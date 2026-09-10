import { createAdminClient, getFunctionsBaseUrl } from "../_shared/supabase.ts";
import {
  TWILIO_TERMINAL_STATUSES,
  getTwilioConfig,
  mapTwilioStatus,
  readFormParams,
  validateTwilioSignature,
} from "../_shared/twilio.ts";

function emptyTwiml(status = 200) {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

function activityTitle(status: string): string {
  switch (status) {
    case "completed":
      return "Ligação realizada";
    case "no_answer":
      return "Ligação não atendida";
    case "busy":
      return "Ligação ocupada";
    case "canceled":
      return "Ligação cancelada";
    case "failed":
      return "Ligação falhou";
    default:
      return "Ligação";
  }
}

// Público (verify_jwt=false): StatusCallback do Twilio.
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return emptyTwiml(405);
  }

  try {
    const config = getTwilioConfig();
    const params = await readFormParams(request);
    const expectedUrl = `${getFunctionsBaseUrl()}/twilio-voice-webhook`;
    const valid = await validateTwilioSignature(
      config.authToken,
      expectedUrl,
      params,
      request.headers.get("X-Twilio-Signature"),
    );
    if (!valid) {
      return emptyTwiml(403);
    }

    const callSid = params.CallSid;
    if (!callSid) {
      return emptyTwiml(400);
    }

    const status = mapTwilioStatus(params.CallStatus ?? "");
    const durationSeconds = params.CallDuration ? Number(params.CallDuration) : null;
    const recordingUrl = params.RecordingUrl ? `${params.RecordingUrl}.mp3` : null;
    const nowIso = new Date().toISOString();

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("call_logs")
      .select(
        "id, tenant_id, attendant_id, customer_id, chat_id, negotiation_id, to_number, answered_at, status",
      )
      .eq("provider_call_sid", callSid)
      .maybeSingle();

    if (!existing) {
      // Ainda não persistimos o SID (corrida) — apenas confirma recebimento.
      return emptyTwiml();
    }

    const isTerminal = TWILIO_TERMINAL_STATUSES.has(status);
    const update: Record<string, unknown> = { status };
    if ((status === "in_progress" || status === "answered") && !existing.answered_at) {
      update.answered_at = nowIso;
    }
    if (durationSeconds != null) {
      update.duration_seconds = durationSeconds;
    }
    if (recordingUrl) {
      update.recording_url = recordingUrl;
    }
    if (isTerminal) {
      update.ended_at = nowIso;
    }

    await admin.from("call_logs").update(update).eq("id", existing.id);

    // Ao encerrar, registra na timeline do CRM.
    if (isTerminal) {
      const durationLabel = formatDuration(durationSeconds);
      const bodyParts = [
        `Para ${existing.to_number ?? "número desconhecido"}`,
        durationLabel ? `duração ${durationLabel}` : null,
      ].filter(Boolean);

      await admin.from("crm_activities").insert({
        tenant_id: existing.tenant_id,
        customer_id: existing.customer_id,
        negotiation_id: existing.negotiation_id,
        chat_id: existing.chat_id,
        activity_type: "call",
        title: activityTitle(status),
        body: bodyParts.join(" · "),
        metadata: {
          call_sid: callSid,
          status,
          duration_seconds: durationSeconds,
          recording_url: recordingUrl,
        },
        created_by: existing.attendant_id,
      });
    }

    return emptyTwiml();
  } catch (_error) {
    // Twilio reenvia em caso de erro; respondemos 200 para evitar loop de retry
    // quando o erro é interno e não recuperável pelo reenvio.
    return emptyTwiml();
  }
});
