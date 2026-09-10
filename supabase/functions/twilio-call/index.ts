import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  getFunctionsBaseUrl,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import { createTwilioCall, getTwilioConfig, toE164BR } from "../_shared/twilio.ts";

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { admin, tenantId, userId } = await requireTenantPermission(
      request,
      "crm",
      "edit",
      "Seu papel não tem permissão para registrar ligações.",
    );

    const body = await request.json().catch(() => ({}));
    const leadNumber = toE164BR(String(body.toNumber ?? ""));
    if (!leadNumber) {
      return jsonResponse({ error: "Número do lead inválido." }, 400);
    }

    // Telefone do atendente (discado primeiro).
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("call_phone")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();
    if (profileError) {
      throw new Error(profileError.message);
    }
    const attendantPhone = toE164BR(String(profile?.call_phone ?? ""));
    if (!attendantPhone) {
      return jsonResponse(
        { error: "Configure seu telefone em Configurações → Perfil antes de ligar." },
        400,
      );
    }

    const config = getTwilioConfig();

    // Valida vínculos opcionais e cria o registro da ligação.
    const { data: callLog, error: insertError } = await admin
      .from("call_logs")
      .insert({
        tenant_id: tenantId,
        provider: "twilio",
        direction: "outbound",
        from_number: config.fromNumber,
        to_number: leadNumber,
        attendant_id: userId,
        customer_id: body.customerId ?? null,
        chat_id: body.chatId ?? null,
        negotiation_id: body.negotiationId ?? null,
        status: "queued",
      })
      .select("id")
      .single();
    if (insertError || !callLog) {
      throw new Error(insertError?.message ?? "Não foi possível criar o registro da ligação.");
    }

    const base = getFunctionsBaseUrl();
    const twimlUrl = `${base}/twilio-voice-twiml?callLogId=${callLog.id}`;
    const statusCallbackUrl = `${base}/twilio-voice-webhook`;

    try {
      const { sid } = await createTwilioCall(config, {
        to: attendantPhone,
        twimlUrl,
        statusCallbackUrl,
      });
      await admin
        .from("call_logs")
        .update({
          provider_call_sid: sid,
          status: "initiated",
          started_at: new Date().toISOString(),
        })
        .eq("id", callLog.id);

      return jsonResponse({ callLogId: callLog.id, callSid: sid });
    } catch (twilioError) {
      const message = twilioError instanceof Error ? twilioError.message : "Falha ao iniciar ligação.";
      await admin
        .from("call_logs")
        .update({ status: "failed", error: message, ended_at: new Date().toISOString() })
        .eq("id", callLog.id);
      return jsonResponse({ error: message }, 502);
    }
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, 403);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      400,
    );
  }
});
