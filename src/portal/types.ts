export type PortalCategory = "general" | "medical" | "fiscal";
export type PortalScope =
  | "case_summary:read"
  | "agenda:read"
  | "messages:read"
  | "messages:write"
  | "requests:upload"
  | "documents:read"
  | "statements:read"
  | "fiscal_exports:read";
export type PortalMembership = {
  id: string;
  case_id: string;
  access_kind: "client" | "representative" | "accountant";
  scopes: PortalScope[];
  allow_medical: boolean;
  allow_fiscal: boolean;
  revision: number;
  expires_at: string;
  public_title: string;
};
export type PortalContext = {
  identity_id: string;
  status: "pending" | "active" | "suspended";
  memberships: PortalMembership[];
};
export type PortalPublication = {
  id: string;
  category: PortalCategory;
  publication_kind: "summary" | "update" | "agenda";
  title: string;
  body: string;
  created_at: string;
  reviewed_at: string;
};
export type PortalAgenda = {
  id: string;
  category: PortalCategory;
  title: string;
  body: string;
  starts_at: string;
  ends_at: string | null;
  reviewed_at: string;
};
export type PortalDocument = {
  id: string;
  document_id: string;
  category: PortalCategory;
  display_name: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  purpose: string;
  expires_at: string;
};
export type PortalDocumentRequest = {
  id: string;
  category: PortalCategory;
  title: string;
  instructions: string;
  due_at: string | null;
  expires_at: string;
  status:
    "open" | "uploading" | "submitted" | "approved" | "rejected" | "cancelled";
  document_id?: string | null;
};
export type PortalMessage = {
  id: string;
  category: PortalCategory;
  body: string;
  direction: "client" | "office";
  created_at: string;
};
export type PortalExport = { id: string; title: string; reviewed_at: string };
export type PortalExportManifest = {
  id: string;
  title: string;
  items: {
    release_id: string;
    document_id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
  }[];
};
export type PortalCase = {
  membership: PortalMembership;
  publications: PortalPublication[];
  agenda: PortalAgenda[];
  documents: PortalDocument[];
  requests: PortalDocumentRequest[];
  messages: PortalMessage[];
  exports: PortalExport[];
};

export function portalCategoryAllowed(
  member: PortalMembership,
  category: string,
) {
  return category === "general"
    ? member.access_kind !== "accountant"
    : category === "medical"
      ? member.allow_medical && member.access_kind !== "accountant"
      : category === "fiscal" && member.allow_fiscal;
}
export function portalMembershipFingerprint(members: PortalMembership[]) {
  return JSON.stringify(
    members
      .map((m) => [
        m.id,
        m.revision,
        m.scopes,
        m.allow_medical,
        m.allow_fiscal,
        m.expires_at,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
