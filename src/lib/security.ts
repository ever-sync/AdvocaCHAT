import { supabaseAnonKey } from "@/lib/supabase";

const SALT = "wchat-security-salt-2026-xyz";

// Convert an array buffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate HMAC signature for a string message
export async function generateSignature(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // Use anon key + SALT as the secret
  const secretKeyString = (supabaseAnonKey || "") + SALT;
  const keyData = encoder.encode(secretKeyString);

  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, data);
  return bufferToHex(signature);
}

/**
 * Generates a verification signature for URL query parameters.
 * Only signs the core parameters (ignoring dynamically added answers or the signature itself).
 */
export async function signUrlParams(params: Record<string, string>): Promise<string> {
  // We only sign parameters that define the identity and content structure of the link.
  // Exclude 'sig' (obviously) and we focus on: neg, cust, tenant, exp, valor_total, templateId.
  const criticalKeys = ["neg", "cust", "tenant", "exp", "valor_total", "templateId"];

  const sortedParams: string[] = [];
  criticalKeys.forEach((key) => {
    if (params[key] !== undefined && params[key] !== null) {
      sortedParams.push(`${key}=${params[key]}`);
    }
  });

  const canonical = sortedParams.sort().join("&");
  return generateSignature(canonical);
}

/**
 * Verifies a signature against query parameters.
 */
export async function verifyUrlParams(
  params: Record<string, string>,
  signature: string
): Promise<boolean> {
  try {
    const expected = await signUrlParams(params);
    return expected === signature;
  } catch (err) {
    console.error("Erro ao verificar assinatura dos parâmetros:", err);
    return false;
  }
}
