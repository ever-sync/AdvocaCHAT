// Helpers de OAuth + Calendar do Google, compartilhados pelas functions de
// agendamento. Padrão de state assinado (HMAC) e tokens criptografados igual ao
// meta-oauth. Tokens guardados em scheduling_google_connections.
import { createAdminClient } from "./supabase.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
export const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

// calendar.events (escopo sensível: requer verificação do app no Google) +
// leitura para freebusy. access_type=offline + prompt=consent => refresh token.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const STATE_TTL_MS = 15 * 60 * 1000;

export function getGoogleCredentials() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos secrets das functions.");
  }
  return { clientId, clientSecret };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signState(secret: string, tenantId: string, providerId: string) {
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ t: tenantId, p: providerId, exp: Date.now() + STATE_TTL_MS })),
  );
  return `${body}.${await hmacHex(secret, body)}`;
}

export async function verifyState(
  secret: string,
  state: string,
): Promise<{ tenantId: string; providerId: string } | null> {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  const expected = await hmacHex(secret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (mismatch !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as {
      t?: string; p?: string; exp?: number;
    };
    if (!parsed.t || !parsed.p || !parsed.exp || parsed.exp < Date.now()) return null;
    return { tenantId: parsed.t, providerId: parsed.p };
  } catch {
    return null;
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.error ?? `Google token ${res.status}`);
  }
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getGoogleCredentials();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) {
    const err = new Error(data.error ?? `Google refresh ${res.status}`);
    // @ts-expect-error marca invalid_grant p/ o caller revogar
    err.code = data.error;
    throw err;
  }
  return data;
}

export async function getAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}

type ConnectionRow = {
  id: string;
  tenant_id: string;
  provider_id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string | null;
  status: string;
};

/**
 * Devolve um access token válido (renova se expirado e persiste). Retorna null e
 * marca a conexão como 'revoked' se o refresh falhar com invalid_grant.
 */
export async function getValidGoogleAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRow,
): Promise<string | null> {
  if (conn.status === "revoked") return null;
  const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + 60_000 && conn.encrypted_access_token;
  if (stillValid && conn.encrypted_access_token) {
    try {
      return await decryptSecret(conn.encrypted_access_token);
    } catch {
      // cai pro refresh
    }
  }
  if (!conn.encrypted_refresh_token) return null;
  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(conn.encrypted_refresh_token);
  } catch {
    return null;
  }
  try {
    const refreshed = await refreshAccessToken(refreshToken);
    if (!refreshed.access_token) return null;
    const encAccess = await encryptSecret(refreshed.access_token);
    const newExpiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
    await admin
      .from("scheduling_google_connections")
      .update({
        encrypted_access_token: encAccess,
        access_token_expires_at: newExpiry,
        status: "connected",
        last_error: null,
      })
      .eq("id", conn.id);
    return refreshed.access_token;
  } catch (err) {
    // @ts-expect-error o erro enriquecido carrega code em runtime
    const code = err?.code as string | undefined;
    if (code === "invalid_grant") {
      await admin
        .from("scheduling_google_connections")
        .update({ status: "revoked", last_error: "invalid_grant" })
        .eq("id", conn.id);
    } else {
      await admin
        .from("scheduling_google_connections")
        .update({ status: "error", last_error: err instanceof Error ? err.message : "refresh error" })
        .eq("id", conn.id);
    }
    return null;
  }
}

const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3/calendars";

export type GoogleEventInput = {
  summary: string;
  description?: string;
  startIso: string; // UTC ISO
  endIso: string;
  /** Marca o evento como criado pelo WChat (evita re-importar no pull). */
  appointmentId: string;
};

function eventBody(input: GoogleEventInput) {
  return {
    summary: input.summary,
    description: input.description ?? "",
    start: { dateTime: input.startIso },
    end: { dateTime: input.endIso },
    extendedProperties: { private: { wchat_appointment_id: input.appointmentId } },
  };
}

/** Cria evento no calendário; devolve o eventId. */
export async function insertCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleEventInput,
): Promise<string> {
  const res = await fetch(`${GOOGLE_CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody(input)),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new Error(data.error?.message ?? `events.insert ${res.status}`);
  return data.id;
}

export async function patchCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: GoogleEventInput,
): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(input)),
    },
  );
  if (!res.ok && res.status !== 404) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? `events.patch ${res.status}`);
  }
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  // 404/410 = já não existe: tratamos como sucesso.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`events.delete ${res.status}`);
  }
}

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/**
 * Lista eventos incrementalmente. Usa syncToken quando disponível; em 410 GONE
 * (token expirado) refaz a partir de timeMin. Devolve eventos + novo syncToken.
 */
export async function listEventsIncremental(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string | null; timeMinIso: string },
): Promise<{ events: GoogleEvent[]; nextSyncToken: string | null; resynced: boolean }> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let resynced = false;

  for (let guard = 0; guard < 20; guard++) {
    const url = new URL(`${GOOGLE_CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "250");
    if (opts.syncToken && !resynced) {
      url.searchParams.set("syncToken", opts.syncToken);
    } else {
      url.searchParams.set("timeMin", opts.timeMinIso);
    }
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 410) {
      // syncToken inválido → recomeça full a partir de timeMin.
      resynced = true;
      pageToken = undefined;
      continue;
    }
    if (!res.ok) throw new Error(`events.list ${res.status}`);
    const data = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    events.push(...(data.items ?? []));
    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
      continue;
    }
    nextSyncToken = data.nextSyncToken ?? null;
    break;
  }

  return { events, nextSyncToken, resynced };
}

export type BusyInterval = { start: number; end: number }; // epoch ms

/** Consulta freebusy do Google e devolve intervalos ocupados (epoch ms). */
export async function queryFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  const res = await fetch(GOOGLE_FREEBUSY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: timeMinIso, timeMax: timeMaxIso, items: [{ id: calendarId }] }),
  });
  if (!res.ok) {
    throw new Error(`freeBusy ${res.status}`);
  }
  const data = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }));
}

/**
 * Ocupação do Google de um prestador no intervalo (ou [] se não conectado/erro).
 * Não lança — disponibilidade nunca deve quebrar por causa do Google.
 */
export async function fetchProviderGoogleBusy(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  providerId: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  try {
    const { data: conn } = await admin
      .from("scheduling_google_connections")
      .select("id, tenant_id, provider_id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, status, calendar_id")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!conn || conn.status === "revoked") return [];
    const token = await getValidGoogleAccessToken(admin, conn as ConnectionRow);
    if (!token) return [];
    return await queryFreeBusy(token, String(conn.calendar_id ?? "primary"), timeMinIso, timeMaxIso);
  } catch {
    return [];
  }
}
