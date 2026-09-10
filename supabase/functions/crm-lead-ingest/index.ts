/**
 * crm-lead-ingest — Ingere leads externos no CRM via HTTP POST.
 *
 * Autenticação: mesmo segredo usado pelo n8n (tenant_integrations.n8n_secret).
 * Dois modos aceitos:
 *   1. Bearer token    → Authorization: Bearer <n8n_secret>
 *   2. HMAC-SHA256     → X-Signature: sha256=<hmac> + X-Timestamp: <unix_seconds>
 *
 * Payload (application/json):
 * {
 *   "tenant_id":    "uuid",                   // obrigatório
 *   "nome":         "João Silva",              // recomendado
 *   "telefone":     "11999998888",             // telefone ou email são necessários para dedup
 *   "email":        "joao@example.com",
 *   "funnel_id":    "comercial",               // opcional — usa padrão do tenant
 *   "stage_id":     "lead",                    // opcional — usa padrão do tenant
 *   "title":        "Lead Google Ads",         // opcional — gerado automaticamente se omitido
 *   "fonte":        "google-ads",              // opcional — sufixo no título automático
 *   "custom_fields": {}                        // reservado para uso futuro
 * }
 *
 * Resposta 200:
 * {
 *   "customerId":     "uuid",
 *   "negotiationId":  "uuid",
 *   "isNewCustomer":  true
 * }
 */

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * Zod schema que força objetos a terem apenas valores strings, numbers ou booleans.
 * Ele descarta (ou stringuifica) objetos aninhados e arrays, evitando crashes no React.
 */
const SafeStringRecordSchema = z.record(
  z.string(),
  z.any().transform((val) => {
    if (val === null || val === undefined) return "";
    if (typeof val === "object") {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  })
);

const MAX_TIMESTAMP_SKEW_SECONDS = 300;

function parseTimestampSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{10,13}$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return trimmed.length === 13 ? Math.floor(num / 1000) : num;
}

async function verifyHmac(
  secret: string,
  timestamp: string,
  body: string,
  signature: string | null,
): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const received = signature.replace(/^sha256=/, "").toLowerCase();
  if (expected.length !== received.length) return false;

  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const rawBody = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const tenantId = String(body.tenant_id ?? "").trim();
  if (!tenantId) {
    return jsonResponse({ error: "tenant_id é obrigatório." }, 400);
  }

  // --- autenticação ---
  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("tenant_integrations")
    .select("n8n_secret, n8n_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const authHeader = request.headers.get("authorization") ?? "";
  const signature = request.headers.get("x-signature");
  const timestampHeader = request.headers.get("x-timestamp");

  let authorizedByHmac = false;
  if (integration?.n8n_secret && signature && timestampHeader) {
    const ts = parseTimestampSeconds(timestampHeader);
    if (ts !== null && Math.abs(Date.now() / 1000 - ts) <= MAX_TIMESTAMP_SKEW_SECONDS) {
      authorizedByHmac = await verifyHmac(
        integration.n8n_secret,
        timestampHeader,
        rawBody,
        signature,
      );
    }
  }

  // Bearer com o n8n_secret diretamente (modo simples para o HTTP node do n8n)
  let authorizedBySecret = false;
  if (!authorizedByHmac && integration?.n8n_secret) {
    authorizedBySecret = authHeader === `Bearer ${integration.n8n_secret}`;
  }

  if (!authorizedByHmac && !authorizedBySecret) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  if (!integration?.n8n_enabled) {
    return jsonResponse({ error: "Integração n8n desabilitada para este tenant." }, 403);
  }

  // --- validação mínima ---
  const nome = typeof body.nome === "string" ? body.nome.trim() : null;
  const telefoneOriginal = typeof body.telefone === "string" ? body.telefone.trim() : null;
  const telefone = telefoneOriginal ? telefoneOriginal.replace(/\D/g, "") : null;
  const email = typeof body.email === "string" ? body.email.trim() : null;

  if (!nome && !telefone && !email) {
    return jsonResponse({ error: "Informe ao menos nome, telefone ou email." }, 400);
  }

  let parsedCustomFields = {};
  if (body.custom_fields && typeof body.custom_fields === "object") {
    const result = SafeStringRecordSchema.safeParse(body.custom_fields);
    if (result.success) {
      parsedCustomFields = result.data;
    } else {
      console.warn("[crm-lead-ingest] custom_fields inválidos no payload", result.error);
    }
  }

  // --- chama a RPC ---
  try {
    const { data, error } = await admin.rpc("upsert_crm_lead", {
      p_tenant_id:    tenantId,
      p_nome:         nome ?? null,
      p_telefone:     telefone ?? null,
      p_email:        email ?? null,
      p_funnel_id:    typeof body.funnel_id === "string" ? body.funnel_id.trim() || null : null,
      p_stage_id:     typeof body.stage_id  === "string" ? body.stage_id.trim()  || null : null,
      p_title:        typeof body.title     === "string" ? body.title.trim()     || null : null,
      p_fonte:        typeof body.fonte     === "string" ? body.fonte.trim()     || null : null,
      p_custom_fields: parsedCustomFields,
    });

    if (error) {
      console.error("[crm-lead-ingest] rpc error:", error.message);
      return jsonResponse({ error: error.message }, 400);
    }

    const row = Array.isArray(data) ? data[0] : data;
    return jsonResponse({
      customerId:    row?.customer_id    ?? null,
      negotiationId: row?.negotiation_id ?? null,
      isNewCustomer: row?.is_new_customer ?? false,
    });
  } catch (err) {
    console.error("[crm-lead-ingest] unexpected:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erro inesperado." },
      500,
    );
  }
});
