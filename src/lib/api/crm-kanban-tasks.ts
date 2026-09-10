import { useQuery } from "@tanstack/react-query";
import { listCrmTasks } from "@/lib/api/crm-tasks";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { CrmTask } from "@/types/domain";

export type KanbanTaskPreview = {
  negotiationId: string;
  title: string;
  dueAt: string | null;
  overdue: boolean;
  openCount: number;
  overdueCount: number;
};

function isOverdue(dueAt: string | null | undefined, nowMs: number): boolean {
  if (!dueAt) return false;
  const t = Date.parse(dueAt);
  return Number.isFinite(t) && t < nowMs;
}

export function buildKanbanTaskPreviews(
  tasks: CrmTask[],
  nowMs = Date.now(),
): Map<string, KanbanTaskPreview> {
  const openByNeg = new Map<string, CrmTask[]>();
  for (const task of tasks) {
    if (task.status !== "aberta" || !task.negotiationId) continue;
    const list = openByNeg.get(task.negotiationId) ?? [];
    list.push(task);
    openByNeg.set(task.negotiationId, list);
  }

  const result = new Map<string, KanbanTaskPreview>();
  for (const [negotiationId, open] of openByNeg) {
    open.sort((a, b) => {
      const aDue = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });
    const next = open[0];
    const overdueCount = open.filter((t) => isOverdue(t.dueAt, nowMs)).length;
    result.set(negotiationId, {
      negotiationId,
      title: next.title,
      dueAt: next.dueAt ?? null,
      overdue: isOverdue(next.dueAt, nowMs),
      openCount: open.length,
      overdueCount,
    });
  }
  return result;
}

export async function listOpenCrmTasksForNegotiations(
  negotiationIds: string[],
): Promise<CrmTask[]> {
  if (!isSupabaseConfigured || negotiationIds.length === 0) return [];
  const unique = [...new Set(negotiationIds.filter((id) => id.trim()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 40) {
    chunks.push(unique.slice(i, i + 40));
  }
  const merged: CrmTask[] = [];
  for (const chunk of chunks) {
    const batch = await Promise.all(
      chunk.map((id) => listCrmTasks({ negotiationId: id, status: "aberta" })),
    );
    for (const list of batch) merged.push(...list);
  }
  return merged;
}

export function useKanbanTaskPreviews(
  negotiationIds: string[],
  opts?: { enabled?: boolean },
) {
  const enabled =
    (opts?.enabled ?? true) && isSupabaseConfigured && negotiationIds.length > 0;
  return useQuery({
    queryKey: ["crm-kanban-task-previews", ...negotiationIds.slice().sort()],
    queryFn: async () => {
      const tasks = await listOpenCrmTasksForNegotiations(negotiationIds);
      return buildKanbanTaskPreviews(tasks);
    },
    enabled,
    staleTime: 30_000,
  });
}
