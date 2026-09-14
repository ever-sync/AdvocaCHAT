import type { LegalDocumentCategory } from "./legal";
import type { LegalDocumentRequest } from "./legal-operations";

export type IrWorkflowStatus = "incomplete" | "in_legal_review" | "proposed" | "decision_recorded";
export type IrPayerType = "inss" | "rpps" | "military" | "supplementary" | "employer" | "other";
export type IrIncomeKind = "retirement" | "pension" | "military_retirement" | "paid_reserve" | "salary" | "rent" | "supplementary_benefit" | "supplementary_redemption" | "other";
export type IrRegime = "rgps" | "rpps" | "military" | "supplementary" | "other" | "unknown";
export type IrProductType = "none" | "pgbl" | "vgbl" | "other" | "unknown";
export type IrPensionKind = "survivor" | "alimony" | "other" | "unknown";
export type IrIncomeEvent = "recurring" | "lump_sum" | "unknown";
export type IrEvidenceType = "disease_onset_reported" | "diagnosis_reported" | "medical_report_issued" | "medical_evidence_received" | "benefit_started" | "withholding_started" | "withholding_stopped" | "tax_document_issued" | "administrative_protocol" | "judicial_protocol" | "other";
export type IrDatePrecision = "exact" | "estimated" | "unknown";
export type IrStrategy = "documents_first" | "administrative" | "judicial" | "combined";
export type IrJson = null | boolean | number | string | IrJson[] | { [key: string]: IrJson };
interface IrRecord { id: string; tenant_id: string; created_at: string }
interface IrCaseRecord extends IrRecord { case_id: string }
export interface IrCaseControl { case_id: string; tenant_id: string; input_revision: number; workflow_status: IrWorkflowStatus; updated_at: string | null }
export interface IrPayerPayload { name: string; payer_type: IrPayerType; registry_number?: string; notes?: string }
export interface IrPayer extends IrCaseRecord, IrPayerPayload { registry_number: string; notes: string; created_by: string; updated_at: string }
export interface IrIncomePayload { payer_id: string; income_kind: IrIncomeKind; regime: IrRegime; product_type?: IrProductType; pension_kind?: IrPensionKind; income_event?: IrIncomeEvent; benefit_number?: string; benefit_start_date?: string | null; withholding_reported: "yes" | "no" | "unknown"; notes?: string }
export interface IrIncomeSource extends IrCaseRecord, IrIncomePayload { product_type: IrProductType; pension_kind: IrPensionKind; income_event: IrIncomeEvent; benefit_number: string; benefit_start_date: string | null; notes: string; created_by: string; updated_at: string }
export interface IrEvidencePayload { category: LegalDocumentCategory; event_type: IrEvidenceType; event_date?: string | null; date_precision: IrDatePrecision; description: string; document_id?: string | null; source_page?: number | null; supersedes_id?: string | null }
export interface IrEvidenceEvent extends IrCaseRecord, IrEvidencePayload { event_date: string | null; document_id: string | null; source_page: number | null; supersedes_id: string | null; created_by: string }
export type IrDocumentCheck = "present" | "absent" | "unclear" | "not_applicable";
export type IrDocumentChecks = Partial<Record<"identity" | "issuer" | "signature" | "date" | "readability" | "source", IrDocumentCheck>>;
export type IrConfirmedDocumentType = "medical_report" | "medical_certificate" | "exam" | "prescription" | "other" | "unknown";
export interface IrDocumentReviewMetadata { issuer_name?: string; professional_registration?: string; document_nature?: "official" | "private" | "unknown"; confirmed_document_type?: IrConfirmedDocumentType; issued_on?: string | null; reported_onset_on?: string | null }
export interface IrDocumentReview extends IrCaseRecord { document_id: string; category: LegalDocumentCategory; checks: IrDocumentChecks; metadata: IrDocumentReviewMetadata; result: "sufficient" | "pending" | "inconsistent"; review_note: string; reviewer_id: string }
export interface IrOfficialSource { url: string; title?: string; checked_on?: string; version_note?: string }
export interface IrRulePayload { rule_key: string; title: string; scope: Record<string, IrJson>; criteria: string; sources: IrOfficialSource[] }
export interface IrRuleVersion extends IrRecord, IrRulePayload { version_number: number; status: "draft" | "approved" | "rejected"; created_by: string; approved_by: string | null; review_note: string; reviewed_at: string | null }
export type IrChecklistStage = "intake" | "decision" | "filing" | "followup";
export interface IrChecklistTemplateItem { key: string; title: string; category: LegalDocumentCategory; gating_stage: IrChecklistStage; required: boolean }
export interface IrChecklistPayload { template_key: string; title: string; payer_types: IrPayerType[]; route: "administrative" | "judicial" | "both"; items: IrChecklistTemplateItem[] }
export interface IrChecklistVersion extends IrRecord, IrChecklistPayload { version_number: number; created_by: string }
export interface IrChecklistItem extends IrCaseRecord { template_version_id: string; item_key: string; payer_id: string | null; category: LegalDocumentCategory; title: string; gating_stage: IrChecklistStage; required: boolean; document_request_id: string | null; waiver_reason: string | null; waived_by: string | null }
export interface IrSourceProposal { source_id: string; proposal: "needs_review" | "proposed_applicable" | "proposed_not_applicable"; rule_version_ids: string[]; evidence_event_ids: string[]; document_ids: string[]; reasoning: string; proposed_start_date?: string | null; start_date_reason?: string }
export interface IrAssessmentVersion extends IrCaseRecord { version_number: number; input_revision: number; input_hash: string; snapshot: IrJson; source_proposals: IrSourceProposal[]; strategy: IrStrategy; summary: string; status: "draft" | "in_review" | "approved" | "superseded"; created_by: string; reviewer_id: string | null; review_note: string; reviewed_at: string | null }
export interface LegalRepresentationPayload { representative_party_id: string; basis: "power_of_attorney" | "court_order" | "legal_guardianship" | "other"; scopes: "document_upload"[]; evidence_document_id: string; instrument_version_id?: string | null; valid_from: string; valid_until?: string | null }
export interface LegalRepresentation extends IrCaseRecord, LegalRepresentationPayload {
  category: LegalDocumentCategory;
  instrument_version_id: string | null;
  valid_until: string | null;
  status: "draft" | "active" | "revoked";
  created_by: string;
  approved_by: string | null;
  approval_note: string;
  approved_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  revoked_at: string | null;
}
export type LegalRepresentationEffectiveStatus = "draft" | "active" | "revoked" | "expired" | "not_started" | "invalid_evidence";
export interface LegalRepresentationState { id: string; effective_status: LegalRepresentationEffectiveStatus }
export interface LegalRepresentedDocumentRequest extends LegalDocumentRequest { representation_id: string | null }
export interface IrChecklistState { item_id: string; document_request_id: string | null; state: LegalDocumentRequest["status"] | "pending" | "waived" }
export interface IrCaseContext {
  control: IrCaseControl;
  can_fiscal: boolean;
  can_medical: boolean;
  can_assess: boolean;
  latest_assessment_id: string | null;
  assessment_is_current: boolean | null;
  checklist_states: IrChecklistState[];
  representation_states: LegalRepresentationState[];
}
