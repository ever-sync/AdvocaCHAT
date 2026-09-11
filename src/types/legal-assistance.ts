/** F7 contracts: docs/FASE_7_CONTRATO.md (2500) and the private OCR kernel DTO. */
export type AssistanceCategory =
  "general" | "medical" | "fiscal" | "restricted";
export type AssistanceDraftKind =
  "summary" | "chronology" | "message" | "pleading";
export type AssistanceDraftState =
  "draft" | "in_review" | "reviewed" | "returned" | "revoked";
export interface AssistanceDraftSection {
  heading: string;
  text: string;
  citation_ids: string[];
}
export interface AssistanceDraftBody {
  title: string;
  sections: AssistanceDraftSection[];
  missing_facts: string[];
  divergences: string[];
}
export interface AssistanceCitation {
  id: string;
  case_id: string;
  category: AssistanceCategory;
  source_kind: "text_page" | "knowledge";
  source_version_id: string;
  document_id?: string | null;
  page_number: number | null;
  start_offset: number;
  source_label: string;
  quote: string;
  source_sha256: string;
  created_at: string;
}
/** Local presentation metadata, supplied only after current authorization checks. */
export interface AssistanceCitationChoice {
  citation: AssistanceCitation;
  label: string;
  readable: boolean;
  current: boolean;
}
export interface AssistanceOcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: string;
  block: number;
  paragraph: number;
  line: number;
}
export interface AssistanceRecognizedOcrPage {
  page: number;
  status: "recognized" | "low_confidence" | "no_text_recognized";
  text: string;
  words: AssistanceOcrWord[];
  tsv: string;
  confidence_mean: string | null;
  width: number;
  height: number;
  coordinate_system: "rendered_pixels";
  review_status: "unreviewed";
}
export interface AssistanceUnprocessedOcrPage {
  page: number;
  status: "not_processed";
  reason: string;
  review_status: "unreviewed";
}
export type AssistanceOcrPage =
  AssistanceRecognizedOcrPage | AssistanceUnprocessedOcrPage;
export interface AssistanceOcrEngine {
  poppler?: string;
  memory_enforcement?: "rlimit_as" | "rss_process_group_monitor";
  tesseract?: string;
  models?: { language: string; sha256: string }[];
  oem?: number;
  psm?: number;
  render_dpi?: number;
  render_max_dimension?: number;
  minimum_confidence?: string;
}
export interface AssistanceOcrKernelResult {
  kernel_version: string;
  source_sha256: string | null;
  source_bytes: number | null;
  mime_type: string;
  status: "complete" | "partial" | "unreadable" | "failed" | "refused";
  reason: string | null;
  pages_total: number | null;
  pages: AssistanceOcrPage[];
  engine: AssistanceOcrEngine;
  review_status: "unreviewed";
  elapsed_ms: number;
}
/** An edit intent for a parent version editor; this is not an RPC payload. */
export interface AssistancePageTextEdit {
  page: number;
  text: string;
  mode: "manual" | "correction";
  note: string;
}

export interface AssistanceMetadata {
  id: string;
  tenant_id: string;
  case_id: string;
  category: AssistanceCategory;
  created_by: string;
  created_at: string;
}
export interface AssistanceSettings {
  tenant_id: string;
  ocr_enabled: boolean;
  ocr_monthly_page_limit: number;
  ocr_max_pages: number;
  updated_by: string | null;
  updated_at: string | null;
}
export interface AssistanceAiConnection {
  id: string;
  model: string;
  policy_version_id: string;
  enabled: boolean;
  state: "not_configured" | "enabled" | "disabled" | "policy_required";
}
export interface AssistanceContext {
  tenant_id: string;
  user_id: string;
  can_edit: boolean;
  can_review: boolean;
  can_manage: boolean;
  settings: AssistanceSettings;
  ocr_usage: { month: string; charged_pages: number; monthly_limit: number };
  ai_connection: AssistanceAiConnection | null;
  ai_usage: {
    month: string;
    currency: "USD";
    quota_cost: string;
    monthly_budget: string;
  } | null;
}
export type AssistanceOcrJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "cancelled"
  | "authorization_revoked"
  | "unknown";
export interface AssistanceOcrJob extends AssistanceMetadata {
  document_id: string;
  source_sha256: string;
  idempotency_key: string;
  state: AssistanceOcrJobState;
  attempts: number;
  max_pages: number;
  quota_pages: number;
  quota_month: string;
  pages_total: number | null;
  processed_pages: number | null;
  kernel_version: string | null;
  error_code: string | null;
  result_version_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}
export type AssistanceTextState =
  "draft" | "in_review" | "approved" | "returned" | "revoked";
export interface AssistanceTextVersion extends AssistanceMetadata {
  is_current?: boolean;
  document_id: string;
  source_sha256: string;
  version_number: number;
  mode: "ocr" | "manual" | "correction";
  previous_version_id: string | null;
  ocr_job_id: string | null;
  pages_total: number | null;
  completeness: "complete" | "partial" | "unknown";
  engine: AssistanceOcrEngine;
  state: AssistanceTextState;
  note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
}
export interface AssistanceTextPageMetadata {
  id: string;
  tenant_id: string;
  case_id: string;
  version_id: string;
  category: AssistanceCategory;
  page_number: number;
  page_status: AssistanceOcrPage["status"] | "manual";
  confidence_mean: string | null;
  width: number | null;
  height: number | null;
  coordinate_system: "rendered_pixels" | "not_applicable" | null;
  review_state: "unreviewed" | "approved" | "returned";
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export interface AssistanceTextPage extends AssistanceTextPageMetadata {
  text: string | null;
  words: AssistanceOcrWord[];
  review_note: string;
}
export interface AssistanceReadPage {
  version: AssistanceTextVersion;
  page: AssistanceTextPage;
  is_current: boolean;
}
export interface AssistanceTextInput {
  mode: "manual" | "correction";
  previous_version_id?: string;
  pages_total?: number;
  note: string;
  pages: { page_number: number; text: string }[];
}
export type AssistanceKnowledgeKind = "template" | "jurisprudence" | "note";
export type AssistanceCatalogState =
  "draft" | "approved" | "rejected" | "revoked";
export interface AssistanceKnowledgeInput {
  knowledge_key: string;
  title: string;
  kind: AssistanceKnowledgeKind;
  source_url: string | null;
  source_document_id: string | null;
  checked_on: string | null;
  version_note: string;
  scope: string;
  text: string;
}
export interface AssistanceKnowledge extends Omit<
  AssistanceKnowledgeInput,
  "text"
> {
  id: string;
  tenant_id: string;
  version_number: number;
  source_sha256: string;
  is_current?: boolean;
  state: AssistanceCatalogState;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
}
export interface AssistanceKnowledgeRead {
  version: AssistanceKnowledge & { text: string };
  is_current: boolean;
}
export interface AssistanceSearchSource {
  kind: "text_page" | "knowledge";
  version_id: string;
}
export interface AssistanceDraftInput {
  draft_key: string;
  kind: AssistanceDraftKind;
  category: AssistanceCategory;
  purpose: string;
  body: AssistanceDraftBody;
  citation_ids: string[];
  previous_version_id?: string;
}
export interface AssistanceDraftVersion extends AssistanceMetadata {
  title?: string;
  draft_key: string;
  version_number: number;
  kind: AssistanceDraftKind;
  citation_ids?: string[];
  snapshot_hash?: string;
  mode: "manual" | "ai";
  ai_job_id: string | null;
  previous_version_id: string | null;
  state: AssistanceDraftState;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  is_current: boolean;
}
export interface AssistanceDraftRead {
  version: AssistanceDraftVersion & {
    purpose: string;
    body: AssistanceDraftBody;
    snapshot: Record<string, unknown>;
  };
  citations: AssistanceCitation[];
  is_current: boolean;
}
export type AssistanceTransferInput =
  | {
      target_kind: "instrument";
      payload: {
        instrument_type: "proposal" | "contract" | "power_of_attorney";
        title: string;
      };
    }
  | {
      target_kind: "publication";
      payload: {
        membership_id: string;
        title: string;
        publication_kind: "summary" | "update";
      };
    };
export interface AssistancePolicyInput {
  policy_key: string;
  title: string;
  model: string;
  purpose_note: string;
  retention_note: string;
  source_document_id: string | null;
  source_url: string | null;
  checked_on: string | null;
  valid_from: string;
  valid_until: string;
  allow_medical: boolean;
  allow_fiscal: boolean;
  currency: "USD";
  rate_unit: "per_million_tokens";
  input_rate: string;
  output_rate: string;
  monthly_budget: string;
  max_input_tokens: number;
  max_output_tokens: number;
}
export interface AssistancePolicy extends AssistancePolicyInput {
  id: string;
  tenant_id: string;
  version_number: number;
  state: AssistanceCatalogState;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
}
export type AssistanceAiJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "authorization_revoked"
  | "not_configured"
  | "quota_exhausted"
  | "unknown";
export interface AssistanceAiJob extends AssistanceMetadata {
  draft_key: string;
  kind: AssistanceDraftKind;
  max_output_tokens: number;
  idempotency_key: string;
  connection_id: string | null;
  policy_version_id: string | null;
  state: AssistanceAiJobState;
  input_tokens: number | null;
  output_tokens: number | null;
  measured_cost: string | null;
  quota_cost: string;
  quota_month: string;
  consumption: "not_sent" | "reserved" | "reported" | "uncertain";
  result_version_id: string | null;
  error_code: string | null;
  started_at: string | null;
  finished_at: string | null;
}
export interface AssistanceAiInput {
  draft_key: string;
  kind: AssistanceDraftKind;
  category: AssistanceCategory;
  purpose: string;
  citation_ids: string[];
  max_output_tokens: number;
  idempotency_key: string;
}
export interface AssistanceListKinds {
  ocr_jobs: AssistanceOcrJob;
  text_versions: AssistanceTextVersion;
  knowledge: AssistanceKnowledge;
  drafts: AssistanceDraftVersion;
  ai_jobs: AssistanceAiJob;
  ai_policies: AssistancePolicy;
}
export interface AssistancePageResult<T> {
  items: T[];
  has_more: boolean;
}
