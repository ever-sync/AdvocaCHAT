import { describe, expect, it } from "vitest";
import { isBillingAccessAllowed } from "@/lib/billing-access";

const now = new Date("2026-07-17T12:00:00.000Z").getTime();

describe("isBillingAccessAllowed", () => {
  it("libera trial somente com vencimento futuro", () => {
    expect(isBillingAccessAllowed({ status: "trialing", trial_ends_at: "2026-07-18T12:00:00.000Z", current_period_end: null }, now)).toBe(true);
    expect(isBillingAccessAllowed({ status: "trialing", trial_ends_at: null, current_period_end: null }, now)).toBe(false);
    expect(isBillingAccessAllowed({ status: "trialing", trial_ends_at: "2026-07-16T12:00:00.000Z", current_period_end: null }, now)).toBe(false);
  });

  it("libera assinatura ativa somente dentro do periodo pago", () => {
    expect(isBillingAccessAllowed({ status: "active", trial_ends_at: null, current_period_end: "2026-08-17T12:00:00.000Z" }, now)).toBe(true);
    expect(isBillingAccessAllowed({ status: "active", trial_ends_at: null, current_period_end: null }, now)).toBe(false);
    expect(isBillingAccessAllowed({ status: "active", trial_ends_at: null, current_period_end: "2026-07-16T12:00:00.000Z" }, now)).toBe(false);
  });

  it.each(["past_due", "paused", "canceled", "incomplete"] as const)("bloqueia status %s", (status) => {
    expect(isBillingAccessAllowed({ status, trial_ends_at: null, current_period_end: "2026-08-17T12:00:00.000Z" }, now)).toBe(false);
  });
});
