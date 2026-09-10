import { useQuery } from "@tanstack/react-query";
import { requireSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type AttendanceReportRow = {
  assignee_id: string;
  assignee_name: string;
  chats_opened: number;
  chats_resolved: number;
  messages_inbound: number;
  messages_outbound: number;
  messages_ai: number;
  avg_first_response_minutes: number | null;
};

export type FunnelReportRow = {
  stage_id: string;
  stage_order: number;
  current_count: number;
  entered_in_period: number;
  won_in_period: number;
  lost_in_period: number;
  conversion_pct: number | null;
};

export type FunnelVelocityRow = {
  stage_id: string;
  stage_order: number;
  transitions: number;
  avg_days: number | null;
  median_days: number | null;
  max_days: number | null;
};

/** @deprecated use FunnelReportRow fields */
export type LegacyFunnelReportRow = {
  stage_id: string;
  total_cards: number;
  moved_in: number;
  sold_count: number;
  lost_count: number;
};

export type StaleNegotiationsSummary = {
  stale_threshold_days: number;
  open_negotiations: number;
  stale_count: number;
  no_future_task_count: number;
  pool_unassigned_stale: number;
};

export type StaleNegotiationRow = {
  negotiation_id: string;
  title: string;
  funnel_id: string;
  stage_id: string;
  assignee_id: string | null;
  assignee_name: string | null;
  days_without_touch: number;
  missing_future_task: boolean;
  total_value: number;
  last_interaction_at: string | null;
};

export type CrmCommercialSlaReport = {
  sla_first_response_minutes: number;
  open_negotiations: number;
  stale_negotiations: number;
  no_future_task_negotiations: number;
  chats_awaiting_first_response: number;
  chats_sla_breached: number;
  chats_first_response_in_period: number;
  avg_first_response_minutes: number | null;
  won_in_period: number;
  lost_in_period: number;
  avg_days_to_close: number | null;
  overdue_crm_tasks: number;
};

export type CrmSellerPerformanceRow = {
  assignee_id: string;
  assignee_name: string;
  open_count: number;
  pipeline_value: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  stale_count: number;
  avg_days_without_touch: number | null;
};

export type SellerSalesRow = {
  seller_id: string;
  seller_name: string;
  sales_count: number;
  sales_total: number;
  goal_amount: number;
  goal_pct: number | null;
};

export type LostReasonRow = {
  reason: string;
  count: number;
  total_value: number;
};

function mapAttendance(row: Record<string, unknown>): AttendanceReportRow {
  return {
    assignee_id: String(row.assignee_id ?? ""),
    assignee_name: String(row.assignee_name ?? ""),
    chats_opened: Number(row.chats_opened ?? 0),
    chats_resolved: Number(row.chats_resolved ?? 0),
    messages_inbound: Number(row.messages_inbound ?? 0),
    messages_outbound: Number(row.messages_outbound ?? 0),
    messages_ai: Number(row.messages_ai ?? 0),
    avg_first_response_minutes: row.avg_first_response_minutes != null
      ? Number(row.avg_first_response_minutes)
      : null,
  };
}

export async function fetchAttendanceReport(from: Date, to: Date, assigneeId?: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_attendance_summary", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_assignee_id: assigneeId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapAttendance);
}

export async function fetchFunnelReport(funnelId: string, from: Date, to: Date) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_funnel_conversion", {
    p_funnel_id: funnelId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    stage_id: String(row.stage_id ?? ""),
    stage_order: Number(row.stage_order ?? 999),
    current_count: Number(row.current_count ?? 0),
    entered_in_period: Number(row.entered_in_period ?? 0),
    won_in_period: Number(row.won_in_period ?? 0),
    lost_in_period: Number(row.lost_in_period ?? 0),
    conversion_pct: row.conversion_pct != null ? Number(row.conversion_pct) : null,
  })) as FunnelReportRow[];
}

export async function fetchFunnelVelocity(funnelId: string, from: Date, to: Date) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_funnel_velocity", {
    p_funnel_id: funnelId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    stage_id: String(row.stage_id ?? ""),
    stage_order: Number(row.stage_order ?? 999),
    transitions: Number(row.transitions ?? 0),
    avg_days: row.avg_days != null ? Number(row.avg_days) : null,
    median_days: row.median_days != null ? Number(row.median_days) : null,
    max_days: row.max_days != null ? Number(row.max_days) : null,
  })) as FunnelVelocityRow[];
}

export async function fetchStaleNegotiationsSummary(funnelId?: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_stale_negotiations_summary", {
    p_funnel_id: funnelId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) {
    return {
      stale_threshold_days: 7,
      open_negotiations: 0,
      stale_count: 0,
      no_future_task_count: 0,
      pool_unassigned_stale: 0,
    } satisfies StaleNegotiationsSummary;
  }
  return {
    stale_threshold_days: Number(row.stale_threshold_days ?? 7),
    open_negotiations: Number(row.open_negotiations ?? 0),
    stale_count: Number(row.stale_count ?? 0),
    no_future_task_count: Number(row.no_future_task_count ?? 0),
    pool_unassigned_stale: Number(row.pool_unassigned_stale ?? 0),
  };
}

export async function fetchStaleNegotiations(funnelId?: string, limit = 100) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_stale_negotiations", {
    p_funnel_id: funnelId ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    negotiation_id: String(row.negotiation_id ?? ""),
    title: String(row.title ?? ""),
    funnel_id: String(row.funnel_id ?? ""),
    stage_id: String(row.stage_id ?? ""),
    assignee_id: row.assignee_id != null ? String(row.assignee_id) : null,
    assignee_name: row.assignee_name != null ? String(row.assignee_name) : null,
    days_without_touch: Number(row.days_without_touch ?? 0),
    missing_future_task: Boolean(row.missing_future_task),
    total_value: Number(row.total_value ?? 0),
    last_interaction_at: row.last_interaction_at != null ? String(row.last_interaction_at) : null,
  })) as StaleNegotiationRow[];
}

export async function fetchCrmCommercialSla(funnelId: string | undefined, from: Date, to: Date) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_crm_commercial_sla", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_funnel_id: funnelId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  if (!row) {
    return null;
  }
  return {
    sla_first_response_minutes: Number(row.sla_first_response_minutes ?? 15),
    open_negotiations: Number(row.open_negotiations ?? 0),
    stale_negotiations: Number(row.stale_negotiations ?? 0),
    no_future_task_negotiations: Number(row.no_future_task_negotiations ?? 0),
    chats_awaiting_first_response: Number(row.chats_awaiting_first_response ?? 0),
    chats_sla_breached: Number(row.chats_sla_breached ?? 0),
    chats_first_response_in_period: Number(row.chats_first_response_in_period ?? 0),
    avg_first_response_minutes: row.avg_first_response_minutes != null
      ? Number(row.avg_first_response_minutes)
      : null,
    won_in_period: Number(row.won_in_period ?? 0),
    lost_in_period: Number(row.lost_in_period ?? 0),
    avg_days_to_close: row.avg_days_to_close != null ? Number(row.avg_days_to_close) : null,
    overdue_crm_tasks: Number(row.overdue_crm_tasks ?? 0),
  } satisfies CrmCommercialSlaReport;
}

export async function fetchCrmSellerPerformance(funnelId: string | undefined, from: Date, to: Date) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_crm_seller_performance", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_funnel_id: funnelId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    assignee_id: String(row.assignee_id ?? ""),
    assignee_name: String(row.assignee_name ?? ""),
    open_count: Number(row.open_count ?? 0),
    pipeline_value: Number(row.pipeline_value ?? 0),
    won_count: Number(row.won_count ?? 0),
    won_value: Number(row.won_value ?? 0),
    lost_count: Number(row.lost_count ?? 0),
    stale_count: Number(row.stale_count ?? 0),
    avg_days_without_touch: row.avg_days_without_touch != null
      ? Number(row.avg_days_without_touch)
      : null,
  })) as CrmSellerPerformanceRow[];
}

export async function fetchSellerSalesReport(year: number, month: number) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_seller_sales", {
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    seller_id: String(row.seller_id ?? ""),
    seller_name: String(row.seller_name ?? ""),
    sales_count: Number(row.sales_count ?? 0),
    sales_total: Number(row.sales_total ?? 0),
    goal_amount: Number(row.goal_amount ?? 0),
    goal_pct: row.goal_pct != null ? Number(row.goal_pct) : null,
  })) as SellerSalesRow[];
}

export async function fetchLostReasons(funnelId: string, from: Date, to: Date) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_lost_reasons", {
    p_funnel_id: funnelId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    reason: String(row.reason ?? "(sem motivo)"),
    count: Number(row.count ?? 0),
    total_value: Number(row.total_value ?? 0),
  })) as LostReasonRow[];
}

export async function exportAttendanceCsv(from: Date, to: Date): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("export_attendance_report", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return "assignee_name,chats_opened,chats_resolved,messages_inbound,messages_outbound,messages_ai\n";
  }
  const headers = Object.keys(rows[0] as object);
  const lines = [
    headers.join(","),
    ...rows.map((r) => {
      const obj = (r as { assignee_name?: string }).assignee_name
        ? r
        : (Object.values(r)[0] as Record<string, unknown>);
      return headers.map((h) => JSON.stringify(String((obj as Record<string, unknown>)[h] ?? ""))).join(",");
    }),
  ];
  return lines.join("\n");
}

type UseReportOptions = { enabled?: boolean };

export function useAttendanceReport(from: Date, to: Date, assigneeId?: string, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "attendance", from.toISOString(), to.toISOString(), assigneeId],
    queryFn: () => fetchAttendanceReport(from, to, assigneeId),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}

export function useFunnelReport(funnelId: string, from: Date, to: Date, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "funnel", funnelId, from.toISOString(), to.toISOString()],
    queryFn: () => fetchFunnelReport(funnelId, from, to),
    enabled: isSupabaseConfigured && Boolean(funnelId) && (opts?.enabled ?? true),
  });
}

export function useFunnelVelocity(funnelId: string, from: Date, to: Date, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "funnel-velocity", funnelId, from.toISOString(), to.toISOString()],
    queryFn: () => fetchFunnelVelocity(funnelId, from, to),
    enabled: isSupabaseConfigured && Boolean(funnelId) && (opts?.enabled ?? true),
  });
}

export function useStaleNegotiationsSummary(funnelId?: string, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "stale-summary", funnelId ?? "all"],
    queryFn: () => fetchStaleNegotiationsSummary(funnelId),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}

export function useStaleNegotiations(funnelId?: string, limit = 100, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "stale", funnelId ?? "all", limit],
    queryFn: () => fetchStaleNegotiations(funnelId, limit),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}

export function useCrmCommercialSla(funnelId: string | undefined, from: Date, to: Date, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "crm-sla", funnelId ?? "all", from.toISOString(), to.toISOString()],
    queryFn: () => fetchCrmCommercialSla(funnelId, from, to),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}

export function useCrmSellerPerformance(funnelId: string | undefined, from: Date, to: Date, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "crm-sellers", funnelId ?? "all", from.toISOString(), to.toISOString()],
    queryFn: () => fetchCrmSellerPerformance(funnelId, from, to),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}

export function useLostReasons(funnelId: string, from: Date, to: Date, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "lost-reasons", funnelId, from.toISOString(), to.toISOString()],
    queryFn: () => fetchLostReasons(funnelId, from, to),
    enabled: isSupabaseConfigured && Boolean(funnelId) && (opts?.enabled ?? true),
  });
}

export function useSellerSalesReport(year: number, month: number, opts?: UseReportOptions) {
  return useQuery({
    queryKey: ["reports", "seller-sales", year, month],
    queryFn: () => fetchSellerSalesReport(year, month),
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
  });
}
