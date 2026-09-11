import { requireSupabase } from "@/lib/supabase";
import type * as A from "@/types/legal-assistance";
async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let query = requireSupabase().rpc(name, params);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(assistanceError(error));
  return data as T;
}
function assistanceError(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  if (
    error.code === "42501" ||
    /forbidden|not_authorized|access_denied|permission_denied/.test(message)
  )
    return "Seu acesso atual não permite esta operação. Atualize o caso para conferir as permissões.";
  if (/stale|superseded|not_current|source_changed/.test(message))
    return "Uma fonte ou versão mudou. Atualize os dados e confira uma nova versão antes de continuar.";
  if (/quota|budget/.test(message))
    return "O limite autorizado de processamento ou orçamento foi atingido. Consulte o consumo do escritório.";
  if (/not_configured|policy_required|disabled/.test(message))
    return "O processamento não está configurado ou autorizado para este escritório.";
  if (
    /invalid_citation|citation.*invalid|quote|source_unavailable/.test(message)
  )
    return "Uma referência não pôde ser confirmada na fonte atual. Selecione novamente o trecho autorizado.";
  if (
    /already_running|live_job|duplicate|conflict/.test(message) ||
    error.code === "23505"
  )
    return "Já existe uma solicitação ou versão correspondente. Atualize os dados antes de tentar novamente.";
  if (
    /invalid|missing|required|limit|not_ready|state/.test(message) ||
    ["22023", "23514", "23502"].includes(error.code ?? "")
  )
    return "Confira os campos, os limites e o estado da versão. A operação não foi concluída.";
  return "Não foi possível concluir a operação de assistência. Atualize os dados e tente novamente.";
}
export const getAssistanceContext = (caseId: string, signal?: AbortSignal) =>
  rpc<A.AssistanceContext>(
    "legal_assistance_context",
    { p_case_id: caseId },
    signal,
  );
export const listAssistance = <K extends keyof A.AssistanceListKinds>(
  caseId: string,
  kind: K,
  limit = 25,
  offset = 0,
  signal?: AbortSignal,
) =>
  rpc<A.AssistancePageResult<A.AssistanceListKinds[K]>>(
    "legal_assistance_list",
    { p_case_id: caseId, p_kind: kind, p_limit: limit, p_offset: offset },
    signal,
  );
export const configureAssistanceOcr = (
  enabled: boolean,
  monthlyPages: number,
  maxPages: number,
) =>
  rpc<A.AssistanceSettings>("legal_assistance_configure_ocr", {
    p_enabled: enabled,
    p_monthly_page_limit: monthlyPages,
    p_max_pages: maxPages,
  });
export const enqueueAssistanceOcr = (
  documentId: string,
  idempotencyKey: string,
  previousJobId?: string,
) =>
  rpc<A.AssistanceOcrJob>("legal_ocr_enqueue", {
    p_document_id: documentId,
    p_idempotency_key: idempotencyKey,
    p_previous_job_id: previousJobId ?? null,
  });
export const cancelAssistanceOcr = (id: string, note: string) =>
  rpc<A.AssistanceOcrJob>("legal_ocr_cancel", { p_job_id: id, p_note: note });
export const createAssistanceTextVersion = (
  documentId: string,
  payload: A.AssistanceTextInput,
) =>
  rpc<A.AssistanceTextVersion>("legal_text_create_version", {
    p_document_id: documentId,
    p_payload: payload,
  });
export const listAssistanceTextPages = (
  versionId: string,
  limit = 20,
  offset = 0,
  signal?: AbortSignal,
) =>
  rpc<A.AssistancePageResult<A.AssistanceTextPageMetadata>>(
    "legal_text_list_pages",
    { p_version_id: versionId, p_limit: limit, p_offset: offset },
    signal,
  );
export const readAssistanceTextPage = (
  versionId: string,
  pageNumber: number,
  signal?: AbortSignal,
) =>
  rpc<A.AssistanceReadPage>(
    "legal_text_read_page",
    { p_version_id: versionId, p_page_number: pageNumber },
    signal,
  );
export const submitAssistanceText = (id: string) =>
  rpc<A.AssistanceTextVersion>("legal_text_submit", { p_version_id: id });
export const reviewAssistanceTextPages = (
  id: string,
  pages: number[],
  decision: "approved" | "returned",
  note: string,
) =>
  rpc<A.AssistanceTextVersion>("legal_text_review_pages", {
    p_version_id: id,
    p_page_numbers: pages,
    p_decision: decision,
    p_note: note,
  });
export const revokeAssistanceText = (id: string, note: string) =>
  rpc<A.AssistanceTextVersion>("legal_text_revoke", {
    p_version_id: id,
    p_note: note,
  });
export const createAssistanceKnowledge = (
  payload: A.AssistanceKnowledgeInput,
) =>
  rpc<A.AssistanceKnowledge>("legal_knowledge_create_version", {
    p_payload: payload,
  });
export const reviewAssistanceKnowledge = (
  id: string,
  decision: "approved" | "rejected" | "revoked",
  note: string,
) =>
  rpc<A.AssistanceKnowledge>("legal_knowledge_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const readAssistanceKnowledge = (id: string, signal?: AbortSignal) =>
  rpc<A.AssistanceKnowledgeRead>(
    "legal_knowledge_read",
    { p_version_id: id },
    signal,
  );
export const searchAssistance = (
  caseId: string,
  query: string,
  sources: A.AssistanceSearchSource[],
  limit = 10,
  signal?: AbortSignal,
) =>
  rpc<{ citations: A.AssistanceCitation[]; has_more: boolean }>(
    "legal_assistance_search",
    { p_case_id: caseId, p_query: query, p_sources: sources, p_limit: limit },
    signal,
  );
export const readAssistanceCitation = (id: string, signal?: AbortSignal) =>
  rpc<A.AssistanceCitation>(
    "legal_assistance_read_citation",
    { p_citation_id: id },
    signal,
  );
export const createAssistanceDraft = (
  caseId: string,
  payload: A.AssistanceDraftInput,
) =>
  rpc<A.AssistanceDraftVersion>("legal_assistance_create_draft", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const readAssistanceDraft = (id: string, signal?: AbortSignal) =>
  rpc<A.AssistanceDraftRead>(
    "legal_assistance_read_draft",
    { p_version_id: id },
    signal,
  );
export const submitAssistanceDraft = (id: string) =>
  rpc<A.AssistanceDraftVersion>("legal_assistance_submit", {
    p_version_id: id,
  });
export const reviewAssistanceDraft = (
  id: string,
  decision: "reviewed" | "returned" | "revoked",
  note: string,
) =>
  rpc<A.AssistanceDraftVersion>("legal_assistance_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const transferAssistanceDraft = (
  id: string,
  input: A.AssistanceTransferInput,
) =>
  rpc<{
    target_kind: "instrument" | "publication";
    target_id: string;
    source_version_id: string;
  }>("legal_assistance_use_draft", {
    p_version_id: id,
    p_target_kind: input.target_kind,
    p_payload: input.payload,
  });
export const createAssistancePolicy = (payload: A.AssistancePolicyInput) =>
  rpc<A.AssistancePolicy>("legal_ai_create_policy_version", {
    p_payload: payload,
  });
export const reviewAssistancePolicy = (
  id: string,
  decision: "approved" | "rejected" | "revoked",
  note: string,
) =>
  rpc<A.AssistancePolicy>("legal_ai_review_policy", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const enqueueAssistanceAi = (
  caseId: string,
  payload: A.AssistanceAiInput,
) =>
  rpc<A.AssistanceAiJob>("legal_ai_enqueue", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const cancelAssistanceAi = (id: string, note: string) =>
  rpc<A.AssistanceAiJob>("legal_ai_cancel", { p_job_id: id, p_note: note });

/** Existing F1 audited endpoint; returns bytes only so the view can discard a late read after revocation. */
export async function readAssistanceOriginal(
  documentId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { supabaseUrl, supabaseAnonKey } = await import("@/lib/supabase");
  const {
    data: { session },
    error,
  } = await requireSupabase().auth.getSession();
  if (error || !session)
    throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${supabaseUrl}/functions/v1/legal-documents`, {
    method: "POST",
    signal,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "download", document_id: documentId }),
  });
  if (!response.ok)
    throw new Error(
      "O documento original não está disponível com sua autorização atual.",
    );
  return response.blob();
}
export async function configureAssistanceAi(
  policyVersionId: string,
  enabled: boolean,
) {
  const { invokeAuthedFunction } = await import("./functions");
  return invokeAuthedFunction<{ connection: A.AssistanceAiConnection }>(
    "legal-assistance-dispatch",
    { action: "configure", policy_version_id: policyVersionId, enabled },
  );
}
