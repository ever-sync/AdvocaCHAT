import type { createAdminClient } from "./supabase.ts";

export type ApiKeyAuth = {
  keyId: string;
  tenantId: string;
  scopes: string[];
  name: string;
};

const API_KEY_PREFIX = "wchat_";

export function generateApiKeyPlaintext(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${API_KEY_PREFIX}${secret}`;
}

export async function hashApiKey(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function apiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, Math.min(plaintext.length, 16));
}

export function extractBearerApiKey(request: Request): string | null {
  const auth = request.headers.get("Authorization")?.trim();
  if (!auth || !/^Bearer\s+/i.test(auth)) {
    return null;
  }
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith(API_KEY_PREFIX)) {
    return null;
  }
  return token;
}

export async function authenticateApiKey(
  admin: ReturnType<typeof createAdminClient>,
  request: Request,
): Promise<ApiKeyAuth | null> {
  const token = extractBearerApiKey(request);
  if (!token) {
    return null;
  }

  const keyHash = await hashApiKey(token);
  const { data, error } = await admin
    .from("tenant_api_keys")
    .select("id, tenant_id, scopes, name, enabled")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data?.enabled) {
    return null;
  }

  void admin
    .from("tenant_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    keyId: String(data.id),
    tenantId: String(data.tenant_id),
    scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : ["read", "write"],
    name: String(data.name),
  };
}

export function hasApiScope(auth: ApiKeyAuth, scope: "read" | "write"): boolean {
  if (auth.scopes.includes("*")) {
    return true;
  }
  return auth.scopes.includes(scope);
}
