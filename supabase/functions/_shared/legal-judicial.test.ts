// Test doubles implement asynchronous fetch; pinned URL imports match the existing Edge test suite.
// deno-lint-ignore-file no-import-prefix require-await
import { assert, assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type PortalAdmin, portalHash } from "./legal-portal.ts";
import { type JudicialJob, type JudicialRecord, ESCAVADOR_ORIGIN, judicialBinding, judicialBytes, judicialCallbackEnvelope, judicialConfig, judicialFetch, judicialIdentifier, judicialJson, judicialNextPage, judicialRequest, validJudicialCallback } from "./legal-judicial.ts";
import { createLegalJudicialDispatchHandler, createLegalJudicialWebhookHandler, runJudicialJob } from "./legal-judicial-handlers.ts";

const tenantId = "62000000-0000-4000-8000-000000000001";
const userId = "62000000-0000-4000-8000-000000000002";
const jobId = "62000000-0000-4000-8000-000000000003";
const leaseId = "62000000-0000-4000-8000-000000000004";
const sourceId = "62000000-0000-4000-8000-000000000005";
const cnj = "00000017120248000000"; // Synthetic; no provider query is executed by this suite.
const configuration: Record<string, string> = {
  CRON_SECRET: "fixture-cron-judicial-strong-secret-only",
  LEGAL_ESCAVADOR_TENANT_ID: tenantId, LEGAL_ESCAVADOR_ACCOUNT_ID: "fixture-judicial-office",
  LEGAL_ESCAVADOR_API_TOKEN: "1|fixture-private-provider-token-123456789", LEGAL_ESCAVADOR_ENABLED: "true",
  LEGAL_ESCAVADOR_CALLBACK_TOKEN: "fixture-callback-judicial-strong-secret-only",
  LEGAL_DATAJUD_TENANT_ID: tenantId, LEGAL_DATAJUD_ACCOUNT_ID: "fixture-datajud-office",
};
const env = (key: string) => configuration[key];
const config = judicialConfig(env, judicialBinding(env, "escavador")!)!;
const baseJob: JudicialJob = { id: jobId, lease_token: leaseId, operation: "consult_cnj", query: { cnj }, max_requests: 5, request_count: 0, connection: { provider: "escavador", account_id: config.accountId, environment: "production" }, source_version_id: sourceId };
type Call = { name: string; args: JudicialRecord };
function fakeAdmin(rpc?: (call: Call) => unknown | Promise<unknown>, options: { role?: string; profileActive?: boolean; sourceProvider?: string; sourceTenant?: string } = {}) {
  const calls: Call[] = [];
  const admin = {
    rpc: async (name: string, args: JudicialRecord) => {
      const call = { name, args }; calls.push(call);
      try { return { data: rpc ? await rpc(call) : name.endsWith("authorize_attempt") ? { allowed: true, max_response_bytes: 1048576 } : name.endsWith("claim") ? [baseJob] : {}, error: null }; }
      catch { return { data: null, error: { code: "42501", message: "DO NOT LEAK PRIVATE SQL DETAIL" } }; }
    },
    auth: { getUser: () => ({ data: { user: { id: userId, role: options.role ?? "authenticated", app_metadata: options.role === "legal_portal" ? { legal_portal: true } : {} } }, error: null }) },
    from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => ({ data: table === "profiles" ? { id: userId, status: options.profileActive === false ? "disabled" : "active", tenant_id: tenantId } : { provider: options.sourceProvider ?? "escavador", tenant_id: options.sourceTenant ?? tenantId }, error: null }) }) }) }),
  } as unknown as PortalAdmin;
  return { admin, calls };
}
function request(body: unknown = { action: "dispatch", provider: "escavador" }, cron = true) {
  return new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", ...(cron ? { "x-cron-secret": configuration.CRON_SECRET } : { Authorization: "Bearer aa.bb.cc" }) }, body: JSON.stringify(body) });
}
function webhook(raw: string, token = configuration.LEGAL_ESCAVADOR_CALLBACK_TOKEN) {
  return new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: raw });
}
const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const page = (next: string | null = null) => response({ items: [{ numero_cnj: cnj }], links: { next } });
const gate = (call: Call) => call.name.endsWith("authorize_attempt") ? { allowed: true, max_response_bytes: 1048576 } : {};
const lastFinish = (calls: Call[]) => calls.filter((v) => v.name.endsWith("finish")).at(-1)!;

Deno.test("judicial config requires explicit account, tenant, strong token and enabled flag; DataJud has no transport", () => {
  assert(config);
  for (const key of ["LEGAL_ESCAVADOR_TENANT_ID", "LEGAL_ESCAVADOR_ACCOUNT_ID"]) assertEquals(judicialBinding((name) => name === key ? undefined : env(name), "escavador"), null);
  for (const key of ["LEGAL_ESCAVADOR_API_TOKEN", "LEGAL_ESCAVADOR_ENABLED"]) assertEquals(judicialConfig((name) => name === key ? undefined : env(name), config), null);
  assertEquals(judicialConfig(() => "true", { ...config, provider: "datajud" }), null);
  assertEquals(judicialBinding((name) => name === "LEGAL_ESCAVADOR_ACCOUNT_ID" ? "https://attacker.test" : env(name), "escavador"), null);
});
Deno.test("judicial routes are enumerated CNJ/OAB operations, without science, credentials, attachments or arbitrary URL", () => {
  const cnjQuery = judicialRequest(baseJob); assertEquals(cnjQuery.url.origin, ESCAVADOR_ORIGIN); assertEquals(cnjQuery.url.pathname, "/api/v2/processos/numero_cnj/0000001-71.2024.8.00.0000");
  const oab = judicialRequest({ ...baseJob, operation: "discover_oab", query: { oab_number: "001234", oab_state: "SP", oab_type: "CONSULTOR_ESTRANGEIRO" } });
  assertEquals(oab.url.pathname, "/api/v2/advogado/processos"); assertEquals(oab.url.searchParams.get("oab_numero"), "001234");
  assertThrows(() => judicialRequest({ ...baseJob, query: { cnj, url: "http://localhost" } }));
  assertThrows(() => judicialRequest({ ...baseJob, operation: "dar_ciencia" as JudicialJob["operation"] }));
  assertThrows(() => judicialRequest({ ...baseJob, query: { cnj: "../autos" } }));
  assertThrows(() => judicialRequest({ ...baseJob, operation: "discover_oab", query: { oab_number: "123", oab_state: "XX" } }));
});
Deno.test("diary monitor requires explicit origin and consumption ceiling, while process monitor disables documents", () => {
  assertEquals(judicialRequest({ ...baseJob, operation: "monitor_process" }).body, { numero: "0000001-71.2024.8.00.0000", documentos_publicos: false });
  assertThrows(() => judicialRequest({ ...baseJob, operation: "monitor_diary", query: { term: "fixture" } }));
  const q = { term: "fixture", origins_ids: [2, 2, 3], variations: ["fixture-other"], limit_appearances: 200 };
  assertEquals(judicialRequest({ ...baseJob, operation: "monitor_diary", query: q }).body, { tipo: "termo", termo: "fixture", origens_ids: [2, 3], variacoes: ["fixture-other"], limite_aparicoes: 200 });
  assertThrows(() => judicialRequest({ ...baseJob, operation: "reconcile_monitor", query: { provider_monitor_id: "1" } }));
});
Deno.test("pagination rejects foreign hosts, redirects, scope changes, duplicate params and action paths", () => {
  const initial = judicialRequest({ ...baseJob, operation: "discover_oab", query: { oab_number: "123", oab_state: "SP" } }).url;
  const good = `${ESCAVADOR_ORIGIN}${initial.pathname}?cursor=YWJj&li=123`;
  const next = judicialNextPage({ links: { next: good } }, initial, initial)!;
  assertEquals(next.searchParams.get("oab_estado"), "SP"); assertEquals(next.searchParams.get("cursor"), "YWJj");
  for (const bad of ["http://localhost/api", "https://api.escavador.com.evil.test/api", `${ESCAVADOR_ORIGIN}/api/v2/ciencia`, `${ESCAVADOR_ORIGIN}${initial.pathname}?oab_estado=RJ&cursor=a`, `${ESCAVADOR_ORIGIN}${initial.pathname}?cursor=a&cursor=b`, `${good}#fragment`, `${ESCAVADOR_ORIGIN}${initial.pathname}?url=http://localhost`]) assertThrows(() => judicialNextPage({ links: { next: bad } }, initial, initial));
  const resumed = judicialRequest({ ...baseJob, operation: "read_updates", query: { cnj, cursor: { page: 2 } } }); assertEquals(resumed.url.searchParams.get("page"), "2");
});
Deno.test("HTTP fetch disables redirects, limits bytes and classifies timeout of POST as ambiguous", async () => {
  let calls = 0;
  const post = judicialRequest({ ...baseJob, operation: "monitor_process" });
  const result = await judicialFetch(config, post, (async (_url, options) => { calls++; assertEquals(options?.redirect, "error"); assertEquals(new Headers(options?.headers).get("Authorization"), `Bearer ${config.token}`); return await new Promise<Response>(() => {}); }) as typeof fetch, 5);
  assert(!result.ok); assert(result.ambiguous); assertEquals(calls, 1);
  for (const status of [408, 409, 429, 500]) {
    const result = await judicialFetch(config, post, (async () => new Response("private provider error", { status })) as typeof fetch); assert(!result.ok); assert(result.ambiguous); assert(!result.retryable);
  }
  const large = await judicialFetch(config, judicialRequest(baseJob), (async () => new Response("x".repeat(1048577))) as typeof fetch); assert(!large.ok);
});
Deno.test("raw parser rejects arrays, malformed UTF8 and oversized streamed body; unsafe numeric IDs stay untrusted", async () => {
  assertThrows(() => judicialJson(new TextEncoder().encode("[]")));
  assertThrows(() => judicialJson(new Uint8Array([0xc3, 0x28])));
  assertEquals(judicialIdentifier(Number.MAX_SAFE_INTEGER + 1), null);
  await assertRejects(() => judicialBytes(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); controller.close(); } }), 5));
  let cancelled = false;
  await assertRejects(() => judicialBytes(new ReadableStream({ cancel() { cancelled = true; } }), 10, 5)); assert(cancelled);
});
Deno.test("dispatcher rejects invalid cron or extra tenant; missing configuration persists status without fetch", async () => {
  const fake = fakeAdmin((call) => call.name.endsWith("claim") ? [] : {}); let fetches = 0;
  const handler = createLegalJudicialDispatchHandler(() => fake.admin, (key) => key === "LEGAL_ESCAVADOR_ENABLED" ? "false" : env(key), { fetcher: (async () => { fetches++; return page(); }) as typeof fetch });
  assertEquals((await handler(request(undefined, false))).status, 401); assertEquals(fake.calls.length, 0);
  assertEquals((await handler(request({ action: "dispatch", provider: "escavador", tenant_id: "attacker" }))).status, 400);
  assertEquals(await (await handler(request())).json(), { configured: false, status: "not_configured", processed: 0 });
  assertEquals(fake.calls[0].args.p_configured, false); assertEquals(fake.calls[0].args.p_expected_tenant_id, tenantId); assertEquals(fetches, 0);
  assertEquals(await (await handler(request({ action: "dispatch", provider: "datajud" }))).json(), { configured: false, status: "permission_required", processed: 0 }); assertEquals(fetches, 0);
});
Deno.test("configure resolves actor from JWT and account from env; rejects portal, inactive profile and foreign source", async () => {
  const body = { action: "configure", provider: "escavador", source_version_id: sourceId, enabled: false, limits: { environment: "production", requests_per_minute: 10, requests_per_day: 100 } };
  const good = fakeAdmin(); assertEquals((await createLegalJudicialDispatchHandler(() => good.admin, env)(request(body, false))).status, 200);
  assertEquals(good.calls[0].args.p_actor_id, userId); assertEquals(good.calls[0].args.p_account_id, config.accountId);
  for (const options of [{ role: "legal_portal" }, { profileActive: false }, { sourceTenant: jobId }, { sourceProvider: "datajud" }]) {
    const denied = fakeAdmin(undefined, options); assertEquals((await createLegalJudicialDispatchHandler(() => denied.admin, env)(request(body, false))).status, 403); assertEquals(denied.calls.length, 0);
  }
});
Deno.test("every GET retry is authorized and quota-counted; source originals persist before finish", async () => {
  const fake = fakeAdmin(gate); const events: string[] = []; let fetches = 0;
  const status = await runJudicialJob(fake.admin, config, baseJob, { sleep: async () => {}, fetcher: (async () => { events.push("fetch"); if (fetches++ === 0) return new Response("", { status: 503 }); return response({ numero_cnj: cnj }); }) as typeof fetch });
  assertEquals(status, "succeeded"); assertEquals(fetches, 2);
  assertEquals(fake.calls.map((v) => v.name.split("service_")[1]), ["authorize_attempt", "authorize_attempt", "ingest", "finish"]);
  assertEquals(lastFinish(fake.calls).args.p_payload, { items_count: 1 });
});
Deno.test("revocation between pages denies fetch and never overwrites the persisted lease denial", async () => {
  let gates = 0; let fetches = 0;
  const fake = fakeAdmin((call) => call.name.endsWith("authorize_attempt") ? { allowed: ++gates === 1, max_response_bytes: 1048576, reason: "revoked" } : {});
  const job = { ...baseJob, operation: "read_updates" as const }; const path = judicialRequest(job).url.pathname;
  const status = await runJudicialJob(fake.admin, config, job, { fetcher: (async () => { fetches++; return page(`${ESCAVADOR_ORIGIN}${path}?cursor=YWJj`); }) as typeof fetch });
  assertEquals(status, "authorization_denied"); assertEquals(fetches, 1); assertEquals(fake.calls.filter((v) => v.name.endsWith("finish")).length, 0);
});
Deno.test("bounded pagination persists remaining cursor instead of declaring complete collection", async () => {
  const fake = fakeAdmin(gate); let fetches = 0; const job = { ...baseJob, operation: "read_updates" as const, max_requests: 1 }; const path = judicialRequest(job).url.pathname;
  assertEquals(await runJudicialJob(fake.admin, config, job, { fetcher: (async () => { fetches++; return page(`${ESCAVADOR_ORIGIN}${path}?cursor=YWJj&li=123`); }) as typeof fetch }), "succeeded");
  assertEquals(fetches, 1); assertEquals(lastFinish(fake.calls).args.p_payload, { items_count: 1, next_cursor: { cursor: "YWJj", li: "123" } });
});
Deno.test("unsafe pagination never triggers a second request and normalized errors do not expose provider body", async () => {
  const fake = fakeAdmin(gate); let fetches = 0;
  await runJudicialJob(fake.admin, config, { ...baseJob, operation: "read_updates" }, { fetcher: (async () => { fetches++; return page("http://localhost/private"); }) as typeof fetch });
  assertEquals(fetches, 1); assertEquals(lastFinish(fake.calls).args.p_payload, { error_code: "unsafe_pagination", items_count: 1 });
});
Deno.test("monitor POST never retries ambiguity and only accepts matching external monitor identity", async () => {
  const job = { ...baseJob, operation: "monitor_process" as const }; let fetches = 0;
  const fake = fakeAdmin(gate);
  assertEquals(await runJudicialJob(fake.admin, config, job, { fetcher: (async () => { fetches++; return new Response("", { status: 503 }); }) as typeof fetch }), "unknown"); assertEquals(fetches, 1);
  const mismatch = fakeAdmin(gate); assertEquals(await runJudicialJob(mismatch.admin, config, job, { fetcher: (async () => response({ id: 17, numero: "99999990020248000000" })) as typeof fetch }), "unknown");
  const matched = fakeAdmin(gate); assertEquals(await runJudicialJob(matched.admin, config, job, { fetcher: (async () => response({ id: 17, numero: cnj })) as typeof fetch }), "succeeded");
  assertEquals(lastFinish(matched.calls).args.p_payload, { provider_monitor_id: "17", monitor_kind: "process", items_count: 1 });
});
Deno.test("foreign account and sandbox-labelled jobs cannot execute a production provider request", async () => {
  let fetches = 0; const fake = fakeAdmin(gate); const runtime = { fetcher: (async () => { fetches++; return page(); }) as typeof fetch };
  await assertRejects(() => runJudicialJob(fake.admin, config, { ...baseJob, connection: { ...baseJob.connection, account_id: "foreign" } }, runtime));
  assertEquals(await runJudicialJob(fake.admin, config, { ...baseJob, connection: { ...baseJob.connection, environment: "sandbox" } }, runtime), "permanent_error"); assertEquals(fetches, 0);
});
Deno.test("callback requires strong separate Bearer token and never trusts body tenant or monitor association", async () => {
  const raw = JSON.stringify({ uuid: "fixture-event-1", event: "nova_movimentacao", tenant_id: "attacker", case_id: jobId, published_on: "2026-09-11", monitoramento: { id: 17, numero: cnj }, movimentacao: { conteudo: "PRIVATE-SENSITIVE", data: "2026-09-10" } });
  assert(validJudicialCallback(webhook(raw), env));
  assertEquals(validJudicialCallback(webhook(raw, config.token), (key) => key === "LEGAL_ESCAVADOR_CALLBACK_TOKEN" ? config.token : env(key)), false);
  const fake = fakeAdmin(); const handler = createLegalJudicialWebhookHandler(() => fake.admin, env);
  assertEquals((await handler(webhook(raw, "wrong"))).status, 401); assertEquals(fake.calls.length, 0);
  const result = await handler(webhook(raw)); assertEquals(await result.json(), { received: true });
  const args = fake.calls[0].args; assertEquals(args.p_expected_tenant_id, tenantId); assertEquals(args.p_raw_original, raw);
  const payload = args.p_payload as JudicialRecord; assertEquals(payload.provider_monitor_ids, ["17"]); assertEquals(payload.published_on, null); assertEquals(payload.source_updated_at, null);
  assert(!JSON.stringify(payload).includes("PRIVATE")); assertEquals(payload.case_id, undefined); assertEquals(payload.tenant_id, undefined);
});
Deno.test("callback replay and changed hash retain the same event identity and every original is sent for durable ingest", async () => {
  const fake = fakeAdmin(); const handler = createLegalJudicialWebhookHandler(() => fake.admin, env);
  const first = '{"uuid":"fixture-event-1","event":"processo_verificado","monitoramento":{"id":17}}'; const changed = first.replace('17', '18');
  for (const raw of [first, first, changed]) assertEquals((await handler(webhook(raw))).status, 200);
  assertEquals(fake.calls.map((call) => call.args.p_event_id), ["fixture-event-1", "fixture-event-1", "fixture-event-1"]);
  assertEquals((fake.calls[0].args.p_payload as JudicialRecord).original_sha256, await portalHash(first));
  assertEquals((fake.calls[2].args.p_payload as JudicialRecord).original_sha256, await portalHash(changed));
  assertEquals(fake.calls[0].args.p_raw_original, first);
});
Deno.test("unsupported callbacks are persisted with quarantine reason; malformed body never acknowledges receipt", async () => {
  const raw = '{"event":"unsupported_action","monitoramento":[]}';
  const envelope = await judicialCallbackEnvelope(raw, JSON.parse(raw)); assertEquals(envelope.eventId, `unidentified:${await portalHash(raw)}`); assertEquals(envelope.payload.quarantine_reason, "missing_event_id");
  const fake = fakeAdmin(); const handler = createLegalJudicialWebhookHandler(() => fake.admin, env);
  assertEquals((await handler(webhook(raw))).status, 200); assertEquals(fake.calls.length, 1);
  for (const malformed of ['[]', '{bad', 'x'.repeat(1048577)]) assertEquals((await handler(webhook(malformed))).status, 400);
  assertEquals(fake.calls.length, 1);
});
Deno.test("webhook waits for durable persistence, and failure never reports 2xx", async () => {
  let resolve: (value: unknown) => void = () => {}; let completed = false;
  const fake = fakeAdmin(() => new Promise((done) => { resolve = done; }));
  const pending = createLegalJudicialWebhookHandler(() => fake.admin, env)(webhook('{"uuid":"fixture-event","event":"processo_verificado"}')).then((result) => { completed = true; return result; });
  while (fake.calls.length === 0) await new Promise((done) => setTimeout(done, 1));
  assertEquals(completed, false); resolve({ id: jobId, duplicate: false }); assertEquals((await pending).status, 200);
  const denied = fakeAdmin(() => { throw new Error(); }); const result = await createLegalJudicialWebhookHandler(() => denied.admin, env)(webhook('{"uuid":"fixture-event","event":"processo_verificado"}'));
  assertEquals(result.status, 403); assert(!(await result.text()).includes("PRIVATE"));
});
Deno.test("invalid CNJ and oversized monitor metadata never prevent preserving the original callback", async () => {
  const value = { uuid: "fixture-bad-metadata", event: "nova_movimentacao", processo: { numero_cnj: "00000010020248000000" }, monitoramento: [{ id: "x".repeat(121), numero: "00000010020248000000" }, { id: 17, numero: cnj }] };
  const raw = JSON.stringify(value);
  const envelope = await judicialCallbackEnvelope(raw, value);
  assertEquals(envelope.raw, raw);
  assertEquals(envelope.payload.provider_monitor_ids, ["17"]);
  assertEquals(envelope.payload.candidates, [{ cnj }]);
});
Deno.test("total execution budget stops before another authorization and persists the pending GET cursor", async () => {
  let now = 0; let fetches = 0;
  const fake = fakeAdmin((call) => { if (call.name.endsWith("ingest")) now = 25000; return gate(call); });
  const job = { ...baseJob, operation: "read_updates" as const };
  const result = await runJudicialJob(fake.admin, config, job, { now: () => now, deadline: 30000, fetcher: (async () => { fetches++; return page("?cursor=nextpage"); }) as typeof fetch });
  assertEquals(result, "succeeded"); assertEquals(fetches, 1);
  assertEquals(fake.calls.filter((call) => call.name.endsWith("authorize_attempt")).length, 1);
  assertEquals(lastFinish(fake.calls).args.p_payload, { error_code: "execution_budget", items_count: 1, next_cursor: { cursor: "nextpage" } });
});
Deno.test("insufficient initial execution time consumes no provider request and POST ambiguity never retries", async () => {
  let now = 0; let fetches = 0; const blocked = fakeAdmin(gate);
  assertEquals(await runJudicialJob(blocked.admin, config, baseJob, { now: () => now, deadline: 5000, fetcher: (async () => { fetches++; return page(); }) as typeof fetch }), "retryable_error");
  assertEquals(fetches, 0); assertEquals(blocked.calls.filter((call) => call.name.endsWith("authorize_attempt")).length, 0);
  const ambiguous = fakeAdmin(gate);
  assertEquals(await runJudicialJob(ambiguous.admin, config, { ...baseJob, operation: "monitor_process" }, { now: () => now, deadline: 30000, fetcher: (async () => { fetches++; now = 27000; return response({ id: 17, numero: cnj }); }) as typeof fetch }), "unknown");
  assertEquals(fetches, 1); assertEquals(ambiguous.calls.filter((call) => call.name.endsWith("ingest")).length, 0);
  assertEquals(lastFinish(ambiguous.calls).args.p_payload, { error_code: "execution_budget", items_count: 0 });
});
Deno.test("dispatcher leases one job only so one request stays within the scheduler budget", async () => {
  const fake = fakeAdmin((call) => call.name.endsWith("claim") ? [] : gate(call));
  const result = await createLegalJudicialDispatchHandler(() => fake.admin, env)(request());
  assertEquals(result.status, 200); assertEquals(fake.calls[0].args.p_limit, 1);
});
