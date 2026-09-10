// Gatilho manual (Fase 5): busca de clientes + matricula num fluxo via RPC
// enroll_customers_in_flow_manual (valida marketing.edit no banco).
import { useMutation } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type ManualCustomer = { id: string; nome: string; telefone: string };

/** Busca leads por nome/telefone para o seletor de matrícula manual. */
export async function searchCustomersForEnroll(term: string): Promise<ManualCustomer[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  let query = supabase
    .from("customers")
    .select("id, nome, telefone")
    .order("nome", { ascending: true })
    .limit(25);

  const t = term.trim();
  if (t) {
    // Busca por nome OU telefone (ilike).
    query = query.or(`nome.ilike.%${t}%,telefone.ilike.%${t}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id ?? ""),
    nome: String(r.nome ?? "Sem nome"),
    telefone: String(r.telefone ?? ""),
  }));
}

export type EnrollResult = { enrolled: number; skipped: number };

export async function enrollCustomersInFlow(
  flowId: string,
  customerIds: string[],
): Promise<EnrollResult> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("enroll_customers_in_flow_manual", {
    p_flow_id: flowId,
    p_customer_ids: customerIds,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    enrolled: Number(r.enrolled ?? 0),
    skipped: Number(r.skipped ?? 0),
  };
}

export function useEnrollCustomersInFlow() {
  return useMutation({
    mutationFn: ({ flowId, customerIds }: { flowId: string; customerIds: string[] }) =>
      enrollCustomersInFlow(flowId, customerIds),
  });
}
