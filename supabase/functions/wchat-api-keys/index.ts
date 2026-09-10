import {
  apiKeyPrefix,
  generateApiKeyPlaintext,
  hashApiKey,
} from "../_shared/api-auth.ts";
import { handleApiCors } from "../_shared/api-http.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  createAdminClient,
  requireTenantPermission,
} from "../_shared/supabase.ts";

function mapKeyRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    key_prefix: String(row.key_prefix),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : ["read", "write"],
    enabled: Boolean(row.enabled),
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at,
  };
}

Deno.serve(async (request) => {
  const cors = handleApiCors(request) ?? handleCors(request);
  if (cors) return cors;

  const method = request.method.toUpperCase();

  try {
    const { admin, tenantId, userId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Sem permissão para gerenciar chaves de API.",
    );

    if (method === "GET") {
      const { data, error } = await admin
        .from("tenant_api_keys")
        .select("id, name, key_prefix, scopes, enabled, last_used_at, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        data: (data ?? []).map((row) => mapKeyRow(row as Record<string, unknown>)),
      });
    }

    if (method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "create");

    if (action === "revoke") {
      const keyId = String(body.id ?? "");
      if (!keyId) {
        return jsonResponse({ error: "id is required." }, 400);
      }

      const { error } = await admin
        .from("tenant_api_keys")
        .update({ enabled: false })
        .eq("tenant_id", tenantId)
        .eq("id", keyId);

      if (error) {
        return jsonResponse({ error: error.message }, 400);
      }

      return jsonResponse({ ok: true });
    }

    const name = String(body.name ?? "").trim();
    if (name.length < 2) {
      return jsonResponse({ error: "name must have at least 2 characters." }, 400);
    }

    const scopesRaw = body.scopes;
    const scopes = Array.isArray(scopesRaw) && scopesRaw.length
      ? scopesRaw.map((s) => String(s))
      : ["read", "write"];

    const plaintext = generateApiKeyPlaintext();
    const keyHash = await hashApiKey(plaintext);
    const prefix = apiKeyPrefix(plaintext);

    const { data, error } = await admin
      .from("tenant_api_keys")
      .insert({
        tenant_id: tenantId,
        name,
        key_prefix: prefix,
        key_hash: keyHash,
        scopes,
        created_by: userId,
      })
      .select("id, name, key_prefix, scopes, enabled, created_at")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({
      key: mapKeyRow(data as Record<string, unknown>),
      secret: plaintext,
      warning: "Guarde o segredo agora. Ele não será exibido novamente.",
    }, 201);
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, 403);
    }
    const message = error instanceof Error ? error.message : "Internal error.";
    const status = message.toLowerCase().includes("bearer") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
