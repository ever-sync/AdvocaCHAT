import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { asaasBinding, asaasConfig, asaasMoney, type LegalChargeJob, parseAsaasJson, parseAsaasReceipt, sendLegalAsaas, validAsaasWebhookToken } from "./legal-payment.ts";
import { createLegalPaymentDispatchHandler, createLegalPaymentWebhookHandler } from "./legal-payment-handlers.ts";
import { type PortalAdmin, portalHash } from "./legal-portal.ts";

const tenantId = "12000000-0000-4000-8000-000000000001";
const attemptId = "12000000-0000-4000-8000-000000000002";
const leaseId = "12000000-0000-4000-8000-000000000003";
const configuration: Record<string, string> = {
  CRON_SECRET: "fixture-cron-secret", LEGAL_ASAAS_TENANT_ID: tenantId, LEGAL_ASAAS_ACCOUNT_ID: "fixture-office",
  LEGAL_ASAAS_ENVIRONMENT: "sandbox", LEGAL_ASAAS_API_KEY: "$aact_hmlg_fixture_fake_key", LEGAL_ASAAS_SEND_ENABLED: "true",
  LEGAL_ASAAS_WEBHOOK_TOKEN: "fixture-webhook-token-with-more-than-thirty-two-characters",
};
const env = (key: string) => configuration[key];
const job: LegalChargeJob = { id: attemptId, amount: "9999999999.99", provider_customer_id: "cus_fixture", due_on: "2026-09-20", billing_type: "CREDIT_CARD", lease_token: leaseId,
  connection: { id: tenantId, account_id: "fixture-office", environment: "sandbox" } };
type Call = { name: string; args: Record<string, unknown> };
function fakeAdmin(rpc: (call: Call) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }> = () => ({ data: null, error: null })) {
  const calls: Call[] = [];
  return { calls, admin: { rpc: async (name: string, args: Record<string, unknown>) => { const call = { name, args }; calls.push(call); return await rpc(call); } } as unknown as PortalAdmin };
}
function dispatch(body: unknown = { action: "dispatch" }, authenticated = true) {
  return new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { "x-cron-secret": configuration.CRON_SECRET } : {}) }, body: JSON.stringify(body) });
}
function paymentResponse(overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ id: "pay_fixture", customer: job.provider_customer_id, externalReference: job.id, value: job.amount, status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/fixture", ...overrides }), { status: 200 });
}
const eventRaw = `{"id":"evt_fixture&123","event":"PAYMENT_RECEIVED","dateCreated":"2026-09-11 10:00:00","tenant_id":"attacker","payment":{"id":"pay_fixture","customer":"cus_fixture","externalReference":"${attemptId}","value":9999999999.99,"status":"RECEIVED","creditCard":{"number":"PRIVATE-CARD"},"description":"PRIVATE-DIAGNOSIS"}}`;
function webhook(raw = eventRaw, token: string | null = configuration.LEGAL_ASAAS_WEBHOOK_TOKEN) {
  return new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { "asaas-access-token": token } : {}) }, body: raw });
}

Deno.test("Asaas requires separate explicit tenant, account, environment, key and enabled flag", () => {
  assert(asaasConfig(env));
  for (const field of ["LEGAL_ASAAS_TENANT_ID", "LEGAL_ASAAS_ACCOUNT_ID", "LEGAL_ASAAS_ENVIRONMENT", "LEGAL_ASAAS_API_KEY", "LEGAL_ASAAS_SEND_ENABLED"]) assertEquals(asaasConfig((key) => key === field ? undefined : env(key)), null);
  assertEquals(asaasConfig((key) => key === "LEGAL_ASAAS_ENVIRONMENT" ? "production" : env(key)), null);
  assertEquals(asaasBinding(() => undefined), null);
});
Deno.test("Asaas serializes exact decimal token and only provider checkout, no card or arbitrary endpoint", async () => {
  let calls = 0;
  const result = await sendLegalAsaas(asaasConfig(env)!, job, (async (url, options) => {
    calls++; assertEquals(url, "https://api-sandbox.asaas.com/v3/payments"); assertEquals(options?.redirect, "error");
    assertEquals(new Headers(options?.headers).get("access_token"), configuration.LEGAL_ASAAS_API_KEY);
    assertEquals(new Headers(options?.headers).get("Authorization"), null);
    const raw = String(options?.body); assert(raw.includes('"value":9999999999.99'));
    const body = JSON.parse(raw); assertEquals(body.externalReference, attemptId); assertEquals(body.postalService, false);
    assertEquals(body.creditCard, undefined); assertEquals(body.creditCardHolderInfo, undefined); assertEquals(body.callback, undefined);
    return paymentResponse();
  }) as typeof fetch);
  assertEquals(calls, 1); assertEquals(result.status, "provider_accepted"); assertEquals(result.providerState, "PENDING");
});
Deno.test("Asaas refuses mismatched account, malformed date, fractional cent and noncanonical value before fetch", async () => {
  let calls = 0;
  for (const changed of [{ amount: "10.005" }, { amount: "10" }, { amount: "0.00" }, { amount: "10000000000.00" }, { due_on: "2026-02-30" }, { connection: { ...job.connection, account_id: "other" } }]) {
    const result = await sendLegalAsaas(asaasConfig(env)!, { ...job, ...changed }, (async () => { calls++; return paymentResponse(); }) as typeof fetch);
    assertEquals(result.status, "failed");
  }
  assertEquals(calls, 0);
});
Deno.test("Asaas timeout and ambiguous provider status never retry a possible charge", async () => {
  let calls = 0;
  const result = await sendLegalAsaas(asaasConfig(env)!, job, ((_url, options) => new Promise((_resolve, reject) => { calls++; options?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true }); })) as typeof fetch, 5);
  assertEquals(result.status, "unknown"); assertEquals(result.providerState, "provider_timeout"); assertEquals(calls, 1);
  for (const status of [408, 409, 429, 500]) assertEquals((await sendLegalAsaas(asaasConfig(env)!, job, (async () => new Response("private-body", { status })) as typeof fetch)).status, "unknown");
  assertEquals((await sendLegalAsaas(asaasConfig(env)!, job, (async () => new Response("private-body", { status: 400 })) as typeof fetch)).status, "failed");
});
Deno.test("Asaas response requires customer/reference/value match and removes untrusted invoice URLs", async () => {
  for (const changed of [{ customer: "cus_other" }, { externalReference: tenantId }, { value: "9999999999.98" }, { id: undefined }]) assertEquals((await sendLegalAsaas(asaasConfig(env)!, job, (async () => paymentResponse(changed)) as typeof fetch)).status, "unknown");
  const result = await sendLegalAsaas(asaasConfig(env)!, job, (async () => paymentResponse({ invoiceUrl: "https://sandbox.asaas.com.attacker.test/pay" })) as typeof fetch);
  assertEquals(result.status, "provider_accepted"); assertEquals(result.providerUrl, null);
});
Deno.test("lossless JSON parsing preserves decimals, escaped strings and rejects invalid tokens", () => {
  assertEquals(parseAsaasJson('{"value":99999999999999.99,"id":"numeric 123 \\"quoted\\"","array":[1,-2.3e+4,true,null]}'), { value: "99999999999999.99", id: 'numeric 123 "quoted"', array: ["1", "-2.3e+4", true, null] });
  assertEquals(asaasMoney("0.1"), "0.10");
  for (const bad of ["1e2", "1.005", "001", 0.1, null]) assertThrows(() => asaasMoney(bad));
  for (const bad of ['{"v":01}', '{"v":-}', '{"v":NaN}']) assertThrows(() => parseAsaasJson(bad));
});
Deno.test("Asaas token comparison rejects absent, weak, reused API key and wrong token", () => {
  assert(validAsaasWebhookToken(configuration.LEGAL_ASAAS_WEBHOOK_TOKEN, configuration.LEGAL_ASAAS_WEBHOOK_TOKEN));
  assertEquals(validAsaasWebhookToken(null, configuration.LEGAL_ASAAS_WEBHOOK_TOKEN), false);
  for (const token of ["a".repeat(32), "with spaces".repeat(5), "a".repeat(256)]) assertEquals(validAsaasWebhookToken(token, token), false);
  assertEquals(validAsaasWebhookToken(configuration.LEGAL_ASAAS_WEBHOOK_TOKEN, configuration.LEGAL_ASAAS_WEBHOOK_TOKEN, configuration.LEGAL_ASAAS_WEBHOOK_TOKEN), false);
  assertEquals(validAsaasWebhookToken("x".repeat(60), configuration.LEGAL_ASAAS_WEBHOOK_TOKEN), false);
});
Deno.test("receipt whitelist keeps exact gross value and does not invent timezone or retain PII", () => {
  const parsed = parseAsaasReceipt(eventRaw); assertEquals(parsed.amount, job.amount); assertEquals(parsed.provider_created_at, null);
  assertEquals(parsed.safe_payload.date_created, "2026-09-11 10:00:00"); assert(!JSON.stringify(parsed).includes("PRIVATE")); assert(!JSON.stringify(parsed).includes("attacker"));
  const zoned = parseAsaasReceipt(eventRaw.replace("2026-09-11 10:00:00", "2026-09-11T10:00:00-03:00")); assertEquals(zoned.provider_created_at, "2026-09-11T13:00:00.000Z");
  assertThrows(() => parseAsaasReceipt(eventRaw.replace("9999999999.99", "1e5")));
});
Deno.test("unconfigured dispatcher sends nothing and only marks the server-bound account unavailable", async () => {
  const fake = fakeAdmin(() => ({ data: [], error: null })); let fetches = 0;
  const handler = createLegalPaymentDispatchHandler(() => fake.admin, (key) => key === "LEGAL_ASAAS_SEND_ENABLED" ? "false" : env(key), (async () => { fetches++; return paymentResponse(); }) as typeof fetch);
  assertEquals((await handler(dispatch({}, false))).status, 401); assertEquals(fake.calls.length, 0);
  const response = await handler(dispatch()); assertEquals(await response.json(), { configured: false, status: "not_configured", processed: 0 }); assertEquals(fetches, 0);
  assertEquals(fake.calls[0].args, { p_expected_tenant_id: tenantId, p_account_id: "fixture-office", p_environment: "sandbox", p_configured: false });
  assertEquals((await handler(dispatch({ action: "dispatch", tenant_id: "attacker" }))).status, 400);
});
Deno.test("dispatcher stores exactly the leased attempt result without automatic settlement", async () => {
  const fake = fakeAdmin((call) => ({ data: call.name.endsWith("claim") ? [job] : {}, error: null }));
  const response = await createLegalPaymentDispatchHandler(() => fake.admin, env, (async () => paymentResponse()) as typeof fetch)(dispatch());
  assertEquals(response.status, 200); assertEquals(fake.calls.length, 2);
  assertEquals(fake.calls[1].args.p_attempt_id, attemptId); assertEquals(fake.calls[1].args.p_lease_token, leaseId); assertEquals(fake.calls[1].args.p_status, "provider_accepted");
});
Deno.test("webhook authenticates before parsing and persists replay identity with server account and body hash", async () => {
  const fake = fakeAdmin(() => ({ data: { status: "needs_reconciliation" }, error: null })); const handler = createLegalPaymentWebhookHandler(() => fake.admin, env);
  assertEquals((await handler(webhook("INVALID", null))).status, 403); assertEquals(fake.calls.length, 0);
  for (let count = 0; count < 2; count++) assertEquals((await handler(webhook())).status, 200);
  assertEquals(fake.calls.length, 2); assertEquals(fake.calls[0].args, fake.calls[1].args);
  assertEquals(fake.calls[0].args.p_expected_tenant_id, tenantId); assertEquals(fake.calls[0].args.p_account_id, "fixture-office");
  const payload = fake.calls[0].args.p_payload as Record<string, unknown>; assertEquals(payload.body_hash, await portalHash(eventRaw)); assert(!JSON.stringify(payload).includes("PRIVATE"));
});
Deno.test("webhook never confirms database failure or oversized body; absent binding fails closed", async () => {
  const fake = fakeAdmin(() => ({ data: null, error: { code: "XX000", message: "SECRET" } })); const handler = createLegalPaymentWebhookHandler(() => fake.admin, env);
  const response = await handler(webhook()); assertEquals(response.status, 503); assert(!(await response.text()).includes("SECRET"));
  assertEquals((await handler(webhook("x".repeat(65537)))).status, 413);
  assertEquals((await createLegalPaymentWebhookHandler(() => fake.admin, () => undefined)(webhook())).status, 403);
});
