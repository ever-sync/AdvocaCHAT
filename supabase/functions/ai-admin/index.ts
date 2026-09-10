// Painel super-admin do add-on de IA: lista tenants (status/cota/uso) e provisiona
// (ativa/desativa + cota + overage). Opera ENTRE tenants com service role, gated por
// platform_admins (o JWT precisa ser de um admin da plataforma).

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { recordPlatformAudit } from "../_shared/platform-audit.ts";
import { createAdminClient, requireTenantContext } from "../_shared/supabase.ts";

function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  let ctx;
  try {
    ctx = await requireTenantContext(request);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unauthorized." }, 401);
  }

  const admin = createAdminClient();
  const { data: isAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!isAdmin) {
    return jsonResponse({ error: "Acesso restrito ao administrador da plataforma." }, 403);
  }

  if (request.method === "GET") {
    const [{ data: tenants }, { data: subs }, { data: usage }, { data: addon }] = await Promise.all([
      admin.from("tenants").select("id, nome").order("nome", { ascending: true }),
      admin.from("tenant_ai_subscription").select("tenant_id, active, monthly_token_quota, overage_allowed, trial_ends_at"),
      admin.from("ai_usage").select("tenant_id, input_tokens, output_tokens").gte("created_at", monthStartIso()),
      admin.from("billing_addons").select("id, name, description, amount_cents, currency, active").eq("id", "ia").maybeSingle(),
    ]);

    const usedByTenant = new Map<string, number>();
    for (const u of usage ?? []) {
      const prev = usedByTenant.get(u.tenant_id) ?? 0;
      usedByTenant.set(u.tenant_id, prev + (u.input_tokens ?? 0) + (u.output_tokens ?? 0));
    }
    const subByTenant = new Map<string, Record<string, unknown>>();
    for (const s of subs ?? []) subByTenant.set(s.tenant_id, s);

    const rows = (tenants ?? []).map((t: Record<string, unknown>) => {
      const sub = subByTenant.get(String(t.id));
      return {
        tenant_id: t.id,
        nome: t.nome,
        active: Boolean(sub?.active),
        monthly_token_quota: Number(sub?.monthly_token_quota ?? 0),
        overage_allowed: Boolean(sub?.overage_allowed),
        trial_ends_at: (sub?.trial_ends_at as string | null) ?? null,
        has_subscription: Boolean(sub),
        tokens_used: usedByTenant.get(String(t.id)) ?? 0,
      };
    });
    return jsonResponse({ tenants: rows, addon: addon ?? null });
  }

  if (request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "JSON inválido." }, 400);
    }
    if (String(body.intent ?? "") === "update_catalog") {
      const amountCents = Math.round(Number(body.amount_cents));
      if (!Number.isFinite(amountCents) || amountCents < 1) {
        return jsonResponse({ error: "Preco do add-on invalido." }, 400);
      }
      const { error } = await admin.from("billing_addons").update({
        amount_cents: amountCents,
        active: body.active !== false,
        updated_at: new Date().toISOString(),
      }).eq("id", "ia");
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ ok: true });
    }
    const tenantId = String(body.tenant_id ?? "").trim();
    if (!tenantId) return jsonResponse({ error: "tenant_id obrigatório." }, 400);

    const { data: before } = await admin
      .from("tenant_ai_subscription")
      .select("active, monthly_token_quota, overage_allowed, trial_ends_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const next = {
      active: Boolean(body.active),
      monthly_token_quota: Math.max(0, Math.floor(Number(body.monthly_token_quota ?? 0))),
      overage_allowed: Boolean(body.overage_allowed),
      trial_ends_at: body.trial_ends_at ? new Date(String(body.trial_ends_at)).toISOString() : null,
    };

    const { error } = await admin.from("tenant_ai_subscription").upsert(
      {
        tenant_id: tenantId,
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) return jsonResponse({ error: error.message }, 500);
    await recordPlatformAudit(admin, {
      tenantId,
      actor: { userId: ctx.userId, role: ctx.role },
      entityType: "tenant_ai_subscription",
      entityId: tenantId,
      summary: `Provisionamento de IA ${next.active ? "ativado" : "desativado"}`,
      changes: {
        active: { from: before?.active ?? null, to: next.active },
        monthly_token_quota: { from: before?.monthly_token_quota ?? null, to: next.monthly_token_quota },
        overage_allowed: { from: before?.overage_allowed ?? null, to: next.overage_allowed },
        trial_ends_at: { from: before?.trial_ends_at ?? null, to: next.trial_ends_at },
      },
      metadata: { source: "ai-admin" },
      request,
    });
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
});
