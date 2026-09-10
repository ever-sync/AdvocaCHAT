import { describe, expect, it } from "vitest";
import {
  daysSinceLastTouch,
  getNegotiationAlerts,
  hasFutureTask,
  hasNegotiationAlerts,
  isNegotiationUnassigned,
  negotiationMatchesAlertsFilter,
  normalizeStaleNegotiationDays,
} from "./negotiation-alerts";

describe("negotiation-alerts", () => {
  const now = new Date("2026-05-15T12:00:00Z").getTime();

  it("detecta pool sem responsável", () => {
    expect(isNegotiationUnassigned("")).toBe(true);
    expect(isNegotiationUnassigned(null)).toBe(true);
    expect(isNegotiationUnassigned("user-1")).toBe(false);
  });

  it("tarefa futura vs vencida", () => {
    expect(hasFutureTask("2026-05-20T12:00:00Z", now)).toBe(true);
    expect(hasFutureTask("2026-05-10T12:00:00Z", now)).toBe(false);
    expect(hasFutureTask(undefined, now)).toBe(false);
  });

  it("alerta sem tarefa futura e parado", () => {
    const alerts = getNegotiationAlerts(
      {
        status: "em_andamento",
        createdAt: "2026-05-01T12:00:00Z",
        lastInteractionAt: "2026-05-01T12:00:00Z",
      },
      now,
    );
    expect(alerts.map((a) => a.kind)).toEqual(["no_future_task", "stale"]);
  });

  it("ignora vendido", () => {
    expect(
      getNegotiationAlerts(
        {
          status: "vendido",
          createdAt: "2026-01-01T12:00:00Z",
        },
        now,
      ),
    ).toEqual([]);
  });

  it("negotiationMatchesAlertsFilter por tipo", () => {
    const input = {
      status: "em_andamento" as const,
      createdAt: "2026-05-01T12:00:00Z",
      lastInteractionAt: "2026-05-01T12:00:00Z",
    };
    expect(negotiationMatchesAlertsFilter(input, "off", now)).toBe(true);
    expect(negotiationMatchesAlertsFilter(input, "any", now)).toBe(true);
    expect(negotiationMatchesAlertsFilter(input, "stale", now)).toBe(true);
    expect(negotiationMatchesAlertsFilter(input, "no_future_task", now)).toBe(true);
    expect(hasNegotiationAlerts(input, now)).toBe(true);
  });

  it("respeita limiar configurável de dias parado", () => {
    const input = {
      status: "em_andamento" as const,
      createdAt: "2026-05-10T12:00:00Z",
      lastInteractionAt: "2026-05-10T12:00:00Z",
    };
    expect(getNegotiationAlerts(input, now, 14).some((a) => a.kind === "stale")).toBe(false);
    expect(getNegotiationAlerts(input, now, 5).some((a) => a.kind === "stale")).toBe(true);
    expect(normalizeStaleNegotiationDays(0)).toBe(1);
    expect(normalizeStaleNegotiationDays(120)).toBe(90);
  });

  it("daysSinceLastTouch prioriza interação", () => {
    expect(
      daysSinceLastTouch(
        {
          status: "em_andamento",
          createdAt: "2026-01-01T12:00:00Z",
          lastContactAt: "2026-01-01T12:00:00Z",
          lastInteractionAt: "2026-05-14T12:00:00Z",
        },
        now,
      ),
    ).toBe(1);
  });
});
