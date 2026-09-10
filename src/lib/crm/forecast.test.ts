import { describe, expect, it } from "vitest";
import type { CrmFunnel } from "@/data/crm-funnels";
import { buildForecast, resolveDealProbability, stageProbability, type ForecastDeal } from "./forecast";

const funnels: CrmFunnel[] = [
  {
    id: "comercial",
    listName: "COMERCIAL",
    stages: [
      { id: "lead", title: "Lead" },
      { id: "andamento", title: "Andamento", probability: 40 },
      { id: "venda", title: "Venda", isSaleStage: true },
      { id: "perdido", title: "Perdido", isLostStage: true },
    ],
  },
];

describe("stageProbability", () => {
  it("usa a probabilidade configurada", () => {
    expect(stageProbability({ id: "x", title: "X", probability: 75 }, 1, 4)).toBe(75);
  });
  it("etapa de venda = 100, perda = 0", () => {
    expect(stageProbability({ id: "v", title: "V", isSaleStage: true }, 2, 4)).toBe(100);
    expect(stageProbability({ id: "p", title: "P", isLostStage: true }, 3, 4)).toBe(0);
  });
  it("estima por posição quando não configurada", () => {
    // (0+1)/(4+1) = 20%
    expect(stageProbability({ id: "l", title: "L" }, 0, 4)).toBe(20);
  });
  it("clampa em 0–100", () => {
    expect(stageProbability({ id: "x", title: "X", probability: 150 }, 0, 4)).toBe(100);
  });
});

describe("resolveDealProbability", () => {
  it("resolve via funil + etapa", () => {
    const deal: ForecastDeal = {
      id: "1", totalValue: 1000, funnelId: "comercial", stageId: "andamento",
      assigneeId: null, closingForecast: null, status: "em_andamento",
    };
    expect(resolveDealProbability(deal, funnels)).toBe(40);
  });
  it("etapa inexistente => 0", () => {
    const deal: ForecastDeal = {
      id: "2", totalValue: 1000, funnelId: "comercial", stageId: "nao-existe",
      assigneeId: null, closingForecast: null, status: "em_andamento",
    };
    expect(resolveDealProbability(deal, funnels)).toBe(0);
  });
});

describe("buildForecast", () => {
  it("soma pipeline e ponderado", () => {
    const deals: ForecastDeal[] = [
      { id: "1", totalValue: 1000, funnelId: "comercial", stageId: "andamento", assigneeId: "a", closingForecast: "2026-06-10T00:00:00Z", status: "em_andamento" },
      { id: "2", totalValue: 2000, funnelId: "comercial", stageId: "lead", assigneeId: "b", closingForecast: "2026-06-20T00:00:00Z", status: "em_andamento" },
    ];
    const summary = buildForecast(deals, funnels, (id) => id ?? "Sem dono");
    expect(summary.openCount).toBe(2);
    expect(summary.pipelineTotal).toBe(3000);
    // 1000*0.4 + 2000*0.2 = 400 + 400 = 800
    expect(summary.weightedTotal).toBe(800);
    expect(summary.byMonth).toHaveLength(1);
    expect(summary.byMonth[0].month).toBe("2026-06");
    expect(summary.bySeller).toHaveLength(2);
  });

  it("agrupa sem-data por último", () => {
    const deals: ForecastDeal[] = [
      { id: "1", totalValue: 1000, funnelId: "comercial", stageId: "andamento", assigneeId: null, closingForecast: null, status: "em_andamento" },
      { id: "2", totalValue: 1000, funnelId: "comercial", stageId: "andamento", assigneeId: null, closingForecast: "2026-07-01T00:00:00Z", status: "em_andamento" },
    ];
    const summary = buildForecast(deals, funnels, () => "x");
    expect(summary.byMonth[summary.byMonth.length - 1].month).toBe("sem-data");
  });
});
