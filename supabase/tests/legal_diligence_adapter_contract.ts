// Local disposable SQL -> production Edge -> fake Auth/Storage transport -> SQL.
// Create advocachat_f8_adapter with frozen F8 migrations before running.
// deno run --no-lock --allow-run=/opt/homebrew/opt/postgresql@17/bin/psql --allow-read=supabase/tests/legal_document_assistance.sql supabase/tests/legal_diligence_adapter_contract.ts
// deno-lint-ignore-file no-import-prefix
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createDiligenceAccessHandler } from "../functions/_shared/legal-diligence-access.ts";
import { createDiligenceDocumentsHandler } from "../functions/_shared/legal-diligence-documents.ts";
import { type PortalAdmin, portalHash } from "../functions/_shared/legal-portal.ts";

type Row = Record<string, unknown>;
type Meta = { id: string; state: string };
type Stored = { id: string; storage_path: string; sha256: string; status: string };
type AuthUser = { id: string; email: string; role: string; app_metadata: Row; email_confirmed_at: string | null };
const connection = ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "advocachat_f8_adapter", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
const quote = (value: unknown): string => value === null || value === undefined ? "null" : typeof value === "boolean" || typeof value === "number" ? String(value) : "'" + (typeof value === "string" ? value : JSON.stringify(value)).replaceAll("'", "''") + "'";
class SqlError extends Error { constructor(public code: string, message: string) { super(message); } }
async function sql<T = Row>(statement: string, parse = true): Promise<T> {
  const process = new Deno.Command("/opt/homebrew/opt/postgresql@17/bin/psql", { args: connection, stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const writer = process.stdin.getWriter(); await writer.write(new TextEncoder().encode(statement)); await writer.close();
  const result = await process.output();
  if (!result.success) { const error = new TextDecoder().decode(result.stderr); throw new SqlError(error.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? "XX000", error.slice(0, 1800)); }
  const lines = new TextDecoder().decode(result.stdout).trim().split("\n").filter(Boolean);
  return (parse && lines.length ? JSON.parse(lines.at(-1)!) : null) as T;
}
globalThis.fetch = () => { throw new Error("Real network forbidden in local diligence contract"); };
const exists = await sql("select to_jsonb(to_regclass('public.legal_diligence_adapter_ids'));");
if (!exists) {
  const fixture = await Deno.readTextFile("supabase/tests/legal_document_assistance.sql");
  const marker = "\nreset role;\ninsert into legal_test_ids(name) values('f7_general_text'";
  const end = fixture.indexOf(marker); assert(end > 0 && fixture.split(marker).length === 2);
  await sql(fixture.slice(0, end) + "\nreset role; create table public.legal_diligence_adapter_ids as select * from legal_test_ids; commit;\n", false);
}
const ids = await sql<Record<string, string>>("select jsonb_object_agg(name,id) from public.legal_diligence_adapter_ids;");
async function rpc<T = Meta>(name: string, args: Row, role = "authenticated", actor = ids.owner): Promise<T> {
  assert(/^legal_[a-z_]+$/.test(name) && Object.keys(args).every((key) => /^p_[a-z0-9_]+$/.test(key)));
  assert(["authenticated", "service_role", "legal_portal"].includes(role));
  return await sql<T>(`begin; set local role ${role}; set local request.jwt.claim.sub=${quote(actor)}; set local request.jwt.claim.role=${quote(role)}; set local request.jwt.claims=${quote({ sub: actor, role })}; select to_jsonb(public.${name}(${Object.entries(args).map(([key, value]) => `${key}=>${quote(value)}`).join(",")})); commit;`);
}
const checks: string[] = [], blobs = new Map<string, Uint8Array>();
let actorId = ids.owner, authCreates = 0, storageUploads = 0, storageRemovals = 0;
let afterUpload: (() => Promise<void>) | undefined, afterDownload: (() => Promise<void>) | undefined;
let loseFinalizeOnce = false;
async function authUser(id: string) {
  return await sql<AuthUser | null>(`select jsonb_build_object('id',id,'email',email,'role',coalesce(nullif(role,''),'authenticated'),'app_metadata',raw_app_meta_data,'email_confirmed_at',email_confirmed_at) from auth.users where id=${quote(id)};`);
}
const admin = {
  rpc: async (name: string, args: Row) => {
    try {
      const data = await rpc<unknown>(name, args, "service_role", actorId);
      if (name === "legal_diligence_service_finalize_upload" && loseFinalizeOnce) { loseFinalizeOnce = false; throw new Error("Synthetic response lost after SQL COMMIT"); }
      return { data, error: null };
    } catch (e) { if (e instanceof SqlError) return { data: null, error: { code: e.code, message: "Local SQL refusal" } }; throw e; }
  },
  auth: {
    getUser: async () => ({ data: { user: await authUser(actorId) }, error: null }),
    admin: {
      getUserById: async (id: string) => { const user = await authUser(id); return { data: { user }, error: user ? null : { status: 404 } }; },
      createUser: async (attributes: Row) => {
        authCreates++;
        assertEquals(attributes.email_confirm, false); assertEquals(attributes.role, "legal_portal"); assertEquals(attributes.password, undefined);
        await sql(`insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(${quote(attributes.id)},${quote(attributes.email)},'legal_portal',${quote(attributes.app_metadata)},'{}',clock_timestamp(),clock_timestamp());`, false);
        return { data: { user: await authUser(String(attributes.id)) }, error: null };
      },
      generateLink: () => { throw new Error("No Auth credential may be returned to staff"); },
    },
  },
  from: (table: string) => { assertEquals(table, "profiles"); return { select: () => ({ eq: (_column: string, id: string) => ({ maybeSingle: async () => ({ data: await sql(`select to_jsonb(p) from public.profiles p where id=${quote(id)};`), error: null }) }) }) }; },
  storage: { from: (bucket: string) => {
    assertEquals(bucket, "legal-case-documents"); return {
      upload: async (path: string, bytes: Uint8Array) => {
        storageUploads++;
        if (blobs.has(path)) return { data: null, error: { status: 409 } };
        blobs.set(path, new Uint8Array(bytes));
        await sql(`insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents',${quote(path)},${quote({ size: bytes.length })});`, false);
        if (afterUpload) { const run = afterUpload; afterUpload = undefined; await run(); }
        return { data: { path }, error: null };
      },
      download: async (path: string) => { const bytes = blobs.get(path); if (afterDownload) { const run = afterDownload; afterDownload = undefined; await run(); } return { data: bytes ? new Blob([bytes]) : null, error: bytes ? null : { status: 404 } }; },
      remove: async (paths: string[]) => { storageRemovals += paths.length; for (const path of paths) { blobs.delete(path); await sql(`delete from storage.objects where bucket_id='legal-case-documents' and name=${quote(path)};`, false); } return { error: null }; },
    };
  } },
} as unknown as PortalAdmin;
const access = createDiligenceAccessHandler(() => admin);
const documents = createDiligenceDocumentsHandler(() => admin);
const request = (body: Row, auth = true) => new Request("https://synthetic.invalid", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { Authorization: "Bearer aaa.bbb.ccc" } : {}) }, body: JSON.stringify(body) });
async function call<T = Row>(body: Row, status = 200, authenticated = true): Promise<T> { const response = await access(request(body, authenticated)); const value = await response.json(); assertEquals(response.status, status, JSON.stringify(value)); return value; }
async function doc(body: Row, status = 200): Promise<Response> { const response = await documents(request(body)); if (response.status !== status) throw new Error(`Document status ${response.status}, expected ${status}: ${await response.text()}`); return response; }
const label = crypto.randomUUID();
const expiry = new Date(Date.now() + 86400000).toISOString();
const bytes = new TextEncoder().encode("evidence");
const source = await rpc<Stored>("legal_prepare_document", { p_case_id: ids.case, p_category: "general", p_display_name: "Synthetic exact original", p_file_name: "proof.txt", p_mime_type: "text/plain", p_size_bytes: bytes.length });
blobs.set(source.storage_path, bytes);
await sql(`insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents',${quote(source.storage_path)},'{"size":8}');`, false);
await rpc("legal_finalize_document", { p_document_id: source.id, p_sha256: await portalHash(bytes) }, "service_role");
const today = await sql<string>("select to_jsonb((clock_timestamp() at time zone 'America/Sao_Paulo')::date);");
const coverage = await rpc("legal_operation_create_coverage", { p_payload: { coverage_key: crypto.randomUUID(), title: "Synthetic exact institutional operation", provider: "mni", operation: "petition_submit", api_version: "synthetic-v1", environment: "homologation", institution_reference: "SYNTHETIC-INSTITUTION", court: "Synthetic court", degree: "first", channel: "Synthetic manual channel", documentation_url: "https://example.invalid/operation", checked_on: today, permission_document_id: source.id, valid_from: today, valid_until: new Date(Date.now()+30*86400000).toISOString().slice(0,10), limitations: "No external adapter or transmission", permission_state: "documented" } });
await rpc("legal_operation_review_coverage", { p_version_id: coverage.id, p_decision: "reviewed", p_note: "Synthetic version and permission reviewed; no real institutional agreement" });
await call({ action: "configure_operation", coverage_version_id: coverage.id, configured: true }, 409);
const environment: Record<string, string> = { LEGAL_OPERATION_TENANT_ID: ids.tenant_a, LEGAL_OPERATION_ACCOUNT_ID: "synthetic-account", LEGAL_OPERATION_INSTITUTION_REFERENCE: "SYNTHETIC-INSTITUTION", LEGAL_OPERATION_ENVIRONMENT: "homologation" };
const configuredHandler = createDiligenceAccessHandler(() => admin, (key) => environment[key]);
let configuredResponse = await configuredHandler(request({ action: "configure_operation", coverage_version_id: coverage.id, configured: true }));
assertEquals(configuredResponse.status, 200, await configuredResponse.clone().text());
const connectionState = await configuredResponse.json(); assertEquals(connectionState.configured, true); assertEquals(connectionState.adapter_implemented, false); assertEquals(connectionState.active, false);
actorId = ids.outsider; configuredResponse = await configuredHandler(request({ action: "configure_operation", coverage_version_id: coverage.id, configured: true })); assertEquals(configuredResponse.status, 403); actorId = ids.owner;
checks.push("institutional_binding_uses_server_identity_without_enabling_or_sending_an_operation");
async function diligence(category = "general", email = `diligence-${label}@example.invalid`) {
  const version = await rpc("legal_diligence_create_version", { p_case_id: ids.case, p_payload: { diligence_key: crypto.randomUUID(), category, title: "Synthetic isolated diligence", instructions: "Literal instruction; no judiciary action. <script>untrusted</script>", supervisor_id: ids.owner, expires_at: expiry, source_document_ids: [source.id] } });
  await rpc("legal_diligence_review", { p_version_id: version.id, p_decision: "approved", p_note: "Synthetic instruction and selected file reviewed" });
  const invite = await rpc("legal_diligence_create_invite", { p_version_id: version.id, p_payload: { email, scopes: ["instruction:read", "files:read", "delivery:upload", "message:write"], expires_at: expiry } });
  await rpc("legal_diligence_review_invite", { p_invite_id: invite.id, p_decision: "approved", p_evidence_document_id: ids.general, p_note: "Synthetic individual contact proof reviewed" });
  return { version, invite };
}
const first = await diligence();
const provisioningKey = crypto.randomUUID();
const provision = await call<{ auth_user_id: string }>({ action: "provision", invite_id: first.invite.id, idempotency_key: provisioningKey }, 201);
const externalId = provision.auth_user_id;
assertEquals(await sql<number>(`select to_jsonb(count(*)) from public.profiles where id=${quote(externalId)};`), 0);
const reservation = await sql<{ id: string }>(`select jsonb_build_object('id',id) from public.legal_portal_provisioning where auth_user_id=${quote(externalId)};`);
await call({ action: "provision", invite_id: first.invite.id, idempotency_key: provisioningKey }, 201); assertEquals(authCreates, 1);
try { await rpc("legal_portal_service_complete_provision", { p_staff_id: ids.owner, p_provisioning_id: reservation.id }, "service_role"); throw new Error("F5 accepted F8 reservation"); } catch (e) { assert(e instanceof SqlError && ["42501", "22023"].includes(e.code)); }
checks.push("reserved_external_identity_has_no_profile_and_F5_cannot_complete_F8_reservation");
const issued = await call<{ activation_path: string }>({ action: "issue", invite_id: first.invite.id });
assert(issued.activation_path.startsWith("/portal/diligencias/ativar#invite="));
const token = new URLSearchParams(issued.activation_path.split("#")[1]).get("invite")!;
const storedToken = await sql<string>(`select to_jsonb(token_hash) from public.legal_diligence_invite_tokens where invite_id=${quote(first.invite.id)};`);
assertEquals(storedToken, await portalHash(token)); assert(storedToken !== token);
assertEquals(await call({ action: "inspect", token }, 200, false), { available: true });
actorId = externalId; await call({ action: "accept", token }, 403);
await sql(`update auth.users set email_confirmed_at=clock_timestamp() where id=${quote(externalId)};`, false);
const accepted = await call<{ grant_id: string }>({ action: "accept", token });
assertEquals((await call<{ grant_id: string }>({ action: "accept", token })).grant_id, accepted.grant_id);
const context = await call<{ diligences: Row[] }>({ action: "context" }); assertEquals(context.diligences.length, 1);
assert(!JSON.stringify(context).includes(ids.case)); assert(!JSON.stringify(context).includes(ids.tenant_a));
assertEquals(await sql<number>(`select to_jsonb(count(*)) from public.legal_portal_memberships where identity_id=${quote(externalId)};`), 0);
checks.push("recipient_confirmation_and_separate_grant_required_no_case_membership_or_auth_secret");
const read = await call<{ instructions: string; documents: { id: string }[] }>({ action: "read", grant_id: accepted.grant_id });
assert(read.instructions.includes("<script>")); assertEquals(read.documents.map((d) => d.id), [source.id]);
assertEquals(await (await doc({ action: "download", grant_id: accepted.grant_id, document_id: source.id })).text(), "evidence");
await doc({ action: "download", grant_id: accepted.grant_id, document_id: ids.medical }, 403);
checks.push("source_bytes_match_and_unreleased_case_file_is_denied");
async function upload(grantId: string, key: string, category?: string, value = "receipt!") {
  const form = new FormData(); form.set("grant_id", grantId); form.set("idempotency_key", key); form.set("description", "Synthetic delivery, waiting for human review"); form.set("file", new File([value], "receipt.txt", { type: "text/plain" })); if (category) form.set("category", category);
  return await documents(new Request("https://synthetic.invalid", { method: "POST", headers: { Authorization: "Bearer aaa.bbb.ccc" }, body: form }));
}
const uploadKey = crypto.randomUUID(); loseFinalizeOnce = true;
let response = await upload(accepted.grant_id, uploadKey); assertEquals(response.status, 503); assertEquals(storageRemovals, 0);
const committed = await sql<{ id: string; document_id: string; state: string }>(`select to_jsonb(d) from public.legal_diligence_deliveries d where idempotency_key=${quote(uploadKey)};`);
assertEquals(committed.state, "submitted"); const countBeforeRetry = storageUploads;
response = await upload(accepted.grant_id, uploadKey); assertEquals(response.status, 200); assertEquals((await response.json()).document_id, committed.document_id); assertEquals(storageUploads, countBeforeRetry);
response = await upload(accepted.grant_id, uploadKey, undefined, "different"); assertEquals(response.status, 400); assertEquals(storageRemovals, 0);
checks.push("lost_finalize_response_preserves_bytes_and_exact_retry_skips_duplicate_upload");
const pendingKey = crypto.randomUUID();
const pending = await rpc<{ delivery_id: string; document: Stored }>("legal_diligence_service_prepare_upload", { p_actor_id: externalId, p_grant_id: accepted.grant_id, p_payload: { file_name: "receipt.txt", mime_type: "text/plain", size_bytes: 8, description: "Synthetic delivery, waiting for human review", idempotency_key: pendingKey } }, "service_role");
blobs.set(pending.document.storage_path, new TextEncoder().encode("receipt!"));
await sql(`insert into storage.objects(bucket_id,name,metadata) values('legal-case-documents',${quote(pending.document.storage_path)},'{"size":8}');`, false);
response = await upload(accepted.grant_id, pendingKey); assertEquals(response.status, 201); assertEquals((await response.json()).delivery_id, pending.delivery_id); assertEquals(storageRemovals, 0);
checks.push("uploaded_bytes_with_lost_transport_response_reconciled_by_measured_hash_without_overwrite");
const replyKey = crypto.randomUUID();
const reply = await call<{ id: string }>({ action: "reply", grant_id: accepted.grant_id, body: "Synthetic observation only", idempotency_key: replyKey }, 201);
assertEquals((await call<{ id: string }>({ action: "reply", grant_id: accepted.grant_id, body: "Synthetic observation only", idempotency_key: replyKey }, 201)).id, reply.id);
actorId = ids.owner; const restricted = await diligence("restricted");
await call({ action: "provision", invite_id: restricted.invite.id, idempotency_key: crypto.randomUUID() }); assertEquals(authCreates, 1);
const restrictedIssued = await call<{ activation_path: string }>({ action: "issue", invite_id: restricted.invite.id });
actorId = externalId;
const restrictedAccepted = await call<{ grant_id: string }>({ action: "accept", token: new URLSearchParams(restrictedIssued.activation_path.split("#")[1]).get("invite") });
response = await upload(restrictedAccepted.grant_id, crypto.randomUUID(), "general"); assertEquals(response.status, 400);
response = await upload(restrictedAccepted.grant_id, crypto.randomUUID(), "medical"); assertEquals(response.status, 201, await response.clone().text());
const restrictedDelivery = await response.json();
const restrictedDocument = await sql<Stored>(`select to_jsonb(d) from public.legal_case_documents d where id=${quote(restrictedDelivery.document_id)};`);
assertEquals(restrictedDocument.status, "diligence_restricted");
assertEquals(await (await doc({ action: "download", grant_id: restrictedAccepted.grant_id, document_id: restrictedDocument.id })).text(), "receipt!");
actorId = ids.owner;
assertEquals(await (await doc({ action: "staff_download", version_id: restricted.version.id, document_id: restrictedDocument.id })).text(), "receipt!");
try { await rpc("legal_finalize_document", { p_document_id: restrictedDocument.id, p_sha256: await portalHash("receipt!") }, "service_role"); throw new Error("F1 promoted restricted delivery"); } catch (e) { assert(e instanceof SqlError); }
try { await rpc("legal_text_create_version", { p_document_id: restrictedDocument.id, p_payload: { mode: "manual", pages_total: 1, note: "Must not use restricted proof", pages: [{ page_number: 1, text: "Restricted" }] } }); throw new Error("F7 consumed restricted delivery"); } catch (e) { assert(e instanceof SqlError); }
await rpc("legal_set_case_member", { p_case_id: ids.case, p_profile_id: ids.member, p_can_edit: true, p_can_view_medical: true, p_can_view_fiscal: false });
actorId = ids.member; await doc({ action: "staff_download", version_id: restricted.version.id, document_id: restrictedDocument.id }, 403);
checks.push("restricted_delivery_retains_dual_acl_and_cannot_be_promoted_or_indexed_by_legacy_modules");
actorId = externalId;
afterDownload = async () => { await rpc("legal_diligence_revoke_invite", { p_invite_id: first.invite.id, p_note: "Synthetic revocation while Storage returns bytes" }); };
await doc({ action: "download", grant_id: accepted.grant_id, document_id: source.id }, 403);
checks.push("revocation_between_private_bytes_and_second_authorization_denies_download");
actorId = ids.owner; const revokedUpload = await diligence();
await call({ action: "provision", invite_id: revokedUpload.invite.id, idempotency_key: crypto.randomUUID() });
const revokedIssued = await call<{ activation_path: string }>({ action: "issue", invite_id: revokedUpload.invite.id }); actorId = externalId;
const revokedGrant = await call<{ grant_id: string }>({ action: "accept", token: new URLSearchParams(revokedIssued.activation_path.split("#")[1]).get("invite") });
afterUpload = async () => { await rpc("legal_diligence_revoke_invite", { p_invite_id: revokedUpload.invite.id, p_note: "Synthetic revocation during upload" }); };
const revokedKey = crypto.randomUUID(); response = await upload(revokedGrant.grant_id, revokedKey); assertEquals(response.status, 403);
assertEquals((await sql<{ state: string }>(`select to_jsonb(d) from public.legal_diligence_deliveries d where idempotency_key=${quote(revokedKey)};`)).state, "abandoned"); assertEquals(storageRemovals, 1);
await sql(`update public.legal_diligence_grants set expires_at=clock_timestamp()-interval '1 second' where id=${quote(restrictedAccepted.grant_id)};`, false);
await call({ action: "read", grant_id: restrictedAccepted.grant_id }, 403);
assertEquals((await call<{ diligences: unknown[] }>({ action: "context" })).diligences, []);
checks.push("revoked_upload_abandons_only_uncommitted_bytes_and_expiry_closes_access");
console.log(JSON.stringify({ result: "PASS", checks, fake_auth_creates: authCreates, fake_storage_uploads: storageUploads, real_network_calls: 0, database: "advocachat_f8_adapter; local disposable only" }));
