import { describe, expect, it } from "vitest";
import type { CrmNegotiation } from "@/types/domain";
import {
  appliedToOwnerDraft,
  compareNegotiations,
  draftToApplied,
  matchesOwner,
  scoreFilterMatches,
  type AppliedOwner,
} from "./board-helpers";

// Fabrica minima: so os campos usados pelos helpers; o resto e irrelevante aqui.
function mk(partial: Partial<CrmNegotiation>): CrmNegotiation {
  return {
    id: "n1",
    title: "Negócio",
    qualification: 0,
    totalValue: 0,
    assigneeId: "",
    customerId: "",
    funnelId: "f1",
    stageId: "s1",
    status: "em_andamento",
    ...partial,
  } as CrmNegotiation;
}

describe("scoreFilterMatches", () => {
  it("aplica os limiares de lead score", () => {
    expect(scoreFilterMatches("hot", 75)).toBe(true);
    expect(scoreFilterMatches("hot", 74)).toBe(false);
    expect(scoreFilterMatches("warm_plus", 50)).toBe(true);
    expect(scoreFilterMatches("tepid_plus", 25)).toBe(true);
    expect(scoreFilterMatches("cold", 24)).toBe(true);
    expect(scoreFilterMatches("cold", 25)).toBe(false);
  });

  it("'all' nunca filtra", () => {
    expect(scoreFilterMatches("all", 0)).toBe(true);
    expect(scoreFilterMatches("all", 100)).toBe(true);
  });
});

describe("compareNegotiations", () => {
  it("ordena por maior valor (value_desc)", () => {
    const a = mk({ totalValue: 100 });
    const b = mk({ totalValue: 300 });
    expect(compareNegotiations(a, b, "value_desc")).toBeGreaterThan(0);
    expect(compareNegotiations(b, a, "value_desc")).toBeLessThan(0);
  });

  it("ordena alfabeticamente A-Z ignorando acento/caixa", () => {
    const a = mk({ title: "ana" });
    const b = mk({ title: "Bruno" });
    expect(compareNegotiations(a, b, "alpha_az")).toBeLessThan(0);
    expect(compareNegotiations(a, b, "alpha_za")).toBeGreaterThan(0);
  });

  it("prioridade desempata qualificação > valor", () => {
    const a = mk({ qualification: 5, totalValue: 10 });
    const b = mk({ qualification: 3, totalValue: 9999 });
    expect(compareNegotiations(a, b, "priority")).toBeLessThan(0); // a vem antes
  });

  it("score_* não tem desempate dedicado (retorna 0)", () => {
    const a = mk({ totalValue: 1 });
    const b = mk({ totalValue: 2 });
    expect(compareNegotiations(a, b, "score_desc")).toBe(0);
  });
});

describe("matchesOwner", () => {
  const mine = mk({ assigneeId: "user-1" });
  const other = mk({ assigneeId: "user-2" });

  it("'all' aceita qualquer dono", () => {
    expect(matchesOwner(mine, { mode: "all" }, "user-1")).toBe(true);
    expect(matchesOwner(other, { mode: "all" }, "user-1")).toBe(true);
  });

  it("'mine' só aceita o próprio perfil", () => {
    expect(matchesOwner(mine, { mode: "mine" }, "user-1")).toBe(true);
    expect(matchesOwner(other, { mode: "mine" }, "user-1")).toBe(false);
  });

  it("'custom' aceita os ids listados", () => {
    const applied: AppliedOwner = { mode: "custom", ids: ["user-2"] };
    expect(matchesOwner(other, applied, "user-1")).toBe(true);
    expect(matchesOwner(mine, applied, "user-1")).toBe(false);
  });
});

describe("draftToApplied / appliedToOwnerDraft", () => {
  it("custom com só o próprio id colapsa para 'mine'", () => {
    const draft = appliedToOwnerDraft({ mode: "custom", ids: ["user-1"] });
    expect(draftToApplied(draft, "user-1")).toEqual({ mode: "mine" });
  });

  it("custom vazio vira 'all'", () => {
    const draft = appliedToOwnerDraft({ mode: "custom", ids: [] });
    expect(draftToApplied(draft, "user-1")).toEqual({ mode: "all" });
  });

  it("preserva múltiplos ids custom", () => {
    const applied: AppliedOwner = { mode: "custom", ids: ["a", "b"] };
    const round = draftToApplied(appliedToOwnerDraft(applied), "user-1");
    expect(round).toEqual({ mode: "custom", ids: ["a", "b"] });
  });
});
