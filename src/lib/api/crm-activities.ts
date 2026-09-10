import { useQuery } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CrmActivity = {
  id: string;
  activityType: string;
  title: string;
  body: string | null;
  createdAt: string;
  negotiationId: string | null;
  chatId: string | null;
};

export async function listCrmActivitiesForCustomer(customerId: string): Promise<CrmActivity[]> {
  if (!isSupabaseConfigured || !customerId) return [];
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_activities")
    .select("id, activity_type, title, body, created_at, negotiation_id, chat_id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    activityType: String(row.activity_type ?? ""),
    title: String(row.title ?? ""),
    body: row.body != null ? String(row.body) : null,
    createdAt: String(row.created_at),
    negotiationId: row.negotiation_id != null ? String(row.negotiation_id) : null,
    chatId: row.chat_id != null ? String(row.chat_id) : null,
  }));
}

export function useCrmActivitiesForCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: ["crm-activities", "customer", customerId],
    queryFn: () => listCrmActivitiesForCustomer(customerId!),
    enabled: isSupabaseConfigured && Boolean(customerId),
  });
}
