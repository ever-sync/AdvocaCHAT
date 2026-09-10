import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SchedulingReportSummary = {
  total: number;
  agendado: number;
  confirmado: number;
  concluido: number;
  cancelado: number;
  nao_compareceu: number;
  receita_total: number;
  taxa_no_show: number;
  taxa_cancelamento: number;
  taxa_conclusao: number;
};

export type SchedulingReportDay = {
  date: string;
  total: number;
  concluido: number;
  cancelado: number;
  nao_compareceu: number;
  receita: number;
};

export type SchedulingReportService = {
  service_nome: string;
  total: number;
  concluido: number;
  receita: number;
};

export type SchedulingReportProvider = {
  provider_id: string;
  total: number;
  concluido: number;
  nao_compareceu: number;
  receita: number;
};

export type SchedulingReport = {
  summary: SchedulingReportSummary;
  by_day: SchedulingReportDay[];
  by_service: SchedulingReportService[];
  by_provider: SchedulingReportProvider[];
};

// ─── Fetcher ─────────────────────────────────────────────────────────────────

export async function fetchSchedulingReport(
  from: string,
  to: string,
  providerId?: string | null,
): Promise<SchedulingReport | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = requireSupabase();
  await getCurrentTenantId(); // garante autenticação
  const { data, error } = await supabase.rpc("scheduling_report", {
    p_from: from,
    p_to: to,
    p_provider_id: providerId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as SchedulingReport;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const KEY = ["scheduling-report"] as const;

export function useSchedulingReport(
  from: string,
  to: string,
  providerId?: string | null,
  options?: Omit<UseQueryOptions<SchedulingReport | null>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...KEY, from, to, providerId ?? "all"],
    queryFn: () => fetchSchedulingReport(from, to, providerId),
    enabled: isSupabaseConfigured && !!from && !!to && (enabledOption ?? true),
    staleTime: 60_000,
  });
}
