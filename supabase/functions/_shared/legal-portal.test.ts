import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createPortalAccessHandler } from "./legal-portal-access.ts";
import { createPortalDocumentsHandler } from "./legal-portal-documents.ts";
import { type PortalAdmin, portalHash } from "./legal-portal.ts";

const actorId = "11000000-0000-4000-8000-000000000001";
const inviteId = "11000000-0000-4000-8000-000000000002";
const documentId = "11000000-0000-4000-8000-000000000003";
const membershipId = "11000000-0000-4000-8000-000000000004";
const token = "a".repeat(64);
const external = { id: actorId, role: "legal_portal", email: "person@example.test", app_metadata: { legal_portal: true } };
type Call = { name: string; args: Record<string, unknown> };
type RpcResult = { data: unknown; error: null | { code: string; message: string } };
function fakeAdmin(options: {
  user?: unknown; profile?: unknown; rpc?: (call: Call) => RpcResult | Promise<RpcResult>;
  existing?: unknown; create?: (attributes: Record<string, unknown>) => unknown;
  link?: unknown; blob?: Blob;
} = {}) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  let authCalls = 0;
  let linkCalls = 0;
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => { const call = { name, args }; calls.push(call); return await options.rpc?.(call) ?? { data: null, error: null }; },
    auth: {
      getUser: async () => { authCalls++; return { data: { user: options.user === undefined ? external : options.user }, error: null }; },
      admin: {
        getUserById: async () => ({ data: { user: options.existing ?? null }, error: options.existing ? null : { status: 404 } }),
        createUser: async (attributes: Record<string, unknown>) => ({ data: { user: options.create?.(attributes) ?? external }, error: null }),
        generateLink: async () => { linkCalls++; return { data: options.link ?? { user: external, properties: { hashed_token: "b".repeat(64), verification_type: "signup" } }, error: null }; },
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.profile ?? null, error: null }) }) }) }),
    storage: { from: () => ({
      download: async () => ({ data: options.blob ?? new Blob(["evidence"]), error: null }),
      upload: async () => ({ data: { path: "unused" }, error: null }),
      remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
    }) },
  } as unknown as PortalAdmin;
  return { admin, calls, removed, authCalls: () => authCalls, linkCalls: () => linkCalls };
}
function json(body: unknown, auth = true) {
  return new Request("https://fixture.test/functions/v1/legal-portal-access", { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer aaa.bbb.ccc" } : {}) }, body: JSON.stringify(body) });
}

Deno.test("portal uses verified Auth UUID, never an actor supplied by caller", async () => {
  const fake = fakeAdmin({ rpc: () => ({ data: { memberships: [] }, error: null }) });
  const handler = createPortalAccessHandler(() => fake.admin);
  assertEquals((await handler(json({ action: "context", p_actor_id: inviteId }))).status, 400);
  assertEquals(fake.calls.length, 0);
  assertEquals((await handler(json({ action: "context" }))).status, 200);
  assertEquals(fake.calls[0].args, { p_actor_id: actorId });
});
Deno.test("portal refuses internal, forged metadata role, and missing sessions", async () => {
  for (const user of [{ ...external, role: "authenticated" }, { ...external, app_metadata: {} }, null]) {
    const fake = fakeAdmin({ user });
    const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "context" }));
    assert([401, 403].includes(response.status));
    assertEquals(fake.calls.length, 0);
  }
  const fake = fakeAdmin();
  assertEquals((await createPortalAccessHandler(() => fake.admin)(json({ action: "context" }, false))).status, 401);
});
Deno.test("inspect hashes high entropy token and exposes availability only without login", async () => {
  const fake = fakeAdmin({ rpc: () => ({ data: { available: true, email: "private@example.test", case_id: inviteId }, error: null }) });
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "inspect", token }, false));
  assertEquals(await response.json(), { available: true });
  assertEquals(fake.calls[0].args, { p_token_hash: await portalHash(token) });
  assertEquals(fake.authCalls(), 0);
});
Deno.test("oversized and injected input never reaches an RPC or echoes PII", async () => {
  const fake = fakeAdmin();
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "reply", body: "private-data".repeat(5000) }));
  assertEquals(response.status, 413);
  assertEquals(fake.calls.length, 0);
  assert(!(await response.text()).includes("private-data"));
});
Deno.test("provision reserves server UUID before create and never auto-confirms or chooses a password", async () => {
  const order: string[] = [];
  let created: Record<string, unknown> | null = null;
  let reads = 0;
  const fake = fakeAdmin({
    user: { ...external, role: "authenticated", app_metadata: {} },
    profile: { id: actorId, tenant_id: inviteId, status: "active" },
    rpc: (call) => { order.push(call.name); return { data: call.name.endsWith("reserve") ? { id: inviteId, auth_user_id: actorId, email: external.email, status: "reserved" } : { status: "pending" }, error: null }; },
    create: (attributes) => { order.push("createUser"); created = attributes; return external; },
  });
  // Staff profile exists; external UUID must have no internal profile after creation.
  fake.admin.from = (() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reads++ === 0 ? { tenant_id: inviteId, status: "active" } : null, error: null }) }) }) })) as unknown as PortalAdmin["from"];
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "provision", invite_id: inviteId, idempotency_key: membershipId }));
  assertEquals(response.status, 201);
  assertEquals(order, ["legal_portal_service_reserve", "createUser", "legal_portal_service_complete_provision"]);
  assertEquals(created, { id: actorId, email: external.email, role: "legal_portal", email_confirm: false, app_metadata: { legal_portal: true } });
});
Deno.test("provision will not convert an existing internal identity", async () => {
  let createCalls = 0;
  const fake = fakeAdmin({ user: { ...external, role: "authenticated", app_metadata: {} }, profile: { status: "active", tenant_id: inviteId }, existing: { ...external, role: "authenticated" },
    rpc: () => ({ data: { id: inviteId, auth_user_id: actorId, email: external.email, status: "reserved" }, error: null }), create: () => { createCalls++; return external; } });
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "provision", invite_id: inviteId, idempotency_key: membershipId }));
  assertEquals(response.status, 403); assertEquals(createCalls, 0); assertEquals(fake.calls.length, 1);
});
Deno.test("provision reuses verified external identity and never recreates an unreserved missing user", async () => {
  for (const exists of [true, false]) {
    let createCalls = 0; let reads = 0;
    const fake = fakeAdmin({ user: { ...external, role: "authenticated", app_metadata: {} }, existing: exists ? external : undefined,
      rpc: () => ({ data: { id: null, auth_user_id: actorId, email: external.email, status: "created" }, error: null }),
      create: () => { createCalls++; return external; } });
    fake.admin.from = (() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: reads++ === 0 ? { tenant_id: inviteId, status: "active" } : null, error: null }) }) }) })) as unknown as PortalAdmin["from"];
    const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "provision", invite_id: inviteId, idempotency_key: membershipId }));
    assertEquals(response.status, exists ? 200 : 409); assertEquals(createCalls, 0); assertEquals(fake.calls.length, 1);
  }
});
Deno.test("communication connection binds server tenant and account, including disabled configuration", async () => {
  const fake = fakeAdmin({ user: { ...external, role: "authenticated", app_metadata: {} }, profile: { status: "active", tenant_id: inviteId }, rpc: () => ({ data: { enabled: false }, error: null }) });
  const body = { action: "configure_communication", provider: "resend", channel: "email", account_id: "office-account", enabled: false };
  assertEquals((await createPortalAccessHandler(() => fake.admin)(json(body))).status, 503);
  assertEquals(fake.calls.length, 0);
  const environment = (key: string) => ({ LEGAL_RESEND_ACCOUNT_ID: "office-account", LEGAL_RESEND_TENANT_ID: inviteId })[key as "LEGAL_RESEND_ACCOUNT_ID" | "LEGAL_RESEND_TENANT_ID"];
  const handler = createPortalAccessHandler(() => fake.admin, environment);
  assertEquals((await handler(json({ ...body, account_id: "other-office" }))).status, 503);
  assertEquals((await handler(json({ ...body, tenant_id: actorId }))).status, 400);
  assertEquals(fake.calls.length, 0);
  assertEquals((await handler(json(body))).status, 200);
  assertEquals(fake.calls[0].args.p_expected_tenant_id, inviteId);
});
Deno.test("issue returns only a case invitation and never exposes an Auth credential, including first activation", async () => {
  const fake = fakeAdmin({ user: { ...external, role: "authenticated", app_metadata: {} }, profile: { status: "active", tenant_id: inviteId }, existing: external,
    rpc: (call) => ({ data: call.name.endsWith("issue") ? { invite_id: inviteId, auth_user_id: actorId, email: external.email, expires_at: "2026-09-12T00:00:00Z", revision: 1 } : { available: true }, error: null }) });
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "issue", invite_id: inviteId }));
  const result = await response.json();
  assertEquals(response.status, 200);
  assertStringIncludes(result.activation_path, "/portal/ativar#invite=");
  assertEquals(new URLSearchParams(result.activation_path.split("#")[1]).size, 1);
  assertEquals(fake.linkCalls(), 0);
  assert(!result.activation_path.includes("auth=")); assert(!result.activation_path.includes("type="));
  assert(!result.activation_path.includes("?")); assert(!JSON.stringify(result).includes(external.email));
  assertEquals(response.headers.get("Cache-Control"), "no-store");
});
Deno.test("concurrent rotation prevents returning obsolete invitation without generating credentials", async () => {
  const fake = fakeAdmin({ user: { ...external, role: "authenticated", app_metadata: {} }, profile: { status: "active", tenant_id: inviteId }, existing: external,
    rpc: (call) => ({ data: call.name.endsWith("issue") ? { invite_id: inviteId, auth_user_id: actorId, email: external.email, revision: 1 } : { available: false }, error: null }) });
  const response = await createPortalAccessHandler(() => fake.admin)(json({ action: "issue", invite_id: inviteId }));
  assertEquals(response.status, 409); assert(!(await response.text()).includes("activation_path")); assertEquals(fake.linkCalls(), 0);
});
Deno.test("owner of case A cannot obtain Auth credentials for an active recipient with grants in case B", async () => {
  const fake = fakeAdmin({ user: { ...external, id: inviteId, role: "authenticated", app_metadata: {} }, profile: { status: "active", tenant_id: inviteId }, existing: { ...external, email_confirmed_at: "2026-09-11T00:00:00Z" },
    rpc: (call) => ({ data: call.name.endsWith("issue") ? { invite_id: inviteId, auth_user_id: actorId, email: external.email, expires_at: "2099-01-01T00:00:00Z", revision: 3, identity_state: "active", memberships: [{ case_id: membershipId }] } : { available: true }, error: null }) });
  for (const action of ["issue", "rotate"]) {
    const response = await createPortalAccessHandler(() => fake.admin)(json({ action, invite_id: inviteId })); const result = await response.json();
    assertEquals(response.status, 200); assertEquals(Object.keys(result).sort(), ["activation_path", "expires_at", "revision"]);
    const fragment = new URLSearchParams(result.activation_path.split("#")[1]); assertEquals([...fragment.keys()], ["invite"]);
    assertEquals(fragment.get("auth"), null); assertEquals(fake.linkCalls(), 0);
  }
});

async function downloadFixture(revoked = false) {
  let authorizeCount = 0;
  const sha = await portalHash("evidence");
  return fakeAdmin({ rpc: () => (++authorizeCount === 2 && revoked)
    ? { data: null, error: { code: "42501", message: "SECRET diagnosis must never be echoed" } }
    : { data: { document_id: documentId, storage_path: `${inviteId}/${membershipId}/${documentId}`, file_name: "proof.txt", mime_type: "text/plain", size_bytes: 8, sha256: sha }, error: null } });
}
Deno.test("download verifies content hash and authorizes again before returning bytes", async () => {
  const fake = await downloadFixture();
  const response = await createPortalDocumentsHandler(() => fake.admin)(json({ action: "download", membership_id: membershipId, release_id: documentId }));
  assertEquals(response.status, 200); assertEquals(await response.text(), "evidence");
  assertEquals(fake.calls.length, 2); assertStringIncludes(response.headers.get("Content-Disposition")!, "attachment");
});
Deno.test("revocation while bytes are fetched denies download and hides SQL error content", async () => {
  const fake = await downloadFixture(true);
  const response = await createPortalDocumentsHandler(() => fake.admin)(json({ action: "download", membership_id: membershipId, release_id: documentId }));
  assertEquals(response.status, 403); assert(!(await response.text()).includes("SECRET"));
});
Deno.test("upload losing representation at finalize cleans bytes and abandons prepared document", async () => {
  const fake = fakeAdmin({ rpc: (call) => call.name.endsWith("finalize_upload")
    ? { data: null, error: { code: "42501", message: "revoked" } }
    : { data: { id: documentId, cleanup_allowed: true, storage_path: `${inviteId}/${membershipId}/${documentId}` }, error: null } });
  const form = new FormData(); form.set("request_id", inviteId); form.set("file", new File(["evidence"], "proof.txt", { type: "text/plain" }));
  const response = await createPortalDocumentsHandler(() => fake.admin)(new Request("https://fixture.test", { method: "POST", headers: { Authorization: "Bearer aaa.bbb.ccc" }, body: form }));
  assertEquals(response.status, 403); assertEquals(fake.removed.length, 1);
  assertEquals(fake.calls.map((call) => call.name), ["legal_portal_service_prepare_upload", "legal_portal_service_finalize_upload", "legal_portal_service_abandon_upload"]);
});
Deno.test("upload rejects caller-selected category and invalid MIME before reservation", async () => {
  for (const category of [true, false]) {
    const fake = fakeAdmin(); const form = new FormData(); form.set("request_id", inviteId);
    form.set("file", new File(["<html>"], "proof.pdf", { type: "application/pdf" }));
    if (category) form.set("category", "medical");
    const response = await createPortalDocumentsHandler(() => fake.admin)(new Request("https://fixture.test", { method: "POST", headers: { Authorization: "Bearer aaa.bbb.ccc" }, body: form }));
    assertEquals(response.status, 400); assertEquals(fake.calls.length, 0);
  }
});
Deno.test("ambiguous finalize failure preserves potentially committed ready bytes", async () => {
  const fake = fakeAdmin({ rpc: (call) => {
    if (call.name.endsWith("finalize_upload")) throw new Error("connection lost after possible commit");
    if (call.name.endsWith("abandon_upload")) return { data: null, error: { code: "22023", message: "already ready" } };
    return { data: { id: documentId, storage_path: `${inviteId}/${membershipId}/${documentId}` }, error: null };
  } });
  const form = new FormData(); form.set("request_id", inviteId); form.set("file", new File(["evidence"], "proof.txt", { type: "text/plain" }));
  const response = await createPortalDocumentsHandler(() => fake.admin)(new Request("https://fixture.test", { method: "POST", headers: { Authorization: "Bearer aaa.bbb.ccc" }, body: form }));
  assertEquals(response.status, 503); assertEquals(fake.removed, []);
  assertEquals(fake.calls.length, 3);
});
