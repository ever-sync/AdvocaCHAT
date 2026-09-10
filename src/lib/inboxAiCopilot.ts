import type { PlaygroundMessage } from "@/lib/api/ai-agent";
import type { WhatsappMessage } from "@/types/domain";

/** Quantos turnos da thread mandar para o LLM por padrão (controla custo/contexto). */
export const COPILOT_DEFAULT_HISTORY_LIMIT = 20;

/**
 * Converte mensagens do chat em payload do `ai-playground`:
 *  - inbound (cliente) → `role: "user"`
 *  - outbound (atendente ou IA) → `role: "assistant"`
 *  - mensagens sem `bodyText` são ignoradas (anexos sem legenda não viram
 *    contexto — o LLM não tem acesso ao arquivo aqui)
 *  - mensagens `system` são ignoradas (não pertencem ao diálogo)
 *  - mensagens com `status === "failed"` são ignoradas (não saíram, não contam)
 *
 * As mensagens já chegam ordenadas (mais antiga primeiro, igual o `useInboxMessages`).
 * Mantemos apenas as últimas `limit` para controlar o tamanho do prompt.
 */
export function buildCopilotPromptFromThread(
  messages: WhatsappMessage[],
  limit: number = COPILOT_DEFAULT_HISTORY_LIMIT,
): PlaygroundMessage[] {
  const out: PlaygroundMessage[] = [];

  for (const message of messages) {
    if (message.messageType === "system") continue;
    if (message.status === "failed") continue;
    const text = message.bodyText?.trim();
    if (!text) continue;

    out.push({
      role: message.direction === "outbound" ? "assistant" : "user",
      text,
    });
  }

  if (out.length <= limit) return out;
  return out.slice(out.length - limit);
}
