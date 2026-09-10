import { createAdminClient } from "./supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

export type PlatformAuditActor = {
  userId: string | null;
  role?: string | null;
};

export type PlatformAuditInput = {
  tenantId: string;
  actor: PlatformAuditActor;
  entityType: "billing_subscription" | "tenant_ai_subscription" | "operation_job" | string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  request?: Request;
};

export async function recordPlatformAudit(admin: Admin, input: PlatformAuditInput) {
  try {
    let actorName = "Admin da plataforma";
    let actorRole = input.actor.role ?? "platform_admin";

    if (input.actor.userId) {
      const { data: profile } = await admin
        .from("profiles")
        .select("nome, role")
        .eq("id", input.actor.userId)
        .maybeSingle();
      actorName = typeof profile?.nome === "string" && profile.nome.trim() ? profile.nome : actorName;
      actorRole = typeof profile?.role === "string" && profile.role.trim() ? profile.role : actorRole;
    }

    await admin.from("audit_logs").insert({
      tenant_id: input.tenantId,
      actor_id: input.actor.userId,
      actor_name: actorName,
      actor_role: actorRole,
      action: "platform_admin_action",
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      changes: input.changes ?? {},
      metadata: {
        platform_admin: true,
        ...(input.metadata ?? {}),
      },
      ip: input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: input.request?.headers.get("user-agent") ?? null,
    });
  } catch (error) {
    console.warn("platform audit failed:", error instanceof Error ? error.message : String(error));
  }
}
