export type JudicialCategory = "general" | "medical" | "fiscal" | "restricted";
export type JudicialProvider = "escavador" | "datajud";
export type JudicialReviewState = "draft" | "approved" | "rejected" | "revoked";
export type JudicialOperation =
  | "consult_cnj"
  | "discover_oab"
  | "monitor_process"
  | "monitor_diary"
  | "read_updates"
  | "reconcile_monitor";
export type JudicialConnectionState =
  | "permission_pending"
  | "not_configured"
  | "disabled"
  | "active"
  | "degraded"
  | "rate_limited"
  | "quota_exhausted"
  | "coverage_unknown";
export type JudicialJobState =
  | "queued"
  | "sending"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "unknown"
  | "cancelled"
  | "permission_pending"
  | "not_configured"
  | "quota_exhausted";
export interface JudicialScope {
  court: string;
  degree: string;
  unit: string;
  territory: string;
}
export interface JudicialSource {
  title: string;
  url: string;
  checked_on: string;
  version_note?: string;
  document_id: string;
}
export interface JudicialVersion {
  id: string;
  tenant_id: string;
  version_number: number;
  title: string;
  state: JudicialReviewState;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
}
export interface JudicialSourceInput {
  provider: JudicialProvider;
  source_key: string;
  title: string;
  api_version: string;
  documentation_url: string;
  checked_on: string;
  terms_version: string;
  permission_document_id: string | null;
  allowed_operations: JudicialOperation[];
  valid_from: string;
  valid_until: string;
  scope: Record<string, unknown>;
  limitations: string;
}
export interface JudicialSourceVersion
  extends JudicialSourceInput, JudicialVersion {}
export interface JudicialConnection {
  id: string;
  tenant_id: string;
  provider: JudicialProvider;
  account_id?: string;
  environment: "production" | "sandbox";
  source_version_id: string;
  enabled: boolean;
  state: JudicialConnectionState;
  limits: { requests_per_minute: number; requests_per_day: number };
  last_success_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}
export interface JudicialCoverageInput {
  scope: Record<string, unknown>;
  capability: string;
  coverage_start_on: string;
  expected_interval_minutes: number;
  tolerated_delay_minutes: number;
  state: "unknown" | "verified" | "degraded" | "interrupted";
  review_note: string;
}
export interface JudicialCoverage extends JudicialCoverageInput {
  id: string;
  connection_id: string;
  reviewed_by: string;
  reviewed_at: string;
  last_capture_at: string | null;
  is_late?: boolean;
}
export interface JudicialQuery {
  cnj?: string;
  oab_number?: string;
  oab_state?: string;
  oab_type?: string;
  term?: string;
  origins_ids?: number[];
  variations?: string[];
  limit_appearances?: number;
  provider_monitor_id?: string;
  monitor_kind?: "process" | "diary";
  cursor?: { cursor?: string; li?: string; page?: string | number };
}
export interface JudicialJobInput {
  case_id?: string;
  proceeding_id?: string;
  operation: JudicialOperation;
  query: JudicialQuery;
  max_requests: number;
  budget_units: number;
  authorization_note: string;
  idempotency_key: string;
}
export interface JudicialJob extends JudicialJobInput {
  id: string;
  connection_id: string;
  state: JudicialJobState;
  attempts: number;
  request_count: number;
  next_attempt_at: string | null;
  provider_monitor_id: string | null;
  monitor_kind?: "process" | "diary" | null;
  result_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
export interface JudicialDates {
  source_updated_at?: string | null;
  decision_signed_at?: string | null;
  made_available_on?: string | null;
  published_on?: string | null;
  communication_sent_at?: string | null;
  provider_received_at?: string | null;
  source_consulted_at?: string | null;
  awareness_effective_on?: string | null;
  temporal_notes?: string;
}
export interface JudicialManualEventInput extends JudicialDates {
  extracted_from_inbox_id?: string;
  title: string;
  event_type: string;
  category: JudicialCategory;
  original_text: string;
  evidence_document_id: string;
  proceeding_id?: string;
  parser_version?: string;
}
export interface JudicialInbox extends JudicialDates {
  id: string;
  tenant_id: string;
  case_id: string | null;
  connection_id: string | null;
  provider: string;
  provider_event_id: string;
  extracted_from_inbox_id?: string | null;
  quarantine_reason?: string | null;
  version_number: number;
  original_id: string;
  original_sha256: string;
  parser_version: string;
  event_type: string;
  title: string;
  category: JudicialCategory;
  candidates: {
    cnj?: string;
    oab_number?: string;
    oab_state?: string;
    title?: string;
  }[];
  provider_monitor_ids: string[];
  captured_at: string;
  association_state:
    "unmatched" | "ambiguous" | "confirmed" | "rejected" | "quarantined";
  proceeding_id: string | null;
  evidence_document_id: string | null;
  revision: number;
  review_note: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export interface JudicialTriage {
  id: string;
  case_id: string;
  inbox_id: string;
  assignee_id: string;
  substitute_id: string | null;
  state: "pending" | "accepted" | "completed" | "cancelled";
  internal_received_at: string;
  accepted_at: string | null;
  due_at: string | null;
  task_id: string;
  note: string;
  revision: number;
}
export interface JudicialCalendarEffect {
  suspend_count: boolean;
  allow_start: boolean;
  allow_due: boolean;
  reason: string;
  source_index: number;
}
export interface JudicialCalendarException extends JudicialCalendarEffect {
  on: string;
  working_day?: boolean;
}
export interface JudicialCalendarSuspension extends JudicialCalendarEffect {
  from: string;
  until: string;
}
export interface JudicialCalendarInput {
  calendar_key: string;
  title: string;
  scope: JudicialScope;
  timezone: string;
  valid_from: string;
  valid_until: string;
  body: {
    working_weekdays: number[];
    exceptions: JudicialCalendarException[];
    suspensions: JudicialCalendarSuspension[];
  };
  sources: JudicialSource[];
}
export interface JudicialCalendarVersion
  extends JudicialCalendarInput, JudicialVersion {}
export type JudicialDayUnit = "business_days" | "calendar_days";
export interface JudicialRuleBody {
  regime: string;
  nature: string;
  modality: string;
  recipient_kind: string;
  conditions: string;
  exclusions: string;
  validity_note: string;
  transition_resolved: boolean;
  input_kind: "civil_date" | "timestamp";
  anchor_kind: string;
  marker_offset_count: number;
  marker_offset_unit: JudicialDayUnit;
  marker_adjustment: "none" | "next_business_day";
  exclude_marker: boolean;
  count_unit: JudicialDayUnit;
  apply_suspensions: boolean;
  due_adjustment: "none" | "next_business_day";
  due_time: string;
}
export interface JudicialRuleInput {
  rule_key: string;
  title: string;
  scope: JudicialScope;
  valid_from: string;
  valid_until: string;
  body: JudicialRuleBody;
  sources: JudicialSource[];
}
export interface JudicialRuleVersion
  extends JudicialRuleInput, JudicialVersion {}
export interface JudicialDeadlineInput {
  deadline_key: string;
  title: string;
  proceeding_id: string;
  inbox_id?: string;
  rule_version_id?: string;
  calendar_version_id?: string;
  quantity: number;
  unit: JudicialDayUnit | "hours" | "months" | "years";
  anchor_date?: string;
  anchor_at?: string;
  anchor_kind: string;
  evidence_document_id?: string;
  duration_basis: string;
  manual_anchor_reason?: string;
  conditions_confirmed: boolean;
  coverage_confirmed: boolean;
  conflict_detected: boolean;
  scope: JudicialScope;
  assignee_id: string;
  substitute_id?: string;
  note: string;
  supersedes_version_id?: string;
}
export interface JudicialDeadlineResult {
  proposed_due_on: string | null;
  start_marker_on: string | null;
  first_counted_on: string | null;
  due_at: string | null;
  timezone: string | null;
  memory: {
    on: string;
    stage: string;
    working_day: boolean;
    suspended: boolean;
    eligible: boolean;
    index: number;
    reason: string;
  }[];
  refusals: { code: string; message: string }[];
}
export interface JudicialDeadlineVersion {
  id: string;
  tenant_id: string;
  case_id: string;
  deadline_key: string;
  version_number: number;
  category: "restricted";
  proceeding_id: string;
  inbox_id: string | null;
  rule_version_id: string | null;
  calendar_version_id: string | null;
  input: JudicialDeadlineInput;
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  result: JudicialDeadlineResult;
  engine_version: string;
  state: "incomplete" | "draft" | "in_review" | "reviewed" | "returned";
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  task_id: string | null;
  supersedes_version_id: string | null;
}
export interface JudicialContext {
  tenant_id: string;
  user_id: string;
  can_manage_sources: boolean;
  can_edit_catalog: boolean;
  can_approve_catalog: boolean;
  can_edit_case: boolean;
  can_review_case: boolean;
  sources: JudicialSourceVersion[];
  connections: JudicialConnection[];
  coverages: JudicialCoverage[];
  jobs: JudicialJob[];
  inbox: JudicialInbox[];
  triage: JudicialTriage[];
  calendars: JudicialCalendarVersion[];
  rules: JudicialRuleVersion[];
  deadlines: JudicialDeadlineVersion[];
  deadline_states: { id: string; is_current: boolean }[];
}
export interface JudicialDeadlineReport {
  calculation: JudicialDeadlineVersion;
  is_current: boolean;
  generated_at: string;
}
