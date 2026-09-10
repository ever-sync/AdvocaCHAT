import { getRequiredEnv } from "./supabase.ts";

export type AsaasCheckoutResponse = {
  id?: string | null;
  link?: string | null;
  url?: string | null;
  status?: string | null;
  customer?: string | null;
  subscription?: {
    id?: string | null;
  } | string | null;
  [key: string]: unknown;
};

export type AsaasWebhookPayload = {
  id?: string;
  event?: string;
  checkout?: {
    id?: string | null;
    link?: string | null;
    status?: string | null;
    customer?: string | null;
    subscription?: {
      id?: string | null;
    } | string | null;
    externalReference?: string | null;
    [key: string]: unknown;
  };
  subscription?: {
    id?: string | null;
    customer?: string | null;
    status?: string | null;
    externalReference?: string | null;
    nextDueDate?: string | null;
    [key: string]: unknown;
  };
  payment?: {
    id?: string | null;
    customer?: string | null;
    subscription?: string | null;
    status?: string | null;
    externalReference?: string | null;
    invoiceUrl?: string | null;
    billingType?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function getAsaasBaseUrl() {
  return (Deno.env.get("ASAAS_API_BASE_URL")?.trim() || "https://api.asaas.com/v3").replace(/\/+$/, "");
}

export function getAsaasApiKey() {
  return getRequiredEnv("ASAAS_API_KEY");
}

export function getAsaasWebhookToken() {
  return Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() || "";
}

export async function asaasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getAsaasBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "User-Agent": "WChat/1.0.0",
      access_token: getAsaasApiKey(),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      Array.isArray(payload?.errors)
        ? payload.errors.map((item: { description?: string }) => item.description).filter(Boolean).join("; ")
        : payload?.message ?? response.statusText;
    throw new Error(`Asaas ${response.status}: ${message}`);
  }

  return payload as T;
}

export function extractAsaasSubscriptionId(value: AsaasCheckoutResponse["subscription"]) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id ?? null;
}

export function extractTenantIdFromExternalReference(value: string | null | undefined) {
  if (!value) return null;
  const [tenantId] = value.split(":");
  return tenantId || null;
}
