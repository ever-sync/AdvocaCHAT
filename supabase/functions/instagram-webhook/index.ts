/**
 * Webhook do Instagram Direct (Meta Graph API).
 *
 * Diferenças em relação ao uazapi-webhook:
 * - Endpoint ÚNICO por app Meta (não há ?instanceId= na URL): o roteamento é
 *   feito pelo `entry.id` (IG user id) → whatsapp_instances.meta_ig_user_id.
 * - GET = handshake de verificação (hub.challenge) com META_VERIFY_TOKEN.
 * - POST autenticado pela assinatura X-Hub-Signature-256 (HMAC do corpo com
 *   META_APP_SECRET), não por token na query string.
 *
 * Secrets necessários (supabase secrets set):
 *   META_APP_SECRET   — App Secret do app Meta (valida assinatura)
 *   META_VERIFY_TOKEN — string arbitrária usada no cadastro do webhook
 */

import { insertMessage, persistWebhookEvent, tryClaimWebhookDelivery } from "../_shared/domain.ts";
import {
  ensureInstagramChat,
  fetchInstagramProfile,
  findInstagramInstanceByIgUserId,
  type InstagramInstanceRecord,
  mirrorInstagramMediaToStorage,
  verifyMetaWebhookSignature,
} from "../_shared/instagram.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { logStructured } from "../_shared/log.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    is_unsupported?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
    reply_to?: { mid?: string };
  };
  read?: { mid?: string };
};

function attachmentMessageType(type: string | undefined): string {
  const normalized = (type ?? "").toLowerCase();
  if (normalized === "audio") return "audio";
  if (normalized === "file") return "document";
  // image, video, share, story_mention, ig_reel... → mídia genérica
  return "media";
}

function previewForEvent(event: MessagingEvent): string {
  const text = event.message?.text?.trim();
  if (text) return text.slice(0, 160);
  const attachment = (event.message?.attachments ?? [])[0];
  const type = (attachment?.type ?? "").toLowerCase();
  if (type === "audio") return "🎤 Áudio";
  if (type === "video" || type === "ig_reel") return "🎬 Vídeo";
  if (type === "file") return "📄 Arquivo";
  if (type === "story_mention") return "📣 Menção em story";
  if (type === "share") return "🔗 Compartilhamento";
  if (type) return "🖼️ Imagem";
  return "Mensagem";
}

async function processMessagingEvent(
  admin: ReturnType<typeof createAdminClient>,
  instance: InstagramInstanceRecord,
  event: MessagingEvent,
  rawEntry: Record<string, unknown>,
) {
  const message = event.message;
  if (!message?.mid || message.is_deleted) {
    return;
  }

  const isEcho = Boolean(message.is_echo);
  // Echo = mensagem enviada PELA conta do negócio (app do Instagram ou outra
  // ferramenta) → outbound. Inbound usa o sender; echo usa o recipient.
  const igsid = isEcho ? event.recipient?.id : event.sender?.id;
  if (!igsid) {
    return;
  }

  const timestamp = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const preview = previewForEvent(event);

  // Nome/foto do contato só na primeira vez (chat novo) — evita uma chamada
  // Graph por mensagem. Atualização de perfil pode vir depois via sync.
  const { data: existingChat } = await admin
    .from("whatsapp_chats")
    .select("id")
    .eq("tenant_id", instance.tenant_id)
    .eq("instance_id", instance.id)
    .eq("remote_jid", igsid)
    .maybeSingle();

  let profile: { name: string | null; username: string | null; profilePic: string | null } = {
    name: null,
    username: null,
    profilePic: null,
  };
  if (!existingChat) {
    profile = await fetchInstagramProfile(instance, igsid);
  }

  const chat = await ensureInstagramChat(admin, instance, {
    igsid,
    displayName: profile.name,
    username: profile.username,
    avatarUrl: profile.profilePic,
    lastMessagePreview: preview,
    lastMessageAt: timestamp,
    unreadIncrement: isEcho ? 0 : 1,
    autoAssign: !isEcho,
    reopenOnInbound: !isEcho,
  });

  const attachments = message.attachments ?? [];
  const text = message.text?.trim() || null;

  if (attachments.length === 0) {
    await insertMessage(admin, instance, chat.id, {
      uazapiMessageId: message.mid,
      channelType: "instagram",
      direction: isEcho ? "outbound" : "inbound",
      messageType: "text",
      status: isEcho ? "sent" : "received",
      bodyText: text ?? (message.is_unsupported ? "[Mensagem não suportada]" : null),
      payloadJson: { source: "instagram", reply_to: message.reply_to?.mid ?? null },
      rawEvent: rawEntry,
      sentAt: isEcho ? timestamp : null,
      receivedAt: isEcho ? null : timestamp,
      actorType: "human",
    });
    return;
  }

  // Anexos: 1 mensagem por anexo (paridade com o WhatsApp, onde cada mídia é
  // uma mensagem). O texto, quando existe, acompanha o primeiro anexo.
  for (let i = 0; i < attachments.length; i += 1) {
    const attachment = attachments[i];
    const sourceUrl = attachment?.payload?.url ?? null;
    const mid = attachments.length === 1 ? message.mid : `${message.mid}#${i}`;

    let mediaUrl: string | null = null;
    let mimeType: string | null = null;
    if (sourceUrl) {
      const mirrored = await mirrorInstagramMediaToStorage(admin, instance, {
        messageId: mid,
        mediaUrl: sourceUrl,
      });
      mediaUrl = mirrored?.publicUrl ?? null;
      mimeType = mirrored?.mimeType ?? null;
    }

    await insertMessage(admin, instance, chat.id, {
      uazapiMessageId: mid,
      channelType: "instagram",
      direction: isEcho ? "outbound" : "inbound",
      messageType: attachmentMessageType(attachment?.type),
      status: isEcho ? "sent" : "received",
      bodyText: i === 0 ? text : null,
      mediaUrl,
      payloadJson: {
        source: "instagram",
        attachment_type: attachment?.type ?? null,
        mime_type: mimeType,
        // URL original do CDN (expira) — útil para debug/reprocessamento.
        cdn_url: sourceUrl,
        reply_to: message.reply_to?.mid ?? null,
      },
      rawEvent: rawEntry,
      sentAt: isEcho ? timestamp : null,
      receivedAt: isEcho ? null : timestamp,
      actorType: "human",
    });
  }
}

async function processReadEvent(
  admin: ReturnType<typeof createAdminClient>,
  instance: InstagramInstanceRecord,
  event: MessagingEvent,
) {
  const igsid = event.sender?.id;
  if (!igsid) return;

  const { data: chat } = await admin
    .from("whatsapp_chats")
    .select("id")
    .eq("tenant_id", instance.tenant_id)
    .eq("instance_id", instance.id)
    .eq("remote_jid", igsid)
    .maybeSingle();
  if (!chat) return;

  // O evento de leitura do IG cobre tudo até a mensagem lida (watermark por mid).
  // Simplificação v1: marca todo outbound ainda não-lido do chat como lido.
  await admin
    .from("whatsapp_messages")
    .update({ status: "read" })
    .eq("chat_id", chat.id)
    .eq("direction", "outbound")
    .neq("status", "read");
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  // Handshake de verificação do webhook (cadastro no painel do app Meta).
  if (request.method === "GET") {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("META_VERIFY_TOKEN") ?? "";

    if (mode === "subscribe" && expected && verifyToken === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return jsonResponse({ error: "Verification failed." }, 403);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
    if (!appSecret) {
      console.error("instagram-webhook: META_APP_SECRET não configurado");
      return jsonResponse({ error: "Webhook not configured." }, 503);
    }

    const rawBody = await request.text();
    const signatureValid = await verifyMetaWebhookSignature(
      appSecret,
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );
    if (!signatureValid) {
      return jsonResponse({ error: "Invalid signature." }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body." }, 400);
    }

    if (payload.object !== "instagram") {
      // Outros objetos (page, permissions...) são aceitos e ignorados — a Meta
      // desativa webhooks que respondem erro com frequência.
      return jsonResponse({ success: true, ignored: true });
    }

    const admin = createAdminClient();
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const requestId = crypto.randomUUID();

    for (const rawEntry of entries) {
      const entry = rawEntry as Record<string, unknown>;
      const igUserId = String(entry.id ?? "");
      if (!igUserId) continue;

      const instance = await findInstagramInstanceByIgUserId(admin, igUserId);
      if (!instance) {
        logStructured("warn", "instagram_webhook_unknown_account", {
          request_id: requestId,
          ig_user_id: igUserId,
        });
        continue;
      }

      const claimed = await tryClaimWebhookDelivery(
        admin,
        instance.tenant_id,
        instance.id,
        "IG_MESSAGING",
        entry,
      );
      if (!claimed) {
        continue;
      }

      await persistWebhookEvent(admin, instance, "IG_MESSAGING", entry);

      logStructured("info", "instagram_webhook_received", {
        request_id: requestId,
        tenant_id: instance.tenant_id,
        instance_id: instance.id,
      });

      const events = (Array.isArray(entry.messaging) ? entry.messaging : []) as MessagingEvent[];
      for (const event of events) {
        if (event.message) {
          await processMessagingEvent(admin, instance, event, entry);
        } else if (event.read) {
          await processReadEvent(admin, instance, event);
        }
      }
    }

    // A Meta exige 200 rápido; falhas parciais já foram logadas por entry.
    return jsonResponse({ success: true });
  } catch (error) {
    console.error("instagram-webhook:", error);
    // 200 mesmo em erro inesperado: a Meta re-tenta com backoff e desativa o
    // webhook se a taxa de erro persistir; o evento bruto fica nos logs.
    return jsonResponse({ success: false });
  }
});
