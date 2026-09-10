import { useQuery } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { ForecastDeal } from "@/lib/crm/forecast";

const OPEN_STATUSES = ["em_andamento", "pausado", "nao_pausado"];

export type ForecastData = {
  deals: ForecastDeal[];
  sellers: Record<string, string>;
};

export async function fetchForecastData(funnelId?: string): Promise<ForecastData> {
  if (!isSupabaseConfigured) return { deals: [], sellers: {} };
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();

  let dealsQuery = supabase
    .from("crm_negotiations")
    .select("id, total_value, funnel_id, stage_id, assignee_id, closing_forecast, status")
    .eq("tenant_id", tenantId)
    .in("status", OPEN_STATUSES)
    .limit(2000);
  if (funnelId) dealsQuery = dealsQuery.eq("funnel_id", funnelId);

  const [{ data: dealRows, error: dealsErr }, { data: profileRows, error: profErr }] = await Promise.all([
    dealsQuery,
    supabase.from("profiles").select("id, nome").eq("tenant_id", tenantId),
  ]);

  if (dealsErr) throw new Error(dealsErr.message);
  if (profErr) throw new Error(profErr.message);

  const sellers: Record<string, string> = {};
  for (const row of (profileRows ?? []) as Record<string, unknown>[]) {
    sellers[String(row.id)] = String(row.nome ?? "—");
  }

  const deals: ForecastDeal[] = ((dealRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    totalValue: Number(row.total_value ?? 0),
    funnelId: String(row.funnel_id ?? ""),
    stageId: String(row.stage_id ?? ""),
    assigneeId: row.assignee_id != null ? String(row.assignee_id) : null,
    closingForecast: row.closing_forecast != null ? String(row.closing_forecast) : null,
    status: String(row.status ?? ""),
  }));

  return { deals, sellers };
}

export function useForecastData(funnelId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["forecast", funnelId ?? "all"],
    queryFn: () => fetchForecastData(funnelId),
    enabled: (options?.enabled ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}
