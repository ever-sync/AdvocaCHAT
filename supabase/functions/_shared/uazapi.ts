type UazapiApiVersion = "v1" | "v2";

export type UazapiInstanceConfig = {
  instanceName: string;
  baseUrl: string;
  apiKey: string;
  apiVersion?: UazapiApiVersion;
};

/**
 * Default `delay` (ms) aplicado quando o usuario nao pediu simulacao de digitacao.
 * Mantem compatibilidade historica com o comportamento anterior de UAZAPI.
 */
const DEFAULT_SEND_DELAY_MS = 0;

/**
 * Erro HTTP da UAZAPI. A flag `retryable` permite que `withRetries` aborte
 * imediatamente quando o backend respondeu com 4xx (entrada invalida, sem credenciais,
 * numero inexistente etc.), evitando tres tentativas redundantes que so atrasam
 * a notificacao de erro para o usuario.
 */
export class UazapiHttpError extends Error {
  readonly status: number;
  readonly payload: unknown;
  readonly retryable: boolean;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "UazapiHttpError";
    this.status = status;
    this.payload = payload;
    // 408 (timeout) e 429 (rate limit) sao retentaveis; outros 4xx nao.
    this.retryable = status >= 500 || status === 408 || status === 429;
  }
}

type UazapiConnectionResolution = {
  config: UazapiInstanceConfig;
  connectionState: Record<string, unknown>;
};

type UazapiSendInput = {
  messageType: string;
  remoteJid: string;
  bodyText?: string;
  mediaUrl?: string;
  payload?: Record<string, unknown>;
  quotedMessageId?: string;
  simulateTypingMs?: number;
};

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function normalizeChatId(value: string) {
  return value.trim();
}

function normalizePhoneNumber(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function extractDigitsFromJid(value?: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits || null;
}

function inferMediaKindFromMimeOrUrl(
  mimeType?: string | null,
  url?: string | null,
): "image" | "video" | "audio" | "document" | null {
  const mime = String(mimeType ?? "").trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (
    mime.includes("pdf") ||
    mime.includes("msword") ||
    mime.includes("officedocument") ||
    mime.includes("spreadsheet") ||
    mime.includes("presentation") ||
    mime.includes("text/")
  ) {
    return "document";
  }

  const path = String(url ?? "").split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(path) || path.startsWith("data:image/")) {
    return "image";
  }
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(path) || path.startsWith("data:video/")) {
    return "video";
  }
  if (/\.(mp3|wav|m4a|aac|opus|oga)$/i.test(path) || path.startsWith("data:audio/")) {
    return "audio";
  }
  if (/\.(pdf|doc|docx|xls|xlsx|csv|zip|rar|ppt|pptx|txt)$/i.test(path)) {
    return "document";
  }

  return null;
}

function inferOutgoingMediaType(input: UazapiSendInput) {
  const payloadMime =
    typeof input.payload?.mimeType === "string"
      ? input.payload.mimeType
      : typeof input.payload?.mimetype === "string"
        ? input.payload.mimetype
        : undefined;

  const payloadUrl =
    typeof input.payload?.url === "string"
      ? input.payload.url
      : typeof input.payload?.mediaUrl === "string"
        ? input.payload.mediaUrl
        : input.mediaUrl;

  const inferred = inferMediaKindFromMimeOrUrl(payloadMime, payloadUrl);

  if (input.messageType === "document") {
    return "document" as const;
  }

  if (input.messageType === "audio") {
    return "audio" as const;
  }

  if (input.messageType === "media") {
    return inferred ?? "document";
  }

  return inferred ?? "document";
}

export async function requestJson<T>(
  config: UazapiInstanceConfig,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const headers =
    config.apiVersion === "v2"
      ? {
          token: config.apiKey,
          "Content-Type": "application/json",
        }
      : {
          apikey: config.apiKey,
          "Content-Type": "application/json",
        };

  const response = await fetch(joinUrl(config.baseUrl, path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const payloadMessage =
      typeof payload === "object" && payload !== null
        ? String(
            (payload as { message?: unknown; error?: unknown }).message ??
              (payload as { message?: unknown; error?: unknown }).error ??
              "",
          )
        : null;

    throw new UazapiHttpError(
      payloadMessage || rawText || `UAZAPI request failed: ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function requestAdminJson<T>(
  baseUrl: string,
  adminToken: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(joinUrl(baseUrl, path), {
    method,
    headers: {
      admintoken: adminToken,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const payloadMessage =
      typeof payload === "object" && payload !== null
        ? String(
            (payload as { message?: unknown; error?: unknown }).message ??
              (payload as { message?: unknown; error?: unknown }).error ??
              "",
          )
        : null;

    throw new UazapiHttpError(
      payloadMessage || rawText || `UAZAPI request failed: ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function createUazapiInstance(
  baseUrl: string,
  adminToken: string,
  name: string,
  extra?: { adminField01?: string; adminField02?: string },
) {
  return requestAdminJson<Record<string, unknown>>(
    baseUrl,
    adminToken,
    "instance/create",
    "POST",
    {
      name,
      ...(extra?.adminField01 ? { adminField01: extra.adminField01 } : {}),
      ...(extra?.adminField02 ? { adminField02: extra.adminField02 } : {}),
    },
  );
}

function isV2Connected(payload: Record<string, unknown>) {
  const status = payload.status as Record<string, unknown> | undefined;
  return Boolean(status?.connected || status?.loggedIn);
}

async function tryV1Connection(baseUrl: string, apiKey: string, instanceName: string) {
  const config: UazapiInstanceConfig = {
    instanceName,
    baseUrl,
    apiKey,
    apiVersion: "v1",
  };
  const connectionState = await requestJson<Record<string, unknown>>(
    config,
    `instance/connectionState/${instanceName}`,
  );

  return {
    config,
    connectionState,
  } satisfies UazapiConnectionResolution;
}

async function tryV2Connection(baseUrl: string, apiKey: string) {
  const config: UazapiInstanceConfig = {
    instanceName: "",
    baseUrl,
    apiKey,
    apiVersion: "v2",
  };
  const connectionState = await requestJson<Record<string, unknown>>(config, "instance/status");
  const instancePayload = connectionState.instance as Record<string, unknown> | undefined;
  const resolvedName = String(
    instancePayload?.name ??
      instancePayload?.profileName ??
      instancePayload?.id ??
      "uazapi-v2",
  ).trim();

  return {
    config: {
      ...config,
      instanceName: resolvedName,
    },
    connectionState,
  } satisfies UazapiConnectionResolution;
}

async function ensureResolvedConfig(config: UazapiInstanceConfig) {
  if (config.apiVersion) {
    return config;
  }

  const resolved = await resolveConnectionConfig(config.baseUrl, config.apiKey, config.instanceName);
  return resolved.config;
}

export function resolveInstanceStatus(connectionState: Record<string, unknown>) {
  const payload = connectionState as Record<string, unknown> & {
    instance?: Record<string, unknown>;
    status?: Record<string, unknown> | string;
  };

  if (typeof payload.status === "object" && payload.status !== null) {
    if (isV2Connected(payload)) {
      return "connected" as const;
    }

    if ((payload.status as Record<string, unknown>).resetting) {
      return "connecting" as const;
    }
  }

  const rawState = String(
    payload.instance?.state ??
      payload.instance?.status ??
      payload.state ??
      (typeof payload.status === "string" ? payload.status : "") ??
      payload.instanceState ??
      "disconnected",
  ).toLowerCase();

  if (["open", "connected", "online", "ready"].some((value) => rawState.includes(value))) {
    return "connected" as const;
  }

  if (["error", "failed"].some((value) => rawState.includes(value))) {
    return "error" as const;
  }

  if (["close", "closed", "disconnect", "logout"].some((value) => rawState.includes(value))) {
    return "disconnected" as const;
  }

  return "connecting" as const;
}

export function resolvePhoneNumber(
  connectionState: Record<string, unknown>,
  fallback?: string | null,
) {
  const payload = connectionState as Record<string, unknown> & {
    instance?: Record<string, unknown>;
    status?: Record<string, unknown>;
  };
  return (
    String(
      payload.instance?.owner ??
        extractDigitsFromJid(String(payload.status?.jid ?? "")) ??
        payload.instance?.number ??
        payload.number ??
        payload.instance?.phone ??
        payload.phone ??
        fallback ??
        "",
    ) || null
  );
}

export function resolveQrCode(connectionState: Record<string, unknown>) {
  const payload = connectionState as Record<string, unknown> & {
    instance?: Record<string, unknown>;
  };
  const qrValue =
    payload.instance?.qrcode ??
    payload.qrcode ??
    payload.base64 ??
    payload.instance?.base64 ??
    payload.qr ??
    payload.instance?.qr ??
    null;

  return typeof qrValue === "string" && qrValue.trim() ? qrValue.trim() : null;
}

export async function getConnectionState(config: UazapiInstanceConfig) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (resolvedConfig.apiVersion === "v2") {
    return requestJson<Record<string, unknown>>(resolvedConfig, "instance/status");
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `instance/connectionState/${resolvedConfig.instanceName}`,
  );
}

export async function resolveConnectionConfig(
  baseUrl: string,
  apiKey: string,
  preferredInstanceName?: string,
) {
  const candidates = Array.from(
    new Set([preferredInstanceName?.trim(), apiKey.trim()].filter((value): value is string => Boolean(value))),
  );
  const errors: string[] = [];

  try {
    return await tryV2Connection(baseUrl, apiKey);
  } catch (error) {
    errors.push(`v2: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  }

  for (const candidate of candidates) {
    try {
      return await tryV1Connection(baseUrl, apiKey, candidate);
    } catch (error) {
      errors.push(`v1:${candidate}: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }

  throw new Error(
    errors.length > 0
      ? `Nao consegui localizar a instancia na UAZAPI. Tentativas: ${errors.join(" | ")}`
      : "Nao foi possivel localizar a instancia na UAZAPI.",
  );
}

export async function setWebhook(config: UazapiInstanceConfig, url: string) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (resolvedConfig.apiVersion === "v2") {
    return requestJson<Record<string, unknown>>(resolvedConfig, "webhook", "POST", {
      enabled: true,
      url,
      events: [
        "connection",
        "messages",
      ],
    });
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `webhook/set/${resolvedConfig.instanceName}`,
    "POST",
    {
      url,
      enabled: true,
      local_map: false,
      STATUS_INSTANCE: true,
      MESSAGES_UPSERT: true,
      SEND_MESSAGE: true,
      MESSAGES_UPDATE: false,
      QRCODE_UPDATED: true,
      CHATS_SET: false,
      CHATS_UPSERT: false,
      CHATS_UPDATE: false,
      CONNECTION_UPDATE: true,
      groups_ignore: true,
    },
  );
}

export async function findWebhook(config: UazapiInstanceConfig) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (resolvedConfig.apiVersion === "v2") {
    return requestJson<Record<string, unknown>>(resolvedConfig, "webhook");
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `webhook/find/${resolvedConfig.instanceName}`,
  );
}

export async function findChats(config: UazapiInstanceConfig) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (resolvedConfig.apiVersion === "v2") {
    return requestJson<Record<string, unknown>>(resolvedConfig, "chat/find", "POST", {
      limit: 100,
      offset: 0,
      sort: "-wa_lastMsgTimestamp",
    });
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `chat/findChats/${resolvedConfig.instanceName}`,
  );
}

export async function findMessages(config: UazapiInstanceConfig, remoteJid: string) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (resolvedConfig.apiVersion === "v2") {
    return requestJson<Record<string, unknown>>(resolvedConfig, "message/find", "POST", {
      chatid: normalizeChatId(remoteJid),
      limit: 100,
    });
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `chat/findMessages/${resolvedConfig.instanceName}`,
    "POST",
    {
      where: {
        key: {
          remoteJid,
        },
      },
      limit: 100,
    },
  );
}

export type UazapiMediaDownload = {
  bytes: Uint8Array;
  mimeType: string | null;
  fileName: string | null;
};

function decodeBase64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;,]+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function pickStringField(obj: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function fetchUrlToBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed (${response.status})`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  return {
    bytes: buffer,
    mimeType: response.headers.get("content-type"),
  };
}

/**
 * Baixa midia recebida (criptografada pelo WhatsApp) usando o endpoint da
 * uazapi v2 que entrega o arquivo ja descriptografado. Tenta variacoes comuns
 * do endpoint para suportar diferentes provedores (uazapi.com, eversync etc.).
 *
 * Retorna `null` se nao foi possivel baixar — o caller deve manter a URL crua
 * apenas como referencia (visualizacao falhara, mas o registro fica auditavel).
 */
export async function downloadIncomingMediaFromUazapi(
  config: UazapiInstanceConfig,
  params: { messageId: string; mediaUrl?: string | null; mediaType?: string | null },
): Promise<UazapiMediaDownload | null> {
  const resolvedConfig = await ensureResolvedConfig(config);
  const messageId = params.messageId.trim();
  if (!messageId) {
    return null;
  }

  const v2Bodies: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "message/download", body: { id: messageId } },
    { path: "message/download", body: { messageid: messageId } },
    { path: "message/download", body: { id: messageId, returnAsBase64: true } },
    { path: "message/getMediaAsBase64", body: { id: messageId } },
  ];

  const v1Bodies: Array<{ path: string; body: Record<string, unknown> }> = [
    {
      path: `chat/getBase64FromMediaMessage/${resolvedConfig.instanceName}`,
      body: { message: { key: { id: messageId } } },
    },
    {
      path: `message/download/${resolvedConfig.instanceName}`,
      body: { id: messageId },
    },
  ];

  const candidates =
    resolvedConfig.apiVersion === "v2" ? v2Bodies : v1Bodies;

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const result = await requestJson<Record<string, unknown> | string>(
        resolvedConfig,
        candidate.path,
        "POST",
        candidate.body,
      );

      if (typeof result === "string" && result.trim().startsWith("data:")) {
        const mimeMatch = /^data:([^;]+);base64,/i.exec(result.trim());
        return {
          bytes: decodeBase64ToBytes(result),
          mimeType: mimeMatch?.[1] ?? null,
          fileName: null,
        };
      }

      if (result && typeof result === "object") {
        const obj = result as Record<string, unknown>;
        const downloadUrl = pickStringField(obj, "url", "fileURL", "fileUrl", "downloadUrl", "publicUrl");
        const base64 = pickStringField(obj, "base64", "fileBase64", "data", "media");
        const mime = pickStringField(obj, "mimeType", "mimetype", "contentType");
        const fileName = pickStringField(obj, "fileName", "filename", "name");

        if (downloadUrl) {
          const fetched = await fetchUrlToBytes(downloadUrl);
          return {
            bytes: fetched.bytes,
            mimeType: mime ?? fetched.mimeType ?? null,
            fileName,
          };
        }

        if (base64) {
          return {
            bytes: decodeBase64ToBytes(base64),
            mimeType: mime,
            fileName,
          };
        }
      }
    } catch (error) {
      lastError = error;
      const isHttp = error instanceof UazapiHttpError;
      if (isHttp && error.status >= 500) {
        break;
      }
    }
  }

  /* Ultimo recurso: tentar baixar a URL crua. Funcionará apenas para midias
   * publicas (raro com WhatsApp criptografado), mas evita perder uma midia
   * que a uazapi nao expoe via /message/download. */
  if (params.mediaUrl) {
    try {
      const fetched = await fetchUrlToBytes(params.mediaUrl);
      return {
        bytes: fetched.bytes,
        mimeType: fetched.mimeType ?? null,
        fileName: null,
      };
    } catch {
      // ignora — nao conseguimos baixar
    }
  }

  if (lastError) {
    // logamos via console para o painel de Edge Functions; nao quebra o webhook
    console.error("downloadIncomingMediaFromUazapi falhou", lastError);
  }
  return null;
}

/**
 * Checks whether a phone number (digits only, e.g. "5511999999999") exists on WhatsApp.
 * Returns true/false, or null if the check could not be performed (API error → don't block sending).
 */
export async function checkNumberOnWhatsApp(
  config: UazapiInstanceConfig,
  phoneDigits: string,
): Promise<boolean | null> {
  try {
    const resolvedConfig = await ensureResolvedConfig(config);

    if (resolvedConfig.apiVersion === "v2") {
      const result = await requestJson<unknown>(resolvedConfig, "chat/onWhatsapp", "POST", {
        numbers: [phoneDigits],
      });
      const items: unknown[] = Array.isArray(result)
        ? result
        : Array.isArray((result as Record<string, unknown>)?.data)
          ? (result as Record<string, unknown>).data as unknown[]
          : [result];
      const first = items[0] as Record<string, unknown> | undefined;
      if (!first) return null;
      return Boolean(first.exists ?? first.onWhatsApp ?? first.isOnWhatsApp);
    }

    // v1
    const result = await requestJson<unknown>(
      resolvedConfig,
      `chat/whatsappNumbers/${resolvedConfig.instanceName}`,
      "POST",
      { numbers: [phoneDigits] },
    );
    const items: unknown[] = Array.isArray(result) ? result : [];
    const first = items[0] as Record<string, unknown> | undefined;
    if (!first) return null;
    return Boolean(first.exists ?? first.isOnWhatsApp ?? first.onWhatsApp);
  } catch {
    // Graceful degradation: validation failure does not block sending
    return null;
  }
}

export async function sendMessageViaUazapi(config: UazapiInstanceConfig, input: UazapiSendInput) {
  const resolvedConfig = await ensureResolvedConfig(config);

  if (!input.remoteJid?.trim()) {
    throw new Error("Destino inválido: remoteJid ausente.");
  }

  // O "simular digitacao" e implementado pelo proprio `delay` nativo da UAZAPI:
  // o servidor da UAZAPI envia presenca "composing" durante o periodo informado
  // e so entao despacha a mensagem. Antes ficava em um `setTimeout` na Edge
  // Function, o que somava ao tempo da nossa funcao + presence call dedicada.
  const delayMs = Math.max(0, input.simulateTypingMs ?? DEFAULT_SEND_DELAY_MS);

  const payload = input.payload ?? {};
  const mediaType = inferOutgoingMediaType(input);
  const number =
    resolvedConfig.apiVersion === "v2"
      ? normalizePhoneNumber(input.remoteJid)
      : input.remoteJid;

  if (!number?.trim()) {
    throw new Error(`Destino inválido para envio (${input.remoteJid}).`);
  }

  if (resolvedConfig.apiVersion === "v2") {
    if (input.messageType === "media" || input.messageType === "audio" || input.messageType === "document") {
      return requestJson<Record<string, unknown>>(resolvedConfig, "send/media", "POST", {
        number,
        type: mediaType,
        file: input.mediaUrl,
        text: input.bodyText ?? "",
        delay: delayMs,
        ...payload,
      });
    }

    if (input.messageType === "location") {
      return requestJson<Record<string, unknown>>(resolvedConfig, "send/location", "POST", {
        number,
        delay: delayMs,
        ...payload,
      });
    }

    if (input.messageType === "contact") {
      return requestJson<Record<string, unknown>>(resolvedConfig, "send/contact", "POST", {
        number,
        delay: delayMs,
        ...payload,
      });
    }

    if (input.messageType === "menu") {
      return requestJson<Record<string, unknown>>(resolvedConfig, "send/menu", "POST", {
        number,
        text: input.bodyText ?? "",
        delay: delayMs,
        ...payload,
      });
    }

    return requestJson<Record<string, unknown>>(resolvedConfig, "send/text", "POST", {
      number,
      text: input.bodyText ?? "",
      replyid: input.quotedMessageId,
      delay: delayMs,
      ...payload,
    });
  }

  if (input.messageType === "text") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendText/${resolvedConfig.instanceName}`,
      "POST",
      {
        number,
        textMessage: {
          text: input.bodyText ?? "",
        },
        options: {
          delay: delayMs,
          quoted: input.quotedMessageId ? { key: { id: input.quotedMessageId } } : undefined,
        },
      },
    );
  }

  if (input.messageType === "poll") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendPoll/${resolvedConfig.instanceName}`,
      "POST",
      {
        number,
        ...(payload ?? {}),
      },
    );
  }

  if (input.messageType === "location") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendLocation/${resolvedConfig.instanceName}`,
      "POST",
      {
        number,
        ...(payload ?? {}),
      },
    );
  }

  if (input.messageType === "contact") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendContact/${resolvedConfig.instanceName}`,
      "POST",
      {
        remotejid: number,
        ...(payload ?? {}),
      },
    );
  }

  if (input.messageType === "menu") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendMenu/${resolvedConfig.instanceName}`,
      "POST",
      {
        number,
        textMessage: {
          text: input.bodyText ?? "",
        },
        ...(payload ?? {}),
      },
    );
  }

  if (input.messageType === "media" || input.messageType === "audio" || input.messageType === "document") {
    return requestJson<Record<string, unknown>>(
      resolvedConfig,
      `message/sendMedia/${resolvedConfig.instanceName}`,
      "POST",
      {
        number,
        mediatype: mediaType,
        mediaMessage: {
          mediatype: mediaType,
          url: input.mediaUrl,
          caption: input.bodyText ?? "",
        },
        ...(payload ?? {}),
      },
    );
  }

  return requestJson<Record<string, unknown>>(
    resolvedConfig,
    `message/sendText/${resolvedConfig.instanceName}`,
    "POST",
    {
      number,
      textMessage: {
        text: input.bodyText ?? "",
      },
      ...(payload ?? {}),
    },
  );
}
