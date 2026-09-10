import { describe, expect, it } from "vitest";
import type { CrmFunnel } from "@/data/crm-funnels";
import { DEFAULT_CRM_FUNNELS } from "@/data/crm-funnels";
import { stageRequiredFields, validateNegotiationForStage } from "./stage-requirements";

describe("stage-requirements", () => {
  it("validateNegotiationForStage exige valor quando configurado", () => {
    expect(
      validateNegotiationForStage({ totalValue: 0, qualification: 3 }, ["total_value"]),
    ).toMatch(/valor do negócio/i);
    expect(
      validateNegotiationForStage({ totalValue: 100, qualification: 3 }, ["total_value"]),
    ).toBeNull();
  });

  it("valida card local sem registro persistido (mesmos campos do Kanban)", () => {
    const required = stageRequiredFields(DEFAULT_CRM_FUNNELS, "comercial", "contrato");
    expect(required).toContain("total_value");

    const mockCard = {
      totalValue: 0,
      qualification: 2,
      closingForecast: null,
      nextTaskAt: null,
    };
    expect(validateNegotiationForStage(mockCard, required)).not.toBeNull();
    expect(
      validateNegotiationForStage({ ...mockCard, totalValue: 5000 }, required),
    ).toBeNull();
  });

  it("usa etapa marcada como venda (slug customizado)", () => {
    const funnels: CrmFunnel[] = [
      {
        id: "custom",
        listName: "Custom",
        stages: [{ id: "ganhou", title: "GANHOU", isSaleStage: true }],
      },
    ];
    expect(stageRequiredFields(funnels, "custom", "ganhou")).toEqual(["total_value"]);
  });
});
