import { describe, expect, it } from "vitest";
import { validateFlow, type FlowSnapshotForValidation } from "./flow-validation";

/** Step minimo valido pro parser de validacao (precisa de id/actionId/label/icon). */
function step(actionId: string, extra: Record<string, unknown> = {}) {
  return {
    id: `step-${actionId}`,
    actionId,
    label: actionId,
    iconKey: "sparkles",
    iconClass: "bg-violet-600",
    ...extra,
  };
}

function snapshot(steps: unknown[]): FlowSnapshotForValidation {
  return {
    name: "Fluxo de teste",
    trigger: { type: "manual" },
    criteria: { group: { combinator: "and", conditions: [] } },
    definition: { steps, exitConditions: ["lead respondeu"] },
  };
}

describe("validateFlow — gate de executor (Fase 1)", () => {
  it("bloqueia ativacao de passo sem executor no worker", () => {
    const result = validateFlow(snapshot([step("sms", { subtitle: "oi" })]));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "STEP_NO_EXECUTOR")).toBe(true);
  });

  it("nao reporta STEP_NO_EXECUTOR para acao com executor", () => {
    const result = validateFlow(snapshot([step("espera", { subtitle: "1 dia" })]));
    expect(result.errors.some((e) => e.code === "STEP_NO_EXECUTOR")).toBe(false);
  });

  it("acao sem executor curto-circuita a validacao de config do passo", () => {
    // 'sms' tem ACTION_SCHEMAS (MSG_EMPTY); o gate de executor vem antes e o
    // passo so deve gerar STEP_NO_EXECUTOR, nao o erro de subtitle.
    const result = validateFlow(snapshot([step("sms")]));
    const codes = result.errors.filter((e) => e.stepId === "step-sms").map((e) => e.code);
    expect(codes).toContain("STEP_NO_EXECUTOR");
    expect(codes).not.toContain("MSG_EMPTY");
  });
});
