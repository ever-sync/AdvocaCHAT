import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export type LeadDuplicateMatch = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  customerCpf: string | null;
  matchReason: "phone" | "email" | "cpf";
  openNegotiationId: string | null;
  openNegotiationTitle: string | null;
  openNegotiationStatus: string | null;
  openNegotiationFunnelId: string | null;
  openNegotiationStageId: string | null;
  openNegotiationTotalValue: number;
  openAssigneeId: string | null;
  openAssigneeName: string | null;
};

type Row = {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  customer_cpf: string | null;
  match_reason: string;
  open_negotiation_id: string | null;
  open_negotiation_title: string | null;
  open_negotiation_status: string | null;
  open_negotiation_funnel_id: string | null;
  open_negotiation_stage_id: string | null;
  open_negotiation_total_value: number | null;
  open_assignee_id: string | null;
  open_assignee_name: string | null;
};

function mapRow(row: Row): LeadDuplicateMatch {
  const reason =
    row.match_reason === "cpf" || row.match_reason === "email" || row.match_reason === "phone"
      ? (row.match_reason as LeadDuplicateMatch["matchReason"])
      : "phone";
  return {
    customerId: row.customer_id,
    customerName: row.customer_name ?? "",
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerCpf: row.customer_cpf,
    matchReason: reason,
    openNegotiationId: row.open_negotiation_id,
    openNegotiationTitle: row.open_negotiation_title,
    openNegotiationStatus: row.open_negotiation_status,
    openNegotiationFunnelId: row.open_negotiation_funnel_id,
    openNegotiationStageId: row.open_negotiation_stage_id,
    openNegotiationTotalValue: Number(row.open_negotiation_total_value ?? 0),
    openAssigneeId: row.open_assignee_id,
    openAssigneeName: row.open_assignee_name,
  };
}

export type FindLeadDuplicatesArgs = {
  phone?: string | null;
  email?: string | null;
  cpf?: string | null;
  excludeCustomerId?: string | null;
};

export async function findLeadDuplicates(
  args: FindLeadDuplicatesArgs,
): Promise<LeadDuplicateMatch[]> {
  const supabase = requireSupabase();
  const phoneDigits = args.phone ? normalizePhone(args.phone).digits : "";
  const { data, error } = await supabase.rpc("find_lead_duplicates", {
    p_phone_digits: phoneDigits.length >= 8 ? phoneDigits : null,
    p_email: args.email?.trim() || null,
    p_cpf: args.cpf?.trim() || null,
    p_exclude_customer_id: args.excludeCustomerId ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(mapRow);
}

function hasAnyQuery(args: FindLeadDuplicatesArgs): boolean {
  const phoneDigits = args.phone ? args.phone.replace(/\D/g, "") : "";
  const email = args.email?.trim() ?? "";
  const cpf = args.cpf ? args.cpf.replace(/\D/g, "") : "";
  return phoneDigits.length >= 8 || email.length > 0 || cpf.length >= 11;
}

/**
 * Busca duplicatas conforme o usuário digita; debounce do lado do consumidor
 * via `useDeferredValue` sobre os argumentos.
 */
export function useLeadDuplicates(args: FindLeadDuplicatesArgs, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && isSupabaseConfigured && hasAnyQuery(args);
  return useQuery({
    queryKey: [
      "crm-lead-duplicates",
      args.phone ?? "",
      args.email ?? "",
      args.cpf ?? "",
      args.excludeCustomerId ?? "",
    ],
    queryFn: () => findLeadDuplicates(args),
    enabled,
    staleTime: 30_000,
  });
}
