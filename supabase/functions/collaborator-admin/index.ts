import { handleCors, jsonResponse } from "../_shared/http.ts";
import { recordPlatformAudit } from "../_shared/platform-audit.ts";
import { createAdminClient, PermissionDeniedError, requireTenantContext } from "../_shared/supabase.ts";

const allowedRoles = new Set(["admin", "operacao", "financeiro", "atendimento"]);
const allowedStatuses = new Set(["active", "inactive"]);

type CollaboratorRow = {
  id: string;
  tenant_id: string;
  nome: string | null;
  email: string | null;
  role: string;
  status: string;
  auth_user_id?: string | null;
};

type CollaboratorUpdateBody = {
  profileId?: unknown;
  nome?: unknown;
  role?: unknown;
  status?: unknown;
  newPassword?: unknown;
};

async function updateAuthUserPassword(admin: ReturnType<typeof createAdminClient>, userId: string, password: string) {
  const authAny = admin.auth as unknown as Record<string, unknown>;
  const adminApi = authAny.admin as Record<string, unknown> | undefined;

  if (adminApi && typeof adminApi.updateUserById === "function") {
    const result = await (adminApi.updateUserById as (id: string, attributes: { password: string }) => Promise<{ error?: { message?: string } | null }>)
      .call(adminApi, userId, { password });
    if (result?.error?.message) {
      throw new Error(result.error.message);
    }
    return;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    throw new Error("Nao foi possivel atualizar a senha do usuario.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "msg" in payload
        ? String((payload as Record<string, unknown>).msg ?? "Nao foi possivel atualizar a senha do usuario.")
        : "Nao foi possivel atualizar a senha do usuario.";
    throw new Error(message);
  }
}

async function resolveCollaboratorAuthUserId(
  admin: ReturnType<typeof createAdminClient>,
  collaborator: CollaboratorRow,
) {
  const directAuthUserId = collaborator.auth_user_id?.trim();
  if (directAuthUserId) {
    return directAuthUserId;
  }

  const email = collaborator.email?.trim().toLowerCase();
  if (!email) {
    return collaborator.id;
  }

  const { data: inviteRow } = await admin
    .from("collaborator_invites")
    .select("auth_user_id")
    .eq("tenant_id", collaborator.tenant_id)
    .ilike("email", email)
    .maybeSingle();

  const inviteAuthUserId = inviteRow?.auth_user_id?.trim();
  if (inviteAuthUserId) {
    return inviteAuthUserId;
  }

  const candidateIds = new Set<string>([collaborator.id]);
  try {
    let page = 1;
    for (; page <= 3; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (error) {
        break;
      }

      for (const user of data.users ?? []) {
        if (user?.email?.trim().toLowerCase() === email && user.id) {
          candidateIds.add(user.id);
          return user.id;
        }
      }

      if (!data.nextPage) {
        break;
      }
    }
  } catch {
    // Ignora falha de listagem e segue com os candidatos abaixo.
  }

  return candidateIds.values().next().value ?? collaborator.id;
}

async function requireCollaboratorManagementContext(request: Request) {
  const ctx = await requireTenantContext(request);
  const admin = createAdminClient();

  const { data: platformAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (platformAdmin) {
    const { data: platformTenantContext, error } = await admin
      .from("platform_user_tenant_context")
      .select("selected_tenant_id")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const selectedTenantId = platformTenantContext?.selected_tenant_id;
    if (!selectedTenantId) {
      throw new Error("Selecione uma empresa antes de editar colaboradores.");
    }

    return {
      admin,
      userId: ctx.userId,
      tenantId: String(selectedTenantId),
      actorRole: ctx.role,
      isPlatformAdmin: true,
    } as const;
  }

  if (ctx.role !== "admin") {
    throw new PermissionDeniedError("Somente administradores podem editar colaboradores.");
  }

  return {
    admin,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    actorRole: ctx.role,
    isPlatformAdmin: false,
  } as const;
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
    const ctx = await requireCollaboratorManagementContext(request);
    const body = (await request.json().catch(() => ({}))) as CollaboratorUpdateBody;

    const profileId = String(body.profileId ?? "").trim();
    const nome = String(body.nome ?? "").trim();
    const role = String(body.role ?? "").trim().toLowerCase();
    const status = String(body.status ?? "").trim().toLowerCase();
    const newPassword = String(body.newPassword ?? "").trim();

    if (!profileId) {
      return jsonResponse({ error: "profileId obrigatorio." }, 400);
    }
    if (!nome) {
      return jsonResponse({ error: "Nome obrigatorio." }, 400);
    }
    if (!allowedRoles.has(role)) {
      return jsonResponse({ error: "Role invalida." }, 400);
    }
    if (!allowedStatuses.has(status)) {
      return jsonResponse({ error: "Status invalido." }, 400);
    }
    if (newPassword.length < 6) {
      return jsonResponse({ error: "A nova senha precisa ter pelo menos 6 caracteres." }, 400);
    }

    const { data: collaborator, error: collaboratorError } = await ctx.admin
      .from("profiles")
      .select("id, tenant_id, nome, email, role, status")
      .eq("id", profileId)
      .eq("tenant_id", ctx.tenantId)
      .maybeSingle();

    if (collaboratorError) {
      return jsonResponse({ error: collaboratorError.message }, 400);
    }
    if (!collaborator) {
      return jsonResponse({ error: "Colaborador nao encontrado neste tenant." }, 404);
    }

    const before = collaborator as CollaboratorRow;
    const authUserId = await resolveCollaboratorAuthUserId(ctx.admin, before);
    const profileUpdatePayload: Record<string, string> = {};

    if ((before.nome ?? "").trim() !== nome) {
      profileUpdatePayload.nome = nome;
    }
    if ((before.role ?? "").trim().toLowerCase() !== role) {
      profileUpdatePayload.role = role;
    }
    if ((before.status ?? "").trim().toLowerCase() !== status) {
      profileUpdatePayload.status = status;
    }

    try {
      await updateAuthUserPassword(ctx.admin, authUserId, newPassword);
    } catch (error) {
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? `Nao foi possivel salvar a nova senha: ${error.message}`
              : "Nao foi possivel salvar a nova senha.",
        },
        400,
      );
    }

    let updated = collaborator as CollaboratorRow;
    if (Object.keys(profileUpdatePayload).length > 0) {
      const { data: profileUpdated, error: updateError } = await ctx.admin
        .from("profiles")
        .update(profileUpdatePayload)
        .eq("id", profileId)
        .eq("tenant_id", ctx.tenantId)
        .select("id, tenant_id, nome, email, role, status, empresa, plano, call_phone, created_at, updated_at")
        .single();

      if (updateError || !profileUpdated) {
        return jsonResponse({ error: updateError?.message ?? "Nao foi possivel salvar o colaborador." }, 400);
      }
      updated = profileUpdated as CollaboratorRow;
    }

    await recordPlatformAudit(ctx.admin, {
      tenantId: ctx.tenantId,
      actor: { userId: ctx.userId, role: ctx.actorRole },
      entityType: "collaborator_profile",
      entityId: profileId,
      summary: `Colaborador atualizado: ${nome}`,
        changes: {
        nome: { from: before.nome, to: nome },
        role: { from: before.role, to: role },
        status: { from: before.status, to: status },
        password_reset: { from: false, to: true },
      },
      metadata: {
        source: "collaborator-admin",
        is_platform_admin: ctx.isPlatformAdmin,
        auth_user_id: authUserId,
        collaborator_email: before.email ?? null,
      },
      request,
    });

    return jsonResponse({
      collaborator: updated,
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
