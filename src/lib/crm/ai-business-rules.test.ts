import { describe, expect, it } from "vitest";
import { evaluateAiReplyEligibility } from "./ai-business-rules";

describe("evaluateAiReplyEligibility", () => {
  it("permite IA quando negócio tem responsável", () => {
    const r = evaluateAiReplyEligibility({
      aiMode: "full",
      negotiationAssigneeId: "seller-1",
    });
    expect(r.allowed).toBe(true);
  });

  it("bloqueia handoff e off", () => {
    expect(evaluateAiReplyEligibility({ aiMode: "off" }).reason).toBe("ai_off");
    expect(evaluateAiReplyEligibility({ aiMode: "handoff" }).reason).toBe("handoff_mode");
  });

  it("permite IA quando chat tem atendente atribuído", () => {
    const r = evaluateAiReplyEligibility({
      aiMode: "qualifying",
      chatAssigneeId: "user-1",
    });
    expect(r.allowed).toBe(true);
  });

  it("qualifying só em lead/contato", () => {
    expect(
      evaluateAiReplyEligibility({
        aiMode: "qualifying",
        negotiationStageId: "lead",
      }).allowed,
    ).toBe(true);
    expect(
      evaluateAiReplyEligibility({
        aiMode: "qualifying",
        negotiationStageId: "andamento",
      }).reason,
    ).toBe("qualifying_stage_limit");
  });

  it("full permite estágio avançado sem dono", () => {
    expect(
      evaluateAiReplyEligibility({
        aiMode: "full",
        negotiationStageId: "contrato",
      }).allowed,
    ).toBe(true);
  });
});
