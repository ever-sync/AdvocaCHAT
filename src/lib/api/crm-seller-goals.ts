import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CrmSellerGoal = {
  id: string;
  profileId: string;
  year: number;
  month: number;
  goalAmount: number;
};

type GoalRow = {
  id: string;
  tenant_id: string;
  profile_id: string;
  year: number;
  month: number;
  goal_amount: number;
};

function mapRow(row: GoalRow): CrmSellerGoal {
  return {
    id: row.id,
    profileId: row.profile_id,
    year: Number(row.year),
    month: Number(row.month),
    goalAmount: Number(row.goal_amount ?? 0),
  };
}

export async function listCrmSellerGoals(
  year: number,
  month: number,
): Promise<CrmSellerGoal[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_seller_monthly_goals")
    .select("id, tenant_id, profile_id, year, month, goal_amount")
    .eq("year", year)
    .eq("month", month);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as GoalRow));
}

export async function upsertCrmSellerGoal(input: {
  profileId: string;
  year: number;
  month: number;
  goalAmount: number;
}): Promise<void> {
  const supabase = requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Não autenticado");
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();
  const tenantId = profileRow?.tenant_id;
  if (!tenantId) throw new Error("Tenant não encontrado");

  const { error } = await supabase.from("crm_seller_monthly_goals").upsert(
    {
      tenant_id: tenantId,
      profile_id: input.profileId,
      year: input.year,
      month: input.month,
      goal_amount: input.goalAmount,
    },
    { onConflict: "tenant_id,profile_id,year,month" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteCrmSellerGoal(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("crm_seller_monthly_goals")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type CrmMonthlyGoalReportRow = {
  profileId: string;
  profileName: string;
  goalAmount: number;
  soldAmount: number;
  soldCount: number;
  attainmentPct: number | null;
};

type ReportRow = {
  profile_id: string;
  profile_name: string | null;
  goal_amount: number | null;
  sold_amount: number | null;
  sold_count: number | null;
  attainment_pct: number | null;
};

export async function fetchCrmMonthlyGoals(
  year: number,
  month: number,
): Promise<CrmMonthlyGoalReportRow[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("report_crm_monthly_goals", {
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReportRow[]).map((row) => ({
    profileId: row.profile_id,
    profileName: (row.profile_name ?? "").trim(),
    goalAmount: Number(row.goal_amount ?? 0),
    soldAmount: Number(row.sold_amount ?? 0),
    soldCount: Number(row.sold_count ?? 0),
    attainmentPct: row.attainment_pct == null ? null : Number(row.attainment_pct),
  }));
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCrmMonthlyGoals(year: number, month: number, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["crm-monthly-goals", year, month],
    queryFn: () => fetchCrmMonthlyGoals(year, month),
    enabled: (opts?.enabled ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useCrmSellerGoals(year: number, month: number, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["crm-seller-goals", year, month],
    queryFn: () => listCrmSellerGoals(year, month),
    enabled: (opts?.enabled ?? true) && isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useUpsertCrmSellerGoal(
  options?: UseMutationOptions<
    void,
    Error,
    { profileId: string; year: number; month: number; goalAmount: number }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCrmSellerGoal,
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await queryClient.invalidateQueries({
        queryKey: ["crm-seller-goals", variables.year, variables.month],
      });
      await queryClient.invalidateQueries({
        queryKey: ["crm-monthly-goals", variables.year, variables.month],
      });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}
