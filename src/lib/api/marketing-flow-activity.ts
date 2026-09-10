import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type FlowActivity = {
  lastEventAt: string | null;
  lastEventType: string | null;
};

export async function getMarketingFlowActivity(): Promise<Record<string, FlowActivity>> {
  if (!isSupabaseConfigured) return {};
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_marketing_flow_activity");
  if (error) throw new Error(error.message);
  const out: Record<string, FlowActivity> = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const flowId = String(row.flow_id ?? "");
    if (!flowId) continue;
    out[flowId] = {
      lastEventAt: row.last_event_at == null ? null : String(row.last_event_at),
      lastEventType: row.last_event_type == null ? null : String(row.last_event_type),
    };
  }
  return out;
}

export function activityFor(
  activity: Record<string, FlowActivity> | undefined,
  flowId: string,
): FlowActivity | null {
  return activity?.[flowId] ?? null;
}

export function useMarketingFlowActivity() {
  return useQuery({
    queryKey: ["marketing-flow-activity"],
    queryFn: getMarketingFlowActivity,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
    // RPC nova: se a migration ainda não foi aplicada, a query falha em
    // silêncio (data fica undefined) e a coluna mostra "—" — sem quebrar a lista.
    retry: false,
  });
}
