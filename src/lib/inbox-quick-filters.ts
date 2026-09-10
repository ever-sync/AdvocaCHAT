import { inboxChatFiltersFromListScope } from "@/lib/api/whatsapp";
import type { InboxChatFilters, InboxListScope, InboxQuickFilter } from "@/types/domain";

export const INBOX_QUICK_FILTER_OPTIONS: ReadonlyArray<{ id: InboxQuickFilter; label: string }> = [
  { id: "mine", label: "Minhas" },
  { id: "unread", label: "Não lidas" },
  { id: "unassigned", label: "Sem atendente" },
  { id: "waiting_customer", label: "Aguardando cliente" },
  { id: "overdue_followup", label: "Lembretes vencidos" },
  { id: "hidden", label: "Ocultas" },
];

export function inboxQuickFilterLabel(filter: InboxQuickFilter | null): string {
  if (!filter) {
    return "Todas";
  }
  return INBOX_QUICK_FILTER_OPTIONS.find((o) => o.id === filter)?.label ?? "Todas";
}

export function inboxFiltersFromQuickFilter(
  quickFilter: InboxQuickFilter | null,
  currentUserId: string | undefined,
): Pick<
  InboxChatFilters,
  "assigneeId" | "currentUserId" | "unreadOnly" | "hideSnoozed" | "snoozedOnly"
> {
  switch (quickFilter) {
    case "mine":
      return {
        assigneeId: "mine",
        currentUserId,
        hideSnoozed: true,
        snoozedOnly: false,
        unreadOnly: false,
      };
    case "unread":
      return {
        unreadOnly: true,
        hideSnoozed: true,
        snoozedOnly: false,
      };
    case "unassigned":
      return {
        assigneeId: "unassigned",
        hideSnoozed: true,
        snoozedOnly: false,
        unreadOnly: false,
      };
    case "waiting_customer":
      // Filtro real é client-side (isChatWaitingForCustomer). Aqui só garantimos
      // que o server traga as conversas do operador atual com fila ativa.
      return {
        assigneeId: "mine",
        currentUserId,
        hideSnoozed: true,
        snoozedOnly: false,
        unreadOnly: false,
      };
    case "overdue_followup":
      // Mesmo padrão do waiting_customer — server traz a fila do operador,
      // cruzamento com tarefas vencidas (useOverdueFollowupsForTenant) é
      // feito client-side no Inbox.
      return {
        assigneeId: "mine",
        currentUserId,
        hideSnoozed: true,
        snoozedOnly: false,
        unreadOnly: false,
      };
    case "hidden":
      return {
        hideSnoozed: false,
        snoozedOnly: false,
        unreadOnly: false,
      };
    default:
      return {
        hideSnoozed: true,
        snoozedOnly: false,
        unreadOnly: false,
      };
  }
}

/** Ocultas = fora da fila ativa: conversas encerradas (resolvidas, perdidas, etc.). */
export function inboxScopeFiltersForQuickFilter(
  quickFilter: InboxQuickFilter | null,
  listScope: InboxListScope,
): Pick<InboxChatFilters, "status" | "resolution" | "hideLost"> {
  if (quickFilter === "hidden") {
    return { status: "closed", hideLost: false };
  }
  return inboxChatFiltersFromListScope(listScope);
}
