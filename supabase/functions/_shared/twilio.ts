// Helpers Twilio (voz / click-to-call). Credenciais via secrets da Edge Function.

import { timingSafeEqual } from "./timing-safe-equal.ts";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

export function getTwilioConfig(): TwilioConfig {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_NUMBER");
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "Twilio não configurado. Defina TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_NUMBER nos secrets.",
    );
  }
  return { accountSid, authToken, fromNumber };
}

/** Normaliza um telefone brasileiro para E.164 (+55...). Retorna "" se inválido. */
export function toE164BR(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (value.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("55") && digits.length >= 12) {
    return `+${digits}`;
  }
  const national = digits.replace(/^0+/, "");
  if (national.length < 10 || national.length > 11) return "";
  return `+55${national}`;
}

/** Lê o corpo application/x-www-form-urlencoded de um request (clona para não consumir). */
export async function readFormParams(request: Request): Promise<Record<string, string>> {
  const text = await request.text();
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    params[key] = value;
  }
  return params;
}

async function hmacSha1Base64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Valida a assinatura X-Twilio-Signature.
 * Algoritmo: URL completa + (params POST ordenados por chave, concatenados key+value),
 * HMAC-SHA1 com o Auth Token, base64.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export async function validateTwilioSignature(
  authToken: string,
  fullUrl: string,
  params: Record<string, string>,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const expected = await hmacSha1Base64(authToken, data);
  // Comparação em tempo constante (evita timing side-channel).
  return timingSafeEqual(expected, signatureHeader);
}

/** Cria uma chamada via Twilio REST. */
export async function createTwilioCall(
  config: TwilioConfig,
  params: {
    to: string;
    twimlUrl: string;
    statusCallbackUrl: string;
  },
): Promise<{ sid: string }> {
  const body = new URLSearchParams();
  body.set("To", params.to);
  body.set("From", config.fromNumber);
  body.set("Url", params.twimlUrl);
  body.set("StatusCallback", params.statusCallbackUrl);
  body.set("StatusCallbackMethod", "POST");
  for (const evt of ["initiated", "ringing", "answered", "completed"]) {
    body.append("StatusCallbackEvent", evt);
  }

  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message ?? `Twilio respondeu ${res.status}.`);
  }
  return { sid: String(json.sid) };
}

/** Mapeia o CallStatus do Twilio para o status interno de call_logs. */
export function mapTwilioStatus(twilioStatus: string): string {
  switch (twilioStatus) {
    case "queued":
      return "queued";
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "busy":
      return "busy";
    case "no-answer":
      return "no_answer";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return "initiated";
  }
}

export const TWILIO_TERMINAL_STATUSES = new Set([
  "completed",
  "busy",
  "no_answer",
  "failed",
  "canceled",
]);
