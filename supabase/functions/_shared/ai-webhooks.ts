// Helper centralizado para emitir eventos da IA pra fila de webhooks
// (public.enqueue_webhook_event). Curto-circuita rápido quando ninguém está
// inscrito — a RPC só faz INSERT se houver webhook ativo casando o evento.
//
// Best-effort: falha no enqueue NÃO derruba o turno da IA. Logamos o erro
// e seguimos; a função é chamada de pontos críticos (orchestrator/tools) e
// não pode atrasar a resposta ao cliente.

import type { createAdminClient } from "./supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

export type AiWebhookEvent =
  | "ai.turn_completed"
  | "ai.handoff"
  | "ai.fact_remembered"
  | "ai.critique_blocked"
  | "ai.circuit_tripped";

export async function emitAiWebhook(
  admin: Admin,
  tenantId: string,
  event: AiWebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await admin.rpc("enqueue_webhook_event", {
      p_tenant: tenantId,
      p_event: event,
      p_payload: payload,
    });
  } catch (err) {
    console.error(`emitAiWebhook(${event}) falhou:`, err);
  }
}
