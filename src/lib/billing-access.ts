import type { BillingSubscription } from "@/lib/api/billing";

type AccessSubscription = Pick<BillingSubscription, "status" | "trial_ends_at" | "current_period_end"> | null | undefined;

export function isBillingAccessAllowed(subscription: AccessSubscription, now = Date.now()): boolean {
  if (!subscription) return false;
  if (subscription.status === "trialing") {
    return Boolean(subscription.trial_ends_at)
      && new Date(subscription.trial_ends_at as string).getTime() > now;
  }
  if (subscription.status === "active") {
    return Boolean(subscription.current_period_end)
      && new Date(subscription.current_period_end as string).getTime() > now;
  }
  return false;
}
