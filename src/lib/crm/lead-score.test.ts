import { describe, expect, it } from "vitest";
import type { CrmNegotiation } from "@/types/domain";
import { buildScoringContext, computeLeadScore, leadScoreTier } from "./lead-score";

const NOW = new Date("2026-05-27T12:00:00Z").getTime();

function makeNeg(overrides: Partial<CrmNegotiation> = {}): CrmNegotiation {
  return {
    id: "n1",
    funnelId: "comercial",
    stageId: "andamento",
    status: "em_andamento",
    assigneeId: "u1",
    title: "Acme",
    starCount: 0,
    createdAt: new Date(NOW - 5 * 86_400_000).toISOString(),
    qualification: 0,
    totalValue: 0,
    ...overrides,
  };
}

describe("leadScoreTier", () => {
  it("classifica os limiares corretamente", () => {
    expect(leadScoreTier(0)).toBe("cold");
    expect(leadScoreTier(24)).toBe("cold");
    expect(leadScoreTier(25)).toBe("tepid");
    expect(leadScoreTier(49)).toBe("tepid");
    expect(leadScoreTier(50)).toBe("warm");
    expect(leadScoreTier(74)).toBe("warm");
    expect(leadScoreTier(75)).toBe("hot");
    expect(leadScoreTier(100)).toBe("hot");
  });
});

describe("computeLeadScore", () => {
  it("negócios fechados pontuam 0", () => {
    const won = computeLeadScore(makeNeg({ status: "vendido", qualification: 5 }), { nowMs: NOW });
    expect(won.total).toBe(0);
    expect(won.tier).toBe("cold");
    const lost = computeLeadScore(makeNeg({ status: "perdido", totalValue: 100_000 }), { nowMs: NOW });
    expect(lost.total).toBe(0);
  });

  it("lead vazio (sem interação, sem qualif, sem valor, sem prob) é frio", () => {
    const n = makeNeg({ createdAt: new Date(NOW - 30 * 86_400_000).toISOString() });
    const r = computeLeadScore(n, { nowMs: NOW });
    expect(r.recency).toBe(0); // 30 dias
    expect(r.engagement).toBe(0);
    expect(r.value).toBe(0);
    expect(r.qualification).toBe(0);
    expect(r.nextTask).toBe(5); // sem task = neutro
    // Pipeline default 30% → 3 pts; total = 8 → cold
    expect(r.tier).toBe("cold");
    expect(r.total).toBe(8);
  });

  it("lead ideal pontua perto de 100", () => {
    const n = makeNeg({
      lastInteractionAt: new Date(NOW - 60_000).toISOString(),
      starCount: 12,
      qualification: 5,
      totalValue: 40_000,
      nextTaskAt: new Date(NOW + 86_400_000).toISOString(),
    });
    const r = computeLeadScore(n, {
      nowMs: NOW,
      funnelMedianValue: 10_000,
      stageProbabilityPct: 80,
    });
    expect(r.recency).toBe(25); // hoje
    expect(r.engagement).toBe(20); // satura
    expect(r.qualification).toBe(15); // 5*3
    expect(r.value).toBe(20); // ratio 4 = max
    expect(r.pipeline).toBe(8); // 80% → 8
    expect(r.nextTask).toBe(10); // futura
    expect(r.total).toBe(98);
    expect(r.tier).toBe("hot");
  });

  it("decai com dias parado", () => {
    const fresh = computeLeadScore(
      makeNeg({ lastInteractionAt: new Date(NOW - 86_400_000).toISOString() }),
      { nowMs: NOW },
    );
    const stale = computeLeadScore(
      makeNeg({ lastInteractionAt: new Date(NOW - 10 * 86_400_000).toISOString() }),
      { nowMs: NOW },
    );
    expect(fresh.recency).toBeGreaterThan(stale.recency);
    expect(stale.recency).toBeLessThan(10);
  });

  it("tarefa vencida zera nextTask, sem tarefa é neutro", () => {
    const overdue = computeLeadScore(
      makeNeg({ nextTaskAt: new Date(NOW - 86_400_000).toISOString() }),
      { nowMs: NOW },
    );
    const none = computeLeadScore(makeNeg({ nextTaskAt: undefined }), { nowMs: NOW });
    const future = computeLeadScore(
      makeNeg({ nextTaskAt: new Date(NOW + 86_400_000).toISOString() }),
      { nowMs: NOW },
    );
    expect(overdue.nextTask).toBe(0);
    expect(none.nextTask).toBe(5);
    expect(future.nextTask).toBe(10);
  });
});

describe("buildScoringContext", () => {
  it("computa mediana ignorando fechados e valores 0", () => {
    const ctx = buildScoringContext(
      [
        { totalValue: 100, status: "em_andamento" },
        { totalValue: 300, status: "em_andamento" },
        { totalValue: 999_999, status: "vendido" }, // ignorado
        { totalValue: 0, status: "em_andamento" }, // ignorado
        { totalValue: 200, status: "pausado" },
      ],
      [],
    );
    expect(ctx.funnelMedianValue).toBe(200);
  });

  it("indexa probabilidades por stageId, ignorando undefined", () => {
    const ctx = buildScoringContext(
      [],
      [
        { id: "lead", probability: null },
        { id: "andamento", probability: 40 },
        { id: "venda", probability: 100 },
      ],
    );
    expect(ctx.stageProbabilities.get("lead")).toBeUndefined();
    expect(ctx.stageProbabilities.get("andamento")).toBe(40);
    expect(ctx.stageProbabilities.get("venda")).toBe(100);
  });
});
