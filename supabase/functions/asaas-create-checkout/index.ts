import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import {
  asaasRequest,
  extractAsaasSubscriptionId,
  type AsaasCheckoutResponse,
} from "../_shared/asaas.ts";

type BillingPeriod = "monthly" | "yearly";

function normalizeBillingPeriod(value: unknown): BillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

function asaasCycle(period: BillingPeriod) {
  return period === "yearly" ? "YEARLY" : "MONTHLY";
}

function appUrl() {
  return (
    Deno.env.get("APP_SITE_URL")?.trim() ||
    Deno.env.get("PUBLIC_APP_URL")?.trim() ||
    Deno.env.get("VITE_APP_URL")?.trim() ||
    "https://wchat.digital"
  ).replace(/\/+$/, "");
}

function checkoutUrlFromResponse(response: AsaasCheckoutResponse) {
  return response.link ?? response.url ?? null;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { admin, tenantId, userId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Seu papel nao tem permissao para gerenciar assinatura.",
    );

    const body = await request.json().catch(() => ({}));
    const requestedPlanId = String(body.planId ?? "").trim();
    const billingPeriod = normalizeBillingPeriod(body.billingPeriod);
    const billingTypes = Array.isArray(body.billingTypes) && body.billingTypes.length > 0
      ? body.billingTypes.map(String)
      : ["CREDIT_CARD"];

    const { data: currentSubscription } = await admin
      .from("billing_subscriptions")
      .select("plan_id, billing_period")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const planId = requestedPlanId || currentSubscription?.plan_id || "profissional";

    const { data: plan, error: planError } = await admin
      .from("billing_plans")
      .select("id, name, description")
      .eq("id", planId)
      .eq("status", "active")
      .single();

    if (planError || !plan) {
      throw new Error(planError?.message ?? "Plano nao encontrado.");
    }

    const { data: price, error: priceError } = await admin
      .from("billing_plan_prices")
      .select("amount_cents, currency")
      .eq("plan_id", planId)
      .eq("billing_period", billingPeriod)
      .eq("active", true)
      .single();

    if (priceError || !price) {
      throw new Error(priceError?.message ?? "Preco do plano nao encontrado.");
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("nome, email, call_phone")
      .eq("id", userId)
      .maybeSingle();

    const site = appUrl();
    const externalReference = `${tenantId}:${planId}:${billingPeriod}:${crypto.randomUUID()}`;
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);

    const checkout = await asaasRequest<AsaasCheckoutResponse>("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        billingTypes,
        chargeTypes: ["RECURRENT"],
        minutesToExpire: 1440,
        externalReference,
        callback: {
          successUrl: `${site}/configuracoes?aba=plano&billing=success`,
          cancelUrl: `${site}/configuracoes?aba=plano&billing=cancel`,
          expiredUrl: `${site}/configuracoes?aba=plano&billing=expired`,
        },
        items: [
          {
            name: `WChat ${plan.name}`,
            description: plan.description ?? `Assinatura WChat ${plan.name}`,
            quantity: 1,
            value: Number(price.amount_cents) / 100,
          },
        ],
        customerData: {
          name: profile?.nome || undefined,
          email: profile?.email || undefined,
          phone: profile?.call_phone || undefined,
        },
        subscription: {
          cycle: asaasCycle(billingPeriod),
          nextDueDate: nextDueDate.toISOString().slice(0, 10),
        },
      }),
    });

    const checkoutId = checkout.id ?? null;
    const checkoutUrl = checkoutUrlFromResponse(checkout);
    const gatewaySubscriptionId = extractAsaasSubscriptionId(checkout.subscription);

    const { error: updateError } = await admin
      .from("billing_subscriptions")
      .upsert(
        {
          tenant_id: tenantId,
          plan_id: planId,
          status: "incomplete",
          billing_period: billingPeriod,
          gateway_provider: "asaas",
          gateway_checkout_id: checkoutId,
          gateway_checkout_url: checkoutUrl,
          gateway_subscription_id: gatewaySubscriptionId,
          gateway_status: checkout.status ?? "CHECKOUT_CREATED",
          gateway_metadata: {
            externalReference,
            checkout,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );

    if (updateError) {
      throw new Error(updateError.message);
    }

    return jsonResponse({
      checkoutId,
      checkoutUrl,
      gatewaySubscriptionId,
      raw: checkout,
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
