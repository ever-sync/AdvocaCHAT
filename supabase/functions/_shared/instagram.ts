/**
 * Canal Instagram Direct (Meta Graph API).
 *
 * Reusa as tabelas whatsapp_* generalizadas (channel_type='instagram'):
 * - `remote_jid` guarda o IGSID do contato (ID numérico por usuário+página,
 *   sem telefone — por isso os campos remote_phone_* ficam nulos).
 * - A instância (provider='meta_instagram') guarda o Page Access Token
 *   criptografado em `encrypted_apikey` e os IDs em meta_page_id/meta_ig_user_id.
 */

import { decryptSecret } from "./crypto.ts";
import {
  type AdminClient,
  avatarSourceVersion,
  externalizeStoragePublicUrl,
  inferExtensionFromMime,
  type InstanceRecord,
  isMetaCdnAvatarUrl,
  isMirroredAvatarUrl,
  MEDIA_BUCKET,
  mirrorAvatarToStorage,
  mirroredAvatarVersion,
} from "./domain.ts";

export const META_GRAPH_BASE_URL = "https://graph.facebook.com/v23.0";

export type InstagramInstanceRecord = InstanceRecord & {
  provider?: string | null;
  meta_page_id?: string | null;
  meta_ig_user_id?: string | null;
};

/**
 * O webhook da Meta é um endpoint único por app — o roteamento para a instância
 * é feito pelo `entry.id` (IG user id da conta profissional conectada).
 */
export async function findInstagramInstanceByIgUserId(
  admin: AdminClient,
  igUserId: string,
): Promise<InstagramInstanceRecord | null> {
  const { data, error } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("provider", "meta_instagram")
    .eq("meta_ig_user_id", igUserId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    console.error("findInstagramInstanceByIgUserId:", error.message);
    return null;
  }

  return (data as InstagramInstanceRecord) ?? null;
}

/**
 * Perfil público do contato (nome + foto) via Graph API. Falha em silêncio:
 * o webhook nunca deve quebrar porque o perfil não pôde ser lido (token
 * expirado, permissão pendente de App Review, conta restrita...).
 */
export async function fetchInstagramProfile(
  instance: InstagramInstanceRecord,
  igsid: string,
): Promise<{ name: string | null; username: string | null; profilePic: string | null }> {
  try {
    const accessToken = await decryptSecret(instance.encrypted_apikey);
    const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(igsid)}` +
      `?fields=name,username,profile_pic&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("fetchInstagramProfile: status", res.status);
      return { name: null, username: null, profilePic: null };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : null,
      username: typeof data.username === "string" && data.username.trim()
        ? data.username.trim()
        : null,
      profilePic: typeof data.profile_pic === "string" && data.profile_pic.trim()
        ? data.profile_pic.trim()
        : null,
    };
  } catch (error) {
    console.error("fetchInstagramProfile:", error);
    return { name: null, username: null, profilePic: null };
  }
}

async function findCustomerByIgsid(admin: AdminClient, tenantId: string, igsid: string) {
  const { data } = await admin
    .from("customers")
    .select("id, nome, source_columns")
    .eq("tenant_id", tenantId)
    .eq("source_columns->>ig_sid", igsid)
    .order("updated_at", { ascending: false })
    .limit(1);

  return data?.[0] ?? null;
}

async function createCustomerFromIgsid(
  admin: AdminClient,
  tenantId: string,
  igsid: string,
  displayName?: string | null,
  username?: string | null,
) {
  const fallbackCode = igsid.slice(-8) || crypto.randomUUID().slice(0, 8);
  const customerName = displayName?.trim() ||
    (username ? `@${username}` : `Instagram ${fallbackCode}`);

  const { data, error } = await admin
    .from("customers")
    .insert({
      tenant_id: tenantId,
      codigo: `IG-${fallbackCode}`,
      origem: "organico",
      nome: customerName,
      telefone: "",
      celular: "",
      perfil: "B",
      rota: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticket_medio: 0,
      frequencia_compra: "Sem historico",
      total_gasto: 0,
      canal: "instagram",
      ativo: true,
      cadastrado_em: new Date().toISOString(),
      source_columns: {
        auto_created: true,
        source: "instagram_inbox",
        ig_sid: igsid,
        ig_username: username ?? null,
      },
    })
    .select("id, nome")
    .single();

  if (error) {
    if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
      return findCustomerByIgsid(admin, tenantId, igsid);
    }
    throw new Error(error.message);
  }

  return data;
}

/**
 * Equivalente do `ensureChat` para Instagram: sem normalização de telefone,
 * chave do chat = IGSID. Mantém os mesmos comportamentos operacionais
 * (avatar espelhado, IA auto-on por canal, auto-assign round-robin, reabertura
 * de chats `lost` em inbound).
 */
export async function ensureInstagramChat(
  admin: AdminClient,
  instance: InstagramInstanceRecord,
  params: {
    igsid: string;
    displayName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    lastMessagePreview?: string | null;
    lastMessageAt?: string | null;
    unreadIncrement?: number;
    autoAssign?: boolean;
    reopenOnInbound?: boolean;
  },
) {
  let customer = await findCustomerByIgsid(admin, instance.tenant_id, params.igsid);
  if (!customer) {
    customer = await createCustomerFromIgsid(
      admin,
      instance.tenant_id,
      params.igsid,
      params.displayName,
      params.username,
    );
  }

  const { data: existing } = await admin
    .from("whatsapp_chats")
    .select("*")
    .eq("tenant_id", instance.tenant_id)
    .eq("instance_id", instance.id)
    .eq("remote_jid", params.igsid)
    .maybeSingle();

  // Foto de perfil: URLs do CDN da Meta expiram — espelha no Storage (mesma
  // estratégia do WhatsApp; só baixa de novo quando a foto muda de versão).
  let resolvedAvatarUrl: string | null = existing?.avatar_url ?? null;
  const incomingAvatar = typeof params.avatarUrl === "string" ? params.avatarUrl.trim() : "";
  if (incomingAvatar) {
    if (isMetaCdnAvatarUrl(incomingAvatar)) {
      const version = avatarSourceVersion(incomingAvatar);
      const alreadyCurrent = isMirroredAvatarUrl(existing?.avatar_url) &&
        mirroredAvatarVersion(existing?.avatar_url) === version;
      resolvedAvatarUrl = alreadyCurrent
        ? existing?.avatar_url ?? null
        : (await mirrorAvatarToStorage(admin, instance, params.igsid, incomingAvatar, version)) ??
          existing?.avatar_url ??
          null;
    } else {
      resolvedAvatarUrl = incomingAvatar;
    }
  }

  let defaultAiMode = "off";
  if (!existing && instance.ai_enabled) {
    defaultAiMode = instance.ai_default_mode || "full";
  }

  const fallbackName = params.username
    ? `@${params.username}`
    : `Instagram ${params.igsid.slice(-8)}`;

  const payload = {
    tenant_id: instance.tenant_id,
    instance_id: instance.id,
    customer_id: customer?.id ?? null,
    channel_type: "instagram",
    remote_jid: params.igsid,
    remote_phone_digits: null,
    remote_phone_e164: null,
    display_name: params.displayName?.trim() ||
      customer?.nome?.trim() ||
      existing?.display_name ||
      fallbackName,
    avatar_url: resolvedAvatarUrl,
    last_message_preview: params.lastMessagePreview ?? existing?.last_message_preview ?? null,
    last_message_at: params.lastMessageAt ?? existing?.last_message_at ?? null,
    unread_count: Math.max(
      0,
      Number(existing?.unread_count ?? 0) + Number(params.unreadIncrement ?? 0),
    ),
    status: "open",
    resolution: params.reopenOnInbound && existing?.resolution === "lost"
      ? "open"
      : existing?.resolution ?? "open",
    ai_mode: existing?.ai_mode ?? defaultAiMode,
  };

  const { data, error } = await admin
    .from("whatsapp_chats")
    .upsert(payload, { onConflict: "tenant_id,instance_id,remote_jid" })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const aiHandling = Boolean(instance.ai_enabled) &&
    (data?.ai_mode === "qualifying" || data?.ai_mode === "full");
  if (params.autoAssign && data && !data.assignee_id && !aiHandling) {
    const { error: assignError } = await admin.rpc("auto_assign_instance_chat", {
      p_chat_id: data.id,
    });
    if (assignError) {
      console.error("ensureInstagramChat: auto_assign_instance_chat falhou", assignError);
    }
  }

  return data;
}

/**
 * Espelha um anexo do Instagram no Storage público. As URLs do CDN
 * (lookaside.fbsbx.com / cdninstagram) expiram em horas — sem espelho a mídia
 * some do histórico. Diferente do WhatsApp, não há criptografia: é um GET.
 */
export async function mirrorInstagramMediaToStorage(
  admin: AdminClient,
  instance: InstagramInstanceRecord,
  params: { messageId: string; mediaUrl: string },
): Promise<{ publicUrl: string; mimeType: string } | null> {
  try {
    const { error: storageLimitError } = await admin.rpc("assert_tenant_plan_limit", {
      p_tenant_id: instance.tenant_id,
      p_metric: "storage_gb",
      p_increment: 0,
    });
    if (storageLimitError) {
      console.error("mirrorInstagramMediaToStorage: limite de storage", storageLimitError);
      return null;
    }

    const res = await fetch(params.mediaUrl);
    if (!res.ok) {
      console.error("mirrorInstagramMediaToStorage: fetch falhou", { status: res.status });
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 50_000_000) {
      return null;
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const mime = contentType.split(";")[0]?.trim() || "application/octet-stream";
    const ext = inferExtensionFromMime(mime);
    const safeId = params.messageId.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "ig";
    const path = `${instance.tenant_id}/${instance.id}/${safeId}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (uploadError) {
      console.error("mirrorInstagramMediaToStorage: upload falhou", uploadError);
      return null;
    }

    const { data } = admin.storage.from(MEDIA_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      return null;
    }

    return { publicUrl: externalizeStoragePublicUrl(data.publicUrl), mimeType: mime };
  } catch (error) {
    console.error("mirrorInstagramMediaToStorage:", error);
    return null;
  }
}

/** Janela de resposta do Instagram: 24h após a última mensagem do cliente. */
export const INSTAGRAM_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function getInstagramReplyWindow(
  admin: AdminClient,
  chatId: string,
): Promise<{ lastInboundAt: string | null; withinWindow: boolean }> {
  const { data } = await admin
    .from("whatsapp_messages")
    .select("received_at, created_at")
    .eq("chat_id", chatId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  const last = data?.[0];
  const lastInboundAt = (last?.received_at ?? last?.created_at ?? null) as string | null;
  if (!lastInboundAt) {
    return { lastInboundAt: null, withinWindow: false };
  }

  const elapsed = Date.now() - new Date(lastInboundAt).getTime();
  return { lastInboundAt, withinWindow: elapsed >= 0 && elapsed < INSTAGRAM_REPLY_WINDOW_MS };
}

function instagramAttachmentType(messageType: string, mediaUrl: string): string {
  const normalizedType = messageType.toLowerCase();
  if (normalizedType === "audio") return "audio";
  if (normalizedType === "document") return "file";

  const path = (() => {
    try {
      return new URL(mediaUrl).pathname.toLowerCase();
    } catch {
      return mediaUrl.toLowerCase();
    }
  })();
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(path)) return "video";
  if (/\.(mp3|ogg|oga|opus|m4a|wav|aac)(\?|$)/.test(path)) return "audio";
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar|txt|csv)(\?|$)/.test(path)) return "file";
  return "image";
}

/**
 * Envia uma DM via Graph API (`POST /{ig-user-id}/messages`). A `mediaUrl`
 * precisa ser pública — as mídias do app já vivem no bucket público do Storage.
 * Retorna o `message_id` (mid) que a Meta também ecoa no webhook (dedupe).
 */
export async function sendInstagramDirectMessage(
  instance: InstagramInstanceRecord,
  params: {
    igsid: string;
    messageType: string;
    bodyText?: string | null;
    mediaUrl?: string | null;
  },
): Promise<{ mid: string | null; raw: Record<string, unknown> }> {
  const igUserId = instance.meta_ig_user_id;
  if (!igUserId) {
    throw new Error("Instância do Instagram sem meta_ig_user_id — reconecte a conta.");
  }

  const accessToken = await decryptSecret(instance.encrypted_apikey);

  const message: Record<string, unknown> = {};
  if (params.mediaUrl) {
    message.attachment = {
      type: instagramAttachmentType(params.messageType, params.mediaUrl),
      payload: { url: params.mediaUrl },
    };
  } else if (params.bodyText?.trim()) {
    message.text = params.bodyText.trim();
  } else {
    throw new Error("Mensagem vazia: informe texto ou mídia.");
  }

  const url = `${META_GRAPH_BASE_URL}/${encodeURIComponent(igUserId)}/messages` +
    `?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: params.igsid },
      messaging_type: "RESPONSE",
      message,
    }),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
    message_id?: string;
  };
  if (!res.ok || raw.error) {
    throw new Error(raw.error?.message ?? `Graph API respondeu ${res.status} no envio.`);
  }

  return { mid: typeof raw.message_id === "string" ? raw.message_id : null, raw };
}

/** Valida a assinatura `X-Hub-Signature-256` (HMAC-SHA256 do corpo com o App Secret). */
export async function verifyMetaWebhookSignature(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const expectedPrefix = "sha256=";
  const header = (signatureHeader ?? "").trim();
  if (!header.startsWith(expectedPrefix)) {
    return false;
  }
  const provided = header.slice(expectedPrefix.length).toLowerCase();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (provided.length !== computed.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < computed.length; i += 1) {
    mismatch |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}
