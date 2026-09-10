import { createAdminClient, getFunctionsBaseUrl } from "../_shared/supabase.ts";
import {
  getTwilioConfig,
  readFormParams,
  validateTwilioSignature,
} from "../_shared/twilio.ts";

function twimlResponse(xml: string, status = 200) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Público (verify_jwt=false): chamado pelo Twilio quando o atendente atende.
// Retorna o TwiML que disca o lead e une as pontas.
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return twimlResponse("<Response><Reject/></Response>", 405);
  }

  try {
    const config = getTwilioConfig();
    const url = new URL(request.url);
    const callLogId = url.searchParams.get("callLogId");
    const params = await readFormParams(request);

    // Reconstrói a URL pública (com query) para validar a assinatura.
    const expectedUrl = `${getFunctionsBaseUrl()}/twilio-voice-twiml?callLogId=${callLogId ?? ""}`;
    const valid = await validateTwilioSignature(
      config.authToken,
      expectedUrl,
      params,
      request.headers.get("X-Twilio-Signature"),
    );
    if (!valid) {
      return twimlResponse("<Response><Reject/></Response>", 403);
    }

    if (!callLogId) {
      return twimlResponse("<Response><Say>Ligação inválida.</Say></Response>", 400);
    }

    const admin = createAdminClient();
    const { data: callLog } = await admin
      .from("call_logs")
      .select("to_number")
      .eq("id", callLogId)
      .maybeSingle();

    const lead = callLog?.to_number ? String(callLog.to_number) : "";
    if (!lead) {
      return twimlResponse("<Response><Say>Número do lead não encontrado.</Say></Response>", 404);
    }

    return twimlResponse(
      `<Response><Dial callerId="${escapeXml(config.fromNumber)}"><Number>${escapeXml(lead)}</Number></Dial></Response>`,
    );
  } catch (_error) {
    return twimlResponse("<Response><Say>Erro ao conectar a ligação.</Say></Response>", 500);
  }
});
