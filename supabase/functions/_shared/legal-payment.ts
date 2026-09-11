import { timingSafeEqual } from "./timing-safe-equal.ts";
import { portalUuid } from "./legal-portal.ts";

export type PaymentEnvironment = (key: string) => string | undefined;
export type AsaasBinding = { tenantId: string; accountId: string; environment: "sandbox" | "production" };
export type AsaasConfig = AsaasBinding & { apiKey: string; baseUrl: string };
export type LegalChargeJob = {
  id: string; amount: string; provider_customer_id: string; due_on: string;
  billing_type: "PIX" | "BOLETO" | "CREDIT_CARD"; lease_token: string;
  connection: { id: string; account_id: string; environment: "sandbox" | "production" };
};
export type PaymentResult = { status: "provider_accepted" | "unknown" | "failed"; providerId: string | null; providerUrl: string | null; providerState: string | null };
const noWhitespace = (value: string) => !/\s/.test(value) && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const paymentId = /^pay_[A-Za-z0-9_-]{1,170}$/;
const customerId = /^cus_[A-Za-z0-9_-]{1,170}$/;
export function asaasBinding(env: PaymentEnvironment): AsaasBinding | null {
  const tenantId = env("LEGAL_ASAAS_TENANT_ID")?.trim();
  const accountId = env("LEGAL_ASAAS_ACCOUNT_ID")?.trim();
  const environment = env("LEGAL_ASAAS_ENVIRONMENT");
  if (!tenantId || !portalUuid.test(tenantId) || !accountId || accountId.length > 180 || !noWhitespace(accountId) || (environment !== "sandbox" && environment !== "production")) return null;
  return { tenantId, accountId, environment };
}
export function asaasConfig(env: PaymentEnvironment): AsaasConfig | null {
  const binding = asaasBinding(env); const apiKey = env("LEGAL_ASAAS_API_KEY")?.trim();
  if (!binding || env("LEGAL_ASAAS_SEND_ENABLED") !== "true" || !apiKey || apiKey.length < 16 || apiKey.length > 4096 || !noWhitespace(apiKey)) return null;
  if ((apiKey.startsWith("$aact_prod_") && binding.environment !== "production") || (apiKey.startsWith("$aact_hmlg_") && binding.environment !== "sandbox")) return null;
  return { ...binding, apiKey, baseUrl: binding.environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3" };
}
export function validAsaasWebhookToken(provided: string | null, expected: string | undefined, apiKey?: string): boolean {
  return !!provided && !!expected && expected.length > 32 && expected.length <= 255 && noWhitespace(expected) && expected !== apiKey && timingSafeEqual(provided, expected);
}

/** Preserve JSON numeric tokens as strings. No financial value passes through Number. */
export function parseAsaasJson(raw: string): unknown {
  let result = ""; let index = 0;
  while (index < raw.length) {
    if (raw[index] === '"') {
      const start = index++;
      while (index < raw.length) { if (raw[index] === "\\") { index += 2; continue; } if (raw[index++] === '"') break; }
      result += raw.slice(start, index);
    } else if (/[0-9-]/.test(raw[index])) {
      const token = raw.slice(index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)?.[0];
      if (!token) throw new Error("Invalid JSON number");
      result += JSON.stringify(token); index += token.length;
    } else { result += raw[index++]; }
  }
  return JSON.parse(result);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid provider object");
  return value as Record<string, unknown>;
}
export function asaasMoney(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2})?$/.test(value)) throw new Error("Invalid decimal amount");
  const [integer, fraction = ""] = value.split("."); return `${integer}.${fraction.padEnd(2, "0")}`;
}
function validDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function invoiceUrl(value: unknown, environment: AsaasBinding["environment"]): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const allowed = environment === "sandbox" ? ["sandbox.asaas.com", "www.sandbox.asaas.com"] : ["asaas.com", "www.asaas.com"];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed.includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
const failed = (state: string): PaymentResult => ({ status: "failed", providerId: null, providerUrl: null, providerState: state });
const unknown = (state: string): PaymentResult => ({ status: "unknown", providerId: null, providerUrl: null, providerState: state });
async function boundedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  if (reader) while (true) {
    const next = await reader.read(); if (next.done) break;
    length += next.value.length; if (length > 65536) { await reader.cancel(); throw new Error("Response too large"); } chunks.push(next.value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true }).decode(result);
}

/** One creation attempt. externalReference correlates; it is not a provider idempotency guarantee. */
export async function sendLegalAsaas(config: AsaasConfig, job: LegalChargeJob, fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<PaymentResult> {
  let amount: string;
  try { amount = asaasMoney(job.amount); } catch { return failed("invalid_dispatch"); }
  if (!portalUuid.test(job.id) || !portalUuid.test(job.lease_token) || !customerId.test(job.provider_customer_id) || !validDay(job.due_on) || !["PIX", "BOLETO", "CREDIT_CARD"].includes(job.billing_type) || amount !== job.amount || BigInt(amount.replace(".", "")) <= 0n || BigInt(amount.replace(".", "")) > 999999999999n || job.connection?.account_id !== config.accountId || job.connection?.environment !== config.environment) return failed("invalid_dispatch");
  const fields = { customer: job.provider_customer_id, billingType: job.billing_type, dueDate: job.due_on,
    externalReference: job.id, description: "Honorários e serviços contratados", postalService: false };
  // Asaas requires a JSON number; insert only the validated decimal token, never floating point.
  const body = `${JSON.stringify(fields).slice(0, -1)},"value":${amount}}`;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(`${config.baseUrl}/payments`, { method: "POST", redirect: "error", signal: controller.signal,
      headers: { access_token: config.apiKey, "Content-Type": "application/json", "User-Agent": "CaleoCRM-Legal/1.0" }, body });
    if (!response.ok) { await response.body?.cancel(); return response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 429 ? unknown(`provider_http_${response.status}`) : failed(`provider_http_${response.status}`); }
    const data = object(parseAsaasJson(await boundedResponse(response)));
    if (typeof data.id !== "string" || !paymentId.test(data.id) || data.customer !== job.provider_customer_id || data.externalReference !== job.id || asaasMoney(data.value) !== amount || typeof data.status !== "string" || !/^[A-Z_]{1,120}$/.test(data.status)) return unknown("invalid_provider_response");
    return { status: "provider_accepted", providerId: data.id, providerUrl: invoiceUrl(data.invoiceUrl, config.environment), providerState: data.status };
  } catch { return unknown(controller.signal.aborted ? "provider_timeout" : "provider_response_unknown"); }
  finally { clearTimeout(timer); }
}

export type LegalPaymentReceipt = {
  provider_event_id: string; event_type: string; provider_created_at: string | null;
  provider_charge_id: string; external_reference: string; provider_customer_id: string; amount: string | null;
  safe_payload: Record<string, unknown>;
};
export function parseAsaasReceipt(raw: string): LegalPaymentReceipt {
  const event = object(parseAsaasJson(raw)); const payment = object(event.payment);
  if (typeof event.id !== "string" || !/^[A-Za-z0-9_&:-]{1,180}$/.test(event.id) || typeof event.event !== "string" || !/^PAYMENT_[A-Z_]{1,92}$/.test(event.event) || typeof payment.id !== "string" || !paymentId.test(payment.id) || typeof payment.externalReference !== "string" || !portalUuid.test(payment.externalReference) || typeof payment.customer !== "string" || !customerId.test(payment.customer)) throw new Error("Unmatched payment event");
  const amount = payment.value === undefined || payment.value === null ? null : asaasMoney(payment.value);
  const dateCreated = typeof event.dateCreated === "string" && /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(event.dateCreated) ? event.dateCreated : null;
  // Asaas examples omit timezone. Preserve original text; never invent an instant from server timezone.
  const createdAt = dateCreated && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(dateCreated) && Number.isFinite(Date.parse(dateCreated)) ? new Date(dateCreated).toISOString() : null;
  const status = typeof payment.status === "string" && /^[A-Z_]{1,120}$/.test(payment.status) ? payment.status : null;
  return { provider_event_id: event.id, event_type: event.event, provider_created_at: createdAt, provider_charge_id: payment.id,
    external_reference: payment.externalReference, provider_customer_id: payment.customer, amount,
    safe_payload: { event_id: event.id, event_type: event.event, date_created: dateCreated,
      payment: { id: payment.id, external_reference: payment.externalReference, customer: payment.customer, value: amount, status } } };
}
