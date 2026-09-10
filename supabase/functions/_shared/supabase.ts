import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import {
  canTenantPermission,
  mergeRolePermissionsConfig,
  permissionDeniedMessage,
  type PermissionAction,
  type PermissionFunctionKey,
  type TenantRolePermissionsConfig,
  PermissionDeniedError,
} from "./role-permissions.ts";
export { PermissionDeniedError } from "./role-permissions.ts";
import { timingSafeEqual } from "./timing-safe-equal.ts";

export function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }

  return value;
}

export function createAdminClient() {
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function isInternalRequest(request: Request) {
  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = request.headers.get("x-cron-secret");

  return Boolean(
    expectedSecret && providedSecret && timingSafeEqual(expectedSecret, providedSecret),
  );
}

export async function requireTenantContext(request: Request) {
  const admin = createAdminClient();
  const authorization = request.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("Missing bearer token.");
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    throw new Error("Invalid bearer token.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    throw new Error("User has no tenant.");
  }

  return {
    admin,
    userId: userData.user.id,
    tenantId: profile.tenant_id as string,
    role: String(profile.role ?? "atendimento"),
  };
}

export async function requireTenantContextOrInternal(request: Request) {
  if (isInternalRequest(request)) {
    return {
      admin: createAdminClient(),
      userId: null,
      tenantId: null,
      isInternal: true as const,
    };
  }

  const context = await requireTenantContext(request);
  return {
    ...context,
    isInternal: false as const,
  };
}

export function getFunctionsBaseUrl() {
  const publicUrl = Deno.env.get("SUPABASE_PUBLIC_URL")?.trim();
  return `${publicUrl || getRequiredEnv("SUPABASE_URL")}/functions/v1`;
}

export async function fetchTenantRolePermissions(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<TenantRolePermissionsConfig> {
  const { data, error } = await admin
    .from("tenant_settings")
    .select("role_permissions")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mergeRolePermissionsConfig(data?.role_permissions);
}

export async function requireTenantPermission(
  request: Request,
  fn: PermissionFunctionKey,
  action: PermissionAction,
  customMessage?: string,
) {
  const context = await requireTenantContext(request);
  const permissions = await fetchTenantRolePermissions(context.admin, context.tenantId);
  if (!canTenantPermission(permissions, context.role, fn, action)) {
    throw new PermissionDeniedError(customMessage ?? permissionDeniedMessage(fn, action));
  }

  return {
    ...context,
    permissions,
  };
}

export async function assertTenantBillingActive(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string | null | undefined,
  actionLabel = "executar esta acao",
) {
  if (!tenantId) {
    throw new Error("Tenant nao informado.");
  }

  const { data, error } = await admin
    .from("billing_subscriptions")
    .select("status, plan_id, trial_ends_at, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();
  const status = data?.status ? String(data.status) : null;
  const trialActive = status === "trialing"
    && Boolean(data?.trial_ends_at)
    && new Date(String(data.trial_ends_at)).getTime() > now;
  const subscriptionActive = status === "active"
    && Boolean(data?.current_period_end)
    && new Date(String(data.current_period_end)).getTime() > now;

  if (trialActive || subscriptionActive) {
    return {
      allowed: true,
      status,
      planId: data?.plan_id ? String(data.plan_id) : null,
    };
  }

  const reason = !status
    ? "sem assinatura"
    : status === "trialing"
      ? "com teste expirado"
      : status === "active"
        ? "com periodo expirado"
        : `com status ${status}`;
  const err = new PermissionDeniedError(
    `Sua assinatura esta ${reason}. Regularize o plano para ${actionLabel}.`,
  );
  err.status = 402;
  throw err;
}
