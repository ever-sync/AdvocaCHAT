import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type CommunicationJob, parseLegalReceipt, resendConfig, sendLegalResend, verifyLegalSvix } from "./legal-communication.ts";
import { createLegalDispatchHandler, createLegalWebhookHandler } from "./legal-communication-handlers.ts";
import type { PortalAdmin } from "./legal-portal.ts";

const testSecret = `whsec_${btoa("fixture-signing-key-not-a-real-key")}`;
const job: CommunicationJob = { job_id: "11000000-0000-4000-8000-000000000001", lease_token: "11000000-0000-4000-8000-000000000002", communication_id: "11000000-0000-4000-8000-000000000003", channel: "email", recipient: "person@example.test", subject: "Atualização disponível", body: "Abra o portal. <script>test</script>", idempotency_key: "legal-communication-11000000-0000-4000-8000-000000000001" };
const config = { apiKey: "fixture-no-real-key", accountId: "fixture-account", tenantId: "11000000-0000-4000-8000-000000000009", from: "Equipe <no-reply@example.test>" };
const configured = { CRON_SECRET: "fixture-cron", LEGAL_COMMUNICATION_SEND_ENABLED: "true", LEGAL_RESEND_API_KEY: config.apiKey, LEGAL_RESEND_ACCOUNT_ID: config.accountId, LEGAL_RESEND_TENANT_ID: config.tenantId, LEGAL_RESEND_FROM: config.from, LEGAL_RESEND_WEBHOOK_SECRET: testSecret };
const environment = (data: Record<string, string>) => (key: string) => data[key];
async function signedHeaders(raw: string, timestamp = Math.floor(Date.now() / 1000), id = "msg_fixture") {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("fixture-signing-key-not-a-real-key"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
  return new Headers({ "Content-Type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(digest)))}` });
}

Deno.test("communication requires explicit legal config and enabled flag, never marketing defaults", () => {
  assertEquals(resendConfig(environment({ RESEND_API_KEY: "other-product", MARKETING_EMAIL_FROM: config.from })), null);
  assertEquals(resendConfig(environment({ ...configured, LEGAL_COMMUNICATION_SEND_ENABLED: "false" })), null);
  assertEquals(resendConfig(environment({ ...configured, LEGAL_RESEND_TENANT_ID: "" })), null);
  assertEquals(resendConfig(environment({ ...configured, LEGAL_RESEND_FROM: "bad\r\nBcc: victim@example.test" })), null);
  assertEquals(resendConfig(environment(configured)), config);
});
Deno.test("provider acceptance retains idempotency and is not delivery; HTML content escaped", async () => {
  let calls = 0;
  const fake: typeof fetch = async (_input, options) => {
    calls++;
    assertEquals(new Headers(options?.headers).get("Idempotency-Key"), job.idempotency_key);
    const body = JSON.parse(String(options?.body));
    assert(!body.html.includes("<script>")); assert(body.html.includes("&lt;script&gt;"));
    return new Response(JSON.stringify({ id: "message-fixture" }));
  };
  assertEquals(await sendLegalResend(config, job, fake), { status: "provider_accepted", messageId: "message-fixture", errorCode: null });
  assertEquals(calls, 1);
});
Deno.test("ambiguous provider timeout makes exactly one attempt and returns unknown", async () => {
  let calls = 0;
  const fake: typeof fetch = (_input, options) => { calls++; return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })); };
  const result = await sendLegalResend(config, job, fake, 5);
  assertEquals(result.status, "unknown"); assertEquals(result.errorCode, "provider_timeout"); assertEquals(calls, 1);
});
Deno.test("5xx and malformed success remain unknown; explicit rejection is failed", async () => {
  for (const [response, expected] of [[new Response("upstream", { status: 503 }), "unknown"], [new Response("{}"), "unknown"], [new Response("private-recipient-error", { status: 422 }), "failed"]] as const) {
    const result = await sendLegalResend(config, job, async () => response);
    assertEquals(result.status, expected); assert(!JSON.stringify(result).includes("private-recipient"));
  }
});
Deno.test("Svix accepts valid signatures and rejects tamper, replay, future and missing config", async () => {
  const raw = '{"type":"email.delivered"}'; const now = 1700000000;
  const headers = await signedHeaders(raw, now);
  assert(await verifyLegalSvix(raw, headers, testSecret, now));
  assert(!await verifyLegalSvix(raw + " ", headers, testSecret, now));
  assert(!await verifyLegalSvix(raw, headers, testSecret, now + 301));
  assert(!await verifyLegalSvix(raw, headers, testSecret, now - 301));
  assert(!await verifyLegalSvix(raw, headers, "", now));
  headers.set("svix-signature", "v2,invalid"); assert(!await verifyLegalSvix(raw, headers, testSecret, now));
});
Deno.test("email.sent is never normalized to delivered; opened is channel read only", () => {
  assertEquals(parseLegalReceipt('{"type":"email.sent"}', "event-fixture"), null);
  assertEquals(parseLegalReceipt(JSON.stringify({ type: "email.opened", created_at: "2026-09-11T00:00:00Z", data: { email_id: "message-fixture" } }), "event-fixture")?.status, "read");
});
Deno.test("disabled dispatcher authenticates cron and never claims or contacts a provider", async () => {
  let calls = 0;
  const handler = createLegalDispatchHandler(() => { calls++; throw new Error(); }, environment({ CRON_SECRET: "fixture-cron" }), async () => { calls++; throw new Error(); });
  const make = (secret: string) => new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": secret }, body: '{"action":"dispatch"}' });
  assertEquals((await handler(make("wrong"))).status, 401);
  assertEquals(await (await handler(make("fixture-cron"))).json(), { configured: false, status: "not_configured", processed: 0 });
  assertEquals(calls, 0);
});
Deno.test("annual followups run independently of provider configuration and cannot send", async () => {
  const calls: string[] = [];
  const admin = { rpc: async (name: string) => { calls.push(name); return { data: 2, error: null }; } } as unknown as PortalAdmin;
  const handler = createLegalDispatchHandler(() => admin, environment({ CRON_SECRET: "fixture-cron" }), async () => { throw new Error("provider must not run"); });
  const response = await handler(new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": "fixture-cron" }, body: '{"action":"followups"}' }));
  assertEquals(await response.json(), { created: 2 }); assertEquals(calls, ["legal_portal_service_run_followups"]);
});
Deno.test("worker persists provider acceptance using claimed lease and never invents delivered", async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const admin = { rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: name.endsWith("claim") ? [job] : { status: args.p_status }, error: null }; } } as unknown as PortalAdmin;
  const handler = createLegalDispatchHandler(() => admin, environment(configured), async () => new Response('{"id":"message-fixture"}'));
  const response = await handler(new Request("https://fixture.test", { method: "POST", headers: { "Content-Type": "application/json", "x-cron-secret": "fixture-cron" }, body: '{"action":"dispatch"}' }));
  assertEquals(response.status, 200); assertEquals(calls[1].args.p_status, "provider_accepted"); assertEquals(calls[1].args.p_lease_token, job.lease_token);
  assert(!JSON.stringify(await response.json()).includes("person@example.test"));
});
Deno.test("webhook fails closed without signature and persists verified replay ids without trusting tenant", async () => {
  const calls: Record<string, unknown>[] = [];
  const admin = { rpc: async (_name: string, args: Record<string, unknown>) => { calls.push(args); return { data: { matched: true }, error: null }; } } as unknown as PortalAdmin;
  const handler = createLegalWebhookHandler(() => admin, environment(configured));
  const raw = JSON.stringify({ type: "email.delivered", created_at: new Date().toISOString(), data: { email_id: "message-fixture" }, tenant_id: "attacker-selected", account_id: "attacker-account" });
  assertEquals((await handler(new Request("https://fixture.test", { method: "POST", body: raw }))).status, 401);
  assertEquals(calls.length, 0);
  const headers = await signedHeaders(raw);
  for (let attempt = 0; attempt < 2; attempt++) assertEquals((await handler(new Request("https://fixture.test", { method: "POST", headers, body: raw }))).status, 200);
  assertEquals(calls[0].p_account_id, config.accountId); assertEquals(calls[0].p_expected_tenant_id, config.tenantId); assertEquals(calls[0].p_event_id, calls[1].p_event_id);
  assert(!JSON.stringify(calls).includes("attacker")); assert(!JSON.stringify(calls).includes(raw));
});
Deno.test("webhook database failure is retryable and never acknowledges persistence prematurely", async () => {
  const raw = JSON.stringify({ type: "email.failed", created_at: new Date().toISOString(), data: { email_id: "message-fixture" } });
  const admin = { rpc: async () => ({ data: null, error: { code: "XX000", message: "private" } }) } as unknown as PortalAdmin;
  const response = await createLegalWebhookHandler(() => admin, environment(configured))(new Request("https://fixture.test", { method: "POST", headers: await signedHeaders(raw), body: raw }));
  assertEquals(response.status, 503); assert(!(await response.text()).includes("private"));
});
