// Emite um evento generico para a fila de webhooks de saida do tenant
// (public.enqueue_webhook_event). Curto-circuita no banco: so insere se houver
// webhook ativo inscrito no evento.
//
// Best-effort: falha no enqueue NAO deve derrubar o fluxo chamador. Logamos e
// seguimos — e usado de pontos criticos (worker, dispatchers) que nao podem
// quebrar por causa de uma notificacao.

import type { createAdminClient } from "./supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

export async function emitWebhookEvent(
  admin: Admin,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!tenantId || !event) return;
  try {
    await admin.rpc("enqueue_webhook_event", {
      p_tenant: tenantId,
      p_event: event,
      p_payload: payload,
    });
  } catch (err) {
    console.error(`emitWebhookEvent(${event}) falhou:`, err);
  }
}
