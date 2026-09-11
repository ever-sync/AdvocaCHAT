export type ExpansionCategory = "general" | "medical" | "fiscal" | "restricted";
export interface ExpansionContext {
  tenant_id: string;
  user_id: string;
  can_edit: boolean;
  can_review: boolean;
  can_manage: boolean;
  external_execution_enabled: false;
}
export interface ExpansionPage<T> {
  items: T[];
  has_more: boolean;
}
export interface ExpansionMetadata {
  id: string;
  tenant_id: string;
  case_id?: string;
  version_number?: number;
  title?: string;
  category?: ExpansionCategory;
  state: string;
  created_at: string;
  created_by: string;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  is_current?: boolean;
}
interface Version {
  id: string;
  tenant_id: string;
  version_number: number;
  previous_version_id: string | null;
  title: string;
  created_at: string;
  created_by: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
}
export type ExpansionProvider =
  "domicilio" | "djen" | "mni" | "inss" | "onr" | "other";
export type ExpansionOperation =
  | "domicilio_list"
  | "domicilio_logs"
  | "domicilio_awareness"
  | "court_case_read"
  | "court_publication_read"
  | "petition_submit"
  | "inss_request"
  | "registry_search"
  | "registry_signature"
  | "other_manual";
export interface ExpansionCoverageInput {
  coverage_key: string;
  previous_version_id?: string | null;
  title: string;
  provider: ExpansionProvider;
  operation: ExpansionOperation;
  api_version: string;
  environment: "production" | "homologation";
  institution_reference: string;
  court: string;
  degree: string;
  channel: string;
  documentation_url: string;
  checked_on: string | null;
  permission_document_id: string | null;
  valid_from: string | null;
  valid_until: string | null;
  limitations: string;
  permission_state: "unverified" | "documented" | "denied";
}
export interface ExpansionCoverage
  extends Version, Omit<ExpansionCoverageInput, "previous_version_id"> {
  state: "draft" | "reviewed" | "revoked";
}
export interface ExpansionHomologationInput {
  scenario: string;
  result: "passed" | "failed" | "inconclusive";
  evidence_document_id: string;
  tested_on: string;
  note: string;
}
export interface ExpansionHomologation extends ExpansionHomologationInput {
  id: string;
  coverage_version_id: string;
  created_by: string;
  created_at: string;
}
export interface ExpansionConnection {
  id: string | null;
  coverage_version_id: string;
  configured: boolean;
  adapter_implemented: false;
  permission_current: boolean;
  homologation_passed: boolean;
  active: false;
  state:
    | "adapter_unimplemented"
    | "not_configured"
    | "permission_required"
    | "homologation_required";
}
export interface ExpansionCoverageRead {
  version: ExpansionCoverage;
  is_current: boolean;
  homologations: ExpansionHomologation[];
  connection: ExpansionConnection | null;
}
export interface ExpansionActChecks {
  documents_complete: boolean;
  recipient_verified: boolean;
  representation_reviewed: boolean;
  signature_checked: boolean;
  channel_authorized: boolean;
  legal_consequences_reviewed: boolean;
}
export type ExpansionActKind =
  "petition" | "awareness" | "administrative_request" | "other";
export interface ExpansionActInput {
  act_key: string;
  previous_version_id?: string | null;
  category: ExpansionCategory;
  title: string;
  act_kind: ExpansionActKind;
  proceeding_id?: string | null;
  coverage_version_id?: string | null;
  recipient: string;
  channel: string;
  representation_id?: string | null;
  succession_authority_id?: string | null;
  instrument_version_id?: string | null;
  final_document_id?: string | null;
  signature_evidence_document_id?: string | null;
  source_document_ids: string[];
  purpose: string;
  authority_basis: string;
  checks: ExpansionActChecks;
}
export interface ExpansionAct
  extends Version, Omit<ExpansionActInput, "previous_version_id"> {
  case_id: string;
  state: "draft" | "in_review" | "ready" | "returned" | "revoked";
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
}
export interface ExpansionAttempt {
  reports?: {
    id: string;
    state: string;
    note: string;
    actor_id: string;
    created_at: string;
  }[];
  id: string;
  version_id: string;
  case_id: string;
  mode: "manual";
  idempotency_key: string;
  snapshot_hash: string;
  state:
    "prepared" | "reported_external" | "unknown" | "not_sent" | "reconciled";
  note: string;
  created_by: string;
  created_at: string;
}
export interface ExpansionReceiptInput {
  document_id: string;
  external_reference: string;
  recipient: string;
  channel: string;
  proceeding_id?: string | null;
  occurred_on: string;
  outcome: "protocol" | "awareness" | "rejected" | "not_sent";
  description: string;
}
export interface ExpansionReceipt extends ExpansionReceiptInput {
  id: string;
  attempt_id: string;
  document_sha256: string;
  state: "submitted" | "reviewed" | "returned";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at?: string;
}
export interface ExpansionReceiptChecks {
  reference_matches: boolean;
  recipient_matches: boolean;
  channel_matches: boolean;
  document_compared: boolean;
  occurrence_confirmed: boolean;
}
export interface ExpansionActRead {
  can_prepare_attempt?: boolean;
  attempt_blockers?: string[];
  version: ExpansionAct;
  is_current: boolean;
  missing: string[];
  attempts: ExpansionAttempt[];
  receipts: ExpansionReceipt[];
}
export type ExpansionSuccessionCapacity =
  | "spouse"
  | "partner"
  | "heir"
  | "legatee"
  | "dependent"
  | "estate_representative"
  | "other"
  | "unknown";
export interface ExpansionSuccessionPersonInput {
  party_id: string;
  claimed_capacity: ExpansionSuccessionCapacity;
  capacity_note: string;
  evidence_document_ids: string[];
  representation_id?: string | null;
  pending_note: string;
}
export interface ExpansionSuccessionPerson extends ExpansionSuccessionPersonInput {
  id: string;
  version_id: string;
  case_id: string;
}
export interface ExpansionSuccessionInput {
  succession_key: string;
  previous_version_id?: string | null;
  category: "restricted";
  title: string;
  deceased_party_id: string;
  death_on?: string | null;
  death_document_id?: string | null;
  assets_status: "unknown" | "declared_present" | "declared_absent";
  dependency_status: "unknown" | "reported" | "documented";
  payment_location:
    | "unknown"
    | "not_released"
    | "available_at_bank"
    | "credited"
    | "returned_to_revenue";
  proceeding_id?: string | null;
  notes: string;
  persons: ExpansionSuccessionPersonInput[];
}
export interface ExpansionSuccession
  extends
    Version,
    Omit<ExpansionSuccessionInput, "previous_version_id" | "persons"> {
  case_id: string;
  state: "draft" | "in_review" | "reviewed" | "returned" | "revoked";
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
}
export type ExpansionSuccessionOperation =
  | "document_collection"
  | "portal_access"
  | "administrative_representation"
  | "judicial_representation"
  | "payment_request";
export interface ExpansionSuccessionAuthorityInput {
  person_id: string;
  representation_id: string | null;
  operation: ExpansionSuccessionOperation;
  evidence_document_ids: string[];
  basis_note: string;
  scope_note: string;
  valid_from: string | null;
  valid_until: string | null;
  decision: "reviewed" | "insufficient" | "revoked";
}
export interface ExpansionSuccessionAuthority extends ExpansionSuccessionAuthorityInput {
  is_current?: boolean;
  revoked_at?: string | null;
  revocation_note?: string | null;
  id: string;
  version_id: string;
  snapshot: Record<string, unknown>;
  reviewed_by: string;
  reviewed_at: string;
}
export type ExpansionSuccessionEventKind =
  | "death_reported"
  | "estate_filing"
  | "appointment"
  | "habilitation_requested"
  | "habilitation_decided"
  | "document_received"
  | "payment_authority_recorded"
  | "note";
export interface ExpansionSuccessionEventInput {
  event_kind: ExpansionSuccessionEventKind;
  occurred_on: string;
  document_id?: string | null;
  description: string;
  previous_event_id?: string | null;
}
export interface ExpansionSuccessionEvent extends ExpansionSuccessionEventInput {
  id: string;
  version_id: string;
  created_by: string;
  created_at: string;
}
export interface ExpansionSuccessionRead {
  version: ExpansionSuccession;
  is_current: boolean;
  missing: string[];
  persons: ExpansionSuccessionPerson[];
  authorities: ExpansionSuccessionAuthority[];
  events: ExpansionSuccessionEvent[];
}
export type ExpansionDiligenceScope =
  "instruction:read" | "files:read" | "delivery:upload" | "message:write";
export interface ExpansionDiligenceInput {
  diligence_key: string;
  previous_version_id?: string | null;
  category: ExpansionCategory;
  title: string;
  instructions: string;
  proceeding_id?: string | null;
  supervisor_id: string;
  substitute_id?: string | null;
  due_at?: string | null;
  expires_at: string;
  source_document_ids: string[];
}
export interface ExpansionDiligence
  extends Version, Omit<ExpansionDiligenceInput, "previous_version_id"> {
  case_id: string;
  snapshot: Record<string, unknown>;
  snapshot_hash: string;
  state: "draft" | "approved" | "returned" | "revoked" | "completed";
}
export interface ExpansionDiligenceInviteInput {
  email: string;
  scopes: ExpansionDiligenceScope[];
  expires_at: string;
}
export interface ExpansionDiligenceInvite {
  id: string;
  case_id: string;
  tenant_id: string;
  version_id: string;
  email?: string;
  identity_id?: string | null;
  scopes: ExpansionDiligenceScope[];
  expires_at: string;
  state: "draft" | "approved" | "rejected" | "issued" | "accepted" | "revoked";
  revision: number;
  identity_evidence_document_id?: string | null;
  identity_note?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_by: string;
  created_at: string;
}
export interface ExpansionDiligenceGrant {
  id: string;
  case_id: string;
  tenant_id: string;
  version_id: string;
  invite_id: string;
  identity_id?: string;
  scopes: ExpansionDiligenceScope[];
  expires_at: string;
  state: "active" | "revoked" | "completed";
  accepted_at: string;
  revision: number;
}
export interface ExpansionDiligenceDelivery {
  id: string;
  case_id: string;
  version_id: string;
  grant_id: string;
  identity_id?: string;
  document_id: string;
  description: string;
  state: "prepared" | "submitted" | "reviewed" | "returned" | "abandoned";
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  created_at?: string;
}
export interface ExpansionDiligenceMessage {
  id: string;
  grant_id: string;
  identity_id?: string;
  body: string;
  idempotency_key?: string;
  created_at: string;
}
export interface ExpansionDiligenceRead {
  version: ExpansionDiligence;
  is_current: boolean;
  invites: ExpansionDiligenceInvite[];
  grants: ExpansionDiligenceGrant[];
  deliveries: ExpansionDiligenceDelivery[];
  messages: ExpansionDiligenceMessage[];
}
export interface ExpansionSpecialtyStage {
  key: string;
  label: string;
}
export interface ExpansionSpecialtyChecklist {
  key: string;
  title: string;
  description: string;
  category: ExpansionCategory;
  required: boolean;
}
export interface ExpansionSpecialtyTask {
  key: string;
  title: string;
  description: string;
  category: ExpansionCategory;
}
export interface ExpansionSpecialtyBody {
  stages: ExpansionSpecialtyStage[];
  checklist: ExpansionSpecialtyChecklist[];
  task_templates: ExpansionSpecialtyTask[];
}
export interface ExpansionSpecialtyInput {
  package_key: string;
  previous_version_id?: string | null;
  title: string;
  specialty: string;
  purpose: string;
  scope: string;
  source_url: string;
  checked_on: string | null;
  validity_note: string;
  limitations: string;
  body: ExpansionSpecialtyBody;
}
export interface ExpansionSpecialty
  extends Version, Omit<ExpansionSpecialtyInput, "previous_version_id"> {
  state: "draft" | "reviewed" | "revoked";
}
export interface ExpansionSpecialtyRead {
  version: ExpansionSpecialty;
  is_current: boolean;
}
export interface ExpansionSpecialtyPreview {
  version_id: string;
  is_current: boolean;
  can_apply: boolean;
  missing: string[];
  additions: ExpansionSpecialtyBody;
  conflicts: { kind?: string; item_key?: string; reason?: string }[];
  preview_hash: string;
}
export interface ExpansionSpecialtyInstallation {
  id: string;
  tenant_id: string;
  case_id: string;
  package_version_id: string;
  snapshot: Record<string, unknown>;
  preview_hash: string;
  idempotency_key: string;
  created_by: string;
  created_at: string;
}
export interface ExpansionSpecialtyItem {
  id: string;
  installation_id: string;
  case_id: string;
  kind: "stage" | "checklist" | "task_template";
  item_key: string;
  category: ExpansionCategory;
  payload:
    | ExpansionSpecialtyStage
    | ExpansionSpecialtyChecklist
    | ExpansionSpecialtyTask;
  state: "open" | "completed" | "disabled";
  note: string | null;
  task_id: string | null;
}
export interface ExpansionSpecialtyInstallationRead {
  installation: ExpansionSpecialtyInstallation;
  items: ExpansionSpecialtyItem[];
}
export type ExpansionListKind =
  | "coverages"
  | "acts"
  | "succession"
  | "diligences"
  | "packages"
  | "installations";
