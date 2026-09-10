import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type FlowStats = {
  totalEntered: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  exitedCount: number;
};

const EMPTY_STATS: FlowStats = {
  totalEntered: 0,
  activeCount: 0,
  completedCount: 0,
  failedCount: 0,
  exitedCount: 0,
};

export async function getMarketingFlowStats(): Promise<Record<string, FlowStats>> {
  if (!isSupabaseConfigured) return {};
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_marketing_flow_stats");
  if (error) throw new Error(error.message);
  const out: Record<string, FlowStats> = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const flowId = String(row.flow_id ?? "");
    if (!flowId) continue;
    out[flowId] = {
      totalEntered: Number(row.total_entered ?? 0),
      activeCount: Number(row.active_count ?? 0),
      completedCount: Number(row.completed_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      exitedCount: Number(row.exited_count ?? 0),
    };
  }
  return out;
}

export function statsFor(
  stats: Record<string, FlowStats> | undefined,
  flowId: string,
): FlowStats {
  return stats?.[flowId] ?? EMPTY_STATS;
}

export function useMarketingFlowStats() {
  return useQuery({
    queryKey: ["marketing-flow-stats"],
    queryFn: getMarketingFlowStats,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
  });
}
