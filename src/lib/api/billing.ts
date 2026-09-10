import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type BillingPeriod = "monthly" | "yearly";
export type BillingStatus = "trialing" | "active" | "past_due" | "paused" | "canceled" | "incomplete";

export type BillingPlan = {
  id: string;
  name: string;
  description: string | null;
  entitlements: Record<string, unknown>;
  features: string[];
};

export type BillingPlanCatalogItem = BillingPlan & {
  sort_order: number;
  prices: Record<BillingPeriod, BillingPrice | null>;
};

export type BillingPrice = {
  billing_period: BillingPeriod;
  currency: string;
  amount_cents: number;
};

export type BillingSubscription = {
  tenant_id: string;
  plan_id: string;
  status: BillingStatus;
  billing_period: BillingPeriod;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  gateway_provider: "asaas" | string;
  gateway_customer_id: string | null;
  gateway_subscription_id: string | null;
  gateway_checkout_id: string | null;
  gateway_checkout_url: string | null;
  gateway_invoice_url: string | null;
  gateway_status: string | null;
  pending_plan_id: string | null;
  pending_billing_period: BillingPeriod | null;
  pending_checkout_id: string | null;
  pending_checkout_url: string | null;
  pending_checkout_status: string | null;
  pending_change_id: string | null;
  pending_change_status: string | null;
  pending_effective_at: string | null;
  plan: BillingPlan;
  pending_plan: BillingPlan | null;
  price: BillingPrice | null;
};

export type BillingAccess = {
  allowed: boolean;
  reason: string;
  status: BillingStatus | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export type BillingUsageCounter = {
  metric: string;
  used: number;
  limit_value: number | null;
  period_start: string;
  period_end: string;
};

export type BillingSnapshot = {
  subscription: BillingSubscription | null;
  access: BillingAccess | null;
  usage: BillingUsageCounter[];
};

export type BillingPlansCatalog = BillingPlanCatalogItem[];

export type BillingAddon = {
  id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  active: boolean;
};

export type CreateAbacatePayCheckoutResult =
  | { mode: "checkout"; checkoutId: string; checkoutUrl: string }
  | { mode: "scheduled_change"; scheduled: true; effectiveAt: string | null; status: string };

const DEFAULT_SNAPSHOT: BillingSnapshot = {
  subscription: null,
  access: null,
  usage: [],
};

export const billingSnapshotQueryKey = ["billing", "snapshot"] as const;
export const billingPlansCatalogQueryKey = ["billing", "plans"] as const;
export const billingAddonsQueryKey = ["billing", "addons"] as const;

function normalizeSnapshot(value: unknown): BillingSnapshot {
  if (!value || typeof value !== "object") return DEFAULT_SNAPSHOT;
  const raw = value as Partial<BillingSnapshot>;
  return {
    subscription: raw.subscription ?? null,
    access: raw.access ?? null,
    usage: Array.isArray(raw.usage) ? raw.usage : [],
  };
}

export async function getTenantBillingSnapshot(): Promise<BillingSnapshot> {
  if (!isSupabaseConfigured) return DEFAULT_SNAPSHOT;

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_tenant_billing_snapshot");
  if (error) {
    throw new Error(error.message);
  }

  return normalizeSnapshot(data);
}

export async function getBillingPlansCatalog(): Promise<BillingPlansCatalog> {
  if (!isSupabaseConfigured) return [];

  const client = requireSupabase();

  const [plansRes, pricesRes] = await Promise.all([
    client.from("billing_plans").select("id, name, description, entitlements, features, sort_order, status").eq("status", "active").order("sort_order"),
    client.from("billing_plan_prices").select("plan_id, billing_period, currency, amount_cents, active").eq("active", true),
  ]);

  if (plansRes.error) throw new Error(plansRes.error.message);
  if (pricesRes.error) throw new Error(pricesRes.error.message);

  const pricesByPlan = new Map<string, Partial<Record<BillingPeriod, BillingPrice>>>();
  for (const price of pricesRes.data ?? []) {
    const billingPeriod = price.billing_period as BillingPeriod;
    const current = pricesByPlan.get(price.plan_id) ?? {};
    current[billingPeriod] = {
      billing_period: billingPeriod,
      currency: String(price.currency ?? "BRL"),
      amount_cents: Number(price.amount_cents ?? 0),
    };
    pricesByPlan.set(price.plan_id, current);
  }

  return (plansRes.data ?? []).map((plan) => ({
    id: String(plan.id),
    name: String(plan.name ?? plan.id),
    description: plan.description == null ? null : String(plan.description),
    entitlements: (plan.entitlements as Record<string, unknown>) ?? {},
    features: Array.isArray(plan.features) ? (plan.features as string[]) : [],
    sort_order: Number(plan.sort_order ?? 0),
    prices: {
      monthly: pricesByPlan.get(String(plan.id))?.monthly ?? null,
      yearly: pricesByPlan.get(String(plan.id))?.yearly ?? null,
    },
  }));
}

export function useTenantBillingSnapshot(
  options?: Omit<UseQueryOptions<BillingSnapshot, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<BillingSnapshot, Error>({
    queryKey: billingSnapshotQueryKey,
    queryFn: getTenantBillingSnapshot,
    enabled: isSupabaseConfigured && (options?.enabled ?? true),
    staleTime: 60_000,
    ...options,
  });
}

export function useBillingPlansCatalog(
  options?: Omit<UseQueryOptions<BillingPlansCatalog, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<BillingPlansCatalog, Error>({
    queryKey: billingPlansCatalogQueryKey,
    queryFn: getBillingPlansCatalog,
    staleTime: 5 * 60 * 1000,
    retry: false,
    ...options,
  });
}

export function useBillingAddons() {
  return useQuery<BillingAddon[], Error>({
    queryKey: billingAddonsQueryKey,
    queryFn: async () => {
      const client = requireSupabase();
      const { data, error } = await client.from("billing_addons").select("id, name, description, amount_cents, currency, active").eq("active", true);
      if (error) throw new Error(error.message);
      return (data ?? []) as BillingAddon[];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export async function createAbacatePayCheckout(input: { planId: string; billingPeriod: BillingPeriod }) {
  return invokeAuthedFunction<CreateAbacatePayCheckoutResult>("abacatepay-create-checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function verifyAbacatePayCheckout() {
  return invokeAuthedFunction<{ active: boolean; status: string }>("abacatepay-create-checkout", {
    method: "POST",
    body: JSON.stringify({ intent: "verify" }),
  });
}

export async function cancelAbacatePaySubscription() {
  return invokeAuthedFunction<{ canceled: boolean; status: string }>("abacatepay-create-checkout", {
    method: "POST",
    body: JSON.stringify({ intent: "cancel" }),
  });
}
