import { useMemo } from "react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { listCrmTasks } from "@/lib/api/crm-tasks";
import { classifyFollowup } from "@/lib/inboxFollowupStatus";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { CrmTask } from "@/types/domain";

const KEY = ["crm-tasks", "tenant-index"] as const;

export type FollowupsBucket = {
  /** customer_ids com pelo menos uma tarefa neste bucket. */
  customerIds: ReadonlySet<string>;
  /** negotiation_ids com pelo menos uma tarefa neste bucket. */
  negotiationIds: ReadonlySet<string>;
};

export type FollowupsIndex = {
  overdue: FollowupsBucket;
  soon: FollowupsBucket;
};

const EMPTY_BUCKET: FollowupsBucket = {
  customerIds: new Set<string>(),
  negotiationIds: new Set<string>(),
};
const EMPTY_INDEX: FollowupsIndex = { overdue: EMPTY_BUCKET, soon: EMPTY_BUCKET };

/**
 * Indexa as `crm_tasks` em aberto do tenant por bucket de urgência
 * (overdue, soon). Os Sets retornados são pra lookup O(1) ao casar com
 * `customer_id` / `primaryNegotiationId` dos chats da lista lateral.
 *
 * Por que client-side? `crm_tasks` não tem coluna de "urgência" —
 * derivamos de `due_at` vs `now()`. Fetch único do tenant inteiro é
 * barato (RLS filtra; volume típico << 1000 tarefas abertas por operador).
 *
 * Por padrão fica sempre habilitado quando Supabase está configurado —
 * 1 request alimenta o filtro "Lembretes vencidos" E os chips das linhas.
 */
export function useFollowupsIndexForTenant(
  options?: Omit<UseQueryOptions<CrmTask[], Error>, "queryKey" | "queryFn">,
): FollowupsIndex {
  const { enabled: enabledOption, ...rest } = options ?? {};
  const query = useQuery<CrmTask[], Error>({
    queryKey: KEY,
    queryFn: () => listCrmTasks({ status: "aberta" }),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
    ...rest,
  });

  return useMemo<FollowupsIndex>(() => {
    const tasks = query.data ?? [];
    if (tasks.length === 0) return EMPTY_INDEX;

    const overdueCustomers = new Set<string>();
    const overdueNegotiations = new Set<string>();
    const soonCustomers = new Set<string>();
    const soonNegotiations = new Set<string>();

    for (const task of tasks) {
      const status = classifyFollowup(task);
      if (status === "overdue") {
        if (task.customerId) overdueCustomers.add(task.customerId);
        if (task.negotiationId) overdueNegotiations.add(task.negotiationId);
      } else if (status === "soon") {
        if (task.customerId) soonCustomers.add(task.customerId);
        if (task.negotiationId) soonNegotiations.add(task.negotiationId);
      }
    }

    return {
      overdue: { customerIds: overdueCustomers, negotiationIds: overdueNegotiations },
      soon: { customerIds: soonCustomers, negotiationIds: soonNegotiations },
    };
  }, [query.data]);
}
