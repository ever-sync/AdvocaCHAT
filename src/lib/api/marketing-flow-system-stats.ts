import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type FlowSystemStats = {
  queuedJobs: number;
  failedJobs24h: number;
  workerLastSeen: string | null;
};

const EMPTY_STATS: FlowSystemStats = {
  queuedJobs: 0,
  failedJobs24h: 0,
  workerLastSeen: null,
};

export async function getFlowSystemStats(): Promise<FlowSystemStats> {
  if (!isSupabaseConfigured) return EMPTY_STATS;
  const supabase = requireSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 3 queries paralelas: count queued / count failed nas ultimas 24h /
  // ultimo batimento do worker. O heartbeat vem da RPC dedicada (o worker grava
  // um tick a cada execucao, com ou sem jobs) — antes era max(locked_at), que
  // so existe quando ha fila e deixava o card "Inativo" mesmo com o cron ativo.
  const [queuedResult, failedResult, heartbeatResult] = await Promise.all([
    supabase
      .from("marketing_flow_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    supabase
      .from("marketing_flow_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["failed", "dead"])
      .gt("updated_at", since),
    supabase.rpc("get_marketing_flow_worker_last_seen"),
  ]);

  if (queuedResult.error) throw new Error(queuedResult.error.message);
  if (failedResult.error) throw new Error(failedResult.error.message);
  // heartbeatResult error nao bloqueia (RPC pode nao existir antes do db:push).

  return {
    queuedJobs: queuedResult.count ?? 0,
    failedJobs24h: failedResult.count ?? 0,
    workerLastSeen:
      typeof heartbeatResult.data === "string" ? heartbeatResult.data : null,
  };
}

export function useFlowSystemStats() {
  return useQuery({
    queryKey: ["marketing-flow-system-stats"],
    queryFn: getFlowSystemStats,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Considera o worker "ativo" se a ultima atividade foi nos ultimos 5 minutos. */
export function isWorkerActive(workerLastSeen: string | null): boolean {
  if (!workerLastSeen) return false;
  const t = new Date(workerLastSeen).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 5 * 60 * 1000;
}
