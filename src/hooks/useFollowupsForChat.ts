import { useMemo } from "react";
import { useCrmTasksForCustomer, useCrmTasksForNegotiation } from "@/lib/api/crm-tasks";
import type { CrmTask, InboxChat } from "@/types/domain";

export type UseFollowupsForChatResult = {
  /** Tarefas em aberto vinculadas ao chat (customer e/ou negotiation), ordenadas por dueAt asc. */
  followups: CrmTask[];
  isLoading: boolean;
};

/**
 * Lista as `crm_tasks` em aberto vinculadas a este chat — combina os hooks
 * existentes por customer e por negociação, deduplica por id e ordena por
 * dueAt ascendente (vencidos primeiro, depois mais próximos).
 *
 * Quando o chat não tem customer nem negotiation vinculados (chat "solto"),
 * retorna lista vazia sem disparar nenhum fetch.
 */
export function useFollowupsForChat(chat: InboxChat | null): UseFollowupsForChatResult {
  const customerId = chat?.customerId ?? null;
  const negotiationId = chat?.primaryNegotiationId ?? null;

  const customerTasks = useCrmTasksForCustomer(customerId ?? undefined, {
    enabled: Boolean(customerId),
  });
  const negotiationTasks = useCrmTasksForNegotiation(negotiationId ?? undefined, {
    enabled: Boolean(negotiationId),
  });

  const followups = useMemo<CrmTask[]>(() => {
    const seen = new Map<string, CrmTask>();
    for (const task of customerTasks.data ?? []) {
      if (task.status === "aberta") seen.set(task.id, task);
    }
    for (const task of negotiationTasks.data ?? []) {
      if (task.status === "aberta") seen.set(task.id, task);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const ams = a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER;
      const bms = b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER;
      return ams - bms;
    });
  }, [customerTasks.data, negotiationTasks.data]);

  return {
    followups,
    isLoading: customerTasks.isLoading || negotiationTasks.isLoading,
  };
}
