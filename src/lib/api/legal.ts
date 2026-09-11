import { requireSupabase, supabaseAnonKey, supabaseUrl } from "@/lib/supabase";
import type {
  LegalCase, LegalCaseDocument, LegalCaseEvent, LegalCaseInput, LegalCaseMember,
  LegalCaseParty, LegalCasePatch, LegalCaseStatus, LegalDocumentCategory,
  LegalProceeding, LegalProfessionalProfile, LegalWorkspaceContext,
} from "@/types/legal";

async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}

export function getLegalWorkspaceContext() {
  return rpc<LegalWorkspaceContext>("legal_workspace_context");
}

export async function listLegalCustomers(search = "", limit = 50): Promise<Array<{ id: string; nome: string }>> {
  const context = await getLegalWorkspaceContext();
  if (!context.enabled || !context.can_create) return [];
  let query = requireSupabase().from("customers").select("id,nome")
    .eq("tenant_id", context.tenant_id).order("nome").limit(Math.max(1, Math.min(limit, 100)));
  if (search.trim()) query = query.ilike("nome", `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; nome: string }>;
}

export function setLegalWorkspaceEnabled(enabled: boolean) {
  return rpc("legal_set_workspace_enabled", { p_enabled: enabled });
}

export function saveMyLegalProfessionalProfile(input: Pick<LegalProfessionalProfile, "oab_number" | "oab_state">) {
  return rpc("legal_set_professional_profile", { p_oab_number: input.oab_number, p_oab_state: input.oab_state });
}

export async function listLegalCases(filters: { search?: string; status?: LegalCaseStatus | "all"; customer_id?: string } = {}) {
  let query = requireSupabase().from("legal_cases").select("*").order("updated_at", { ascending: false }).limit(200);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.customer_id) query = query.eq("customer_id", filters.customer_id);
  if (filters.search?.trim()) {
    const search = filters.search.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("title", `%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as LegalCase[];
}

export async function getLegalCase(id: string) {
  const { data, error } = await requireSupabase().from("legal_cases").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as LegalCase | null;
}

export function createLegalCase(input: LegalCaseInput) {
  return rpc<LegalCase>("legal_create_case", {
    p_title: input.title, p_customer_id: input.customer_id ?? null,
    p_negotiation_id: input.negotiation_id ?? null, p_area: input.area ?? "",
    p_case_type: input.case_type ?? "consultivo",
    p_next_action: input.next_action ?? "Definir próxima providência",
    p_next_action_due_at: input.next_action_due_at ?? null,
  });
}

export function updateLegalCase(id: string, patch: LegalCasePatch) {
  return rpc<LegalCase>("legal_update_case", { p_case_id: id, p_patch: patch });
}

async function listCaseRows<T>(table: string, caseId: string, order?: string): Promise<T[]> {
  let query = requireSupabase().from(table).select("*").eq("case_id", caseId);
  if (order) query = query.order(order, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export const listLegalParties = (id: string) => listCaseRows<LegalCaseParty>("legal_case_parties", id);
export const listLegalProceedings = (id: string) => listCaseRows<LegalProceeding>("judicial_proceedings", id);
export const listLegalMembers = (id: string) => listCaseRows<LegalCaseMember>("legal_case_members", id);
export const listLegalEvents = (id: string) => listCaseRows<LegalCaseEvent>("legal_case_events", id, "created_at");

export function addLegalParty(caseId: string, input: Pick<LegalCaseParty, "name" | "party_role"> & { customer_id?: string | null }) {
  return rpc("legal_add_case_party", { p_case_id: caseId, p_name: input.name, p_party_role: input.party_role, p_customer_id: input.customer_id ?? null });
}

export function addLegalProceeding(caseId: string, input: Pick<LegalProceeding, "cnj_number" | "court" | "division" | "description">) {
  return rpc("legal_add_proceeding", { p_case_id: caseId, p_cnj_number: input.cnj_number, p_court: input.court, p_division: input.division, p_description: input.description });
}

export function setLegalMember(caseId: string, member: Omit<LegalCaseMember, "case_id">) {
  return rpc("legal_set_case_member", { p_case_id: caseId, p_profile_id: member.profile_id, p_can_edit: member.can_edit, p_can_view_medical: member.can_view_medical, p_can_view_fiscal: member.can_view_fiscal });
}

export function removeLegalMember(caseId: string, profileId: string) {
  return rpc("legal_remove_case_member", { p_case_id: caseId, p_profile_id: profileId });
}

export function addLegalNote(caseId: string, description: string) {
  return rpc("legal_add_case_event", { p_case_id: caseId, p_description: description });
}

export async function listLegalDocuments(caseId: string) {
  const rows = await listCaseRows<LegalCaseDocument>("legal_case_documents", caseId, "created_at");
  return rows.filter((row) => row.status === "ready");
}

async function documentRequest(body: BodyInit, json = false): Promise<Response> {
  const { data: { session }, error } = await requireSupabase().auth.getSession();
  if (error || !session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${supabaseUrl}/functions/v1/legal-documents`, {
    method: "POST", headers: {
      apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    }, body,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "Não foi possível acessar o documento.");
  }
  return response;
}

export async function uploadLegalDocument(caseId: string, input: { file: File; category: LegalDocumentCategory; display_name: string }) {
  const body = new FormData();
  body.set("case_id", caseId);
  body.set("category", input.category);
  body.set("display_name", input.display_name);
  body.set("file", input.file);
  const response = await documentRequest(body);
  return await response.json() as LegalCaseDocument;
}

export async function downloadLegalDocument(document: LegalCaseDocument) {
  const response = await documentRequest(JSON.stringify({ action: "download", document_id: document.id }), true);
  const url = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = document.file_name;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function setLegalDocumentHold(documentId: string, retentionHold: boolean, reason: string) {
  return rpc("legal_set_document_hold", { p_document_id: documentId, p_retention_hold: retentionHold, p_reason: reason });
}
