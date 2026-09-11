import { requireSupabase } from "@/lib/supabase";
import type { IrCalculationPayload, IrCalculationReport, IrCalculationVersion, IrCessationPayload, IrCessationRecord, IrClaim, IrClaimEvent, IrClaimEventPayload, IrClaimOverlap, IrClaimPayload, IrFinancialContext, IrParameterValidation, IrParameterValidationPayload, IrPaymentPrincipal, IrPaymentPrincipalPayload, IrPeriodReview, IrPeriodReviewPayload, IrPrincipalAllocation, IrRecovery, IrRecoveryPayload, IrTaxEntry, IrTaxEntryPayload, IrTaxImport, IrTaxImportReview, IrTaxParameterPayload, IrTaxParameterVersion, IrTaxReturn, IrTaxReturnEvent, IrTaxReturnPayload } from "@/types/legal-ir-calculations";

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
async function list<T>(table: string, caseId?: string): Promise<T[]> {
  const rows: T[] = [];
  // Imports can contain 500 rows each. Never silently present only the first page.
  for (let offset = 0; offset < 25_000; offset += 500) {
    let query = requireSupabase().from(table).select("*").order("id").range(offset, offset + 499);
    if (caseId) query = query.eq("case_id", caseId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("Volume de registros excede a consulta completa. Restrinja o período antes de conferir os dados.");
}

export const getIrFinancialContext = (caseId: string) => rpc<IrFinancialContext>("ir_get_financial_context", { p_case_id: caseId });
export const listIrTaxImports = (caseId: string) => list<IrTaxImport>("ir_tax_imports", caseId);
export const listIrTaxImportReviews = (caseId: string) => list<IrTaxImportReview>("ir_tax_import_reviews", caseId);
export const listIrTaxEntries = (caseId: string) => list<IrTaxEntry>("ir_tax_entries", caseId);
export const createIrTaxImport = (caseId: string, documentId: string, title: string, format: IrTaxImport["format"], lines: IrTaxEntryPayload[], supersedesImportId?: string) => rpc<IrTaxImport>("ir_create_tax_import", { p_case_id: caseId, p_document_id: documentId, p_title: title, p_format: format, p_lines: lines, p_supersedes_import_id: supersedesImportId ?? null });
export const updateIrTaxEntry = (entryId: string, payload: Partial<IrTaxEntryPayload>) => rpc<IrTaxEntry>("ir_update_tax_entry", { p_entry_id: entryId, p_payload: payload });
export const reviewIrTaxImport = (importId: string, decision: "reviewed" | "rejected", note: string) => rpc<IrTaxImport>("ir_review_tax_import", { p_import_id: importId, p_decision: decision, p_note: note });
export const listIrTaxParameterVersions = () => list<IrTaxParameterVersion>("ir_tax_parameter_versions");
export const createIrTaxParameterVersion = (payload: IrTaxParameterPayload) => rpc<IrTaxParameterVersion>("ir_create_tax_parameter_version", { p_payload: payload });
export const reviewIrTaxParameterVersion = (versionId: string, decision: "approved" | "rejected", note: string) => rpc<IrTaxParameterVersion>("ir_review_tax_parameter_version", { p_version_id: versionId, p_decision: decision, p_note: note });
export const listIrParameterValidations = () => list<IrParameterValidation>("ir_parameter_validations");
export const recordIrParameterValidation = (versionId: string, payload: IrParameterValidationPayload) => rpc<IrParameterValidation>("ir_record_parameter_validation", { p_version_id: versionId, p_payload: payload });
export const listIrCalculationVersions = (caseId: string) => list<IrCalculationVersion>("ir_calculation_versions", caseId);
export const readIrCalculationReport = (versionId: string) => rpc<IrCalculationReport>("ir_read_calculation_report", { p_version_id: versionId });
export const createIrCalculationVersion = (caseId: string, payload: IrCalculationPayload) => rpc<IrCalculationVersion>("ir_create_calculation_version", { p_case_id: caseId, p_payload: payload });
export const submitIrCalculationReview = (versionId: string) => rpc<IrCalculationVersion>("ir_submit_calculation_review", { p_version_id: versionId });
export const reviewIrCalculation = (versionId: string, decision: "approved" | "returned", note: string, inventoryComplete = false) => rpc<IrCalculationVersion>("ir_review_calculation", { p_version_id: versionId, p_decision: decision, p_note: note, p_inventory_complete: inventoryComplete });
export const listIrPeriodReviews = (caseId: string) => list<IrPeriodReview>("ir_period_reviews", caseId);
export const recordIrPeriodReview = (caseId: string, payload: IrPeriodReviewPayload) => rpc<IrPeriodReview>("ir_record_period_review", { p_case_id: caseId, p_payload: payload });
export const listIrTaxReturns = (caseId: string) => list<IrTaxReturn>("ir_tax_returns", caseId);
export const recordIrTaxReturn = (caseId: string, payload: IrTaxReturnPayload) => rpc<IrTaxReturn>("ir_record_tax_return", { p_case_id: caseId, p_payload: payload });
export const listIrTaxReturnEvents = (caseId: string) => list<IrTaxReturnEvent>("ir_tax_return_events", caseId);
export const updateIrTaxReturnStatus = (returnId: string, status: IrTaxReturn["status"], receiptDocumentId: string | null, receiptNumber: string | null, note: string) => rpc<IrTaxReturn>("ir_update_tax_return_status", { p_return_id: returnId, p_status: status, p_receipt_document_id: receiptDocumentId, p_receipt_number: receiptNumber, p_note: note });
export const listIrClaims = (caseId: string) => list<IrClaim>("ir_claims", caseId);
export const createIrClaim = (caseId: string, payload: IrClaimPayload) => rpc<IrClaim>("ir_create_claim", { p_case_id: caseId, p_payload: payload });
export const updateIrClaimDraft = (claimId: string, payload: IrClaimPayload) => rpc<IrClaim>("ir_update_claim_draft", { p_claim_id: claimId, p_payload: payload });
export const reviewIrClaimStrategy = (claimId: string, jurisdiction: string, standing: string, note: string) => rpc<IrClaim>("ir_review_claim_strategy", { p_claim_id: claimId, p_jurisdiction: jurisdiction, p_standing: standing, p_note: note });
export const listIrClaimEvents = (caseId: string) => list<IrClaimEvent>("ir_claim_events", caseId);
export const recordIrClaimEvent = (claimId: string, payload: IrClaimEventPayload) => rpc<IrClaimEvent>("ir_record_claim_event", { p_claim_id: claimId, p_payload: payload });
export const listIrPaymentPrincipals = (caseId: string) => list<IrPaymentPrincipal>("ir_payment_principals", caseId);
export const createIrPaymentPrincipal = (caseId: string, payload: IrPaymentPrincipalPayload) => rpc<IrPaymentPrincipal>("ir_create_payment_principal", { p_case_id: caseId, p_payload: payload });
export const verifyIrPaymentPrincipal = (principalId: string, note: string) => rpc<IrPaymentPrincipal>("ir_verify_payment_principal", { p_principal_id: principalId, p_note: note });
export const listIrPrincipalAllocations = (caseId: string) => list<IrPrincipalAllocation>("ir_principal_allocations", caseId);
export const allocateIrPrincipal = (principalId: string, claimId: string, amount: string, idempotencyKey: string, reason: string) => rpc<IrPrincipalAllocation>("ir_allocate_principal", { p_principal_id: principalId, p_claim_id: claimId, p_amount: amount, p_idempotency_key: idempotencyKey, p_reason: reason });
export const releaseIrAllocation = (allocationId: string, reason: string) => rpc<IrPrincipalAllocation>("ir_release_allocation", { p_allocation_id: allocationId, p_reason: reason });
export const listIrRecoveries = (caseId: string) => list<IrRecovery>("ir_recoveries", caseId);
export const recordIrRecovery = (allocationId: string, payload: IrRecoveryPayload) => rpc<IrRecovery>("ir_record_recovery", { p_allocation_id: allocationId, p_payload: payload });
export const listIrClaimOverlaps = (caseId: string) => list<IrClaimOverlap>("ir_claim_overlaps", caseId);
export const linkIrClaimOverlap = (claimAId: string, claimBId: string, reason: string) => rpc<IrClaimOverlap>("ir_link_claim_overlap", { p_claim_a_id: claimAId, p_claim_b_id: claimBId, p_reason: reason });
export const listIrCessationRecords = (caseId: string) => list<IrCessationRecord>("ir_cessation_records", caseId);
export const recordIrCessation = (caseId: string, payload: IrCessationPayload) => rpc<IrCessationRecord>("ir_record_cessation", { p_case_id: caseId, p_payload: payload });
