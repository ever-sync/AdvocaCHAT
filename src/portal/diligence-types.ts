export type DiligenceScope =
  | "instruction:read"
  | "files:read"
  | "delivery:upload"
  | "message:write";
export type DiligenceGrant = {
  grant_id: string;
  title: string;
  category: "general" | "medical" | "fiscal" | "restricted";
  due_at: string | null;
  expires_at: string;
  state: string;
  scopes: DiligenceScope[];
};
export type DiligenceContext = {
  identity_id: string;
  status: string;
  diligences: DiligenceGrant[];
};
export type DiligenceRead = {
  grant: {
    id: string;
    title: string;
    category: string;
    due_at: string | null;
    expires_at: string;
    scopes: DiligenceScope[];
  };
  instructions: string | null;
  documents: {
    id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    sha256: string;
  }[];
  deliveries: {
    id: string;
    document_id: string;
    file_name: string;
    state: string;
    description: string;
    created_at: string;
    review_note: string | null;
  }[];
  messages: { id: string; body: string; created_at: string }[];
};
export function diligenceFingerprint(grants: DiligenceGrant[]) {
  return JSON.stringify(
    [...grants].sort((a, b) => a.grant_id.localeCompare(b.grant_id)).map((
      g,
    ) => ({ ...g, scopes: [...g.scopes].sort() })),
  );
}
