import { requireSupabase } from "@/lib/supabase";
export type OperationalCost = {
  kind: "actual" | "estimate" | "budget";
  currency: string;
  amount: string;
};
export type ReadinessMetrics = {
  tenant_id: string;
  user_id: string;
  measured_at: string;
  case_count: number;
  active_cases: number;
  waiting_cases: number;
  closed_cases: number;
  overdue_next_actions: number;
  ir_visible_cases: number;
  ir_claims: number;
  ir_received_brl: string;
  ir_recognized_by_claim_brl: string;
  ir_cessation_verified_sources: number;
  storage_visible_bytes: number;
  cost_totals: OperationalCost[];
  ir_warning: string;
  cost_warning: string;
};
export type ImportPreview = {
  rows: Record<string, unknown>[];
  count: number;
  preview_hash: string;
  warning: string;
};
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  let r = requireSupabase().rpc(name, args);
  if (signal) r = r.abortSignal(signal);
  const { data, error } = await r;
  if (error) throw new Error(error.message);
  return data as T;
}
export const readinessMetrics = (signal?: AbortSignal) =>
  rpc<ReadinessMetrics>("legal_readiness_metrics", {}, signal);
export const previewCaseImport = (rows: unknown, signal?: AbortSignal) =>
  rpc<ImportPreview>("legal_preview_case_import", { p_rows: rows }, signal);
export const applyCaseImport = (
  rows: unknown,
  hash: string,
  key: string,
  signal?: AbortSignal,
) =>
  rpc<{ case_ids: string[]; count: number; already_applied: boolean }>(
    "legal_apply_case_import",
    { p_rows: rows, p_preview_hash: hash, p_idempotency_key: key },
    signal,
  );
export const recordOperationalCost = (
  caseId: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) =>
  rpc(
    "legal_record_operational_cost",
    { p_case_id: caseId, p_payload: payload },
    signal,
  );
export const exportCaseManifest = (caseId: string, signal?: AbortSignal) =>
  rpc<Record<string, unknown>>(
    "legal_export_case_manifest",
    { p_case_id: caseId },
    signal,
  );
export async function readinessCases(page: number, signal?: AbortSignal) {
  let q = requireSupabase()
    .from("legal_cases")
    .select("id,title,owner_id", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("id")
    .range(page * 25, page * 25 + 24);
  if (signal) q = q.abortSignal(signal);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    items: (data ?? []) as { id: string; title: string; owner_id: string }[],
    total: count ?? 0,
  };
}
export async function costDocuments(caseId: string, signal?: AbortSignal) {
  let q = requireSupabase()
    .from("legal_case_documents")
    .select("id,display_name")
    .eq("case_id", caseId)
    .eq("status", "ready")
    .order("id")
    .limit(101);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) > 100)
    throw new Error(
      "Este caso exige seleção assistida de comprovantes (mais de 100 arquivos).",
    );
  return (data ?? []) as { id: string; display_name: string }[];
}
export function parseCaseImport(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > 131072)
    throw new Error("Arquivo acima de 128 KiB. Divida em lotes.");
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100)
    throw new Error("Informe uma lista JSON de 1 a 100 casos.");
  return rows;
}
