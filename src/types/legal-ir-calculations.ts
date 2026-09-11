import type { IrJson, IrOfficialSource } from "./legal-ir";

/** Financial values cross the API as decimal text; arithmetic belongs to SQL numeric. */
export type IrDecimal = string;
export type IrTaxPeriodicity = "monthly" | "annual";
export type IrIncomeTaxKind = "ordinary" | "thirteenth" | "rra" | "regressive" | "foreign" | "other" | "unknown";
export type IrDeductionMode = "legal" | "simplified" | "most_favorable";
export type IrTaxResidency = "resident" | "non_resident" | "unknown";
interface IrFiscalRecord { id: string; tenant_id: string; created_at: string }
interface IrFiscalCaseRecord extends IrFiscalRecord { case_id: string }

export interface IrTaxEntryPayload {
  row_number: number;
  source_id?: string | null;
  payment_date?: string | null;
  competence?: string | null;
  calendar_year?: number | null;
  exercise?: number | null;
  income_tax_kind: IrIncomeTaxKind;
  gross: IrDecimal | null;
  taxable: IrDecimal | null;
  withheld: IrDecimal | null;
  legal_deductions: IrDecimal | null;
  source_page?: number | null;
  source_line?: string | null;
  notes?: string;
  raw_data?: Record<string, string>;
}
export interface IrTaxEntry extends IrTaxEntryPayload {
  id: string;
  tenant_id: string;
  case_id: string;
  import_id: string;
  source_id: string | null;
  payment_date: string | null;
  competence: string | null;
  calendar_year: number | null;
  exercise: number | null;
  source_page: number | null;
  source_line: string | null;
  notes: string;
  raw_data: Record<string, string>;
}
export interface IrTaxImport extends IrFiscalCaseRecord {
  document_id: string;
  title: string;
  format: "csv" | "manual";
  supersedes_import_id: string | null;
  status: "draft" | "reviewed" | "rejected" | "superseded";
  reviewer_id: string | null;
  review_note: string;
  created_by: string;
  reviewed_at: string | null;
}
export interface IrTaxImportReview extends IrFiscalCaseRecord {
  import_id: string;
  from_status: IrTaxImport["status"];
  decision: "reviewed" | "rejected";
  note: string;
  reviewer_id: string;
}
export interface IrTaxParameterBody {
  jurisdiction: "BR";
  coverage: "ordinary_resident";
  brackets: { upper_bound: IrDecimal | null; rate: IrDecimal; deduction: IrDecimal }[];
  simplified: { fixed: IrDecimal; percent: IrDecimal; cap: IrDecimal };
  reduction: {
    enabled: boolean;
    zero_until: IrDecimal;
    phaseout_until: IrDecimal;
    full_cap: IrDecimal;
    intercept: IrDecimal;
    slope: IrDecimal;
    boundary: "formula" | "zero_at_upper";
  };
  rounding: { mode: "half_up"; scale: 2; tax_stage: "before_reduction" | "final_only"; reduction_stage: "round" | "exact" };
  validity_note: string;
  sources: (IrOfficialSource & { checked_on: string })[];
}
export interface IrTaxParameterPayload {
  parameter_key: string;
  title: string;
  periodicity: IrTaxPeriodicity;
  valid_from: string;
  valid_until: string;
  calendar_year: number;
  exercise: number;
  body: IrTaxParameterBody;
}
export interface IrTaxParameterVersion extends IrFiscalRecord, IrTaxParameterPayload {
  version_number: number;
  status: "draft" | "approved" | "rejected";
  created_by: string;
  reviewer_id: string | null;
  review_note: string;
  reviewed_at: string | null;
}
export interface IrCalculationRefusal { code: string; message: string }
export interface IrTaxComputation {
  taxable: IrDecimal;
  legal_deductions: IrDecimal;
  simplified_deduction: IrDecimal;
  simplified_deduction_raw: IrDecimal;
  simplified_rounding: "half_up_2";
  deduction_used: IrDecimal;
  base: IrDecimal;
  rate: IrDecimal;
  bracket_deduction: IrDecimal;
  tax_before_reduction: IrDecimal;
  reduction_raw: IrDecimal;
  reduction_used: IrDecimal;
  tax_due: IrDecimal;
  boundary_formula_residual: IrDecimal;
  rounding: IrTaxParameterBody["rounding"];
}
export interface IrParameterValidationPayload {
  taxable: IrDecimal;
  legal_deductions: IrDecimal;
  deduction_mode: IrDeductionMode;
  expected_tax: IrDecimal;
  expected_source: string;
  review_note: string;
}
export interface IrParameterValidation extends IrFiscalRecord, IrParameterValidationPayload {
  parameter_version_id: string;
  result: IrTaxComputation;
  matches_expected: boolean;
  reviewer_id: string;
}
export interface IrCalculationResult {
  scope: "monthly_by_payer" | "annual_ordinary";
  baseline_tax: IrDecimal | null;
  proposed_tax: IrDecimal | null;
  hypothesis_difference: IrDecimal | null;
  withheld_reported: IrDecimal | null;
  recognized_credit: null;
  received: null;
  groups: { payer_id?: string; period: string; entry_ids: string[]; parameter_version_id: string; baseline: IrTaxComputation; proposed: IrTaxComputation }[];
  monetary_update: { status: "not_calculated"; reason: string };
}
export interface IrCalculationAdjustment {
  entry_id: string;
  proposed_taxable: IrDecimal;
  proposed_legal_deductions?: IrDecimal;
  reason: string;
  period_review_id?: string;
}
export interface IrCalculationPayload {
  assessment_id: string;
  periodicity: IrTaxPeriodicity;
  calendar_year: number;
  month?: number;
  import_ids: string[];
  parameter_ids: string[];
  adjustments: IrCalculationAdjustment[];
  deduction_mode: IrDeductionMode;
  tax_residency: IrTaxResidency;
  inventory_complete: boolean;
  completeness_note: string;
}
export interface IrCalculationVersion extends IrFiscalCaseRecord {
  version_number: number;
  assessment_id: string;
  periodicity: IrTaxPeriodicity;
  calendar_year: number;
  month: number | null;
  deduction_mode: IrDeductionMode;
  tax_residency: IrTaxResidency;
  input_hash: string;
  snapshot: IrJson;
  adjustments: IrCalculationAdjustment[];
  result: IrCalculationResult;
  refusals: IrCalculationRefusal[];
  status: "incomplete" | "draft" | "in_review" | "approved" | "superseded";
  inventory_complete: boolean;
  completeness_note: string;
  created_by: string;
  reviewer_id: string | null;
  review_note: string;
  reviewed_at: string | null;
}
export interface IrFinancialContext {
  can_fiscal: boolean;
  can_calculate: boolean;
  operational_timezone: "America/Sao_Paulo";
  calculation_states: { id: string; is_current: boolean }[];
  principal_balances: { id: string; principal: IrDecimal; allocated: IrDecimal; received: IrDecimal; available: IrDecimal }[];
  overlaps: { claim_a_id: string; claim_b_id: string }[];
}
export interface IrCalculationReport {
  calculation: IrCalculationVersion;
  is_current: boolean;
  generated_at: string;
}
export interface IrPeriodReviewPayload {
  source_id: string;
  assessment_id: string;
  period_start: string;
  period_end: string;
  landmark_date: string;
  decision: "include" | "exclude" | "needs_review";
  basis: string;
  limitations: string;
  document_id: string;
}
export interface IrPeriodReview extends IrFiscalCaseRecord, IrPeriodReviewPayload { reviewer_id: string }
export interface IrTaxReturnPayload {
  calendar_year: number;
  exercise: number;
  return_kind: "original" | "amending";
  previous_return_id?: string | null;
  document_id: string;
  receipt_document_id?: string | null;
  receipt_number: string;
  status: "draft" | "filed" | "processing" | "settled" | "cancelled";
  reported_tax: IrDecimal;
  reported_refund: IrDecimal;
  paid_quotas: IrDecimal;
  notes: string;
}
export interface IrTaxReturn extends IrFiscalCaseRecord, IrTaxReturnPayload {
  previous_return_id: string | null;
  receipt_document_id: string | null;
  created_by: string;
}
export interface IrTaxReturnEvent extends IrFiscalCaseRecord {
  return_id: string;
  from_status: IrTaxReturn["status"] | null;
  to_status: IrTaxReturn["status"];
  receipt_document_id: string | null;
  receipt_number: string;
  note: string;
  actor_id: string;
}
export interface IrClaimPayload {
  payer_id: string;
  route: "administrative" | "judicial";
  channel: "source" | "dirpf" | "perdcomp" | "court" | "other";
  claim_kind: "cessation" | "restitution" | "combined";
  title: string;
  assessment_id?: string | null;
  calculation_id?: string | null;
}
export interface IrClaim extends IrFiscalCaseRecord, IrClaimPayload {
  assessment_id: string | null;
  calculation_id: string | null;
  status: "draft" | "submitted" | "awaiting" | "partially_granted" | "granted" | "denied" | "closed";
  jurisdiction: string;
  standing: string;
  strategy_note: string;
  strategy_reviewer_id: string | null;
  strategy_reviewed_at: string | null;
  recognized_amount: IrDecimal;
  created_by: string;
}
export interface IrClaimEventPayload {
  event_type: "protocol" | "requirement" | "appeal" | "decision_granted" | "decision_partial" | "decision_denied" | "closed" | "note";
  description: string;
  occurred_on: string;
  document_id?: string | null;
  protocol_reference: string;
  recognized_amount?: IrDecimal | null;
  due_at?: string | null;
  assignee_id?: string | null;
  substitute_id?: string | null;
}
export interface IrClaimEvent extends IrFiscalCaseRecord, Omit<IrClaimEventPayload, "due_at" | "assignee_id" | "substitute_id"> {
  claim_id: string;
  document_id: string | null;
  recognized_amount: IrDecimal | null;
  task_id: string | null;
  created_by: string;
}
export interface IrPaymentPrincipalPayload {
  customer_id: string;
  source_id: string;
  payment_document_id: string;
  proof_line: string;
  payment_reference: string;
  period_start: string;
  period_end: string;
  paid_on: string;
  tax_code: "IRPF";
  amount: IrDecimal;
}
export interface IrPaymentPrincipal extends IrFiscalCaseRecord, IrPaymentPrincipalPayload {
  proof_hash: string;
  fingerprint: string;
  status: "draft" | "verified";
  reviewer_id: string | null;
  review_note: string;
  created_by: string;
}
export interface IrPrincipalAllocation extends IrFiscalCaseRecord {
  principal_id: string;
  claim_id: string;
  amount: IrDecimal;
  status: "active" | "released";
  idempotency_key: string;
  reason: string;
  created_by: string;
  released_at: string | null;
  release_reason: string | null;
}
export interface IrRecoveryPayload {
  amount: IrDecimal;
  received_on: string;
  channel: "source_refund" | "administrative_refund" | "judicial_payment";
  document_id: string;
  reference: string;
  idempotency_key: string;
  proof_line?: string;
}
export interface IrRecovery extends IrFiscalCaseRecord, IrRecoveryPayload {
  allocation_id: string;
  principal_id: string;
  claim_id: string;
  recorded_by: string;
  proof_line: string;
  fingerprint: string;
}
export interface IrClaimOverlap extends IrFiscalCaseRecord {
  claim_a_id: string;
  claim_b_id: string;
  reason: string;
  created_by: string;
}
export interface IrCessationPayload {
  source_id: string;
  observed_on: string;
  competence: string;
  previous_withheld: IrDecimal;
  current_withheld: IrDecimal;
  before_document_id: string;
  after_document_id: string;
  review_note: string;
}
export interface IrCessationRecord extends IrFiscalCaseRecord, IrCessationPayload {
  status: "verified" | "reopened" | "ongoing";
  reviewer_id: string;
}
