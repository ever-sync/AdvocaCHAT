import type { CrmTask } from "@/types/domain";

/** Janela default para considerar um follow-up "próximo de vencer" (60 minutos). */
export const FOLLOWUP_SOON_WINDOW_MS = 60 * 60_000;

export type FollowupStatus = "overdue" | "soon" | "scheduled";

/**
 * Classifica uma tarefa de follow-up segundo o `due_at`:
 *  - `overdue`: já passou
 *  - `soon`: vence em até {@link FOLLOWUP_SOON_WINDOW_MS}
 *  - `scheduled`: vence mais tarde
 *
 * Retorna `null` para tarefas sem `due_at`, sem status aberta, ou com timestamp inválido.
 */
export function classifyFollowup(
  task: Pick<CrmTask, "status" | "dueAt">,
  options?: { now?: number; soonWindowMs?: number },
): FollowupStatus | null {
  if (task.status !== "aberta") return null;
  if (!task.dueAt) return null;
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs)) return null;

  const now = options?.now ?? Date.now();
  const soonWindow = options?.soonWindowMs ?? FOLLOWUP_SOON_WINDOW_MS;

  if (dueMs < now) return "overdue";
  if (dueMs - now <= soonWindow) return "soon";
  return "scheduled";
}

export function isFollowupOverdue(
  task: Pick<CrmTask, "status" | "dueAt">,
  options?: { now?: number },
): boolean {
  return classifyFollowup(task, options) === "overdue";
}

export function isFollowupSoon(
  task: Pick<CrmTask, "status" | "dueAt">,
  options?: { now?: number; soonWindowMs?: number },
): boolean {
  return classifyFollowup(task, options) === "soon";
}

/**
 * Para uma lista de tarefas, escolhe a mais "urgente" para mostrar como chip:
 * vencidas vencem (mais negativas = mais antigas vencidas), depois próximas,
 * depois a com `due_at` mais cedo. Retorna null se a lista for vazia ou sem
 * tarefas elegíveis.
 */
export function pickMostUrgentFollowup<T extends Pick<CrmTask, "status" | "dueAt">>(
  tasks: T[],
  options?: { now?: number; soonWindowMs?: number },
): { task: T; status: FollowupStatus } | null {
  const now = options?.now ?? Date.now();
  const soon = options?.soonWindowMs ?? FOLLOWUP_SOON_WINDOW_MS;
  type Candidate = { task: T; status: FollowupStatus; dueMs: number };
  const candidates: Candidate[] = [];
  for (const task of tasks) {
    const status = classifyFollowup(task, { now, soonWindowMs: soon });
    if (!status) continue;
    const dueMs = Date.parse(task.dueAt!);
    candidates.push({ task, status, dueMs });
  }
  if (candidates.length === 0) return null;

  const rank: Record<FollowupStatus, number> = { overdue: 0, soon: 1, scheduled: 2 };
  candidates.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return a.dueMs - b.dueMs; // mais cedo (overdue mais antigo / soon mais próximo) primeiro
  });
  return { task: candidates[0].task, status: candidates[0].status };
}

/**
 * Diferença entre `due_at` e agora em minutos (negativo = vencido).
 * Retorna null para tarefas sem due_at ou timestamp inválido.
 */
export function followupMinutesFromNow(
  task: Pick<CrmTask, "dueAt">,
  options?: { now?: number },
): number | null {
  if (!task.dueAt) return null;
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs)) return null;
  const now = options?.now ?? Date.now();
  return Math.round((dueMs - now) / 60_000);
}
