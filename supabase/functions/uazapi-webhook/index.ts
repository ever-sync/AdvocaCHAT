import {
  getInstanceById,
  normalizeWebhookEvent,
  persistWebhookEvent,
  normalizeUazapiMessageId,
  processMessagePayload,
  refreshCampaignStats,
  tryClaimWebhookDelivery,
  unwrapIncomingWebhookMessageRecords,
} from "../_shared/domain.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { handleAppointmentConfirmations } from "../_shared/scheduling-confirm.ts";
import { logStructured } from "../_shared/log.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

function normalizeReceiptStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("read")) return "read";
  if (normalized.includes("deliver")) return "delivered";
  if (normalized.includes("sent")) return "sent";
  return null;
}

const webhookRateBuckets = new Map<string, number[]>();
const WEBHOOK_MAX_PER_SECOND = 100;

function allowWebhookRate(instanceId: string) {
  const now = Date.now();
  const windowMs = 1000;
  const previous = webhookRateBuckets.get(instanceId) ?? [];
  const kept = previous.filter((timestamp) => now - timestamp < windowMs);
  if (kept.length >= WEBHOOK_MAX_PER_SECOND) {
    return false;
  }

  kept.push(now);
  webhookRateBuckets.set(instanceId, kept);
  return true;
}

/** Junta chat de `body` + raiz antes do objeto da mensagem Baileys (v1/v2). */
function mergeWebhookMessageEnvelope(
  payload: Record<string, unknown>,
  message: Record<string, unknown>,
): Record<string, unknown> {
  const rootChat =
    payload.chat && typeof payload.chat === "object"
      ? (payload.chat as Record<string, unknown>)
      : {};
  const body =
    payload.body && typeof payload.body === "object" && !Array.isArray(payload.body)
      ? (payload.body as Record<string, unknown>)
      : {};
  const bodyChat =
    body.chat && typeof body.chat === "object"
      ? (body.chat as Record<string, unknown>)
      : {};
  return {
    ...bodyChat,
    ...rootChat,
    ...message,
  };
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const admin = createAdminClient();
    const url = new URL(request.url);
    const instanceId = url.searchParams.get("instanceId");
    const token = url.searchParams.get("token");

    if (!instanceId || !token) {
      throw new Error("Missing webhook parameters.");
    }

    const instance = await getInstanceById(admin, instanceId);
    if (!instance.webhook_token || !timingSafeEqual(instance.webhook_token, token)) {
      throw new Error("Invalid webhook token.");
    }

    if (!allowWebhookRate(instanceId)) {
      return jsonResponse({ error: "Too many requests for this instance." }, 429);
    }

    const rawBody = await request.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    const eventName = normalizeWebhookEvent(payload);
    const requestId = crypto.randomUUID();
    logStructured("info", "uazapi_webhook_received", {
      request_id: requestId,
      tenant_id: instance.tenant_id,
      instance_id: instance.id,
      event_name: eventName,
    });

    const claimed = await tryClaimWebhookDelivery(admin, instance.tenant_id, instance.id, eventName, payload);
    if (!claimed) {
      return jsonResponse({ success: true, duplicate: true });
    }

    await persistWebhookEvent(admin, instance, eventName, payload);

    if (eventName === "MESSAGES_UPSERT") {
      const messages = unwrapIncomingWebhookMessageRecords(payload);
      for (const message of messages) {
        await processMessagePayload(admin, instance, mergeWebhookMessageEnvelope(payload, message));
      }
      // Respostas "1/confirmar" / "2/cancelar" a lembretes de agendamento.
      await handleAppointmentConfirmations(admin, instance, messages);
    }

    // Webhooks com tipo nao catalogado ou provedor novo: ainda assim tentamos ingerir
    // registros parecidos com mensagem (corrige `UNKNOWN` com corpo util).
    if (eventName === "UNKNOWN") {
      const messages = unwrapIncomingWebhookMessageRecords(payload);
      for (const message of messages) {
        await processMessagePayload(admin, instance, mergeWebhookMessageEnvelope(payload, message));
      }
    }

    if (eventName === "MESSAGES_UPDATE") {
      const updatePayload = (payload.event && typeof payload.event === "object"
        ? payload.event
        : payload) as Record<string, unknown>;
      const rawMessageIds = Array.isArray(updatePayload.MessageIDs)
        ? updatePayload.MessageIDs.map((value) => String(value)).filter(Boolean)
        : [];
      const messageIds = [
        ...new Set(
          rawMessageIds.flatMap((id) => {
            const normalized = normalizeUazapiMessageId(id);
            return normalized && normalized !== id ? [id, normalized] : [id];
          }),
        ),
      ];
      const nextStatus = normalizeReceiptStatus(payload.state ?? updatePayload.Type ?? payload.type);

      if (messageIds.length > 0 && nextStatus) {
        await admin
          .from("whatsapp_messages")
          .update({ status: nextStatus })
          .eq("instance_id", instance.id)
          .in("uazapi_message_id", messageIds);

        // Refresh campaign delivery stats when a receipt arrives for campaign messages
        if (nextStatus === "delivered" || nextStatus === "read") {
          const { data: campaignMsgs } = await admin
            .from("whatsapp_messages")
            .select("campaign_id")
            .eq("instance_id", instance.id)
            .in("uazapi_message_id", messageIds)
            .not("campaign_id", "is", null);

          const affectedCampaignIds = [
            ...new Set(
              (campaignMsgs ?? [])
                .map((m: Record<string, unknown>) => m.campaign_id as string)
                .filter(Boolean),
            ),
          ];
          for (const cId of affectedCampaignIds) {
            await refreshCampaignStats(admin, cId).catch(() => {});
          }
        }
      }
    }

    if (eventName === "QRCODE_UPDATED") {
      await admin
        .from("whatsapp_instances")
        .update({
          last_qr: String(payload.qrcode ?? payload.data?.qrcode ?? ""),
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", instance.id);
    }

    if (eventName === "CONNECTION_UPDATE") {
      const payloadData = payload.data as Record<string, unknown> | undefined;
      const payloadInstance = payload.instance as Record<string, unknown> | undefined;
      const rawStatus = String(
        payload.status ??
          payloadData?.state ??
          payload.state ??
          payloadInstance?.status ??
          "",
      ).toLowerCase();
      const nextStatus = rawStatus.includes("open") || rawStatus.includes("connected")
        ? "connected"
        : rawStatus.includes("close") || rawStatus.includes("disconnect")
          ? "disconnected"
          : "connecting";

      await admin
        .from("whatsapp_instances")
        .update({
          status: nextStatus,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", instance.id);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});
