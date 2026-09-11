// Integration ONLY against the disposable local clone named below. The provider is always fake.
// Bootstrap: clone advocachat_f6_complete as advocachat_f6_adapter; apply the prefix of
// legal_judicial_monitoring.sql before F6_MONITORING_CONCURRENCY_FIXTURE_READY, then
// RESET ROLE; CREATE TABLE public.legal_adapter_test_ids AS SELECT * FROM legal_test_ids; COMMIT;
// Run: deno run --no-lock --allow-run=psql supabase/tests/legal_judicial_adapter_contract.ts
// deno-lint-ignore-file no-import-prefix require-await
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runJudicialJob, createLegalJudicialWebhookHandler } from "../functions/_shared/legal-judicial-handlers.ts";
import type { JudicialConfig, JudicialJob, JudicialRecord } from "../functions/_shared/legal-judicial.ts";
import type { PortalAdmin } from "../functions/_shared/legal-portal.ts";

const connection = ["-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", "advocachat_f6_adapter", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const quote = (value: unknown): string => value === null || value === undefined ? "null" : typeof value === "boolean" || typeof value === "number" ? String(value) : "'" + (typeof value === "string" ? value : JSON.stringify(value)).replaceAll("'", "''") + "'";
async function sql(statement: string): Promise<unknown> {
  const process = new Deno.Command("psql", { args: connection, stdin: "piped", stdout: "piped", stderr: "piped" }).spawn();
  const writer = process.stdin.getWriter(); await writer.write(new TextEncoder().encode(statement)); await writer.close();
  const result = await process.output();
  if (!result.success) throw new Error("Local adapter integration SQL failed: " + new TextDecoder().decode(result.stderr).slice(0, 1600));
  const lines = new TextDecoder().decode(result.stdout).trim().split("\n").filter(Boolean);
  return lines.length ? JSON.parse(lines.at(-1)!) : null;
}
const ids = await sql("select jsonb_object_agg(name,id) from public.legal_adapter_test_ids;") as Record<string, string>;
assert(ids.owner && ids.tenant_a && ids.jud_proceeding);
async function rpc(name: string, args: JudicialRecord, role = "service_role"): Promise<unknown> {
  assert(/^legal_judicial_[a-z_]+$/.test(name));
  assert(Object.keys(args).every((key) => /^p_[a-z_]+$/.test(key)));
  const claims = JSON.stringify({ sub: ids.owner, role });
  return await sql(`begin; set local role ${role}; set local request.jwt.claim.sub=${quote(ids.owner)}; set local request.jwt.claim.role=${quote(role)}; set local request.jwt.claims=${quote(claims)}; select to_jsonb(public.${name}(${Object.entries(args).map(([key, value]) => `${key}=>${quote(value)}`).join(",")})); commit;`);
}
const accountId = `adapter-${crypto.randomUUID()}`;
const config: JudicialConfig = { tenantId: ids.tenant_a, accountId, provider: "escavador", token: "fake-provider-only-never-real-network-token" };
const scope = { court: "Órgão fictício", oab_state: "SP", origins_ids: [1], note: "Entirely synthetic integration scope" };
const operations = ["consult_cnj", "read_updates", "discover_oab", "monitor_process", "monitor_diary", "reconcile_monitor"];
const source = await rpc("legal_judicial_create_source_version", { p_payload: { provider: "escavador", source_key: accountId, title: "Adapter contract fixture only", api_version: "synthetic", documentation_url: "https://example.invalid/docs", checked_on: "2026-09-11", terms_version: "Synthetic only", permission_document_id: ids.general, allowed_operations: operations, valid_from: "2026-01-01", valid_until: "2027-12-31", scope, limitations: "No real provider request or credential" } }, "authenticated") as { id: string };
await rpc("legal_judicial_review_source", { p_version_id: source.id, p_decision: "approved", p_note: "Explicit synthetic fixture approval only" }, "authenticated");
const bound = await rpc("legal_judicial_service_configure", { p_actor_id: ids.owner, p_expected_tenant_id: ids.tenant_a, p_account_id: accountId, p_source_version_id: source.id, p_enabled: true, p_limits: { environment: "production", requests_per_minute: 120, requests_per_day: 1000 } }) as { id: string };
for (const capability of operations) await rpc("legal_judicial_save_coverage", { p_connection_id: bound.id, p_payload: { scope, capability, coverage_start_on: "2026-01-01", expected_interval_minutes: 60, tolerated_delay_minutes: 30, state: "verified", review_note: "Synthetic coverage; no external collection" } }, "authenticated");
const admin = { rpc: async (name: string, args: JudicialRecord) => ({ data: await rpc(name, args), error: null }) } as unknown as PortalAdmin;
const cnj = "00000014520248260001";
let fetchCount = 0;
async function execute(operation: string, query: JudicialRecord, fake: (url: URL, init?: RequestInit) => unknown): Promise<void> {
  const created = await rpc("legal_judicial_enqueue", { p_connection_id: bound.id, p_payload: { ...(operation === "discover_oab" ? {} : { case_id: ids.case, proceeding_id: ids.jud_proceeding }), operation, query, max_requests: 2, budget_units: operation.startsWith("monitor_") ? 1 : 0, authorization_note: "Synthetic adapter verification only", idempotency_key: crypto.randomUUID() } }, "authenticated") as { id: string };
  const jobs = await rpc("legal_judicial_service_claim", { p_expected_tenant_id: ids.tenant_a, p_account_id: accountId, p_provider: "escavador", p_configured: true, p_limit: 1 }) as JudicialJob[];
  assertEquals(jobs.length, 1); assertEquals(jobs[0].id, created.id);
  const result = await runJudicialJob(admin, config, jobs[0], { fetcher: (async (input, init) => { fetchCount++; return new Response(JSON.stringify(fake(new URL(String(input)), init)), { status: 200, headers: { "Content-Type": "application/json" } }); }) as typeof fetch });
  assertEquals(result, "succeeded");
  const persisted = await sql(`select jsonb_build_object('state',state,'summary',result_summary,'requests',request_count) from public.legal_judicial_jobs where id=${quote(created.id)};`) as { state: string; summary: JudicialRecord; requests: number };
  assertEquals(persisted.state, "succeeded"); assert(persisted.requests > 0);
}
await execute("consult_cnj", { cnj }, (url) => { assert(url.pathname.endsWith("0000001-45.2024.8.26.0001")); return { numero_cnj: cnj }; });
await execute("read_updates", { cnj }, (url) => { assert(url.pathname.endsWith("/movimentacoes")); return { items: [{ numero_cnj: cnj }], links: { next: url.searchParams.has("cursor") ? null : "?cursor=second" } }; });
for (const oab_type of ["ADVOGADO", "ESTAGIARIO", "SUPLEMENTAR", "CONSULTOR_ESTRANGEIRO"]) await execute("discover_oab", { oab_number: "12345", oab_state: "SP", oab_type }, (url) => { assertEquals(url.searchParams.get("oab_tipo"), oab_type); return { items: [{ numero_cnj: cnj }], links: { next: null } }; });
await execute("monitor_process", { cnj }, (_url, init) => { assertEquals(init?.method, "POST"); assertEquals(JSON.parse(String(init?.body)).documentos_publicos, false); return { id: 9001, numero: cnj }; });
await execute("reconcile_monitor", { provider_monitor_id: "9001", monitor_kind: "process" }, (url, init) => { assertEquals(init?.method, "GET"); assert(url.pathname.endsWith("/9001")); return { id: 9001, numero: cnj }; });
await execute("monitor_diary", { term: "SYNTHETIC LAW FIRM", origins_ids: [1], variations: [], limit_appearances: 3 }, (_url, init) => { assertEquals(JSON.parse(String(init?.body)).termo, "SYNTHETIC LAW FIRM"); return { id: 9002, tipo: "termo", termo: "SYNTHETIC LAW FIRM" }; });
const callbackToken = "synthetic-callback-secret-distinct-from-api-key";
const environment: Record<string, string> = { LEGAL_ESCAVADOR_TENANT_ID: ids.tenant_a, LEGAL_ESCAVADOR_ACCOUNT_ID: accountId, LEGAL_ESCAVADOR_CALLBACK_TOKEN: callbackToken };
const webhook = createLegalJudicialWebhookHandler(() => admin, (key) => environment[key]);
const event = { uuid: "fixture-same-event", event: "nova_movimentacao", monitoramento: { id: 9001, numero: cnj }, movimentacao: { conteudo: "SYNTHETIC ONLY" } };
for (const value of [event, event, { ...event, movimentacao: { conteudo: "SYNTHETIC CORRECTION" } }]) {
  const result = await webhook(new Request("https://fixture.invalid", { method: "POST", headers: { Authorization: `Bearer ${callbackToken}`, "Content-Type": "application/json" }, body: JSON.stringify(value) }));
  assertEquals(result.status, 200);
}
const events = await sql(`select jsonb_agg(jsonb_build_object('version',version_number,'state',association_state,'case_id',case_id,'category',category) order by version_number) from public.legal_judicial_inbox where connection_id=${quote(bound.id)} and provider_event_id='fixture-same-event';`) as JudicialRecord[];
assertEquals(events.length, 2); assertEquals(events[1].state, "quarantined"); assert(events.every((row) => row.case_id === null && row.category === "restricted"));
console.log(JSON.stringify({ result: "PASS", sql_jobs: 9, fake_provider_fetches: fetchCount, callback_versions: events.length, provider_network_calls: 0, database: "local disposable clone only" }));
