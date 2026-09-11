import { requireSupabase } from "@/lib/supabase";
import type { CaseFinancialData } from "@/types/legal-case-finance";
export async function financeRpc<T = unknown>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
async function rows<T>(table: string, caseId?: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    let query = requireSupabase().from(table).select(table === "legal_charge_attempts" ? "id,case_id,tenant_id,created_at,obligation_id,connection_id,amount,provider_customer_id,billing_type,due_on,status,provider_url,provider_charge_id" : "*").order("id").range(offset, offset + 499);
    if (caseId) query = query.eq("case_id", caseId);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    result.push(...((data ?? []) as T[]));
    if (!data || data.length < 500) return result;
  }
  throw new Error("Este caso excede o limite da consulta financeira. Solicite uma exportação por período; nenhum total parcial foi apresentado.");
}
export async function getCaseFinance(caseId: string, signal?: AbortSignal): Promise<CaseFinancialData> {
  const [agreements, bases, obligations, transactions, allocations, statements, releases, connections, charges, receipts, context] = await Promise.all([
    rows<CaseFinancialData["agreements"][number]>("legal_fee_agreement_versions", caseId, signal), rows<CaseFinancialData["bases"][number]>("legal_fee_basis_versions", caseId, signal),
    rows<CaseFinancialData["obligations"][number]>("legal_financial_obligations", caseId, signal), rows<CaseFinancialData["transactions"][number]>("legal_cash_transactions", caseId, signal),
    rows<CaseFinancialData["allocations"][number]>("legal_cash_allocations", caseId, signal), rows<CaseFinancialData["statements"][number]>("legal_financial_statement_versions", caseId, signal),
    rows<CaseFinancialData["releases"][number]>("legal_financial_statement_releases", caseId, signal), rows<CaseFinancialData["connections"][number]>("legal_payment_connections", undefined, signal),
    rows<CaseFinancialData["charges"][number]>("legal_charge_attempts", caseId, signal), rows<CaseFinancialData["receipts"][number]>("legal_payment_receipts", caseId, signal),
    (async () => { let query = requireSupabase().rpc("legal_get_case_financial_context", { p_case_id: caseId }); if (signal) query = query.abortSignal(signal); const { data, error } = await query; if (error) throw new Error(error.message); return data as CaseFinancialData["context"]; })(),
  ]);
  return { agreements, bases, obligations, transactions, allocations, statements, releases, connections, charges, receipts, context };
}
export async function getFinanceReferences(caseId: string, includeIr: boolean, signal?: AbortSignal): Promise<import("@/types/legal-case-finance").FinanceReferences> {
  async function selected<T>(table: string, columns: string, filters: Record<string, unknown> = {}) {
    let query = requireSupabase().from(table).select(columns).eq("case_id", caseId).order("id").limit(1001);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if ((data?.length ?? 0) > 1000) throw new Error("Há mais de mil referências neste caso. Restrinja os documentos antes de preparar a operação.");
    return (data ?? []) as T[];
  }
  type Ref = import("@/types/legal-case-finance").FinanceReferences;
  const [documents, instruments, versions, signatures, recoveries, claimRows, events] = await Promise.all([
    selected<Ref["documents"][number]>("legal_case_documents", "id,display_name,category", { status: "ready" }),
    selected<{ id: string; title: string }>("legal_instruments", "id,title", { instrument_type: "contract" }),
    selected<{ id: string; instrument_id: string; version_number: number; status: string; superseded_at: string | null; category: string }>("legal_instrument_versions", "id,instrument_id,version_number,status,superseded_at,category"),
    selected<Ref["signatures"][number]>("legal_external_signature_records", "id,version_id,document_id,created_at"),
    includeIr ? selected<Ref["recoveries"][number]>("ir_recoveries", "id,amount,received_on") : Promise.resolve([]),
    includeIr ? selected<Ref["claims"][number]>("ir_claims", "id,title") : Promise.resolve([]),
    includeIr ? selected<{id:string;claim_id:string;event_type:string;occurred_on:string;created_at:string}>("ir_claim_events", "id,claim_id,event_type,occurred_on,created_at") : Promise.resolve([]),
  ]);
  const decisions = new Map<string, (typeof events)[number]>();
  for (const event of [...events].filter((e) => ["decision_granted", "decision_partial", "decision_denied"].includes(e.event_type)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))) if (!decisions.has(event.claim_id)) decisions.set(event.claim_id, event);
  const claims = [...decisions.values()].filter((e) => e.event_type !== "decision_denied").map((e) => ({ id: e.id, title: `${claimRows.find((c) => c.id === e.claim_id)?.title ?? "Pedido"} · decisão ${e.occurred_on}` }));
  return { documents: documents.filter((d) => d.category !== "medical"), contracts: instruments.map((i) => ({ ...i, versions: versions.filter((v) => v.instrument_id === i.id && v.category !== "medical") })), signatures, recoveries, claims };
}
