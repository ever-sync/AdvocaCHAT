import type {
  PortalCategory,
  PortalMembership,
  PortalScope,
} from "@/portal/types";
export type { PortalCategory, PortalScope } from "@/portal/types";
export type CareMembership = PortalMembership & {
  tenant_id: string;
  party_id: string;
  identity_id: string;
  invite_id: string;
  representation_id: string | null;
  verified_email: string;
  state: "pending" | "active" | "revoked";
  accepted_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
};
export type CareInviteInput = {
  party_id: string;
  email: string;
  access_kind: CareMembership["access_kind"];
  scopes: PortalScope[];
  allow_medical: boolean;
  allow_fiscal: boolean;
  representation_id: string | null;
  public_title: string;
  expires_at: string;
  purpose: string;
};
export type CareInvite = CareInviteInput & {
  id: string;
  tenant_id: string;
  case_id: string;
  state: "draft" | "approved" | "rejected" | "issued" | "accepted" | "revoked";
  revision: number;
  identity_id: string | null;
  identity_note: string | null;
  contact_method: "documented_review" | "verified_channel" | null;
  evidence_document_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};
export type CareRepresentationGrant = {
  id: string;
  representation_id: string;
  scopes: PortalScope[];
  review_note: string;
  approved_by: string;
  approved_at: string;
};
export type CarePublicationInput = {
  membership_id: string;
  category: PortalCategory;
  publication_kind: "summary" | "update" | "agenda";
  title: string;
  body: string;
  source_document_ids: string[];
  source_appointment_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  previous_version_id: string | null;
};
export type CarePublication = CarePublicationInput & {
  id: string;
  case_id: string;
  state: "draft" | "approved" | "revoked" | "superseded";
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};
export type CareRelease = {
  id: string;
  case_id: string;
  membership_id: string;
  document_id: string;
  category: PortalCategory;
  document_hash: string;
  purpose: string;
  expires_at: string;
  state: "draft" | "approved" | "revoked";
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};
export type CareExport = {
  id: string;
  membership_id: string;
  title: string;
  release_ids: string[];
  state: "draft" | "approved" | "revoked";
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};
export type CareRequest = {
  status:
    "open" | "uploading" | "submitted" | "approved" | "rejected" | "cancelled";
  document_id: string | null;
  id: string;
  membership_id: string;
  request_id: string;
  category: PortalCategory;
  title: string;
  instructions: string;
  due_at: string | null;
  expires_at: string;
  created_at: string;
};
export type CareCommunicationInput = {
  origin_event_id?: string | null;
  membership_id: string;
  channel: "portal" | "email" | "whatsapp";
  category: PortalCategory;
  title: string;
  body: string;
  expires_at: string;
  previous_version_id?: string | null;
  recipient_phone?: string;
  contact_evidence_id?: string | null;
};
export type CareCommunication = Omit<
  CareCommunicationInput,
  "recipient_phone"
> & {
  id: string;
  recipient: string;
  state: "draft" | "approved" | "cancelled" | "superseded";
  created_at: string;
  review_note: string | null;
  reviewed_at: string | null;
};
export type CareJob = {
  id: string;
  communication_id: string;
  state:
    | "queued"
    | "sending"
    | "provider_accepted"
    | "delivered"
    | "read"
    | "failed"
    | "unknown"
    | "cancelled";
  attempts: number;
  provider_message_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};
export type CareReceipt = {
  id: string;
  job_id: string | null;
  provider: string;
  status: "delivered" | "read" | "failed";
  occurred_at: string;
  matched: boolean;
  received_at: string;
};
export type CareMessage = {
  id: string;
  membership_id: string;
  category: PortalCategory;
  body: string;
  created_at: string;
};
export type CareFollowupInput = {
  title: string;
  purpose: string;
  source_id?: string | null;
  assignee_id: string;
  substitute_id?: string | null;
  next_occurrence: string;
  cadence: "annual" | "once";
  state: "active" | "paused";
  valid_until?: string | null;
};
export type CareFollowup = CareFollowupInput & {
  id: string;
  case_id: string;
  timezone: "America/Sao_Paulo";
  created_at: string;
  updated_at: string;
};
export type CareContext = {
  connections?: {
    channel: "email" | "whatsapp";
    provider: "resend" | "uazapi";
    enabled: boolean;
  }[];
  invites: CareInvite[];
  memberships: CareMembership[];
  representation_grants: CareRepresentationGrant[];
  publications: CarePublication[];
  releases: CareRelease[];
  exports: CareExport[];
  requests: CareRequest[];
  communications: CareCommunication[];
  jobs: CareJob[];
  receipts: CareReceipt[];
  messages: CareMessage[];
  followup_rules: CareFollowup[];
};
export type CareMyDay = {
  items: {
    id: string;
    case_id: string;
    kind: string;
    title: string;
    due_at: string;
    status: string;
    assignee_id: string;
    source_id: string | null;
  }[];
  has_more: boolean;
};
