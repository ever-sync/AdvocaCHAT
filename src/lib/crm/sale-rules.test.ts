import { describe, expect, it } from "vitest";
import {
  DEFAULT_CRM_FUNNELS,
  resolveConfiguredLostStageId,
  resolveConfiguredSaleStageId,
} from "@/data/crm-funnels";
import {
  hasSaleAttendant,
  isLostDestinationStage,
  isSaleDestinationStage,
  negotiationHasCompletedSale,
  validateMarkWinLines,
} from "@/lib/crm/sale-rules";

describe("sale-rules", () => {
  it("exige atendente na conversa e responsável no negócio (chat)", () => {
    expect(
      hasSaleAttendant({
        chatAssigneeId: "u1",
        negotiationAssigneeId: "u2",
      }),
    ).toBe(true);
    expect(
      hasSaleAttendant({
        chatAssigneeId: "u1",
        negotiationAssigneeId: "u1",
        profileId: "u1",
        role: "atendimento",
      }),
    ).toBe(true);
    expect(
      hasSaleAttendant({
        chatAssigneeId: "u1",
        negotiationAssigneeId: "u2",
        profileId: "u1",
        role: "atendimento",
      }),
    ).toBe(false);
    expect(
      hasSaleAttendant({
        chatAssigneeId: "",
        negotiationAssigneeId: "u2",
      }),
    ).toBe(false);
    expect(
      hasSaleAttendant({
        chatAssigneeId: "u1",
        negotiationAssigneeId: null,
      }),
    ).toBe(false);
  });

  it("identifica etapa de venda do funil", () => {
    const customFunnels = [
      {
        id: "comercial",
        listName: "COMERCIAL",
        stages: [
          { id: "lead", title: "LEAD QUALIFICADA" },
          { id: "venda", title: "VENDA", isSaleStage: true },
          { id: "perdido", title: "PERDIDO", isLostStage: true },
        ],
      },
    ];
    const funnelId = customFunnels[0].id;
    const saleId = resolveConfiguredSaleStageId(customFunnels, funnelId);
    expect(isSaleDestinationStage(customFunnels, funnelId, saleId)).toBe(true);
    expect(isSaleDestinationStage(customFunnels, funnelId, "lead")).toBe(false);
  });

  it("identifica etapa de perda do funil", () => {
    const customFunnels = [
      {
        id: "comercial",
        listName: "COMERCIAL",
        stages: [
          { id: "lead", title: "LEAD QUALIFICADA" },
          { id: "venda", title: "VENDA", isSaleStage: true },
          { id: "perdido", title: "PERDIDO", isLostStage: true },
        ],
      },
    ];
    const funnelId = customFunnels[0].id;
    const lostId = resolveConfiguredLostStageId(customFunnels, funnelId);
    expect(isLostDestinationStage(customFunnels, funnelId, lostId)).toBe(true);
    expect(isLostDestinationStage(customFunnels, funnelId, "lead")).toBe(false);
  });

  it("valida linhas da venda", () => {
    expect(
      validateMarkWinLines([
        {
          productId: "p1",
          productName: "X",
          unitValue: 10,
          quantity: 1,
          lineTotal: 10,
        },
      ]),
    ).toBeNull();
    expect(validateMarkWinLines([])).toMatch(/produto/i);
  });

  it("negociação vendida com valor", () => {
    expect(negotiationHasCompletedSale({ status: "vendido", totalValue: 100 })).toBe(true);
    expect(negotiationHasCompletedSale({ status: "vendido", totalValue: 0 })).toBe(false);
  });
});
