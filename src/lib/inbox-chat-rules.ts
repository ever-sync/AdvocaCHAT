import type { ChatResolution, InboxChat, InboxChatStatus } from "@/types/domain";

export const CHAT_RESOLUTION_LABELS: Record<ChatResolution, string> = {
  open: "Em aberto",
  pending: "Pendente",
  resolved: "Resolvida",
  waiting_customer: "Aguardando cliente",
  lost: "Perdido",
};

export function isChatSnoozed(chat: Pick<InboxChat, "snoozeUntil">): boolean {
  if (!chat.snoozeUntil) return false;
  return new Date(chat.snoozeUntil).getTime() > Date.now();
}

export function isChatSlaBreached(chat: Pick<InboxChat, "firstResponseAt" | "slaFirstResponseDueAt">): boolean {
  if (chat.firstResponseAt || !chat.slaFirstResponseDueAt) return false;
  return Date.now() > new Date(chat.slaFirstResponseDueAt).getTime();
}

export function slaMinutesRemaining(chat: Pick<InboxChat, "slaFirstResponseDueAt" | "firstResponseAt">): number | null {
  if (chat.firstResponseAt || !chat.slaFirstResponseDueAt) return null;
  const diff = new Date(chat.slaFirstResponseDueAt).getTime() - Date.now();
  return Math.ceil(diff / 60_000);
}

/** Tempo mínimo de inatividade (ms) para considerar a conversa "esfriada". */
export const WAITING_CUSTOMER_MIN_QUIET_MS = 30 * 60_000;

/**
 * Heurística client-side: sem coluna `last_message_direction` no DB,
 * combinamos `firstResponseAt`, `unreadCount` e `lastMessageAt` para
 * inferir conversas que esfriaram aguardando o cliente.
 *
 * Critérios (todos verdadeiros):
 *  - status `open`
 *  - atendente já participou (`firstResponseAt != null`)
 *  - sem mensagens novas do cliente (`unreadCount === 0`)
 *  - houve atividade depois da primeira resposta (`lastMessageAt > firstResponseAt`)
 *  - última atividade há ao menos {@link WAITING_CUSTOMER_MIN_QUIET_MS}
 *
 * Falso positivo conhecido: cliente respondeu há pouco mais que o limiar
 * e ainda pode voltar. Falso negativo conhecido: atendente falou há menos
 * que o limiar (ainda "ao vivo"). Trocar por uma flag explícita só vale
 * a pena quando houver `last_message_direction` no DB.
 */
export function isChatWaitingForCustomer(
  chat: Pick<InboxChat, "status" | "firstResponseAt" | "unreadCount" | "lastMessageAt">,
  options?: { now?: number; minQuietMs?: number },
): boolean {
  if (chat.status !== ("open" satisfies InboxChatStatus)) return false;
  if (chat.unreadCount > 0) return false;
  if (!chat.firstResponseAt || !chat.lastMessageAt) return false;

  const firstResponseMs = Date.parse(chat.firstResponseAt);
  const lastMessageMs = Date.parse(chat.lastMessageAt);
  if (!Number.isFinite(firstResponseMs) || !Number.isFinite(lastMessageMs)) return false;
  if (lastMessageMs <= firstResponseMs) return false;

  const now = options?.now ?? Date.now();
  const minQuiet = options?.minQuietMs ?? WAITING_CUSTOMER_MIN_QUIET_MS;
  return now - lastMessageMs >= minQuiet;
}
