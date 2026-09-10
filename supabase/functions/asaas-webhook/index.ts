import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  extractTenantIdFromExternalReference,
  getAsaasWebhookToken,
  type AsaasWebhookPayload,
} from "../_shared/asaas.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

function resolveCheckoutId(payload: AsaasWebhookPayload) {
  return payload.checkout?.id ?? null;
}

function resolveSubscriptionId(payload: AsaasWebhookPayload) {
  const checkoutSubscription = payload.checkout?.subscription;
  if (typeof checkoutSubscription === "string") return checkoutSubscription;
  return payload.subscription?.id ?? checkoutSubscription?.id ?? payload.payment?.subscription ?? null;
}

function resolvePaymentId(payload: AsaasWebhookPayload) {
  return payload.payment?.id ?? null;
}

function resolveExternalReference(payload: AsaasWebhookPayload) {
  return (
    payload.payment?.externalReference ??
    payload.subscription?.externalReference ??
    payload.checkout?.externalReference ??
    null
  );
}

function mapSubscriptionStatus(event: string, payload: AsaasWebhookPayload) {
  if (event === "CHECKOUT_PAID") return "active";
  if (event === "SUBSCRIPTION_CREATED" || event === "SUBSCRIPTION_UPDATED") {
    return payload.subscription?.status === "ACTIVE" ? "active" : "paused";
  }
  if (event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED") return "canceled";
  if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED") return "past_due";
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") return "active";
  if (event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") return "canceled";
  return null;
}

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) return corsResponse;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const expectedToken = getAsaasWebhookToken();
  const providedToken =
    request.headers.get("asaas-access-token") ??
    request.headers.get("asaas_access_token") ??
    "";

  if (expectedToken && !timingSafeEqual(expectedToken, providedToken)) {
    return jsonResponse({ error: "Invalid webhook token." }, 401);
  }

  const admin = createAdminClient();
  const payload = (await request.json().catch(() => ({}))) as AsaasWebhookPayload;
  const eventId = String(payload.id ?? crypto.randomUUID());
  const eventType = String(payload.event ?? "UNKNOWN");
  const checkoutId = resolveCheckoutId(payload);
  const subscriptionId = resolveSubscriptionId(payload);
  const paymentId = resolvePaymentId(payload);
  let tenantId = extractTenantIdFromExternalReference(resolveExternalReference(payload));

  if (!tenantId && checkoutId) {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("tenant_id")
      .eq("gateway_provider", "asaas")
      .eq("gateway_checkout_id", checkoutId)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }

  if (!tenantId && subscriptionId) {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("tenant_id")
      .eq("gateway_provider", "asaas")
      .eq("gateway_subscription_id", subscriptionId)
      .maybeSingle();
    tenantId = data?.tenant_id ?? null;
  }

  const { error: eventError } = await admin
    .from("billing_gateway_events")
    .upsert(
      {
        provider: "asaas",
        event_id: eventId,
        event_type: eventType,
        tenant_id: tenantId,
        checkout_id: checkoutId,
        subscription_id: subscriptionId,
        payment_id: paymentId,
        raw_payload: payload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "provider,event_id" },
    );

  if (eventError) {
    return jsonResponse({ error: eventError.message }, 500);
  }

  const nextStatus = mapSubscriptionStatus(eventType, payload);
  if (tenantId && nextStatus) {
    await admin
      .from("billing_subscriptions")
      .update({
        status: nextStatus,
        gateway_provider: "asaas",
        gateway_customer_id:
          payload.payment?.customer ?? payload.subscription?.customer ?? payload.checkout?.customer ?? undefined,
        gateway_subscription_id: subscriptionId ?? undefined,
        gateway_checkout_id: checkoutId ?? undefined,
        gateway_payment_id: paymentId ?? undefined,
        gateway_checkout_url: payload.checkout?.link ?? undefined,
        gateway_invoice_url: payload.payment?.invoiceUrl ?? undefined,
        gateway_status: payload.payment?.status ?? payload.subscription?.status ?? payload.checkout?.status ?? eventType,
        current_period_end: payload.subscription?.nextDueDate ?? undefined,
        gateway_metadata: payload,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId);
  }

  return jsonResponse({ ok: true });
});
