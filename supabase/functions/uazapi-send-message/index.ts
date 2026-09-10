import { decryptSecret } from "../_shared/crypto.ts";
import {
  ensureChat,
  getInstanceById,
  insertMessage,
  insertOrDedupeOutboundMessage,
  normalizeUazapiMessageId,
} from "../_shared/domain.ts";
import {
  getInstagramReplyWindow,
  type InstagramInstanceRecord,
  sendInstagramDirectMessage,
} from "../_shared/instagram.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  createAdminClient,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import { withRetries } from "../_shared/retry.ts";
import { sendMessageViaUazapi } from "../_shared/uazapi.ts";

type PersonalizationFields = {
  nome?: string;
  telefone?: string;
  perfil?: string;
  rota?: string;
  cidade?: string;
};

function normalizePhoneDigits(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  if (!rawDigits) return "";

  const normalizeNationalDigits = (digits: string) => {
    const nationalDigits = digits.length > 11 ? digits.slice(-11) : digits;
    return nationalDigits.length >= 10 ? nationalDigits : "";
  };

  if (rawDigits.startsWith("55")) {
    const nationalDigits = normalizeNationalDigits(rawDigits.slice(2));
    return nationalDigits ? `55${nationalDigits}` : "";
  }

  const nationalDigits = normalizeNationalDigits(rawDigits.replace(/^0+/, ""));
  return nationalDigits ? `55${nationalDigits}` : "";
}

function resolveSpintax(text: string): string {
  return text.replace(/\{([^}]+)\}/g, (_, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)];
  });
}

function applyPersonalization(text: string, fields: PersonalizationFields): string {
  return resolveSpintax(
    text
      .replace(/\{\{nome\}\}/gi, fields.nome ?? "")
      .replace(/\{\{telefone\}\}/gi, fields.telefone ?? "")
      .replace(/\{\{perfil\}\}/gi, fields.perfil ?? "")
      .replace(/\{\{rota\}\}/gi, fields.rota ?? "")
      .replace(/\{\{cidade\}\}/gi, fields.cidade ?? ""),
  );
}

async function lookupPersonalizationFromCustomer(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  remoteJid: string,
): Promise<PersonalizationFields> {
  const digits = normalizePhoneDigits(remoteJid);
  const localDigits = digits.replace(/^55/, "");
  const jid = digits ? `${digits}@s.whatsapp.net` : "";
  const e164 = digits ? `+${digits}` : "";

  // Colapsa as 5 buscas anteriores em uma unica query com OR. Ordem de
  // preferencia mantida no JS porque PostgREST nao garante ordenacao do OR
  // por candidato.
  const orFilter = [
    jid && `phone_jid.eq.${jid}`,
    e164 && `phone_e164.eq.${e164}`,
    digits && `phone_digits.eq.${digits}`,
    localDigits && `phone_digits.eq.${localDigits}`,
    localDigits && `telefone.eq.${localDigits}`,
  ]
    .filter(Boolean)
    .join(",");

  if (!orFilter) {
    return { telefone: remoteJid };
  }

  const { data } = await admin
    .from("customers")
    .select("nome, telefone, perfil, rota, cidade, phone_jid, phone_e164, phone_digits")
    .eq("tenant_id", tenantId)
    .or(orFilter)
    .limit(5);

  if (!data?.length) {
    return { telefone: remoteJid };
  }

  // Reaplica a precedencia de match (jid > e164 > digits internacionais > digits nacionais > telefone).
  const score = (row: Record<string, unknown>) => {
    if (jid && row.phone_jid === jid) return 5;
    if (e164 && row.phone_e164 === e164) return 4;
    if (digits && row.phone_digits === digits) return 3;
    if (localDigits && row.phone_digits === localDigits) return 2;
    if (localDigits && row.telefone === localDigits) return 1;
    return 0;
  };

  const best = (data as Record<string, unknown>[])
    .map((row) => ({ row, score: score(row) }))
    .sort((a, b) => b.score - a.score)[0]?.row;

  if (!best) {
    return { telefone: remoteJid };
  }

  return {
    nome: typeof best.nome === "string" ? best.nome : undefined,
    telefone: typeof best.telefone === "string" ? best.telefone : undefined,
    perfil: typeof best.perfil === "string" ? best.perfil : undefined,
    rota: typeof best.rota === "string" ? best.rota : undefined,
    cidade: typeof best.cidade === "string" ? best.cidade : undefined,
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
    const { admin, tenantId, userId } = await requireTenantPermission(
      request,
      "inbox",
      "edit",
      "Seu papel nao tem permissao para enviar mensagens.",
    );
    await assertTenantBillingActive(admin, tenantId, "enviar mensagens");
    const body = await request.json();
    const instance = await getInstanceById(admin, String(body.instanceId));
    if (instance.tenant_id !== tenantId) {
      throw new Error("WhatsApp instance not found.");
    }

    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .single();
    if (actorError || !actor?.role) {
      throw new Error("Permissão negada.");
    }

    const actorRole = String(actor.role);
    if (!["admin", "operacao", "atendimento"].includes(actorRole)) {
      throw new Error("Permissão negada para enviar mensagens.");
    }

    if (actorRole === "atendimento") {
      const { data: existingChat, error: chatError } = await admin
        .from("whatsapp_chats")
        .select("assignee_id")
        .eq("tenant_id", tenantId)
        .eq("instance_id", instance.id)
        .eq("remote_jid", String(body.remoteJid))
        .maybeSingle();
      if (chatError) {
        throw new Error(chatError.message);
      }
      if (!existingChat || existingChat.assignee_id !== userId) {
        throw new Error("Assuma a conversa para enviar mensagens.");
      }
    }

    // Instagram Direct: sem telefone/ensureChat — a conversa nasce no inbound
    // (não dá para iniciar DM fria) e o envio vai pela Graph API da Meta.
    const igInstance = instance as InstagramInstanceRecord;
    if (igInstance.provider === "meta_instagram") {
      const igsid = String(body.remoteJid);
      const { data: igChat, error: igChatError } = await admin
        .from("whatsapp_chats")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("instance_id", instance.id)
        .eq("remote_jid", igsid)
        .maybeSingle();
      if (igChatError) {
        throw new Error(igChatError.message);
      }
      if (!igChat) {
        throw new Error("Conversa do Instagram não encontrada — ela precisa começar pelo cliente.");
      }

      const window = await getInstagramReplyWindow(admin, igChat.id);
      if (!window.withinWindow) {
        throw new Error(
          "Janela de 24h do Instagram expirou: só é possível responder até 24h após a última mensagem do cliente.",
        );
      }

      const igBodyText = typeof body.bodyText === "string" ? body.bodyText : undefined;
      const igMediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl : undefined;
      const sent = await withRetries(
        () =>
          sendInstagramDirectMessage(igInstance, {
            igsid,
            messageType: String(body.messageType),
            bodyText: igBodyText,
            mediaUrl: igMediaUrl,
          }),
        { maxAttempts: 3, baseDelayMs: 400 },
      );

      const igMessage = await insertMessage(admin, instance, igChat.id, {
        uazapiMessageId: sent.mid,
        channelType: "instagram",
        direction: "outbound",
        messageType: String(body.messageType),
        status: "sent",
        bodyText: igBodyText ?? null,
        mediaUrl: igMediaUrl ?? null,
        payloadJson: { source: "instagram" },
        rawEvent: sent.raw,
        sentAt: new Date().toISOString(),
        actorType: "human",
      });

      await admin
        .from("whatsapp_chats")
        .update({
          last_message_preview: igBodyText ?? String(body.messageType),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", igChat.id);

      return jsonResponse({ success: true, message: igMessage });
    }

    const apiKey = await decryptSecret(instance.encrypted_apikey);
    const config = {
      instanceName: instance.uazapi_instance_name,
      baseUrl: instance.uazapi_base_url,
      apiKey,
    };

    const chat = await ensureChat(admin, instance, {
      remoteJid: String(body.remoteJid),
      displayName: "Cliente",
      lastMessagePreview: String(body.bodyText ?? ""),
      lastMessageAt: new Date().toISOString(),
    });

    const customerPersonalization = await lookupPersonalizationFromCustomer(
      admin,
      tenantId,
      String(body.remoteJid),
    );
    const providedPersonalization = (body.personalization as PersonalizationFields | undefined) ?? {};
    const personalization = {
      nome: providedPersonalization.nome ?? customerPersonalization.nome,
      telefone: providedPersonalization.telefone ?? customerPersonalization.telefone,
      perfil: providedPersonalization.perfil ?? customerPersonalization.perfil,
      rota: providedPersonalization.rota ?? customerPersonalization.rota,
      cidade: providedPersonalization.cidade ?? customerPersonalization.cidade,
    };

    const bodyText =
      typeof body.bodyText === "string"
        ? applyPersonalization(body.bodyText, personalization)
        : undefined;

    const response = await withRetries(
      () =>
        sendMessageViaUazapi(config, {
          messageType: String(body.messageType),
          remoteJid: String(body.remoteJid),
          bodyText,
          mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : undefined,
          payload: (body.payload as Record<string, unknown> | undefined) ?? {},
          quotedMessageId: typeof body.quotedMessageId === "string" ? body.quotedMessageId : undefined,
          simulateTypingMs: typeof body.simulateTypingMs === "number" ? body.simulateTypingMs : undefined,
        }),
      { maxAttempts: 3, baseDelayMs: 400 },
    );

    const rawProviderId = response.key?.id ?? response.data?.key?.id ?? response.id;
    const uazapiMessageId = normalizeUazapiMessageId(
      typeof rawProviderId === "string" ? rawProviderId : null,
    ) || null;
    const message = await insertOrDedupeOutboundMessage(admin, instance, chat.id, {
      uazapiMessageId,
      messageType: String(body.messageType),
      status: "sent",
      bodyText: bodyText ?? null,
      mediaUrl: typeof body.mediaUrl === "string" ? body.mediaUrl : null,
      payloadJson: (body.payload as Record<string, unknown> | undefined) ?? {},
      rawEvent: response,
      quotedMessageId: typeof body.quotedMessageId === "string" ? body.quotedMessageId : null,
      sentAt: new Date().toISOString(),
    });

    await admin
      .from("whatsapp_chats")
      .update({
        last_message_preview: bodyText ?? String(body.messageType),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", chat.id);

    return jsonResponse({ success: true, message });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error." }, 400);
  }
});
