import { handleCors, jsonResponse } from "../_shared/http.ts";
import { abacatePayRequest } from "../_shared/abacatepay.ts";
import { PermissionDeniedError, requireTenantPermission } from "../_shared/supabase.ts";

type AbacateCheckout = {
  id: string;
  url: string;
  status: string;
  externalId?: string | null;
  customerId?: string | null;
  [key: string]: unknown;
};

type AbacatePlanChange = {
  id: string;
  subscriptionId: string;
  status: string;
  productId: string;
  requestedAt?: string;
  [key: string]: unknown;
};

function appUrl() {
  return (
    Deno.env.get("APP_SITE_URL")?.trim() ||
    Deno.env.get("PUBLIC_APP_URL")?.trim() ||
    "https://web-production-ee184.up.railway.app"
  ).replace(/\/+$/, "");
}

function addPeriod(from: Date, period: "monthly" | "yearly") {
  const next = new Date(from);
  if (period === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const { admin, tenantId, userId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Seu papel nao tem permissao para ativar a assinatura.",
    );
    const body = await request.json().catch(() => ({}));
    const intent = String(body.intent ?? "create");

    if (intent === "verify") {
      const { data: current } = await admin
        .from("billing_subscriptions")
        .select("pending_checkout_id, pending_plan_id, pending_billing_period")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!current?.pending_checkout_id) return jsonResponse({ active: false, status: "NOT_FOUND" });

      const rows = await abacatePayRequest<AbacateCheckout[]>(
        `/subscriptions/list?id=${encodeURIComponent(current.pending_checkout_id)}&limit=1`,
      );
      const checkout = rows.find((item) => item.id === current.pending_checkout_id);
      const paid = checkout && ["PAID", "ACTIVE", "COMPLETED"].includes(String(checkout.status).toUpperCase());
      if (!paid) return jsonResponse({ active: false, status: checkout?.status ?? "PENDING" });

      const now = new Date();
      const billingPeriod = current.pending_billing_period === "yearly" ? "yearly" : "monthly";
      const { error: activationError } = await admin.from("billing_subscriptions").update({
        plan_id: current.pending_plan_id,
        billing_period: billingPeriod,
        status: "active",
        trial_ends_at: null,
        current_period_start: now.toISOString(),
        current_period_end: addPeriod(now, billingPeriod).toISOString(),
        gateway_provider: "abacatepay",
        gateway_checkout_id: checkout.id,
        gateway_checkout_url: checkout.url,
        gateway_status: checkout.status,
        pending_plan_id: null,
        pending_billing_period: null,
        pending_gateway_product_id: null,
        pending_checkout_id: null,
        pending_checkout_url: null,
        pending_checkout_status: null,
        pending_metadata: {},
        updated_at: now.toISOString(),
      }).eq("tenant_id", tenantId);
      if (activationError) return jsonResponse({ error: activationError.message }, 500);
      return jsonResponse({ active: true, status: checkout.status });
    }

    if (intent === "cancel") {
      const { data: current, error: currentError } = await admin
        .from("billing_subscriptions")
        .select("status, gateway_provider, gateway_subscription_id")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (currentError) return jsonResponse({ error: currentError.message }, 500);
      if (!current) return jsonResponse({ error: "Assinatura nao encontrada." }, 404);
      if (current.status === "canceled") return jsonResponse({ canceled: true, status: "CANCELLED" });

      let gatewayStatus = "CANCELLED";
      if (current.gateway_subscription_id && current.gateway_provider === "abacatepay") {
        const canceled = await abacatePayRequest<{ status?: string }>("/subscriptions/cancel", {
          method: "POST",
          body: JSON.stringify({ id: current.gateway_subscription_id }),
        });
        gatewayStatus = String(canceled.status ?? "CANCELLED");
      }

      const { error: cancelError } = await admin.from("billing_subscriptions").update({
        status: "canceled",
        gateway_status: gatewayStatus,
        cancel_at_period_end: false,
        pending_plan_id: null,
        pending_billing_period: null,
        pending_gateway_product_id: null,
        pending_checkout_id: null,
        pending_checkout_url: null,
        pending_checkout_status: null,
        pending_change_id: null,
        pending_change_status: null,
        pending_effective_at: null,
        pending_metadata: {},
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", tenantId);
      if (cancelError) return jsonResponse({ error: cancelError.message }, 500);
      return jsonResponse({ canceled: true, status: gatewayStatus });
    }

    const planId = String(body.planId ?? "sistema").trim();
    const billingPeriod = body.billingPeriod === "yearly" ? "yearly" : "monthly";
    const { data: price, error: priceError } = await admin
      .from("billing_plan_prices")
      .select("gateway_product_id, amount_cents")
      .eq("plan_id", planId)
      .eq("billing_period", billingPeriod)
      .eq("active", true)
      .single();
    if (priceError || !price?.gateway_product_id) {
      return jsonResponse({ error: "Plano ainda nao sincronizado com a AbacatePay. Procure o suporte." }, 409);
    }

    const { data: current, error: currentError } = await admin
      .from("billing_subscriptions")
      .select("plan_id, status, billing_period, current_period_end, gateway_subscription_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (currentError) return jsonResponse({ error: currentError.message }, 500);
    if (!current) return jsonResponse({ error: "Assinatura local nao encontrada. Procure o suporte." }, 409);

    const changingPlan = current.plan_id !== planId || current.billing_period !== billingPeriod;
    if (current.status === "active" && current.gateway_subscription_id) {
      if (!changingPlan) {
        return jsonResponse({ error: "Este plano ja esta ativo para o periodo selecionado." }, 409);
      }

      const change = await abacatePayRequest<AbacatePlanChange>("/subscriptions/change-plan", {
        method: "POST",
        body: JSON.stringify({
          id: current.gateway_subscription_id,
          productId: price.gateway_product_id,
          quantity: 1,
        }),
      });
      const { error: changeError } = await admin.from("billing_subscriptions").update({
        pending_plan_id: planId,
        pending_billing_period: billingPeriod,
        pending_gateway_product_id: price.gateway_product_id,
        pending_change_id: change.id,
        pending_change_status: change.status || "PENDING",
        pending_effective_at: current.current_period_end,
        pending_metadata: { change },
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", tenantId);
      if (changeError) return jsonResponse({ error: changeError.message }, 500);

      return jsonResponse({
        mode: "scheduled_change",
        scheduled: true,
        effectiveAt: current.current_period_end,
        status: change.status || "PENDING",
      });
    }

    if (current.status === "active" || (current.status === "past_due" && current.gateway_subscription_id)) {
      return jsonResponse({
        error: "A assinatura precisa ser reconciliada com a AbacatePay antes de gerar outra cobranca.",
      }, 409);
    }

    const externalId = `${tenantId}:${planId}:${billingPeriod}:${crypto.randomUUID()}`;
    const site = appUrl();
    const checkout = await abacatePayRequest<AbacateCheckout>("/subscriptions/create", {
      method: "POST",
      body: JSON.stringify({
        items: [{ id: price.gateway_product_id, quantity: 1 }],
        methods: ["CARD"],
        externalId,
        returnUrl: `${site}/configuracoes?aba=plano`,
        completionUrl: `${site}/inbox?billing=success`,
        metadata: { tenant_id: tenantId, user_id: userId, plan_id: planId, billing_period: billingPeriod },
      }),
    });

    const { error: updateError } = await admin.from("billing_subscriptions").update({
      pending_plan_id: planId,
      pending_billing_period: billingPeriod,
      pending_gateway_product_id: price.gateway_product_id,
      pending_checkout_id: checkout.id,
      pending_checkout_url: checkout.url,
      pending_checkout_status: checkout.status,
      pending_metadata: { externalId, checkout },
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", tenantId);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);

    return jsonResponse({ mode: "checkout", checkoutId: checkout.id, checkoutUrl: checkout.url });
  } catch (error) {
    if (error instanceof PermissionDeniedError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao abrir checkout." }, 400);
  }
});
