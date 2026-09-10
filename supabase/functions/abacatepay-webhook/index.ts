import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";

const ABACATEPAY_PUBLIC_HMAC_KEY = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

type WebhookPayload = {
  id?: string;
  event?: string;
  data?: {
    subscription?: { id?: string; status?: string; frequency?: string; [key: string]: unknown };
    checkout?: { id?: string; status?: string; url?: string; [key: string]: unknown };
    payment?: { id?: string; status?: string };
    subscriptionUpdate?: { id?: string; status?: string; productId?: string; [key: string]: unknown };
  };
  [key: string]: unknown;
};

async function validHmac(rawBody: string, signature: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ABACATEPAY_PUBLIC_HMAC_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return timingSafeEqual(expected, signature);
}

function nextPeriod(from: Date, period: string) {
  const next = new Date(from);
  if (period === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const expectedSecret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET")?.trim() ?? "";
  const suppliedSecret = new URL(request.url).searchParams.get("webhookSecret") ?? "";
  if (!expectedSecret || !timingSafeEqual(expectedSecret, suppliedSecret)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature") ?? "";
  if (!signature || !(await validHmac(rawBody, signature))) {
    return jsonResponse({ error: "Invalid signature." }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  const eventId = String(payload.id ?? "").trim();
  const eventType = String(payload.event ?? "").trim();
  if (!eventId || !eventType) return jsonResponse({ error: "Invalid event." }, 400);

  const admin = createAdminClient();
  const checkoutId = payload.data?.checkout?.id ?? null;
  const subscriptionId = payload.data?.subscription?.id ?? null;
  const paymentId = payload.data?.payment?.id ?? null;
  const { error: insertError } = await admin.from("billing_gateway_events").insert({
    provider: "abacatepay",
    event_id: eventId,
    event_type: eventType,
    checkout_id: checkoutId,
    subscription_id: subscriptionId,
    payment_id: paymentId,
    raw_payload: payload,
  });
  if (insertError?.code === "23505") return jsonResponse({ ok: true, duplicate: true });
  if (insertError) return jsonResponse({ error: insertError.message }, 500);

  let row: {
    tenant_id: string;
    plan_id: string;
    billing_period: string;
    current_period_end: string | null;
    pending_plan_id: string | null;
    pending_billing_period: string | null;
    pending_effective_at: string | null;
  } | null = null;
  const rowFields = "tenant_id, plan_id, billing_period, current_period_end, pending_plan_id, pending_billing_period, pending_effective_at";
  if (checkoutId) {
    const result = await admin.from("billing_subscriptions").select(rowFields).or(`pending_checkout_id.eq.${checkoutId},gateway_checkout_id.eq.${checkoutId}`).maybeSingle();
    row = result.data;
  }
  if (!row && subscriptionId) {
    const result = await admin.from("billing_subscriptions").select(rowFields).eq("gateway_subscription_id", subscriptionId).maybeSingle();
    row = result.data;
  }
  if (!row) return jsonResponse({ ok: true, ignored: true });

  const now = new Date();
  const updates: Record<string, unknown> = {
    gateway_provider: "abacatepay",
    gateway_status: payload.data?.subscription?.status ?? eventType,
    updated_at: now.toISOString(),
  };
  if (subscriptionId) updates.gateway_subscription_id = subscriptionId;
  if (paymentId) updates.gateway_payment_id = paymentId;
  if (["subscription.completed", "subscription.renewed"].includes(eventType)) {
    const applyingPendingPlan = Boolean(row.pending_plan_id)
      && (eventType === "subscription.completed"
        || !row.pending_effective_at
        || new Date(row.pending_effective_at).getTime() <= now.getTime());
    const billingPeriod = applyingPendingPlan
      ? (row.pending_billing_period === "yearly" ? "yearly" : "monthly")
      : row.billing_period;
    const base = eventType === "subscription.renewed" && row.current_period_end && new Date(row.current_period_end) > now
      ? new Date(row.current_period_end)
      : now;
    updates.status = "active";
    updates.trial_ends_at = null;
    updates.current_period_start = now.toISOString();
    updates.current_period_end = nextPeriod(base, billingPeriod).toISOString();
    updates.gateway_checkout_id = checkoutId ?? undefined;
    updates.gateway_checkout_url = payload.data?.checkout?.url ?? undefined;
    if (applyingPendingPlan) {
      updates.plan_id = row.pending_plan_id;
      updates.billing_period = billingPeriod;
      updates.pending_plan_id = null;
      updates.pending_billing_period = null;
      updates.pending_gateway_product_id = null;
      updates.pending_checkout_id = null;
      updates.pending_checkout_url = null;
      updates.pending_checkout_status = null;
      updates.pending_change_id = null;
      updates.pending_change_status = null;
      updates.pending_effective_at = null;
      updates.pending_metadata = {};
    }
  } else if (eventType === "subscription.cancelled") {
    updates.status = "canceled";
    updates.pending_plan_id = null;
    updates.pending_billing_period = null;
    updates.pending_change_id = null;
    updates.pending_change_status = null;
    updates.pending_effective_at = null;
  } else if (eventType === "subscription.payment_failed") {
    updates.status = "past_due";
  } else if (eventType === "subscription.plan_changed") {
    updates.pending_change_status = payload.data?.subscriptionUpdate?.status ?? "PENDING";
    updates.pending_metadata = { event: payload.data };
  }

  const { error: updateError } = await admin.from("billing_subscriptions").update(updates).eq("tenant_id", row.tenant_id);
  if (updateError) return jsonResponse({ error: updateError.message }, 500);
  await admin.from("billing_gateway_events").update({ tenant_id: row.tenant_id, processed_at: now.toISOString() }).eq("provider", "abacatepay").eq("event_id", eventId);
  return jsonResponse({ ok: true });
});
