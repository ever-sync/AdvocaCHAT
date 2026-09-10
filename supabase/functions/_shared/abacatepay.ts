import { getRequiredEnv } from "./supabase.ts";

export type AbacatePayProduct = {
  id: string;
  externalId: string;
  name: string;
  description?: string;
  price: number;
  currency: "BRL";
  cycle?: "MONTHLY" | "ANNUALLY" | null;
  status?: string;
};

type AbacatePayEnvelope<T> = {
  data: T;
  success: boolean;
  error: string | null;
};

export function getAbacatePayBaseUrl() {
  return (Deno.env.get("ABACATEPAY_API_BASE_URL")?.trim() || "https://api.abacatepay.com/v2").replace(/\/+$/, "");
}

export function isAbacatePayConfigured() {
  return Boolean(Deno.env.get("ABACATEPAY_API_KEY")?.trim());
}

export async function abacatePayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getAbacatePayBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${getRequiredEnv("ABACATEPAY_API_KEY")}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: AbacatePayEnvelope<T> | { error?: string } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`AbacatePay ${response.status}: resposta invalida.`);
  }

  if (!response.ok || !payload || !("success" in payload) || payload.success !== true) {
    const rawError = payload && "error" in payload ? payload.error : null;
    const message = typeof rawError === "string" ? rawError : rawError ? JSON.stringify(rawError) : response.statusText;
    throw new Error(`AbacatePay ${response.status}: ${message || "erro desconhecido"}`);
  }

  return payload.data;
}

export function createAbacatePayProduct(input: {
  externalId: string;
  name: string;
  description: string | null;
  price: number;
  cycle: "MONTHLY" | "ANNUALLY";
}) {
  const description = input.description?.trim();
  return abacatePayRequest<AbacatePayProduct>("/products/create", {
    method: "POST",
    body: JSON.stringify({
      externalId: input.externalId,
      name: input.name,
      price: input.price,
      cycle: input.cycle,
      currency: "BRL",
      ...(description ? { description } : {}),
    }),
  });
}

export function deleteAbacatePayProduct(productId: string) {
  return abacatePayRequest<AbacatePayProduct>(`/products/delete?id=${encodeURIComponent(productId)}`, {
    method: "POST",
  });
}
