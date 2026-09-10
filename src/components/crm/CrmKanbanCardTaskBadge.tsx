import { useMemo } from "react";
import {
  useCrmTasksForCustomer,
  useCrmTasksForNegotiation,
} from "@/lib/api/crm-tasks";
import type { KanbanTaskPreview } from "@/lib/api/crm-kanban-tasks";
import {
  countOpenCrmTasksByDue,
  mergeOpenCrmTasksForNegotiationView,
} from "@/lib/crm/negotiation-task-view";
import { isPersistedCrmNegotiationId } from "@/lib/crm/negotiation-model";
import { isSupabaseConfigured } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { CrmNegotiation } from "@/types/domain";

type CrmKanbanCardTaskBadgeProps = {
  card: CrmNegotiation;
  taskPreview?: KanbanTaskPreview;
};

export function CrmKanbanCardTaskBadge({ card, taskPreview }: CrmKanbanCardTaskBadgeProps) {
  const persisted = isPersistedCrmNegotiationId(card.id);
  const useBatchPreview = Boolean(taskPreview);

  const { data: byNegotiation = [], isLoading } = useCrmTasksForNegotiation(card.id, {
    enabled: persisted && isSupabaseConfigured && !useBatchPreview,
  });
  const { data: customerUnlinked = [] } = useCrmTasksForCustomer(card.customerId, {
    enabled:
      persisted && isSupabaseConfigured && Boolean(card.customerId) && !useBatchPreview,
    negotiationUnlinkedOnly: true,
  });

  const counts = useMemo(() => {
    if (useBatchPreview) {
      return { pending: 0, overdue: 0 };
    }
    const open = mergeOpenCrmTasksForNegotiationView(byNegotiation, customerUnlinked);
    return countOpenCrmTasksByDue(open);
  }, [byNegotiation, customerUnlinked, useBatchPreview]);

  if (useBatchPreview && taskPreview) {
    if (taskPreview.openCount === 0) return null;
    return (
      <span
        className="mt-1 block max-w-full truncate text-[10px] text-[var(--crm-ink-2)]"
        title={taskPreview.title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={
            taskPreview.overdue ? "font-semibold text-[var(--crm-danger)]" : "font-medium"
          }
        >
          {taskPreview.overdue ? "⚠ " : ""}
          {taskPreview.title}
        </span>
      </span>
    );
  }

  if (!persisted || !isSupabaseConfigured || isLoading) {
    return null;
  }

  if (counts.pending === 0 && counts.overdue === 0) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`${counts.overdue} tarefa${counts.overdue === 1 ? "" : "s"} atrasada${counts.overdue === 1 ? "" : "s"}, ${counts.pending} pendente${counts.pending === 1 ? "" : "s"}`}
    >
      {counts.overdue > 0 ? (
        <span className="inline-flex items-center gap-0.5" title="Tarefas atrasadas">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full bg-[var(--crm-danger)] animate-pulse")}
            aria-hidden
          />
          <span className="tabular-nums font-semibold text-[var(--crm-danger)]">{counts.overdue}</span>
        </span>
      ) : null}
      {counts.pending > 0 ? (
        <span className="inline-flex items-center gap-0.5" title="Tarefas pendentes">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--crm-amber)]" aria-hidden />
          <span className="tabular-nums font-medium text-[var(--inbox-gold)]">{counts.pending}</span>
        </span>
      ) : null}
    </span>
  );
}
