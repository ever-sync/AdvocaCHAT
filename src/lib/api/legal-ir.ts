import { requireSupabase } from "@/lib/supabase";
import type { IrAssessmentVersion, IrCaseContext, IrChecklistItem, IrChecklistPayload, IrChecklistVersion, IrDocumentChecks, IrDocumentReview, IrDocumentReviewMetadata, IrEvidenceEvent, IrEvidencePayload, IrIncomePayload, IrIncomeSource, IrPayer, IrPayerPayload, IrRulePayload, IrRuleVersion, IrSourceProposal, IrStrategy, LegalRepresentation, LegalRepresentationPayload, LegalRepresentedDocumentRequest } from "@/types/legal-ir";

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
async function list<T>(table: string, caseId?: string): Promise<T[]> {
  let query = requireSupabase().from(table).select("*").order("created_at", { ascending: false }).limit(200);
  if (caseId) query = query.eq("case_id", caseId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}
export const getIrCaseContext = (caseId: string) => rpc<IrCaseContext>("ir_get_case_context", { p_case_id: caseId });
export const syncIrAutomationTasks = (caseId: string) => rpc<{ created: number; resolved: number; dismissed: number; active: number }>("legal_ir_sync_automation_tasks", { p_case_id: caseId });
export const listIrPayers = (caseId: string) => list<IrPayer>("ir_payers", caseId);
export const saveIrPayer = (caseId: string, payload: IrPayerPayload, id?: string) => rpc<IrPayer>("ir_save_payer", { p_case_id: caseId, p_payload: payload, p_payer_id: id ?? null });
export const listIrIncomeSources = (caseId: string) => list<IrIncomeSource>("ir_income_sources", caseId);
export const saveIrIncomeSource = (caseId: string, payload: IrIncomePayload, id?: string) => rpc<IrIncomeSource>("ir_save_income_source", { p_case_id: caseId, p_payload: payload, p_source_id: id ?? null });
export const listIrEvidenceEvents = (caseId: string) => list<IrEvidenceEvent>("ir_evidence_events", caseId);
export const addIrEvidenceEvent = (caseId: string, payload: IrEvidencePayload) => rpc<IrEvidenceEvent>("ir_add_evidence_event", { p_case_id: caseId, p_payload: payload });
export const listIrDocumentReviews = (caseId: string) => list<IrDocumentReview>("ir_document_reviews", caseId);
export const recordIrDocumentReview = (documentId: string, checks: IrDocumentChecks, result: IrDocumentReview["result"], note: string, metadata: IrDocumentReviewMetadata = {}) => rpc<IrDocumentReview>("ir_record_document_review", { p_document_id: documentId, p_checks: checks, p_result: result, p_note: note, p_metadata: metadata });
export const listIrRuleVersions = () => list<IrRuleVersion>("ir_rule_versions");
export const createIrRuleVersion = (payload: IrRulePayload) => rpc<IrRuleVersion>("ir_create_rule_version", { p_payload: payload });
export const reviewIrRuleVersion = (versionId: string, decision: "approved" | "rejected", note: string) => rpc<IrRuleVersion>("ir_review_rule_version", { p_version_id: versionId, p_decision: decision, p_note: note });
export const listIrChecklistVersions = () => list<IrChecklistVersion>("ir_checklist_template_versions");
export const createIrChecklistVersion = (payload: IrChecklistPayload) => rpc<IrChecklistVersion>("ir_create_checklist_version", { p_payload: payload });
export const listIrChecklistItems = (caseId: string) => list<IrChecklistItem>("ir_case_checklist_items", caseId);
export const applyIrChecklist = (caseId: string, versionId: string, payerId?: string) => rpc<IrChecklistItem[]>("ir_apply_checklist", { p_case_id: caseId, p_version_id: versionId, p_payer_id: payerId ?? null });
export const linkIrChecklistRequest = (itemId: string, requestId: string) => rpc<IrChecklistItem>("ir_link_checklist_request", { p_item_id: itemId, p_request_id: requestId });
export const waiveIrChecklistItem = (itemId: string, reason: string) => rpc<IrChecklistItem>("ir_waive_checklist_item", { p_item_id: itemId, p_reason: reason });
export const listIrAssessmentVersions = (caseId: string) => list<IrAssessmentVersion>("ir_assessment_versions", caseId);
export const createIrAssessmentVersion = (caseId: string, proposals: IrSourceProposal[], strategy: IrStrategy, summary: string) => rpc<IrAssessmentVersion>("ir_create_assessment_version", { p_case_id: caseId, p_source_proposals: proposals, p_strategy: strategy, p_summary: summary });
export const submitIrAssessmentReview = (versionId: string) => rpc<IrAssessmentVersion>("ir_submit_assessment_review", { p_version_id: versionId });
export const reviewIrAssessment = (versionId: string, decision: "approved" | "returned", note: string) => rpc<IrAssessmentVersion>("ir_review_assessment", { p_version_id: versionId, p_decision: decision, p_note: note });
export const listLegalRepresentations = (caseId: string) => list<LegalRepresentation>("legal_representations", caseId);
export const listLegalRepresentedDocumentRequests = (caseId: string) => list<LegalRepresentedDocumentRequest>("legal_document_requests", caseId);
export const createLegalRepresentation = (caseId: string, payload: LegalRepresentationPayload) => rpc<LegalRepresentation>("legal_create_representation", { p_case_id: caseId, p_payload: payload });
export const activateLegalRepresentation = (id: string, note: string) => rpc<LegalRepresentation>("legal_activate_representation", { p_representation_id: id, p_review_note: note });
export const revokeLegalRepresentation = (id: string, reason: string) => rpc<LegalRepresentation>("legal_revoke_representation", { p_representation_id: id, p_reason: reason });
export const setLegalRequestRepresentation = (requestId: string, representationId: string | null) => rpc<LegalRepresentedDocumentRequest>("legal_set_request_representation", { p_request_id: requestId, p_representation_id: representationId });
