export type LegalCaseType = "consultivo" | "extrajudicial" | "judicial";
export type LegalCaseStatus = "ativo" | "aguardando" | "encerrado";
export type LegalDocumentCategory = "general" | "medical" | "fiscal";

export interface LegalProfessionalProfile {
  profile_id: string;
  oab_number: string;
  oab_state: string;
}

export interface LegalCollaborator {
  id: string;
  nome: string;
  role: string;
  oab_number?: string | null;
  oab_state?: string | null;
}

export interface LegalWorkspaceContext {
  tenant_id: string;
  enabled: boolean;
  can_activate: boolean;
  can_create: boolean;
  user_id: string;
  professional_profile: LegalProfessionalProfile | null;
  collaborators: LegalCollaborator[];
}

export interface LegalCase {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  negotiation_id: string | null;
  owner_id: string;
  title: string;
  area: string;
  case_type: LegalCaseType;
  status: LegalCaseStatus;
  next_action: string;
  next_action_due_at: string | null;
  wait_reason: string;
  created_at: string;
  updated_at: string;
}

export interface LegalCaseInput {
  title: string;
  customer_id?: string | null;
  negotiation_id?: string | null;
  area?: string;
  case_type?: LegalCaseType;
  next_action?: string;
  next_action_due_at?: string | null;
}

export type LegalCasePatch = Partial<Pick<LegalCase,
  "title" | "area" | "case_type" | "status" | "next_action" | "next_action_due_at" | "wait_reason"
>>;

export interface LegalCaseMember {
  case_id: string;
  profile_id: string;
  can_edit: boolean;
  can_view_medical: boolean;
  can_view_fiscal: boolean;
}

export interface LegalCaseParty {
  id: string;
  case_id: string;
  name: string;
  party_role: string;
  customer_id: string | null;
}

export interface LegalProceeding {
  id: string;
  case_id: string;
  cnj_number: string;
  court: string;
  division: string;
  description: string;
  created_at?: string;
}

export interface LegalCaseEvent {
  id: string;
  case_id: string;
  actor_id: string | null;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LegalCaseDocument {
  id: string;
  case_id: string;
  category: LegalDocumentCategory;
  display_name: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  status: "prepared" | "ready";
  sha256: string | null;
  uploaded_by: string;
  retention_hold: boolean;
  created_at: string;
}
