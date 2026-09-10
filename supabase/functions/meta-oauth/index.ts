/**
 * Conexão de canais Meta (Instagram Direct) via OAuth do Facebook.
 *
 * Fluxo:
 *  1. POST (JWT do app, permissão configuracoes:edit) → devolve `authorizeUrl`
 *     com `state` assinado (tenant + expiração, HMAC com META_APP_SECRET).
 *  2. O usuário autoriza no dialog do Facebook e a Meta redireciona para o
 *     GET desta função (?code&state) — sem Authorization header, por isso
 *     verify_jwt=false e o state assinado é quem autentica o callback.
 *  3. Troca code → user token → long-lived; lista as Páginas com conta
 *     Instagram profissional; cria/atualiza uma instância por conta
 *     (provider=meta_instagram, Page Access Token criptografado) e inscreve a
 *     página no app (subscribed_apps) para o webhook receber as DMs.
 *  4. Redireciona de volta para APP_SITE_URL/configuracoes (secao=canais).
 *
 * Secrets: META_APP_ID, META_APP_SECRET, APP_SITE_URL.
 * No painel do app Meta, registre como Valid OAuth Redirect URI:
 *   {SUPABASE_PUBLIC_URL}/functions/v1/meta-oauth
 */

import { encryptSecret } from "../_shared/crypto.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  getFunctionsBaseUrl,
  createAdminClient,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import { META_GRAPH_BASE_URL } from "../_shared/instagram.ts";

const OAUTH_DIALOG_URL = "https://www.facebook.com/v23.0/dialog/oauth";
const OAUTH_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_manage_metadata",
  "business_management",
].join(",");
const STATE_TTL_MS = 15 * 60 * 1000;

function getMetaAppCredentials() {
  const appId = Deno.env.get("META_APP_ID")?.trim();
  const appSecret = Deno.env.get("META_APP_SECRET")?.trim();
  if (!appId || !appSecret) {
    throw new Error("Configure META_APP_ID e META_APP_SECRET nos secrets das functions.");
  }
  return { appId, appSecret };
}

function redirectUri() {
  return `${getFunctionsBaseUrl()}/meta-oauth`;
}

function appReturnUrl(params: Record<string, string>) {
  const base = (Deno.env.get("APP_SITE_URL") ?? "").replace(/\/+$/, "") || "http://localhost:8080";
  const url = new URL(`${base}/configuracoes`);
  url.searchParams.set("aba", "integracoes");
  url.searchParams.set("secao", "canais");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
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
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signState(appSecret: string, tenantId: string) {
  const body = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ t: tenantId, exp: Date.now() + STATE_TTL_MS })),
  );
  const signature = await hmacHex(appSecret, body);
  return `${body}.${signature}`;
}

async function verifyState(appSecret: string, state: string): Promise<string | null> {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = await hmacHex(appSecret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as {
      t?: string;
      exp?: number;
    };
    if (!parsed.t || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.t;
  } catch {
    return null;
  }
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Graph API respondeu ${res.status} em ${path}.`);
  }
  return data;
}

type PageWithInstagram = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  } | null;
};

async function handleCallback(request: Request): Promise<Response> {
  const { appId, appSecret } = getMetaAppCredentials();
  const url = new URL(request.url);

  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errorParam) {
    return Response.redirect(appReturnUrl({ meta: "erro", motivo: errorParam.slice(0, 200) }), 302);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.redirect(appReturnUrl({ meta: "erro", motivo: "Resposta incompleta da Meta." }), 302);
  }

  const tenantId = await verifyState(appSecret, state);
  if (!tenantId) {
    return Response.redirect(appReturnUrl({ meta: "erro", motivo: "Sessao de conexao expirada. Tente de novo." }), 302);
  }

  try {
    // code → user token de curta duração → long-lived (~60 dias). Os Page
    // Access Tokens derivados de um token longo não expiram por tempo.
    const shortLived = await graphGet<{ access_token: string }>("oauth/access_token", {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri(),
      code,
    });
    const longLived = await graphGet<{ access_token: string }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    });

    const pages = await graphGet<{ data?: PageWithInstagram[] }>("me/accounts", {
      fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
      access_token: longLived.access_token,
    });

    const candidates = (pages.data ?? []).filter(
      (page) => page.instagram_business_account?.id && page.access_token,
    );
    if (candidates.length === 0) {
      return Response.redirect(
        appReturnUrl({
          meta: "erro",
          motivo: "Nenhuma conta Instagram profissional vinculada as suas Paginas.",
        }),
        302,
      );
    }

    const admin = createAdminClient();
    let connected = 0;

    for (const page of candidates) {
      const ig = page.instagram_business_account!;
      const pageToken = page.access_token!;
      const encryptedToken = await encryptSecret(pageToken);
      const displayName = ig.username ? `Instagram @${ig.username}` : `Instagram ${page.name ?? ig.id}`;

      const { data: existing } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider", "meta_instagram")
        .eq("meta_ig_user_id", ig.id)
        .maybeSingle();

      if (!existing) {
        const { error: limitError } = await admin.rpc("assert_tenant_plan_limit", {
          p_tenant_id: tenantId,
          p_metric: "whatsapp_instances",
          p_increment: 1,
        });
        if (limitError) {
          throw new Error(limitError.message);
        }
      }

      const { error: upsertError } = await admin
        .from("whatsapp_instances")
        .upsert(
          {
            tenant_id: tenantId,
            display_name: displayName,
            uazapi_instance_name: `instagram:${ig.id}`,
            uazapi_base_url: "https://graph.facebook.com",
            encrypted_apikey: encryptedToken,
            provider: "meta_instagram",
            meta_page_id: page.id,
            meta_ig_user_id: ig.id,
            status: "connected",
            is_default: false,
            archived_at: null,
            last_sync_at: new Date().toISOString(),
            last_error: null,
          },
          { onConflict: "tenant_id,uazapi_instance_name" },
        );
      if (upsertError) {
        throw new Error(upsertError.message);
      }

      // Inscreve a página no app: sem isso a Meta não entrega os webhooks de
      // DM desta conta. Tolerante a falha (fica registrado em last_error).
      try {
        const subscribeUrl = new URL(`${META_GRAPH_BASE_URL}/${page.id}/subscribed_apps`);
        subscribeUrl.searchParams.set("subscribed_fields", "messages");
        subscribeUrl.searchParams.set("access_token", pageToken);
        const res = await fetch(subscribeUrl, { method: "POST" });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`subscribed_apps ${res.status}: ${detail.slice(0, 200)}`);
        }
      } catch (subscribeError) {
        console.error("meta-oauth: subscribed_apps falhou", subscribeError);
        await admin
          .from("whatsapp_instances")
          .update({
            last_error: "Webhook nao inscrito na Pagina — reconecte a conta.",
          })
          .eq("tenant_id", tenantId)
          .eq("provider", "meta_instagram")
          .eq("meta_ig_user_id", ig.id);
      }

      connected += 1;
    }

    return Response.redirect(appReturnUrl({ meta: "ok", contas: String(connected) }), 302);
  } catch (error) {
    console.error("meta-oauth callback:", error);
    const motivo = error instanceof Error ? error.message.slice(0, 200) : "Erro inesperado.";
    return Response.redirect(appReturnUrl({ meta: "erro", motivo }), 302);
  }
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  // Callback do dialog OAuth da Meta (redirect do navegador, sem JWT).
  if (request.method === "GET") {
    return handleCallback(request);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  // Início do fluxo: o app pede a URL de autorização (JWT + permissão).
  try {
    const { appId, appSecret } = getMetaAppCredentials();
    const { admin, tenantId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Seu papel nao tem permissao para conectar canais.",
    );
    await assertTenantBillingActive(admin, tenantId, "conectar canais");

    const state = await signState(appSecret, tenantId);
    const authorizeUrl = new URL(OAUTH_DIALOG_URL);
    authorizeUrl.searchParams.set("client_id", appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri());
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", OAUTH_SCOPES);
    authorizeUrl.searchParams.set("response_type", "code");

    return jsonResponse({ authorizeUrl: authorizeUrl.toString() });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      400,
    );
  }
});
