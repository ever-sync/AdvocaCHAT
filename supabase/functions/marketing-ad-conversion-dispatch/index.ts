// Worker de dispatch de conversões de Ads.
// Drena marketing_ad_conversion_dispatches pendentes e envia a conversão à
// plataforma:
//   - Meta Ads: API de Conversões (CAPI) — POST real ao Graph API.
//   - Google Ads: upload de conversão offline exige OAuth + developer token
//     (credenciais que não temos por config simples). Marcamos 'skipped' com
//     motivo, em vez de fingir envio ou ficar em retry eterno.
//
// Acesso: cron interno via x-cron-secret (isInternalRequest).
// Backoff: retry fixo de 5 min entre tentativas, até MAX_ATTEMPTS.
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";

const DISPATCH_LIMIT = 25;
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5 * 60_000; // 5 min entre tentativas
const META_GRAPH_VERSION = "v19.0";

type AdminClient = ReturnType<typeof createAdminClient>;

type Dispatch = {
  id: string;
  tenant_id: string;
  event_id: string | null;
  platform: string;
  event_name: string;
  attempts: number;
};

type AdConfig = {
  is_active: boolean;
  credentials: Record<string, unknown>;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Carrega a config (credenciais) de uma plataforma por tenant, com cache. */
async function loadConfig(
  admin: AdminClient,
  cache: Map<string, AdConfig | null>,
  tenantId: string,
  platform: string,
): Promise<AdConfig | null> {
  const key = `${tenantId}:${platform}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const { data } = await admin
    .from("marketing_ad_platform_configs")
    .select("is_active, credentials")
    .eq("tenant_id", tenantId)
    .eq("platform", platform)
    .maybeSingle();
  const config = data
    ? {
        is_active: (data as { is_active: boolean }).is_active === true,
        credentials:
          ((data as { credentials: Record<string, unknown> }).credentials as Record<
            string,
            unknown
          >) ?? {},
      }
    : null;
  cache.set(key, config);
  return config;
}

type SendResult =
  | { kind: "sent"; response: unknown }
  | { kind: "skipped"; reason: string }
  | { kind: "retry"; error: string }
  | { kind: "failed"; error: string };

/** Envia a conversão à Meta via CAPI. */
async function sendMeta(
  config: AdConfig,
  event: Record<string, unknown>,
  eventName: string,
): Promise<SendResult> {
  const creds = config.credentials;
  const pixelId = str(creds.pixel_id) || str(creds.dataset_id);
  const accessToken = str(creds.access_token);
  if (!pixelId || !accessToken) {
    return { kind: "skipped", reason: "Meta Ads sem pixel_id/access_token configurados" };
  }

  const totalValue = Number((event.total_value as number | string | null) ?? 0);
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${pixelId}/events`;
  const body = {
    data: [
      {
        event_name: eventName === "lead_won" ? "Purchase" : eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "system_generated",
        custom_data: {
          value: Number.isFinite(totalValue) ? totalValue : 0,
          currency: "BRL",
        },
      },
    ],
    access_token: accessToken,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { kind: "retry", error: `erro de rede: ${e instanceof Error ? e.message : String(e)}` };
  }

  const text = (await response.text()).slice(0, 4000);
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // mantém texto cru
  }

  if (response.status >= 200 && response.status < 300) {
    return { kind: "sent", response: parsed };
  }
  // 4xx = config/credencial inválida → falha permanente; 5xx = retry.
  if (response.status >= 400 && response.status < 500) {
    return { kind: "failed", error: `Meta HTTP ${response.status}: ${text}` };
  }
  return { kind: "retry", error: `Meta HTTP ${response.status}` };
}

async function processDispatch(
  admin: AdminClient,
  cache: Map<string, AdConfig | null>,
  dispatch: Dispatch,
): Promise<"sent" | "skipped" | "retry" | "failed"> {
  const nowIso = new Date().toISOString();

  // Carrega o evento (payload da conversão).
  let event: Record<string, unknown> = {};
  if (dispatch.event_id) {
    const { data } = await admin
      .from("marketing_ad_conversion_events")
      .select("payload")
      .eq("id", dispatch.event_id)
      .maybeSingle();
    event = ((data as { payload?: Record<string, unknown> } | null)?.payload ?? {}) as Record<
      string,
      unknown
    >;
  }

  const config = await loadConfig(admin, cache, dispatch.tenant_id, dispatch.platform);

  let result: SendResult;
  if (!config || !config.is_active) {
    result = { kind: "skipped", reason: "Plataforma desconectada ou inativa" };
  } else if (dispatch.platform === "meta_ads") {
    result = await sendMeta(config, event, dispatch.event_name);
  } else if (dispatch.platform === "google_ads") {
    result = {
      kind: "skipped",
      reason: "Google Ads requer OAuth + developer token (upload de conversão offline não implementado)",
    };
  } else {
    result = { kind: "failed", error: `Plataforma desconhecida: ${dispatch.platform}` };
  }

  const attempts = dispatch.attempts + 1;

  if (result.kind === "sent") {
    await admin
      .from("marketing_ad_conversion_dispatches")
      .update({
        status: "sent",
        attempts,
        sent_at: nowIso,
        last_attempt_at: nowIso,
        error: null,
        response: result.response ?? null,
      })
      .eq("id", dispatch.id);
    return "sent";
  }

  if (result.kind === "skipped") {
    await admin
      .from("marketing_ad_conversion_dispatches")
      .update({ status: "skipped", attempts, last_attempt_at: nowIso, error: result.reason })
      .eq("id", dispatch.id);
    return "skipped";
  }

  // retry/failed
  const exhausted = result.kind === "failed" || attempts >= MAX_ATTEMPTS;
  await admin
    .from("marketing_ad_conversion_dispatches")
    .update({
      status: exhausted ? "failed" : "pending",
      attempts,
      last_attempt_at: nowIso,
      error: result.error,
    })
    .eq("id", dispatch.id);
  return exhausted ? "failed" : "retry";
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (!isInternalRequest(request)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - RETRY_DELAY_MS).toISOString();

  // Pendentes que nunca tentaram ou cuja última tentativa já passou do backoff.
  const { data, error } = await admin
    .from("marketing_ad_conversion_dispatches")
    .select("id, tenant_id, event_id, platform, event_name, attempts, last_attempt_at")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${since}`)
    .order("created_at", { ascending: true })
    .limit(DISPATCH_LIMIT);

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  const list = (data ?? []) as Dispatch[];
  const cache = new Map<string, AdConfig | null>();
  let sent = 0;
  let skipped = 0;
  let retried = 0;
  let failed = 0;

  for (const dispatch of list) {
    try {
      const outcome = await processDispatch(admin, cache, dispatch);
      if (outcome === "sent") sent++;
      else if (outcome === "skipped") skipped++;
      else if (outcome === "retry") retried++;
      else failed++;
    } catch (e) {
      // Erro inesperado: reenfileira (não perde o dispatch).
      await admin
        .from("marketing_ad_conversion_dispatches")
        .update({
          attempts: dispatch.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          error: e instanceof Error ? e.message : String(e),
        })
        .eq("id", dispatch.id);
      retried++;
    }
  }

  return jsonResponse({ ok: true, claimed: list.length, sent, skipped, retried, failed });
});
