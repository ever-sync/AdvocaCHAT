// Dispatcher de webhooks de saída (webhook_deliveries).
//  - Cron/interno (x-cron-secret): drena a fila de TODOS os tenants.
//  - App (admin) Bearer JWT:
//      body { webhook_id }  => envia um "ping" de teste síncrono p/ aquele webhook.
//      body vazio/{}        => drena a fila apenas do tenant do usuário ("processar agora").
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  createAdminClient,
  isInternalRequest,
  requireTenantContext,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import { webhookBackoffSeconds } from "../_shared/retry-backoff.ts";

const MAX_BATCH = 50;
const TIMEOUT_MS = 10_000;

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function postSigned(url: string, secret: string, event: string, deliveryId: string, body: string) {
  const signature = await hmacSha256Hex(secret, body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WChat-Event": event,
        "X-WChat-Delivery": deliveryId,
        "X-WChat-Signature": `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null as number | null, error: e instanceof Error ? e.message : "erro de rede" };
  } finally {
    clearTimeout(timer);
  }
}

// Linha ja reivindicada (status='processing', attempts incrementado pelo RPC).
type ClaimedDelivery = {
  id: string;
  tenant_id: string;
  webhook_id: string;
  event: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

type WebhookRow = { id: string; url: string; secret: string; active: boolean };

async function processBatch(
  admin: ReturnType<typeof createAdminClient>,
  opts: { tenantId?: string } = {},
) {
  // Claim atomico (FOR UPDATE SKIP LOCKED): marca 'processing' e ja incrementa
  // attempts numa unica transacao. Elimina a pega dupla do SELECT+UPDATE antigo.
  const { data: claimed, error } = await admin.rpc("claim_webhook_deliveries", {
    p_limit: MAX_BATCH,
    p_worker: "dispatcher",
    p_tenant: opts.tenantId ?? null,
  });
  if (error) throw new Error(error.message);
  const rows = (claimed ?? []) as unknown as ClaimedDelivery[];
  if (rows.length === 0) return { processed: 0, success: 0, failed: 0 };

  // Busca os webhooks das entregas reivindicadas (url/secret/active) de uma vez.
  const webhookIds = [...new Set(rows.map((r) => r.webhook_id))];
  const { data: webhooksData, error: whError } = await admin
    .from("webhooks")
    .select("id, url, secret, active")
    .in("id", webhookIds);
  if (whError) throw new Error(whError.message);
  const webhookMap = new Map(
    ((webhooksData ?? []) as WebhookRow[]).map((w) => [w.id, w]),
  );

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const webhook = webhookMap.get(row.webhook_id);
    if (!webhook || !webhook.active) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "error",
          last_error: "webhook inativo ou removido",
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const body = JSON.stringify(row.payload);
    const result = await postSigned(webhook.url, webhook.secret, row.event, row.id, body);

    if (result.ok) {
      await admin
        .from("webhook_deliveries")
        .update({
          status: "success",
          response_status: result.status,
          delivered_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
      success++;
    } else {
      // attempts ja foi incrementado no claim.
      const exhausted = row.attempts >= row.max_attempts;
      const backoffSec = webhookBackoffSeconds(row.attempts);
      await admin
        .from("webhook_deliveries")
        .update({
          status: exhausted ? "error" : "pending",
          response_status: result.status,
          last_error: result.error,
          next_attempt_at: new Date(Date.now() + backoffSec * 1000).toISOString(),
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return { processed: rows.length, success, failed };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    if (isInternalRequest(request)) {
      const admin = createAdminClient();
      const result = await processBatch(admin);
      return jsonResponse({ ok: true, scope: "all", ...result });
    }

    // App: precisa permissão de configuração (gerir/testar webhooks).
    const ctx = await requireTenantPermission(request, "configuracoes", "edit");

    let payload: Record<string, unknown> = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    const webhookId = typeof payload.webhook_id === "string" ? payload.webhook_id : null;
    if (webhookId) {
      const { data: webhook, error } = await ctx.admin
        .from("webhooks")
        .select("id, url, secret, active")
        .eq("id", webhookId)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!webhook) return jsonResponse({ error: "Webhook não encontrado" }, 404);

      const body = JSON.stringify({
        event: "ping",
        tenant_id: ctx.tenantId,
        occurred_at: new Date().toISOString(),
        data: { message: "Teste de webhook do WChat" },
      });
      const result = await postSigned(webhook.url as string, webhook.secret as string, "ping", "test", body);
      return jsonResponse({ ok: result.ok, status: result.status, error: result.error });
    }

    const result = await processBatch(ctx.admin, { tenantId: ctx.tenantId });
    return jsonResponse({ ok: true, scope: "tenant", ...result });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro no dispatcher de webhooks" }, 400);
  }
});
