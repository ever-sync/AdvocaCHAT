import { createLegalAssistanceHandler } from "./legal-assistance-handlers.ts";
import type { PortalAdmin } from "./legal-portal.ts";
import { assistanceConfig, assistanceInputTokenBound } from "./legal-assistance.ts";

const tenant = "71000000-0000-4000-8000-000000000001", user = "71000000-0000-4000-8000-000000000002", id = "71000000-0000-4000-8000-000000000003", lease = "71000000-0000-4000-8000-000000000004", citation = "71000000-0000-4000-8000-000000000005", version = "71000000-0000-4000-8000-000000000006";
const vars: Record<string, string> = { CRON_SECRET: "synthetic-strong-cron-secret-for-tests", LEGAL_AI_OPENAI_TENANT_ID: tenant, LEGAL_AI_OPENAI_ACCOUNT_ID: "test-office", LEGAL_AI_OPENAI_MODEL: "test-model", LEGAL_AI_OPENAI_API_KEY: "synthetic-not-a-real-api-key" };
const env = (key: string) => vars[key];
const input = { purpose: "Conferência sintética", kind: "summary" as const, citations: [{ id: citation, quote: "Fonte sintética sem dados reais.", source_label: "Documento de teste", page: 1 }], max_output_tokens: 1000 };
const job = { id, lease_token: lease, input };
const body = { title: "Rascunho privado", sections: [{ heading: "Fonte", text: "Texto reservado sintético.", citation_ids: [citation] }], missing_facts: ["Falta avaliação."], divergences: [] };
type Call = { name: string; args: Record<string, unknown> };
function assert(value: unknown): asserts value { if (!value) throw new Error("assertion failed"); }
function fake(overrides: (call: Call) => unknown = () => undefined, role = "authenticated") {
  const calls: Call[] = [];
  const admin = {
    rpc: (name: string, args: Record<string, unknown>) => {
      const call = { name, args }; calls.push(call);
      const override = overrides(call);
      if (override instanceof Error) return Promise.resolve({ data: null, error: { code: "XX000", message: "PRIVATE SQL detail" } });
      const data = override ?? (name.endsWith("claim") ? [job] : name.endsWith("authorize") ? { allowed: true } : name.endsWith("finish") ? { job: { id, state: "succeeded" }, version_id: version } : { id: version });
      return Promise.resolve({ data, error: null });
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: user, role, app_metadata: role === "legal_portal" ? { legal_portal: true } : {} } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: user, status: "active", tenant_id: tenant }, error: null }) }) }) }),
  } as unknown as PortalAdmin;
  return { calls, admin };
}
function request(value: unknown = { action: "dispatch" }, cron = true) {
  return new Request("https://fixture.invalid", { method: "POST", headers: { "content-type": "application/json", ...(cron ? { "x-cron-secret": vars.CRON_SECRET } : { authorization: "Bearer aa.bb.cc" }) }, body: JSON.stringify(value) });
}
function provider(usage: unknown = { input_tokens: 300, output_tokens: 60 }): Response {
  return new Response(JSON.stringify({ id: "resp_fixture", status: "completed", error: null, incomplete_details: null, usage, output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(body) }] }] }), { headers: { "content-type": "application/json" } });
}

Deno.test("AI dispatch requires cron and absent configuration performs no SQL or provider request", async () => {
  const f = fake(); let fetched = 0;
  const handler = createLegalAssistanceHandler(() => f.admin, (key) => key === "CRON_SECRET" ? vars.CRON_SECRET : undefined, { fetcher: (() => { fetched++; return Promise.resolve(provider()); }) as typeof fetch });
  assert((await handler(request({ action: "dispatch" }, false))).status === 401);
  const r = await handler(request()); const value = await r.json();
  assert(r.status === 200 && value.configured === false && value.processed === 0 && f.calls.length === 0 && fetched === 0);
});
Deno.test("AI configuration uses verified actor and server tenant/account/model; portal and injected fields fail", async () => {
  const f = fake(); const handler = createLegalAssistanceHandler(() => f.admin, env);
  assert((await handler(request({ action: "configure", policy_version_id: version, enabled: true, tenant_id: tenant }, false))).status === 400);
  assert((await handler(request({ action: "configure", policy_version_id: version, enabled: true }, false))).status === 200);
  assert(f.calls.length === 1 && f.calls[0].args.p_actor_id === user && f.calls[0].args.p_expected_tenant_id === tenant && f.calls[0].args.p_account_id === "test-office" && f.calls[0].args.p_model === "test-model");
  const portal = fake(() => undefined, "legal_portal");
  assert((await createLegalAssistanceHandler(() => portal.admin, env)(request({ action: "configure", policy_version_id: version, enabled: true }, false))).status === 403 && portal.calls.length === 0);
});
Deno.test("removed API key marks binding unconfigured via SQL without sending", async () => {
  const f = fake(); const r = await createLegalAssistanceHandler(() => f.admin, (key) => key === "LEGAL_AI_OPENAI_API_KEY" ? undefined : vars[key])(request());
  assert(r.status === 200 && (await r.json()).configured === false && f.calls.length === 1 && f.calls[0].args.p_configured === false);
});
Deno.test("quota and ACL authorization immediately precede the only provider call", async () => {
  const f = fake(); let fetched = 0;
  const fetcher = (() => { fetched++; assert(f.calls.at(-1)?.name === "legal_ai_service_authorize"); return Promise.resolve(provider()); }) as typeof fetch;
  const r = await createLegalAssistanceHandler(() => f.admin, env, { fetcher })(request());
  const value = await r.json();
  assert(r.status === 200 && value.state === "succeeded" && fetched === 1 && f.calls.length === 3);
  assert(f.calls[1].args.p_input_token_bound === assistanceInputTokenBound(assistanceConfig(env)!, input));
  assert(!JSON.stringify(value).includes("Texto reservado"));
});
Deno.test("authorization denial sends nothing and cannot overwrite the SQL terminal state", async () => {
  const f = fake((call) => call.name.endsWith("authorize") ? { allowed: false } : undefined); let fetched = 0;
  const r = await createLegalAssistanceHandler(() => f.admin, env, { fetcher: (() => { fetched++; return Promise.resolve(provider()); }) as typeof fetch })(request());
  assert(r.status === 200 && (await r.json()).state === "authorization_denied" && fetched === 0 && f.calls.length === 2);
});
Deno.test("unknown token usage reaches persistence as null with no fake zero measurement", async () => {
  const f = fake();
  const r = await createLegalAssistanceHandler(() => f.admin, env, { fetcher: (() => Promise.resolve(provider(null))) as typeof fetch })(request());
  assert(r.status === 200);
  const outcome = f.calls.at(-1)?.args.p_outcome as Record<string, unknown>;
  assert(outcome.ok === true && outcome.usage === null);
});
Deno.test("ambiguous finalization is not retried or falsely acknowledged", async () => {
  const f = fake((call) => call.name.endsWith("finish") ? new Error("lost response") : undefined); let fetched = 0;
  const r = await createLegalAssistanceHandler(() => f.admin, env, { fetcher: (() => { fetched++; return Promise.resolve(provider()); }) as typeof fetch })(request());
  assert(r.status === 503 && fetched === 1 && f.calls.filter((call) => call.name.endsWith("finish")).length === 1 && !(await r.text()).includes("PRIVATE"));
});
Deno.test("time budget exhausted before authorization reserves no quota and sends nothing", async () => {
  let clock = 0; let fetched = 0;
  const f = fake((call) => { if (call.name.endsWith("claim")) clock = 30000; if (call.name.endsWith("finish")) return { job: { id, state: "failed" }, version_id: null }; });
  const r = await createLegalAssistanceHandler(() => f.admin, env, { now: () => clock, fetcher: (() => { fetched++; return Promise.resolve(provider()); }) as typeof fetch })(request());
  assert(r.status === 200 && fetched === 0 && f.calls.every((call) => !call.name.endsWith("authorize")));
  assert((f.calls.at(-1)?.args.p_outcome as Record<string, unknown>).consumption === "not_sent");
});
Deno.test("revoked completion is returned honestly and a success without version is refused", async () => {
  for (const state of ["authorization_revoked", "succeeded"]) {
    const f = fake((call) => call.name.endsWith("finish") ? { job: { id, state }, version_id: null } : undefined);
    const r = await createLegalAssistanceHandler(() => f.admin, env, { fetcher: (() => Promise.resolve(provider())) as typeof fetch })(request());
    assert(r.status === (state === "succeeded" ? 503 : 200));
  }
});
