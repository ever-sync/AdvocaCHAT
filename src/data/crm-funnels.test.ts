import { describe, expect, it } from "vitest";
import { parseTenantCrmFunnelsJson } from "./crm-funnels";

describe("parseTenantCrmFunnelsJson", () => {
  it("aceita array valido", () => {
    const raw = [
      {
        id: "a",
        listName: "Funil A",
        stages: [
          { id: "s1", title: "Etapa 1" },
          { id: "s2", title: "Etapa 2" },
        ],
      },
    ];
    const out = parseTenantCrmFunnelsJson(raw);
    expect(out).toEqual(raw);
  });

  it("rejeita ids duplicados entre funis", () => {
    const raw = [
      { id: "x", listName: "A", stages: [{ id: "s", title: "S" }] },
      { id: "x", listName: "B", stages: [{ id: "t", title: "T" }] },
    ];
    expect(parseTenantCrmFunnelsJson(raw)).toBeNull();
  });

  it("rejeita funil sem etapas", () => {
    expect(
      parseTenantCrmFunnelsJson([{ id: "a", listName: "A", stages: [] }]),
    ).toBeNull();
  });

  it("rejeita nao-array", () => {
    expect(parseTenantCrmFunnelsJson({})).toBeNull();
    expect(parseTenantCrmFunnelsJson(null)).toBeNull();
  });

  it("rejeita mais de uma etapa de venda no mesmo funil", () => {
    const raw = [
      {
        id: "a",
        listName: "Funil A",
        stages: [
          { id: "s1", title: "Etapa 1", isSaleStage: true },
          { id: "s2", title: "Etapa 2", isSaleStage: true },
        ],
      },
    ];
    expect(parseTenantCrmFunnelsJson(raw)).toBeNull();
  });

  it("preserva isSaleStage quando unica", () => {
    const raw = [
      {
        id: "a",
        listName: "Funil A",
        stages: [
          { id: "s1", title: "Etapa 1" },
          { id: "fechado", title: "FECHADO", isSaleStage: true },
        ],
      },
    ];
    const out = parseTenantCrmFunnelsJson(raw);
    expect(out?.[0].stages[1].isSaleStage).toBe(true);
  });

  it("aceita requiredFields por etapa", () => {
    const raw = [
      {
        id: "comercial",
        listName: "COMERCIAL",
        stages: [
          { id: "lead", title: "LEAD" },
          {
            id: "contrato",
            title: "CONTRATO",
            requiredFields: ["total_value", "closing_forecast"],
          },
        ],
      },
    ];
    const out = parseTenantCrmFunnelsJson(raw);
    expect(out?.[0].stages[1].requiredFields).toEqual(["total_value", "closing_forecast"]);
  });
});
