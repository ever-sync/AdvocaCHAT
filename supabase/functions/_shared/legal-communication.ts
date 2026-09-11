import { timingSafeEqual } from "./timing-safe-equal.ts";

export type CommunicationEnvironment = (key: string) => string | undefined;
export type ResendConfig = { apiKey: string; accountId: string; tenantId: string; from: string };
export type CommunicationJob = {
  job_id: string; lease_token: string; communication_id: string; channel: string;
  recipient: string; subject: string; body: string; idempotency_key: string;
};
export type DispatchResult = { status: "provider_accepted" | "failed" | "unknown"; messageId: string | null; errorCode: string | null };
const address = /^[^\s<>(),;:]+@[^\s<>(),;:]+\.[^\s<>(),;:]+$/;
const hasControl = (value: string) => Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export function resendConfig(env: CommunicationEnvironment): ResendConfig | null {
  if (env("LEGAL_COMMUNICATION_SEND_ENABLED") !== "true") return null;
  const apiKey = env("LEGAL_RESEND_API_KEY")?.trim();
  const accountId = env("LEGAL_RESEND_ACCOUNT_ID")?.trim();
  const tenantId = env("LEGAL_RESEND_TENANT_ID")?.trim();
  const from = env("LEGAL_RESEND_FROM")?.trim();
  const email = from?.match(/<([^<>]+)>$/)?.[1] ?? from;
  if (!apiKey || !accountId || accountId.length > 200 || !tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) || !from || from.length > 300 || hasControl(from) || !email || !address.test(email)) return null;
  return { apiKey, accountId, tenantId, from };
}
export function escapeCommunicationHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

/** Exactly one provider attempt. A timeout/5xx has an unknown outcome and is never retried here. */
export async function sendLegalResend(config: ResendConfig, job: CommunicationJob, fetcher: typeof fetch = fetch, timeoutMs = 8000): Promise<DispatchResult> {
  if (job.channel !== "email" || !address.test(job.recipient) || job.recipient.length > 320 || !job.subject || job.subject.length > 300 || hasControl(job.subject) || !job.body || job.body.length > 4000 || !/^[A-Za-z0-9:_-]{1,200}$/.test(job.idempotency_key)) return { status: "failed", messageId: null, errorCode: "invalid_dispatch" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": job.idempotency_key },
      body: JSON.stringify({ from: config.from, to: [job.recipient], subject: job.subject, text: job.body,
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeCommunicationHtml(job.body)}</div>` }),
    });
    if (!response.ok) return { status: response.status >= 500 || response.status === 408 ? "unknown" : "failed", messageId: null, errorCode: response.status >= 500 ? "provider_unavailable" : `provider_http_${response.status}` };
    // Only the opaque provider identifier is retained. Provider error bodies may contain PII.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > 16384) { await reader.cancel(); return { status: "unknown", messageId: null, errorCode: "invalid_provider_response" }; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { status: "unknown", messageId: null, errorCode: "invalid_provider_response" }; }
    const id = data && typeof data === "object" && "id" in data ? data.id : null;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) return { status: "unknown", messageId: null, errorCode: "missing_provider_id" };
    return { status: "provider_accepted", messageId: id, errorCode: null };
  } catch { return { status: "unknown", messageId: null, errorCode: controller.signal.aborted ? "provider_timeout" : "provider_network_error" }; }
  finally { clearTimeout(timer); }
}

/** Svix signed content: id.timestamp.rawBody; verifies before parsing the event. */
export async function verifyLegalSvix(raw: string, headers: Headers, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const id = headers.get("svix-id") ?? "";
  const timestamp = headers.get("svix-timestamp") ?? "";
  const signatures = headers.get("svix-signature") ?? "";
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{1,13}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300 || signatures.length > 4096) return false;
  try {
    if (!secret.startsWith("whsec_")) return false;
    const binary = atob(secret.slice(6));
    if (binary.length < 16 || binary.length > 128) return false;
    const key = await crypto.subtle.importKey("raw", Uint8Array.from(binary, (character) => character.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
    return signatures.trim().split(/\s+/).slice(0, 16).some((signature) => signature.startsWith("v1,") && timingSafeEqual(signature.slice(3), expected));
  } catch { return false; }
}

export type CommunicationReceipt = { eventId: string; messageId: string; status: "delivered" | "read" | "failed"; occurredAt: string };
export function parseLegalReceipt(raw: string, eventId: string): CommunicationReceipt | null {
  const event: unknown = JSON.parse(raw);
  if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("Invalid event");
  const object = event as Record<string, unknown>;
  const statuses: Record<string, CommunicationReceipt["status"]> = { "email.delivered": "delivered", "email.opened": "read", "email.bounced": "failed", "email.failed": "failed", "email.suppressed": "failed" };
  const status = typeof object.type === "string" ? statuses[object.type] : undefined;
  if (!status) return null;
  const data = object.data;
  const messageId = data && typeof data === "object" && "email_id" in data ? data.email_id : null;
  if (typeof messageId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(messageId) || typeof object.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(object.created_at) || !Number.isFinite(Date.parse(object.created_at))) throw new Error("Invalid event");
  return { eventId, messageId, status, occurredAt: new Date(object.created_at).toISOString() };
}
