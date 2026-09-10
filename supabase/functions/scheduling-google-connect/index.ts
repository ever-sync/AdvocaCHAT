// Conexão do Google Calendar de um prestador (OAuth 2.0).
//  1. POST (JWT + configuracoes:edit, body {providerId}) -> authorizeUrl com state
//     assinado (tenant + provider, HMAC com GOOGLE_CLIENT_SECRET).
//  2. GET callback (?code&state, sem JWT) -> troca code, guarda tokens
//     criptografados em scheduling_google_connections e redireciona pro app.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_SITE_URL.
// Registre no Google Cloud como Authorized redirect URI:
//   {FUNCTIONS_BASE_URL}/scheduling-google-connect
import { encryptSecret } from "../_shared/crypto.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  createAdminClient,
  getFunctionsBaseUrl,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_SCOPES,
  exchangeCode,
  getAccountEmail,
  getGoogleCredentials,
  signState,
  verifyState,
} from "../_shared/google.ts";

function redirectUri() {
  return `${getFunctionsBaseUrl()}/scheduling-google-connect`;
}

function appReturnUrl(status: "ok" | "erro", message?: string) {
  const base = (Deno.env.get("APP_SITE_URL") ?? "").replace(/\/+$/, "") || "http://localhost:8080";
  const url = new URL(`${base}/agenda/configuracoes`);
  url.searchParams.set("google", status);
  if (message) url.searchParams.set("google_msg", message.slice(0, 140));
  return url.toString();
}

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  try {
    if (oauthError) throw new Error(oauthError);
    if (!code || !state) throw new Error("Parâmetros ausentes.");

    const { clientSecret } = getGoogleCredentials();
    const parsed = await verifyState(clientSecret, state);
    if (!parsed) throw new Error("State inválido ou expirado.");

    const tokens = await exchangeCode(code, redirectUri());
    if (!tokens.access_token) throw new Error("Sem access_token.");

    const admin = createAdminClient();
    const email = await getAccountEmail(tokens.access_token);
    const encAccess = await encryptSecret(tokens.access_token);
    const encRefresh = tokens.refresh_token ? await encryptSecret(tokens.refresh_token) : null;
    const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    const row: Record<string, unknown> = {
      tenant_id: parsed.tenantId,
      provider_id: parsed.providerId,
      google_account_email: email,
      encrypted_access_token: encAccess,
      access_token_expires_at: expiry,
      calendar_id: "primary",
      status: "connected",
      last_error: null,
      last_sync_at: new Date().toISOString(),
    };
    // Só sobrescreve o refresh token quando o Google manda um novo (ele só
    // reenvia com prompt=consent; em reconexões pode vir vazio).
    if (encRefresh) row.encrypted_refresh_token = encRefresh;

    const { error } = await admin
      .from("scheduling_google_connections")
      .upsert(row, { onConflict: "tenant_id,provider_id" });
    if (error) throw new Error(error.message);

    return Response.redirect(appReturnUrl("ok"), 302);
  } catch (error) {
    return Response.redirect(
      appReturnUrl("erro", error instanceof Error ? error.message : "Falha ao conectar."),
      302,
    );
  }
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method === "GET") {
    return handleCallback(request);
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { clientId, clientSecret } = getGoogleCredentials();
    const { tenantId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Seu papel não tem permissão para conectar o Google Calendar.",
    );
    const body = await request.json().catch(() => ({}));
    const providerId = String(body.providerId ?? "");
    if (!providerId) return jsonResponse({ error: "providerId obrigatório." }, 400);

    const state = await signState(clientSecret, tenantId, providerId);
    const authorizeUrl = new URL(GOOGLE_AUTH_URL);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri());
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", GOOGLE_SCOPES);
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "consent");
    authorizeUrl.searchParams.set("include_granted_scopes", "true");
    authorizeUrl.searchParams.set("state", state);

    return jsonResponse({ authorizeUrl: authorizeUrl.toString() });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro inesperado." }, 400);
  }
});
