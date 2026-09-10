// Relatório de campanhas (dados internos). Lê as RPCs de agregação
// get_marketing_campaign_report (por origem) e get_marketing_form_report
// (por formulário). Janela em dias; null = desde sempre.
import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CampaignSourceRow = {
  source: string;
  leads: number;
  won: number;
  revenue: number;
};

export type CampaignFormRow = {
  formId: string;
  formName: string;
  views: number;
  submits: number;
  leads: number;
  won: number;
  revenue: number;
};

function sinceFromDays(days: number | null): string | null {
  if (days == null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function getCampaignSourceReport(days: number | null): Promise<CampaignSourceRow[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_marketing_campaign_report", {
    p_since: sinceFromDays(days),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    source: String(r.source ?? "Direto/sem origem"),
    leads: Number(r.leads ?? 0),
    won: Number(r.won ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));
}

export async function getCampaignFormReport(days: number | null): Promise<CampaignFormRow[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_marketing_form_report", {
    p_since: sinceFromDays(days),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    formId: String(r.form_id ?? ""),
    formName: String(r.form_name ?? "Sem nome"),
    views: Number(r.views ?? 0),
    submits: Number(r.submits ?? 0),
    leads: Number(r.leads ?? 0),
    won: Number(r.won ?? 0),
    revenue: Number(r.revenue ?? 0),
  }));
}

export function useCampaignSourceReport(days: number | null) {
  return useQuery({
    queryKey: ["marketing-campaign-source-report", days],
    queryFn: () => getCampaignSourceReport(days),
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useCampaignFormReport(days: number | null) {
  return useQuery({
    queryKey: ["marketing-campaign-form-report", days],
    queryFn: () => getCampaignFormReport(days),
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}
