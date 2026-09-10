// Gera link de recovery pelo Supabase Auth e envia um e-mail de recuperação com a nossa marca.
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { sendPasswordRecoveryEmail } from "../_shared/email.ts";

function getAppUrl() {
  const candidates = [
    Deno.env.get("APP_SITE_URL"),
    Deno.env.get("PUBLIC_APP_URL"),
    Deno.env.get("VITE_APP_URL"),
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const parsed = new URL(candidate.trim());
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin.replace(/\/+$/, "");
      }
    } catch {
      // ignore
    }
  }
  return "http://localhost:8080";
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "Informe um e-mail válido." }, 400);
    }

    const admin = createAdminClient();
    const redirectTo = `${getAppUrl()}/redefinir-senha`;
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error) {
      const msg = error.message || "Nao foi possivel gerar o link de recuperação.";
      if (/not found|user.*not/i.test(msg)) {
        return jsonResponse({ ok: true, sent: false, skipped: true });
      }
      return jsonResponse({ error: msg }, 400);
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return jsonResponse({ error: "Nao foi possivel gerar o link de recuperação." }, 400);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id, nome, empresa")
      .eq("email", email)
      .maybeSingle();

    const recipientName =
      (typeof profile?.nome === "string" && profile.nome) ||
      (typeof data?.user?.user_metadata?.nome === "string" ? String(data.user.user_metadata.nome) : null) ||
      (typeof data?.user?.user_metadata?.name === "string" ? String(data.user.user_metadata.name) : null);

    const company =
      (typeof profile?.empresa === "string" && profile.empresa) ||
      (typeof data?.user?.user_metadata?.empresa === "string" ? String(data.user.user_metadata.empresa) : null) ||
      (typeof data?.user?.user_metadata?.company === "string" ? String(data.user.user_metadata.company) : null);

    const tenantId = typeof profile?.tenant_id === "string" && profile.tenant_id
      ? String(profile.tenant_id)
      : "global";

    const result = await sendPasswordRecoveryEmail(admin, {
      tenantId,
      recipientEmail: email,
      recipientName,
      company,
      actionLink,
    });

    return jsonResponse({ ok: true, sent: result.sent, skipped: result.skipped });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro ao enviar recuperacao" }, 400);
  }
});
