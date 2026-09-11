import { requireSupabase } from "@/lib/supabase";
import { invokeAuthedFunction } from "@/lib/api/functions";
import type {
  CareCommunication,
  CareCommunicationInput,
  CareContext,
  CareExport,
  CareFollowup,
  CareFollowupInput,
  CareInvite,
  CareInviteInput,
  CareJob,
  CareMyDay,
  CarePublication,
  CarePublicationInput,
  CareRelease,
  CareRequest,
  PortalCategory,
  PortalScope,
} from "./types";
async function rpc<T>(
  name: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
export const getClientCareContext = (caseId: string) =>
  rpc<CareContext>("legal_client_care_context", { p_case_id: caseId });
export const createPortalInvite = (caseId: string, payload: CareInviteInput) =>
  rpc<CareInvite>("legal_create_portal_invite", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const reviewPortalInvite = (
  id: string,
  decision: "approved" | "rejected",
  note: string,
  method: "documented_review" | "verified_channel",
  evidenceId: string,
) =>
  rpc<CareInvite>("legal_review_portal_invite", {
    p_invite_id: id,
    p_decision: decision,
    p_identity_note: note,
    p_contact_method: method,
    p_evidence_document_id: evidenceId,
  });
export const revokePortalAccess = (input: {
  invite_id?: string;
  membership_id?: string;
  reason: string;
}) =>
  rpc("legal_revoke_portal_access", {
    p_invite_id: input.invite_id ?? null,
    p_membership_id: input.membership_id ?? null,
    p_reason: input.reason,
  });
export const grantPortalRepresentation = (
  id: string,
  scopes: PortalScope[],
  note: string,
) =>
  rpc("legal_grant_portal_representation", {
    p_representation_id: id,
    p_scopes: scopes,
    p_note: note,
  });
export const provisionPortalInvite = (id: string, key: string) =>
  invokeAuthedFunction<{ identity_id: string }>("legal-portal-access", {
    action: "provision",
    invite_id: id,
    idempotency_key: key,
  });
export const issuePortalInvite = (id: string, rotate = false) =>
  invokeAuthedFunction<{
    activation_path: string;
    expires_at: string;
    revision: number;
  }>("legal-portal-access", {
    action: rotate ? "rotate" : "issue",
    invite_id: id,
  });
export const createPortalPublication = (
  caseId: string,
  payload: CarePublicationInput,
) =>
  rpc<CarePublication>("legal_create_portal_publication", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const reviewPortalPublication = (
  id: string,
  decision: "approved" | "revoked",
  note: string,
) =>
  rpc<CarePublication>("legal_review_portal_publication", {
    p_publication_id: id,
    p_decision: decision,
    p_note: note,
  });
export const releasePortalDocument = (
  documentId: string,
  membershipId: string,
  purpose: string,
  expiresAt: string,
) =>
  rpc<CareRelease>("legal_release_portal_document", {
    p_document_id: documentId,
    p_membership_id: membershipId,
    p_purpose: purpose,
    p_expires_at: expiresAt,
  });
export const reviewPortalDocumentRelease = (
  id: string,
  decision: "approved" | "revoked",
  note: string,
) =>
  rpc<CareRelease>("legal_review_portal_document_release", {
    p_release_id: id,
    p_decision: decision,
    p_note: note,
  });
export const createPortalExport = (
  membershipId: string,
  title: string,
  releaseIds: string[],
) =>
  rpc<CareExport>("legal_create_portal_export", {
    p_membership_id: membershipId,
    p_title: title,
    p_release_ids: releaseIds,
  });
export const reviewPortalExport = (
  id: string,
  decision: "approved" | "revoked",
  note: string,
) =>
  rpc<CareExport>("legal_review_portal_export", {
    p_export_id: id,
    p_decision: decision,
    p_note: note,
  });
export const createPortalRequest = (
  membershipId: string,
  payload: {
    category: PortalCategory;
    title: string;
    instructions: string;
    due_at: string | null;
    expires_at: string;
  },
) =>
  rpc<CareRequest>("legal_create_portal_request", {
    p_membership_id: membershipId,
    p_payload: payload,
  });
export const createCareCommunication = (
  caseId: string,
  payload: CareCommunicationInput,
) =>
  rpc<CareCommunication>("legal_create_communication", {
    p_case_id: caseId,
    p_payload: payload,
  });
export const reviewCareCommunication = (
  id: string,
  decision: "approved" | "cancelled",
  note: string,
) =>
  rpc<CareCommunication>("legal_review_communication", {
    p_version_id: id,
    p_decision: decision,
    p_note: note,
  });
export const queueCareCommunication = (id: string, key: string) =>
  rpc<CareJob>("legal_queue_communication", {
    p_version_id: id,
    p_idempotency_key: key,
  });
export const saveCareFollowup = (
  caseId: string,
  payload: CareFollowupInput,
  id?: string,
) =>
  rpc<CareFollowup>("legal_save_followup_rule", {
    p_case_id: caseId,
    p_payload: payload,
    p_rule_id: id ?? null,
  });
export const runCareFollowups = (caseId: string) =>
  rpc<number>("legal_run_followups", { p_case_id: caseId });
export const getLegalMyDay = (
  from: string,
  until: string,
  offset = 0,
  limit = 50,
) =>
  rpc<CareMyDay>("legal_my_day", {
    p_from: from,
    p_until: until,
    p_limit: limit,
    p_offset: offset,
  });
