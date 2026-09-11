import { requireSupabase, supabaseAnonKey, supabaseUrl } from "@/lib/supabase";
import type { LegalDocumentCategory } from "@/types/legal";
import type { LegalOperationSettings, LegalCaseOperation, LegalInterviewTemplate, LegalInterviewVersion, LegalInterviewSubmission, LegalInterviewQuestion, LegalConflictReview, LegalConflictDecision, LegalDocumentRequest, LegalInstrument, LegalInstrumentVersion, LegalInstrumentType, LegalExternalSignatureRecord, LegalTaskTemplate, LegalCaseTask, LegalTaskPayload, LegalAppointment, LegalAppointmentPayload } from "@/types/legal-operations";
async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
async function rows<T>(table: string, field?: string, id?: string, order = "created_at"): Promise<T[]> {
  let query = requireSupabase().from(table).select("*").limit(200);
  if (field && id) query = query.eq(field, id);
  if (order) query = query.order(order, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
export async function getLegalOperationSettings() { return (await rows<LegalOperationSettings>("legal_operation_settings", undefined, undefined, ""))[0] ?? null; }
export function configureLegalOperations(input: Pick<LegalOperationSettings, "services" | "pipeline_stages" | "closure_reasons">) { return rpc<LegalOperationSettings>("legal_configure_operations", { p_services: input.services, p_pipeline_stages: input.pipeline_stages, p_closure_reasons: input.closure_reasons }); }
export async function getLegalCaseOperation(caseId: string) { return (await rows<LegalCaseOperation>("legal_case_operations", "case_id", caseId, ""))[0] ?? null; }
export function setLegalCaseOperation(caseId: string, input: Omit<LegalCaseOperation, "case_id">) { return rpc<LegalCaseOperation>("legal_set_case_operation", { p_case_id: caseId, p_service_name: input.service_name, p_stage_name: input.stage_name, p_closure_reason: input.closure_reason }); }
export const listLegalInterviewTemplates = () => rows<LegalInterviewTemplate>("legal_interview_templates");
export const listLegalInterviewVersions = (templateId: string) => rows<LegalInterviewVersion>("legal_interview_template_versions", "template_id", templateId, "version_number");
export async function getLegalInterviewVersion(versionId: string) { return (await rows<LegalInterviewVersion>("legal_interview_template_versions", "id", versionId))[0] ?? null; }
export const listLegalInterviewSubmissions = (caseId: string) => rows<LegalInterviewSubmission>("legal_interview_submissions", "case_id", caseId);
export function createLegalInterviewTemplate(input: { title: string; category: LegalDocumentCategory; questions: LegalInterviewQuestion[] }) { return rpc<LegalInterviewTemplate>("legal_create_interview_template", { p_title: input.title, p_category: input.category, p_questions: input.questions }); }
export function addLegalInterviewVersion(templateId: string, questions: LegalInterviewQuestion[]) { return rpc<LegalInterviewVersion>("legal_add_interview_version", { p_template_id: templateId, p_questions: questions }); }
export function submitLegalInterview(caseId: string, versionId: string, answers: LegalInterviewSubmission["answers"]) { return rpc<LegalInterviewSubmission>("legal_submit_interview", { p_case_id: caseId, p_template_version_id: versionId, p_answers: answers }); }
export const listLegalConflictReviews = (caseId: string) => rows<LegalConflictReview>("legal_conflict_reviews", "case_id", caseId);
export function recordLegalConflictReview(caseId: string, decision: LegalConflictDecision, notes: string) { return rpc<LegalConflictReview>("legal_record_conflict_review", { p_case_id: caseId, p_decision: decision, p_notes: notes }); }
export const listLegalDocumentRequests = (caseId: string) => rows<LegalDocumentRequest>("legal_document_requests", "case_id", caseId);
export function createLegalDocumentRequest(caseId: string, input: { category: LegalDocumentCategory; title: string; instructions?: string; due_at?: string | null }) { return rpc<LegalDocumentRequest>("legal_create_document_request", { p_case_id: caseId, p_category: input.category, p_title: input.title, p_instructions: input.instructions ?? "", p_due_at: input.due_at ?? null }); }
export function submitLegalDocumentRequest(requestId: string, documentId: string) { return rpc<LegalDocumentRequest>("legal_submit_document_request", { p_request_id: requestId, p_document_id: documentId }); }
export function reviewLegalDocumentRequest(requestId: string, decision: "approved" | "rejected", note: string) { return rpc<LegalDocumentRequest>("legal_review_document_request", { p_request_id: requestId, p_decision: decision, p_note: note }); }
export function cancelLegalDocumentRequest(requestId: string, reason: string) { return rpc<LegalDocumentRequest>("legal_cancel_document_request", { p_request_id: requestId, p_reason: reason }); }
export async function issueLegalDocumentRequestLink(requestId: string): Promise<{ url: string; expires_at: string }> {
  const { data: { session }, error } = await requireSupabase().auth.getSession();
  if (error || !session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${supabaseUrl}/functions/v1/legal-document-requests`, { method: "POST", headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "issue", request_id: requestId }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Não foi possível gerar o link.");
  const url = new URL("/enviar-documento", window.location.origin); url.hash = new URLSearchParams({ token: data.token }).toString();
  return { url: url.toString(), expires_at: data.expires_at };
}
export const listLegalInstruments = (caseId: string) => rows<LegalInstrument>("legal_instruments", "case_id", caseId);
export const listLegalInstrumentVersions = (instrumentId: string) => rows<LegalInstrumentVersion>("legal_instrument_versions", "instrument_id", instrumentId, "version_number");
export function createLegalInstrument(caseId: string, input: { instrument_type: LegalInstrumentType; title: string; category: LegalDocumentCategory; content: string }) { return rpc<LegalInstrument>("legal_create_instrument", { p_case_id: caseId, p_instrument_type: input.instrument_type, p_title: input.title, p_category: input.category, p_content: input.content }); }
export function addLegalInstrumentVersion(instrumentId: string, content: string) { return rpc<LegalInstrumentVersion>("legal_add_instrument_version", { p_instrument_id: instrumentId, p_content: content }); }
export function submitLegalInstrumentReview(versionId: string) { return rpc<LegalInstrumentVersion>("legal_submit_instrument_review", { p_version_id: versionId }); }
export function reviewLegalInstrument(versionId: string, decision: "approved" | "revoked", note: string) { return rpc<LegalInstrumentVersion>("legal_review_instrument", { p_version_id: versionId, p_decision: decision, p_note: note }); }
export const listLegalExternalSignatures = (caseId: string) => rows<LegalExternalSignatureRecord>("legal_external_signature_records", "case_id", caseId);
export function recordLegalExternalSignature(versionId: string, documentId: string, evidenceNote: string) { return rpc<LegalExternalSignatureRecord>("legal_record_external_signature", { p_version_id: versionId, p_document_id: documentId, p_evidence_note: evidenceNote }); }
export const listLegalTaskTemplates = () => rows<LegalTaskTemplate>("legal_task_templates");
export function saveLegalTaskTemplate(input: { title: string; notes?: string; default_due_days?: number | null }, id?: string) { return rpc<LegalTaskTemplate>("legal_save_task_template", { p_title: input.title, p_notes: input.notes ?? "", p_default_due_days: input.default_due_days ?? null, p_template_id: id ?? null }); }
export const listLegalCaseTasks = (caseId: string) => rows<LegalCaseTask>("legal_case_tasks", "case_id", caseId);
export function saveLegalCaseTask(caseId: string, input: LegalTaskPayload, id?: string) { return rpc<LegalCaseTask>("legal_save_case_task", { p_case_id: caseId, p_payload: input, p_task_id: id ?? null }); }
export const listLegalAppointments = (caseId: string) => rows<LegalAppointment>("legal_appointments", "case_id", caseId);
export function saveLegalAppointment(caseId: string, input: LegalAppointmentPayload, id?: string) { return rpc<LegalAppointment>("legal_save_appointment", { p_case_id: caseId, p_payload: input, p_appointment_id: id ?? null }); }
