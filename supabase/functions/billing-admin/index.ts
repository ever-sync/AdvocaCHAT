// Painel super-admin de billing: catálogo de planos + assinaturas por tenant.
// Protegido por platform_admins.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { recordPlatformAudit } from "../_shared/platform-audit.ts";
import { createAdminClient, requireTenantContext } from "../_shared/supabase.ts";
import {
  createAbacatePayProduct,
  deleteAbacatePayProduct,
  isAbacatePayConfigured,
  abacatePayRequest,
} from "../_shared/abacatepay.ts";

const METRICS = [
  "customers",
  "whatsapp_instances",
  "users",
  "marketing_flow_runs_monthly",
  "storage_gb",
] as const;

const ENTITLEMENT_KEYS = [...METRICS, "support", "custom_api"] as const;

const VALID_STATUS = new Set(["trialing", "active", "past_due", "paused", "canceled", "incomplete"]);
const VALID_PERIODS = new Set(["monthly", "yearly"]);
const VALID_PLAN_STATUS = new Set(["active", "archived"]);

type Metric = (typeof METRICS)[number];

type BillingSubscriptionRow = {
  tenant_id: string;
  plan_id: string;
  status: string;
  billing_period: string;
  current_period_end: string | null;
  gateway_provider: string | null;
  gateway_status: string | null;
  gateway_subscription_id: string | null;
};

type PlanPriceRow = {
  plan_id: string;
  billing_period: "monthly" | "yearly";
  currency: string;
  amount_cents: number;
  active: boolean;
  gateway_provider: string | null;
  gateway_product_id: string | null;
};

function addPeriod(from: Date, billingPeriod: string): Date {
  const next = new Date(from);
  if (billingPeriod === "yearly") {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

function normalizePlanId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseLimitValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim().toLowerCase() === "unlimited") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

function parseEntitlements(raw: unknown): Record<string, unknown> {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const key of ENTITLEMENT_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (key === "support") {
      const text = typeof value === "string" ? value.trim() : "";
      if (text) out[key] = text;
      continue;
    }
    if (key === "custom_api") {
      out[key] = value === true || value === "true" || value === 1 || value === "1";
      continue;
    }
    out[key] = parseLimitValue(value);
  }
  return out;
}

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === "string") {
      return raw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }
    return [];
  }
  return raw.map((item) => String(item).trim()).filter(Boolean).slice(0, 30);
}

function parsePriceCents(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

async function requirePlatformAdmin(request: Request) {
  const ctx = await requireTenantContext(request);
  const admin = createAdminClient();
  const { data: isAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!isAdmin) {
    throw new Error("Acesso restrito ao administrador da plataforma.");
  }

  return { ...ctx, admin };
}

async function getUsageForTenant(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
): Promise<Array<{ metric: Metric; used: number; limit_value: number | null }>> {
  const rows = await Promise.all(
    METRICS.map(async (metric) => {
      const [{ data: used, error: usedError }, { data: limit, error: limitError }] = await Promise.all([
        admin.rpc("get_tenant_current_usage", { p_tenant_id: tenantId, p_metric: metric }),
        admin.rpc("get_tenant_plan_limit", { p_tenant_id: tenantId, p_metric: metric }),
      ]);

      if (usedError) throw new Error(usedError.message);
      if (limitError) throw new Error(limitError.message);

      return {
        metric,
        used: Number(used ?? 0),
        limit_value: limit === null || limit === undefined ? null : Number(limit),
      };
    }),
  );

  return rows;
}

async function listPlanCatalog(admin: ReturnType<typeof createAdminClient>) {
  const [{ data: plans, error: plansError }, { data: prices, error: pricesError }] = await Promise.all([
    admin
      .from("billing_plans")
      .select("id, name, description, entitlements, features, status, sort_order, created_at, updated_at")
      .order("sort_order", { ascending: true }),
    admin
      .from("billing_plan_prices")
      .select("plan_id, billing_period, currency, amount_cents, active, gateway_provider, gateway_product_id"),
  ]);

  if (plansError) return jsonResponse({ error: plansError.message }, 500);
  if (pricesError) return jsonResponse({ error: pricesError.message }, 500);

  const pricesByPlan = new Map<string, Record<string, {
    currency: string;
    amount_cents: number;
    active: boolean;
    gateway_provider: string | null;
    gateway_product_id: string | null;
  }>>();
  for (const row of (prices ?? []) as PlanPriceRow[]) {
    const planId = String(row.plan_id);
    const bucket = pricesByPlan.get(planId) ?? {};
    bucket[String(row.billing_period)] = {
      currency: String(row.currency ?? "brl"),
      amount_cents: Number(row.amount_cents ?? 0),
      active: row.active !== false,
      gateway_provider: row.gateway_provider,
      gateway_product_id: row.gateway_product_id,
    };
    pricesByPlan.set(planId, bucket);
  }

  return jsonResponse({
    abacatepay_configured: isAbacatePayConfigured(),
    plans: (plans ?? []).map((plan: Record<string, unknown>) => {
      const id = String(plan.id);
      const planPrices = pricesByPlan.get(id) ?? {};
      return {
        id,
        name: String(plan.name ?? id),
        description: plan.description == null ? null : String(plan.description),
        entitlements: plan.entitlements ?? {},
        features: Array.isArray(plan.features) ? plan.features : [],
        status: String(plan.status ?? "active"),
        sort_order: Number(plan.sort_order ?? 0),
        created_at: String(plan.created_at ?? ""),
        updated_at: String(plan.updated_at ?? ""),
        prices: {
          monthly: planPrices.monthly ?? null,
          yearly: planPrices.yearly ?? null,
        },
      };
    }),
  });
}

async function createGatewayProducts(input: {
  planId: string;
  name: string;
  description: string | null;
  monthlyCents: number;
  yearlyCents: number;
  periods?: Array<"monthly" | "yearly">;
}) {
  if (!isAbacatePayConfigured()) {
    throw new Error("ABACATEPAY_API_KEY nao configurada nas Edge Functions.");
  }
  if (input.monthlyCents < 1 || input.yearlyCents < 1) {
    throw new Error("A AbacatePay exige precos maiores que zero.");
  }

  const created: Array<{ period: "monthly" | "yearly"; id: string }> = [];
  try {
    const periods = input.periods ?? ["monthly", "yearly"];
    if (periods.includes("monthly")) {
      const monthly = await createAbacatePayProduct({
        externalId: `wchat-${input.planId}-monthly`,
        name: `${input.name} - Mensal`,
        description: input.description,
        price: input.monthlyCents,
        cycle: "MONTHLY",
      });
      created.push({ period: "monthly", id: monthly.id });
    }

    if (periods.includes("yearly")) {
      const yearly = await createAbacatePayProduct({
        externalId: `wchat-${input.planId}-yearly`,
        name: `${input.name} - Anual`,
        description: input.description,
        price: input.yearlyCents,
        cycle: "ANNUALLY",
      });
      created.push({ period: "yearly", id: yearly.id });
    }
    return created;
  } catch (error) {
    await Promise.allSettled(created.map((product) => deleteAbacatePayProduct(product.id)));
    throw error;
  }
}

async function upsertPlanCatalog(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>,
  body: Record<string, unknown>,
  request: Request,
) {
  const planRaw = body.plan && typeof body.plan === "object" ? (body.plan as Record<string, unknown>) : {};
  const pricesRaw = body.prices && typeof body.prices === "object" ? (body.prices as Record<string, unknown>) : {};

  const planId = normalizePlanId(planRaw.id);
  const name = String(planRaw.name ?? "").trim();
  const description = String(planRaw.description ?? "").trim() || null;
  const sortOrder = Number(planRaw.sort_order ?? 0);
  const status = String(planRaw.status ?? "active").trim();

  if (!planId) return jsonResponse({ error: "ID do plano invalido." }, 400);
  if (!name) return jsonResponse({ error: "Nome do plano obrigatorio." }, 400);
  if (!VALID_PLAN_STATUS.has(status)) return jsonResponse({ error: "Status do plano invalido." }, 400);
  if (!Number.isFinite(sortOrder)) return jsonResponse({ error: "Ordem invalida." }, 400);

  const entitlements = parseEntitlements(planRaw.entitlements);
  const features = parseFeatures(planRaw.features);

  const monthlyCents = parsePriceCents(pricesRaw.monthly ?? pricesRaw.monthly_cents);
  const yearlyCents = parsePriceCents(pricesRaw.yearly ?? pricesRaw.yearly_cents);
  if (monthlyCents === null || yearlyCents === null) {
    return jsonResponse({ error: "Precos mensal e anual sao obrigatorios (em centavos)." }, 400);
  }

  const { data: before } = await admin
    .from("billing_plans")
    .select("id, name, description, entitlements, features, status, sort_order")
    .eq("id", planId)
    .maybeSingle();

  const { data: beforePrices, error: beforePricesError } = await admin
    .from("billing_plan_prices")
    .select("plan_id, billing_period, currency, amount_cents, active, gateway_provider, gateway_product_id")
    .eq("plan_id", planId);
  if (beforePricesError) return jsonResponse({ error: beforePricesError.message }, 500);

  const existingPrices = (beforePrices ?? []) as PlanPriceRow[];
  const existingMonthly = existingPrices.find((price) => price.billing_period === "monthly");
  const existingYearly = existingPrices.find((price) => price.billing_period === "yearly");
  const alreadyPartiallySynced = Boolean(existingMonthly?.gateway_product_id || existingYearly?.gateway_product_id);
  const alreadySynced = Boolean(existingMonthly?.gateway_product_id && existingYearly?.gateway_product_id);
  const gatewayFieldsChanged = Boolean(before) && (
    before.name !== name ||
    (before.description ?? null) !== description ||
    Number(existingMonthly?.amount_cents ?? -1) !== monthlyCents ||
    Number(existingYearly?.amount_cents ?? -1) !== yearlyCents
  );

  if (alreadyPartiallySynced && gatewayFieldsChanged) {
    return jsonResponse({
      error: "Nome, descricao e precos de um plano sincronizado nao podem ser alterados porque a AbacatePay nao oferece edicao de produtos. Arquive este plano e crie outro.",
    }, 409);
  }

  let createdGatewayProducts: Array<{ period: "monthly" | "yearly"; id: string }> = [];
  if (!alreadySynced) {
    try {
      createdGatewayProducts = await createGatewayProducts({
        planId,
        name,
        description,
        monthlyCents,
        yearlyCents,
        periods: ([
          !existingMonthly?.gateway_product_id ? "monthly" : null,
          !existingYearly?.gateway_product_id ? "yearly" : null,
        ].filter(Boolean) as Array<"monthly" | "yearly">),
      });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao criar produtos na AbacatePay." }, 502);
    }
  }

  const now = new Date().toISOString();
  const { error: planError } = await admin.from("billing_plans").upsert(
    {
      id: planId,
      name,
      description,
      sort_order: sortOrder,
      status,
      entitlements,
      features,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (planError) {
    await Promise.allSettled(createdGatewayProducts.map((product) => deleteAbacatePayProduct(product.id)));
    return jsonResponse({ error: planError.message }, 500);
  }

  for (const period of ["monthly", "yearly"] as const) {
    const amount = period === "monthly" ? monthlyCents : yearlyCents;
    const createdProduct = createdGatewayProducts.find((product) => product.period === period);
    const { error: priceError } = await admin.from("billing_plan_prices").upsert(
      {
        plan_id: planId,
        billing_period: period,
        currency: "brl",
        amount_cents: amount,
        active: status === "active",
        ...(createdProduct ? { gateway_provider: "abacatepay", gateway_product_id: createdProduct.id } : {}),
        updated_at: now,
      },
      { onConflict: "plan_id,billing_period" },
    );
    if (priceError) {
      await Promise.allSettled(createdGatewayProducts.map((product) => deleteAbacatePayProduct(product.id)));
      if (!before) {
        await admin.from("billing_plans").delete().eq("id", planId);
      } else if (createdGatewayProducts.length > 0) {
        for (const product of createdGatewayProducts) {
          await admin
            .from("billing_plan_prices")
            .update({ gateway_provider: null, gateway_product_id: null, updated_at: new Date().toISOString() })
            .eq("plan_id", planId)
            .eq("billing_period", product.period);
        }
      }
      return jsonResponse({ error: priceError.message }, 500);
    }
  }

  await admin.rpc("refresh_current_billing_usage", { p_tenant_id: null });
  await recordPlatformAudit(admin, {
    tenantId: ctx.tenantId,
    actor: { userId: ctx.userId, role: ctx.role },
    entityType: "billing_plan",
    entityId: planId,
    summary: before ? `Plano ${planId} atualizado` : `Plano ${planId} criado`,
    changes: {
      name: { from: before?.name ?? null, to: name },
      status: { from: before?.status ?? null, to: status },
      sort_order: { from: before?.sort_order ?? null, to: sortOrder },
      entitlements: { from: before?.entitlements ?? null, to: entitlements },
    },
    metadata: {
      source: "billing-admin",
      intent: "upsert_plan",
      abacatepay_products: createdGatewayProducts,
    },
    request,
  });

  return jsonResponse({ ok: true, plan_id: planId });
}

async function deletePlanCatalog(
  admin: ReturnType<typeof createAdminClient>,
  ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>,
  body: Record<string, unknown>,
  request: Request,
) {
  const planId = normalizePlanId(body.plan_id);
  if (!planId) return jsonResponse({ error: "ID do plano invalido." }, 400);

  const [{ data: plan, error: planError }, { data: prices, error: pricesError }, { count, error: subsError }] = await Promise.all([
    admin.from("billing_plans").select("id, name, status").eq("id", planId).maybeSingle(),
    admin
      .from("billing_plan_prices")
      .select("plan_id, billing_period, currency, amount_cents, active, gateway_provider, gateway_product_id")
      .eq("plan_id", planId),
    admin.from("billing_subscriptions").select("tenant_id", { count: "exact", head: true }).eq("plan_id", planId),
  ]);

  if (planError) return jsonResponse({ error: planError.message }, 500);
  if (pricesError) return jsonResponse({ error: pricesError.message }, 500);
  if (subsError) return jsonResponse({ error: subsError.message }, 500);
  if (!plan) return jsonResponse({ error: "Plano nao encontrado." }, 404);
  if ((count ?? 0) > 0) {
    return jsonResponse({ error: `O plano possui ${count} assinatura(s). Arquive-o em vez de excluir.` }, 409);
  }

  const gatewayPrices = ((prices ?? []) as PlanPriceRow[]).filter((price) => price.gateway_product_id);
  if (gatewayPrices.length > 0 && !isAbacatePayConfigured()) {
    return jsonResponse({ error: "ABACATEPAY_API_KEY nao configurada; nao e seguro excluir apenas o plano local." }, 503);
  }

  for (const price of gatewayPrices) {
    try {
      await deleteAbacatePayProduct(price.gateway_product_id!);
      const { error: unlinkError } = await admin
        .from("billing_plan_prices")
        .update({ gateway_product_id: null, updated_at: new Date().toISOString() })
        .eq("plan_id", planId)
        .eq("billing_period", price.billing_period);
      if (unlinkError) return jsonResponse({ error: unlinkError.message }, 500);
    } catch (error) {
      if (error instanceof Error && error.message.includes("AbacatePay 404")) {
        const { error: unlinkError } = await admin
          .from("billing_plan_prices")
          .update({ gateway_product_id: null, updated_at: new Date().toISOString() })
          .eq("plan_id", planId)
          .eq("billing_period", price.billing_period);
        if (unlinkError) return jsonResponse({ error: unlinkError.message }, 500);
        continue;
      }
      return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao excluir produto na AbacatePay." }, 502);
    }
  }

  const { error: deleteError } = await admin.from("billing_plans").delete().eq("id", planId);
  if (deleteError) return jsonResponse({ error: deleteError.message }, 500);

  await recordPlatformAudit(admin, {
    tenantId: ctx.tenantId,
    actor: { userId: ctx.userId, role: ctx.role },
    entityType: "billing_plan",
    entityId: planId,
    summary: `Plano ${planId} excluido`,
    changes: { deleted: { from: plan, to: null } },
    metadata: { source: "billing-admin", intent: "delete_plan" },
    request,
  });

  return jsonResponse({ ok: true, plan_id: planId });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  let ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    ctx = await requirePlatformAdmin(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized.";
    return jsonResponse({ error: message }, message.includes("restrito") ? 403 : 401);
  }

  const { admin } = ctx;
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.searchParams.get("view") === "catalog") {
      return await listPlanCatalog(admin);
    }

    const [{ data: tenants, error: tenantsError }, { data: subs, error: subsError }, { data: plans, error: plansError }] =
      await Promise.all([
        admin.from("tenants").select("id, nome, created_at").order("nome", { ascending: true }),
        admin
          .from("billing_subscriptions")
          .select("tenant_id, plan_id, status, billing_period, current_period_end, gateway_provider, gateway_status, gateway_subscription_id"),
        admin.from("billing_plans").select("id, name, description, entitlements, features, status").eq("status", "active").order("sort_order"),
      ]);

    if (tenantsError) return jsonResponse({ error: tenantsError.message }, 500);
    if (subsError) return jsonResponse({ error: subsError.message }, 500);
    if (plansError) return jsonResponse({ error: plansError.message }, 500);

    const subByTenant = new Map<string, BillingSubscriptionRow>();
    for (const sub of (subs ?? []) as BillingSubscriptionRow[]) {
      subByTenant.set(sub.tenant_id, sub);
    }

    const rows = await Promise.all(
      (tenants ?? []).map(async (tenant: Record<string, unknown>) => {
        const tenantId = String(tenant.id);
        const usage = await getUsageForTenant(admin, tenantId);
        const exceeded = usage.filter((row) => row.limit_value !== null && row.used > row.limit_value);

        return {
          tenant_id: tenantId,
          nome: String(tenant.nome ?? "Sem nome"),
          created_at: String(tenant.created_at ?? ""),
          subscription: subByTenant.get(tenantId) ?? null,
          usage,
          exceeded_metrics: exceeded.map((row) => row.metric),
        };
      }),
    );

    return jsonResponse({
      plans: (plans ?? []).map((plan: Record<string, unknown>) => ({
        id: String(plan.id),
        name: String(plan.name ?? plan.id),
        description: plan.description == null ? null : String(plan.description),
        entitlements: plan.entitlements ?? {},
        features: plan.features ?? [],
      })),
      tenants: rows,
    });
  }

  if (request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "JSON invalido." }, 400);
    }

    const intent = String(body.intent ?? "set_tenant_plan").trim().toLowerCase();
    if (intent === "upsert_plan") {
      return await upsertPlanCatalog(admin, ctx, body, request);
    }
    if (intent === "delete_plan") {
      return await deletePlanCatalog(admin, ctx, body, request);
    }

    const tenantId = String(body.tenant_id ?? "").trim();
    const planId = String(body.plan_id ?? "").trim();
    const status = String(body.status ?? "active").trim();
    const billingPeriod = String(body.billing_period ?? "monthly").trim();
    const reason = String(body.reason ?? "").trim();

    if (!tenantId) return jsonResponse({ error: "tenant_id obrigatorio." }, 400);
    if (!planId) return jsonResponse({ error: "plan_id obrigatorio." }, 400);
    if (!VALID_STATUS.has(status)) return jsonResponse({ error: "Status invalido." }, 400);
    if (!VALID_PERIODS.has(billingPeriod)) return jsonResponse({ error: "Periodo invalido." }, 400);
    if (reason.length < 5) return jsonResponse({ error: "Informe o motivo da alteracao (minimo 5 caracteres)." }, 400);

    const { data: planExists, error: planExistsError } = await admin
      .from("billing_plans")
      .select("id")
      .eq("id", planId)
      .eq("status", "active")
      .maybeSingle();
    if (planExistsError) return jsonResponse({ error: planExistsError.message }, 500);
    if (!planExists) return jsonResponse({ error: "Plano nao encontrado ou inativo." }, 400);

    const { data: before } = await admin
      .from("billing_subscriptions")
      .select("tenant_id, plan_id, status, billing_period, trial_ends_at, current_period_start, current_period_end, gateway_provider, gateway_subscription_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const now = new Date();
    const periodEnd = addPeriod(now, billingPeriod);

    if (before?.gateway_provider === "abacatepay" && before.gateway_subscription_id) {
      if (status === "trialing") {
        return jsonResponse({ error: "Uma assinatura vinculada ao gateway nao pode voltar para trial." }, 409);
      }
      if (status === "active" && before.status !== "active" && before.plan_id === planId && before.billing_period === billingPeriod) {
        return jsonResponse({ error: "A reativacao deve vir da confirmacao de pagamento da AbacatePay." }, 409);
      }
      if (status === "canceled") {
        await abacatePayRequest("/subscriptions/cancel", {
          method: "POST",
          body: JSON.stringify({ id: before.gateway_subscription_id }),
        });
      } else if (status === "active" && (before.plan_id !== planId || before.billing_period !== billingPeriod)) {
        const { data: price, error: priceError } = await admin
          .from("billing_plan_prices")
          .select("gateway_product_id")
          .eq("plan_id", planId)
          .eq("billing_period", billingPeriod)
          .eq("active", true)
          .maybeSingle();
        if (priceError) return jsonResponse({ error: priceError.message }, 500);
        if (!price?.gateway_product_id) return jsonResponse({ error: "Plano nao sincronizado com a AbacatePay." }, 409);

        const change = await abacatePayRequest<{ id: string; status?: string }>("/subscriptions/change-plan", {
          method: "POST",
          body: JSON.stringify({ id: before.gateway_subscription_id, productId: price.gateway_product_id, quantity: 1 }),
        });
        const { error: pendingError } = await admin.from("billing_subscriptions").update({
          pending_plan_id: planId,
          pending_billing_period: billingPeriod,
          pending_gateway_product_id: price.gateway_product_id,
          pending_change_id: change.id,
          pending_change_status: change.status ?? "PENDING",
          pending_effective_at: before.current_period_end,
          pending_metadata: { source: "billing-admin", reason, updated_by: ctx.userId, change },
          updated_at: now.toISOString(),
        }).eq("tenant_id", tenantId);
        if (pendingError) return jsonResponse({ error: pendingError.message }, 500);

        await recordPlatformAudit(admin, {
          tenantId,
          actor: { userId: ctx.userId, role: ctx.role },
          entityType: "billing_subscription",
          entityId: tenantId,
          summary: `Mudanca agendada para ${planId} (${billingPeriod})`,
          changes: { pending_plan_id: { from: null, to: planId }, pending_billing_period: { from: null, to: billingPeriod } },
          metadata: { source: "billing-admin", reason, gateway_synced: true },
          request,
        });
        return jsonResponse({ ok: true, scheduled: true, effective_at: before.current_period_end });
      }
    }

    const nextTrialEnd = status === "trialing"
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const nextPeriodStart = ["active", "trialing"].includes(status)
      ? now.toISOString()
      : before?.current_period_start ?? null;
    const nextPeriodEnd = status === "trialing"
      ? nextTrialEnd
      : status === "active"
        ? periodEnd.toISOString()
        : before?.current_period_end ?? null;

    const { error: upsertError } = await admin.from("billing_subscriptions").upsert(
      {
        tenant_id: tenantId,
        plan_id: planId,
        status,
        billing_period: billingPeriod,
        trial_ends_at: nextTrialEnd,
        current_period_start: nextPeriodStart,
        current_period_end: nextPeriodEnd,
        cancel_at_period_end: false,
        metadata: {
          manual_update: true,
          updated_by: ctx.userId,
          updated_at: now.toISOString(),
          reason,
        },
        updated_at: now.toISOString(),
      },
      { onConflict: "tenant_id" },
    );

    if (upsertError) return jsonResponse({ error: upsertError.message }, 500);

    await admin.from("profiles").update({ plano: planId }).eq("tenant_id", tenantId);
    await admin.rpc("refresh_current_billing_usage", { p_tenant_id: tenantId });
    await recordPlatformAudit(admin, {
      tenantId,
      actor: { userId: ctx.userId, role: ctx.role },
      entityType: "billing_subscription",
      entityId: tenantId,
      summary: `Plano alterado para ${planId} (${status}, ${billingPeriod})`,
      changes: {
        plan_id: { from: before?.plan_id ?? null, to: planId },
        status: { from: before?.status ?? null, to: status },
        billing_period: { from: before?.billing_period ?? null, to: billingPeriod },
        current_period_end: { from: before?.current_period_end ?? null, to: nextPeriodEnd },
      },
      metadata: { source: "billing-admin", reason, gateway_synced: status === "canceled" && before?.gateway_provider === "abacatepay" },
      request,
    });

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed." }, 405);
});
