import { escapeIlikeLiteralForPostgrest } from "../_shared/ilike-literal.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  createAdminClient,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import { sendCollaboratorInviteEmail } from "../_shared/email.ts";

const allowedRoles = new Set(["admin", "operacao", "financeiro", "atendimento"]);

type InviteEmailPayload = {
  email: string;
  nome: string;
  empresa: string | null;
  tenantId: string;
  role: string;
  appUrl?: string;
};

type SendInviteEmailResult = {
  emailSent: boolean;
  warning: string | null;
};

function normalizePublicOrigin(raw: string | null | undefined) {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isLocalhostOrigin(raw: string | null | undefined) {
  const normalized = normalizePublicOrigin(raw);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function resolveAppUrl(request: Request, bodyAppUrl?: unknown) {
  const envCandidates = [
    Deno.env.get("APP_SITE_URL"),
    Deno.env.get("PUBLIC_APP_URL"),
    Deno.env.get("VITE_APP_URL"),
  ];

  for (const candidate of envCandidates) {
    const normalized = normalizePublicOrigin(candidate);
    if (normalized && !isLocalhostOrigin(normalized)) {
      return normalized;
    }
  }

  const origin = normalizePublicOrigin(request.headers.get("origin"));
  const fromBody = normalizePublicOrigin(typeof bodyAppUrl === "string" ? bodyAppUrl : null);

  if (fromBody) {
    if (isLocalhostOrigin(fromBody)) {
      throw new Error(
        "O convite recebeu uma URL local (localhost). Defina APP_SITE_URL nos secrets da Edge Function e VITE_APP_URL no frontend para um dominio publico.",
      );
    }

    if (origin && fromBody !== origin) {
      throw new Error("URL publica do app nao confere com a origem da requisicao.");
    }

    return fromBody;
  }

  const referer = request.headers.get("referer");
  const fromReferer = referer ? normalizePublicOrigin(referer) : null;
  if (fromReferer && !isLocalhostOrigin(fromReferer)) {
    return fromReferer;
  }

  if (origin && !isLocalhostOrigin(origin)) {
    return origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost?.trim()) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.trim() || "https";
    const forwarded = normalizePublicOrigin(`${forwardedProto}://${forwardedHost.trim()}`);
    if (forwarded && !isLocalhostOrigin(forwarded)) {
      return forwarded;
    }
  }

  throw new Error(
    "Nao foi possivel resolver a URL publica do app para o convite. Defina APP_SITE_URL nos secrets da Edge Function e VITE_APP_URL no frontend.",
  );
}

async function sendInviteEmail(
  service: ReturnType<typeof createAdminClient>,
  request: Request,
  payload: InviteEmailPayload,
): Promise<SendInviteEmailResult> {
  const appUrl = resolveAppUrl(request, payload.appUrl);
  const result = await sendCollaboratorInviteEmail(service, {
    email: payload.email,
    nome: payload.nome,
    empresa: payload.empresa,
    tenantId: payload.tenantId,
    role: payload.role,
    appUrl,
  });

  return { emailSent: result.sent, warning: null };
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
      "colaboradores",
      "edit",
      "Seu papel nao tem permissao para criar acessos de colaboradores.",
    );
    await assertTenantBillingActive(admin, tenantId, "convidar usuarios");
    const body = await request.json().catch(() => ({}));
    const nome = String(body.nome ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "operacao").trim().toLowerCase();
    const resend = body.resend === true;

    if (!nome || !email) {
      throw new Error("nome e email sao obrigatorios.");
    }

    if (!allowedRoles.has(role)) {
      throw new Error("role invalido.");
    }

    const { data: inviterProfile, error: inviterError } = await admin
      .from("profiles")
      .select("nome, empresa, role")
      .eq("id", userId)
      .single();

    if (inviterError || !inviterProfile) {
      throw new Error("Nao foi possivel validar o perfil do usuario atual.");
    }

    if (inviterProfile.role !== "admin") {
      throw new Error("Somente administradores podem criar acessos de colaboradores.");
    }

    const service = createAdminClient();
    const { data: existingProfile } = await service
      .from("profiles")
      .select("id, tenant_id, email")
      .ilike("email", escapeIlikeLiteralForPostgrest(email))
      .maybeSingle();
    const { data: existingInvite } = await service
      .from("collaborator_invites")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.tenant_id && existingProfile.tenant_id !== tenantId) {
      throw new Error("Esse email ja esta associado a outro tenant.");
    }

    const shouldConsumeSeat =
      !resend &&
      !existingInvite &&
      (!existingProfile?.tenant_id || existingProfile.tenant_id !== tenantId);

    if (shouldConsumeSeat) {
      const { error: limitError } = await service.rpc("assert_tenant_plan_limit", {
        p_tenant_id: tenantId,
        p_metric: "users",
        p_increment: 1,
      });

      if (limitError) {
        throw new Error(limitError.message);
      }
    }

    const { error: inviteUpsertError } = await service
      .from("collaborator_invites")
      .upsert(
        {
          tenant_id: tenantId,
          email,
          nome,
          role,
          status: existingProfile ? "accepted" : "pending",
          invited_by: userId,
          auth_user_id: existingProfile?.id ?? null,
          accepted_at: existingProfile ? new Date().toISOString() : null,
        },
        { onConflict: "tenant_id,email" },
      );

    if (inviteUpsertError) {
      throw new Error(inviteUpsertError.message);
    }

    let emailSent = false;
    let inviteWarning: string | null = null;

    if (existingProfile?.id) {
      const { error: profileUpdateError } = await service
        .from("profiles")
        .update({
          tenant_id: tenantId,
          nome,
          empresa: inviterProfile.empresa,
          role,
          status: "active",
        })
        .eq("id", existingProfile.id);

      if (profileUpdateError) {
        throw new Error(profileUpdateError.message);
      }
    } else {
      const shouldSendEmail = resend || existingInvite?.status !== "pending";

      if (shouldSendEmail) {
        const sendResult = await sendInviteEmail(service, request, {
          email,
          nome,
          empresa: inviterProfile.empresa,
          tenantId,
          role,
          appUrl: typeof body.appUrl === "string" ? body.appUrl : undefined,
        });
        emailSent = sendResult.emailSent;
        inviteWarning = sendResult.warning;
      } else {
        inviteWarning = "Este convite ja existia e o e-mail nao foi reenviado. Use Reenviar e-mail.";
      }
    }

    const { data: invite, error: inviteLoadError } = await service
      .from("collaborator_invites")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .single();

    if (inviteLoadError || !invite) {
      throw new Error(inviteLoadError?.message ?? "Nao foi possivel carregar o convite criado.");
    }

    return jsonResponse({
      invite,
      emailSent,
      warning: inviteWarning,
    });
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
