import { judicialErrorMessage } from "@/lib/legal-judicial-errors";
import { requireSupabase } from "@/lib/supabase";
import { invokeAuthedFunction } from "./functions";
import type * as J from "@/types/legal-judicial";
async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let query = requireSupabase().rpc(name, params);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error(judicialErrorMessage(error));
  return data as T;
}
export const getJudicialContext = (caseId?: string, signal?: AbortSignal) =>
  rpc<J.JudicialContext>(
    "legal_judicial_context",
    { p_case_id: caseId ?? null },
    signal,
  );
export const createJudicialSource = (payload: J.JudicialSourceInput) =>
  rpc<J.JudicialSourceVersion>("legal_judicial_create_source_version", {
    p_payload: payload,
  });
export const reviewJudicialSource = (
  id: string,
  decision: "approved" | "rejected" | "revoked",
  note: string,
) =>
  rpc<J.JudicialSourceVersion>("legal_judicial_review_source", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const configureJudicialConnection = (
  provider: J.JudicialProvider,
  sourceVersionId: string,
  enabled: boolean,
  limits: {
    environment: "production";
    requests_per_minute: number;
    requests_per_day: number;
  },
) =>
  invokeAuthedFunction<{ connection: J.JudicialConnection }>(
    "legal-judicial-dispatch",
    {
      action: "configure",
      provider,
      source_version_id: sourceVersionId,
      enabled,
      limits,
    },
  );
export const saveJudicialCoverage = (
  connectionId: string,
  payload: J.JudicialCoverageInput,
  id?: string,
) =>
  rpc<J.JudicialCoverage>("legal_judicial_save_coverage", {
    p_connection_id: connectionId,
    p_payload: payload,
    p_coverage_id: id ?? null,
  });
export const enqueueJudicialJob = (
  connectionId: string,
  payload: J.JudicialJobInput,
) =>
  rpc<J.JudicialJob>("legal_judicial_enqueue", {
    p_connection_id: connectionId,
    p_payload: payload,
  });
export const retryJudicialJob = (id: string, note: string) =>
  rpc<J.JudicialJob>("legal_judicial_retry_job", {
    p_job_id: id,
    p_note: note,
  });
export const cancelJudicialJob = (id: string, note: string) =>
  rpc<J.JudicialJob>("legal_judicial_cancel_job", {
    p_job_id: id,
    p_note: note,
  });
export const recordJudicialManualEvent = (
  caseId: string,
  payload: J.JudicialManualEventInput,
) =>
  rpc<J.JudicialInbox>("legal_judicial_record_manual_event", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const reviewJudicialAssociation = (
  id: string,
  caseId: string,
  proceedingId: string,
  decision: "confirmed" | "rejected",
  evidenceId: string,
  note: string,
) =>
  rpc<J.JudicialInbox>("legal_judicial_review_association", {
    p_inbox_id: id,
    p_case_id: caseId,
    p_proceeding_id: proceedingId,
    p_decision: decision,
    p_evidence_document_id: evidenceId,
    p_note: note,
  });
export const readJudicialOriginal = (id: string, signal?: AbortSignal) =>
  rpc<{ original_text: string; content_type: string; sha256: string }>(
    "legal_judicial_read_original",
    { p_inbox_id: id },
    signal,
  );
export const assignJudicialItem = (
  id: string,
  assigneeId: string,
  substituteId: string | null,
  dueAt: string | null,
  note: string,
) =>
  rpc<J.JudicialTriage>("legal_judicial_assign", {
    p_inbox_id: id,
    p_assignee_id: assigneeId,
    p_substitute_id: substituteId,
    p_due_at: dueAt,
    p_note: note,
  });
export const acceptJudicialAssignment = (id: string, note: string) =>
  rpc<J.JudicialTriage>("legal_judicial_accept_assignment", {
    p_triage_id: id,
    p_note: note,
  });
export const updateJudicialTaskStatus = (
  id: string,
  status: "open" | "completed" | "cancelled",
  note: string,
) =>
  rpc("legal_judicial_update_task_status", {
    p_task_id: id,
    p_status: status,
    p_note: note,
  });
export const createJudicialCalendar = (payload: J.JudicialCalendarInput) =>
  rpc<J.JudicialCalendarVersion>("legal_deadline_create_calendar_version", {
    p_payload: payload,
  });
export const createJudicialRule = (payload: J.JudicialRuleInput) =>
  rpc<J.JudicialRuleVersion>("legal_deadline_create_rule_version", {
    p_payload: payload,
  });
export const reviewJudicialCalendar = (
  id: string,
  decision: "approved" | "rejected" | "revoked",
  note: string,
) =>
  rpc<J.JudicialCalendarVersion>("legal_deadline_review_calendar", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const reviewJudicialRule = (
  id: string,
  decision: "approved" | "rejected" | "revoked",
  note: string,
) =>
  rpc<J.JudicialRuleVersion>("legal_deadline_review_rule", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const createJudicialDeadline = (
  caseId: string,
  payload: J.JudicialDeadlineInput,
) =>
  rpc<J.JudicialDeadlineVersion>("legal_deadline_create_version", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const submitJudicialDeadline = (id: string) =>
  rpc<J.JudicialDeadlineVersion>("legal_deadline_submit", { p_version_id: id });
export const reviewJudicialDeadline = (
  id: string,
  decision: "reviewed" | "returned",
  note: string,
) =>
  rpc<J.JudicialDeadlineVersion>("legal_deadline_review", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const createJudicialCheckTask = (
  id: string,
  dueAt: string,
  note: string,
) =>
  rpc("legal_deadline_create_check_task", {
    p_version_id: id,
    p_due_at: dueAt,
    p_note: note,
  });
export const readJudicialDeadlineReport = (id: string, signal?: AbortSignal) =>
  rpc<J.JudicialDeadlineReport>(
    "legal_deadline_read_report",
    { p_version_id: id },
    signal,
  );
