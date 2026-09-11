import { requireSupabase } from "@/lib/supabase";
import type * as E from "@/types/legal-expansion";
import type { LegalCaseTask } from "@/types/legal-operations";
async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let request = requireSupabase().rpc(name, params);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(expansionError(error));
  return data as T;
}
export function expansionError(error: { code?: string; message?: string }) {
  const m = error.message ?? "";
  if (
    error.code === "42501" ||
    /forbidden|access_denied|permission_denied/.test(m)
  )
    return "Seu acesso atual não permite esta operação. Atualize o caso para conferir as permissões.";
  if (/stale|superseded|not_current|snapshot|preview_changed/.test(m))
    return "Uma versão, prova ou autorização mudou. Atualize os dados e faça uma nova conferência.";
  if (/unresolved|unreconciled|pending_attempt|ambiguous/.test(m))
    return "A tentativa anterior ainda exige conferência. Registre e confira o resultado antes de preparar outra.";
  if (
    /receipt.*duplicate|proof.*duplicate|already_used|duplicate/.test(m) ||
    error.code === "23505"
  )
    return "Já existe um registro correspondente. Confira a tentativa e a prova antes de repetir.";
  if (/not_configured|permission_required|adapter_unimplemented/.test(m))
    return "Esta operação externa não está implementada, configurada ou autorizada para o escritório.";
  if (
    /missing|invalid|required|not_ready|limit|state/.test(m) ||
    ["22023", "23514", "23502"].includes(error.code ?? "")
  )
    return "Confira os campos obrigatórios, as provas e o estado atual do registro. A operação não foi concluída.";
  return "Não foi possível concluir a operação. Atualize os dados e tente novamente.";
}
export const getExpansionContext = (caseId: string, signal?: AbortSignal) =>
  rpc<E.ExpansionContext>(
    "legal_expansion_context",
    { p_case_id: caseId },
    signal,
  );
export const listExpansion = (
  caseId: string,
  kind: E.ExpansionListKind,
  limit = 25,
  offset = 0,
  signal?: AbortSignal,
) =>
  rpc<E.ExpansionPage<E.ExpansionMetadata>>(
    "legal_expansion_list",
    { p_case_id: caseId, p_kind: kind, p_limit: limit, p_offset: offset },
    signal,
  );
export const createCoverage = (payload: E.ExpansionCoverageInput) =>
  rpc<E.ExpansionMetadata>("legal_operation_create_coverage", {
    p_payload: payload,
  });
export const reviewCoverage = (
  id: string,
  decision: "reviewed" | "revoked",
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_operation_review_coverage", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const recordHomologation = (
  id: string,
  payload: E.ExpansionHomologationInput,
) =>
  rpc<E.ExpansionHomologation>("legal_operation_record_homologation", {
    p_version_id: id,
    p_payload: payload,
  });
export const readCoverage = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionCoverageRead>(
    "legal_operation_read_coverage",
    { p_version_id: id },
    signal,
  );
export const createExternalAct = (
  caseId: string,
  payload: E.ExpansionActInput,
) =>
  rpc<E.ExpansionMetadata>("legal_external_act_create_version", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const submitExternalAct = (id: string) =>
  rpc<E.ExpansionMetadata>("legal_external_act_submit", { p_version_id: id });
export const reviewExternalAct = (
  id: string,
  decision: "ready" | "returned" | "revoked",
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_external_act_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const readExternalAct = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionActRead>(
    "legal_external_act_read",
    { p_version_id: id },
    signal,
  );
export const prepareExternalAttempt = (id: string, key: string, note: string) =>
  rpc<E.ExpansionAttempt>("legal_external_act_prepare_attempt", {
    p_version_id: id,
    p_idempotency_key: key,
    p_note: note,
  });
export const reportExternalAttempt = (
  id: string,
  state: "reported_external" | "unknown" | "not_sent",
  note: string,
) =>
  rpc<E.ExpansionAttempt>("legal_external_act_report_attempt", {
    p_attempt_id: id,
    p_state: state,
    p_note: note,
  });
export const recordExternalReceipt = (
  id: string,
  payload: E.ExpansionReceiptInput,
) =>
  rpc<E.ExpansionReceipt>("legal_external_act_record_receipt", {
    p_attempt_id: id,
    p_payload: payload,
  });
export const reconcileExternalReceipt = (
  id: string,
  decision: "reviewed" | "returned",
  checks: E.ExpansionReceiptChecks,
  note: string,
) =>
  rpc<E.ExpansionReceipt>("legal_external_act_reconcile", {
    p_receipt_id: id,
    p_decision: decision,
    p_checks: checks,
    p_note: note,
  });
export const createSuccession = (
  caseId: string,
  payload: E.ExpansionSuccessionInput,
) =>
  rpc<E.ExpansionMetadata>("legal_succession_create_version", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const submitSuccession = (id: string) =>
  rpc<E.ExpansionMetadata>("legal_succession_submit", { p_version_id: id });
export const reviewSuccession = (
  id: string,
  decision: "reviewed" | "returned" | "revoked",
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_succession_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const readSuccession = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionSuccessionRead>(
    "legal_succession_read",
    { p_version_id: id },
    signal,
  );
export const recordSuccessionAuthority = (
  id: string,
  payload: E.ExpansionSuccessionAuthorityInput,
) =>
  rpc<E.ExpansionSuccessionAuthority>("legal_succession_record_authority", {
    p_version_id: id,
    p_payload: payload,
  });
export const revokeSuccessionAuthority = (id: string, note: string) =>
  rpc<E.ExpansionSuccessionAuthority>("legal_succession_revoke_authority", {
    p_authority_id: id,
    p_note: note,
  });
export const recordSuccessionEvent = (
  id: string,
  payload: E.ExpansionSuccessionEventInput,
) =>
  rpc<E.ExpansionSuccessionEvent>("legal_succession_record_event", {
    p_version_id: id,
    p_payload: payload,
  });
export const createDiligence = (
  caseId: string,
  payload: E.ExpansionDiligenceInput,
) =>
  rpc<E.ExpansionMetadata>("legal_diligence_create_version", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const reviewDiligence = (
  id: string,
  decision: "approved" | "returned" | "revoked" | "completed",
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_diligence_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const readDiligence = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionDiligenceRead>(
    "legal_diligence_read",
    { p_version_id: id },
    signal,
  );
export const createDiligenceInvite = (
  id: string,
  payload: E.ExpansionDiligenceInviteInput,
) =>
  rpc<E.ExpansionMetadata>("legal_diligence_create_invite", {
    p_version_id: id,
    p_payload: payload,
  });
export const reviewDiligenceInvite = (
  id: string,
  decision: "approved" | "rejected",
  documentId: string,
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_diligence_review_invite", {
    p_invite_id: id,
    p_decision: decision,
    p_evidence_document_id: documentId,
    p_note: note,
  });
export const revokeDiligenceInvite = (id: string, note: string) =>
  rpc<E.ExpansionMetadata>("legal_diligence_revoke_invite", {
    p_invite_id: id,
    p_note: note,
  });
export const reviewDiligenceDelivery = (
  id: string,
  decision: "reviewed" | "returned",
  note: string,
) =>
  rpc<E.ExpansionDiligenceDelivery>("legal_diligence_review_delivery", {
    p_delivery_id: id,
    p_decision: decision,
    p_note: note,
  });
export const createSpecialty = (payload: E.ExpansionSpecialtyInput) =>
  rpc<E.ExpansionMetadata>("legal_specialty_create_version", {
    p_payload: payload,
  });
export const reviewSpecialty = (
  id: string,
  decision: "reviewed" | "revoked",
  note: string,
) =>
  rpc<E.ExpansionMetadata>("legal_specialty_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const readSpecialty = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionSpecialtyRead>(
    "legal_specialty_read",
    { p_version_id: id },
    signal,
  );
export const previewSpecialty = (caseId: string, id: string) =>
  rpc<E.ExpansionSpecialtyPreview>("legal_specialty_preview", {
    p_case_id: caseId,
    p_version_id: id,
  });
export const applySpecialty = (
  caseId: string,
  id: string,
  previewHash: string,
  key: string,
) =>
  rpc<{
    installation_id: string;
    already_applied: boolean;
    items: E.ExpansionSpecialtyItem[];
  }>("legal_specialty_apply", {
    p_case_id: caseId,
    p_version_id: id,
    p_preview_hash: previewHash,
    p_idempotency_key: key,
  });
export const readSpecialtyInstallation = (id: string, signal?: AbortSignal) =>
  rpc<E.ExpansionSpecialtyInstallationRead>(
    "legal_specialty_installation",
    { p_installation_id: id },
    signal,
  );
export const updateSpecialtyItem = (
  id: string,
  state: "open" | "completed" | "disabled",
  note: string,
) =>
  rpc<E.ExpansionSpecialtyItem>("legal_specialty_update_item", {
    p_item_id: id,
    p_state: state,
    p_note: note,
  });
export const createSpecialtyTask = (
  id: string,
  input: { due_at: string; assignee_id: string; substitute_id?: string | null },
) =>
  rpc<LegalCaseTask>("legal_specialty_create_task", {
    p_item_id: id,
    p_due_at: input.due_at,
    p_assignee_id: input.assignee_id,
    p_substitute_id: input.substitute_id ?? null,
  });
export interface ExpansionRepresentationOption {
  id: string;
  case_id: string;
  category: E.ExpansionCategory;
  representative_party_id: string;
  basis: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
}
export interface ExpansionInstrumentOption {
  id: string;
  case_id: string;
  category: E.ExpansionCategory;
  instrument_id: string;
  version_number: number;
  status: string;
  superseded_at: string | null;
  title: string;
}
export async function listExpansionRepresentationOptions(caseId: string) {
  const { data, error } = await requireSupabase()
    .from("legal_representations")
    .select(
      "id,case_id,category,representative_party_id,basis,status,valid_from,valid_until",
    )
    .eq("case_id", caseId)
    .limit(100);
  if (error) throw new Error(expansionError(error));
  return (data ?? []) as ExpansionRepresentationOption[];
}
export async function listExpansionInstrumentOptions(caseId: string) {
  const db = requireSupabase();
  const [versions, instruments] = await Promise.all([
    db
      .from("legal_instrument_versions")
      .select(
        "id,case_id,category,instrument_id,version_number,status,superseded_at",
      )
      .eq("case_id", caseId)
      .eq("status", "approved")
      .is("superseded_at", null)
      .limit(100),
    db
      .from("legal_instruments")
      .select("id,title")
      .eq("case_id", caseId)
      .limit(100),
  ]);
  if (versions.error || instruments.error)
    throw new Error(expansionError(versions.error ?? instruments.error!));
  return (versions.data ?? []).map((v) => ({
    ...v,
    title:
      instruments.data?.find((i) => i.id === v.instrument_id)?.title ??
      "Instrumento autorizado",
  })) as ExpansionInstrumentOption[];
}
export async function issueDiligenceLink(
  inviteId: string,
  idempotencyKey: string,
  rotate = false,
) {
  const { invokeAuthedFunction } = await import("./functions");
  await invokeAuthedFunction("legal-diligence-access", {
    action: "provision",
    invite_id: inviteId,
    idempotency_key: idempotencyKey,
  });
  return invokeAuthedFunction<{
    activation_path: string;
    expires_at: string;
    revision: number;
  }>("legal-diligence-access", {
    action: rotate ? "rotate" : "issue",
    invite_id: inviteId,
  });
}
export async function configureExpansionConnection(
  coverageVersionId: string,
  configured: boolean,
) {
  const { invokeAuthedFunction } = await import("./functions");
  try {
    return await invokeAuthedFunction<E.ExpansionConnection>(
      "legal-diligence-access",
      {
        action: "configure_operation",
        coverage_version_id: coverageVersionId,
        configured,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "HTTP 409") {
      throw new Error(
        "A configuração institucional não está vinculada ou não atende à cobertura selecionada. Nenhuma operação externa foi ativada.",
      );
    }
    throw error;
  }
}
export async function readDiligenceDocument(
  versionId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; file_name: string }> {
  const { supabaseUrl, supabaseAnonKey } = await import("@/lib/supabase");
  const {
    data: { session },
    error,
  } = await requireSupabase().auth.getSession();
  if (error || !session)
    throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(
    `${supabaseUrl}/functions/v1/legal-diligence-documents`,
    {
      method: "POST",
      signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "staff_download",
        version_id: versionId,
        document_id: documentId,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "O arquivo da diligência não está disponível com sua autorização atual.",
    );
  const disposition = response.headers.get("content-disposition") ?? "";
  let name = "arquivo-diligencia";
  const extended = disposition.match(/filename\*=UTF-8''([^;]+)/i),
    plain = disposition.match(/filename="([^"]+)"/i);
  try {
    name = extended ? decodeURIComponent(extended[1]) : (plain?.[1] ?? name);
  } catch {
    /* use safe fallback */
  }
  return {
    blob: await response.blob(),
    file_name: Array.from(name)
      .map((char) => {
        const code = char.codePointAt(0)!;
        return code < 32 || code === 127 || char === "/" || char === "\\"
          ? "_"
          : char;
      })
      .join("")
      .slice(0, 200),
  };
}
