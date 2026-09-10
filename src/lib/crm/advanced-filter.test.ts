import { describe, expect, it } from "vitest";
import type { Customer, CrmNegotiation } from "@/types/domain";
import {
  decodeAdvancedFilter,
  encodeAdvancedFilter,
  evaluateAdvancedFilter,
  evaluateRule,
  type AdvancedFilter,
  type AdvancedFilterRule,
} from "./advanced-filter";

const NOW = new Date("2026-05-27T12:00:00Z").getTime();

function makeNeg(over: Partial<CrmNegotiation> = {}): CrmNegotiation {
  return {
    id: "n1",
    funnelId: "comercial",
    stageId: "andamento",
    status: "em_andamento",
    assigneeId: "u1",
    title: "Negócio Acme",
    starCount: 0,
    createdAt: new Date(NOW - 5 * 86_400_000).toISOString(),
    qualification: 3,
    totalValue: 1000,
    customerId: "c1",
    ...over,
  };
}

const customer: Customer = {
  id: "c1",
  nome: "Acme S.A.",
  telefone: "+556299988620",
  phoneDigits: "6299988620",
  phoneE164: "+556299988620",
  perfil: "A",
  rota: "Centro",
  ultimoPedido: "",
  status: "ativo",
  email: "acme@example.com",
  cnpj: "",
  endereco: "",
  vendedor: "",
  ticketMedio: 0,
  frequenciaCompra: "",
  totalGasto: 0,
};

const ctx = {
  customerById: new Map([["c1", customer]]),
  scoresByNegId: new Map([["n1", { total: 72 }]]),
  nowMs: NOW,
};

function rule(over: Partial<AdvancedFilterRule>): AdvancedFilterRule {
  return {
    id: "r1",
    field: "title",
    operator: "contains",
    value: "",
    ...over,
  } as AdvancedFilterRule;
}

describe("evaluateRule", () => {
  it("title contains (case-insensitive)", () => {
    const r = rule({ field: "title", operator: "contains", value: "acme" });
    expect(evaluateRule(makeNeg(), r, ctx)).toBe(true);
    expect(evaluateRule(makeNeg({ title: "Outra" }), r, ctx)).toBe(false);
  });

  it("customerPhone contains (apenas dígitos)", () => {
    const r = rule({ field: "customerPhone", operator: "contains", value: "99988" });
    expect(evaluateRule(makeNeg(), r, ctx)).toBe(true);
  });

  it("status in / equals", () => {
    const inRule = rule({ field: "status", operator: "in", value: ["pausado", "em_andamento"] });
    expect(evaluateRule(makeNeg(), inRule, ctx)).toBe(true);
    expect(evaluateRule(makeNeg({ status: "vendido" }), inRule, ctx)).toBe(false);
    const eqRule = rule({ field: "status", operator: "equals", value: "em_andamento" });
    expect(evaluateRule(makeNeg(), eqRule, ctx)).toBe(true);
  });

  it("totalValue gte / lte / between", () => {
    const gte = rule({ field: "totalValue", operator: "gte", value: 500 });
    expect(evaluateRule(makeNeg({ totalValue: 1000 }), gte, ctx)).toBe(true);
    expect(evaluateRule(makeNeg({ totalValue: 100 }), gte, ctx)).toBe(false);
    const between = rule({
      field: "totalValue",
      operator: "between",
      value: 500,
      value2: 2000,
    });
    expect(evaluateRule(makeNeg({ totalValue: 1500 }), between, ctx)).toBe(true);
    expect(evaluateRule(makeNeg({ totalValue: 3000 }), between, ctx)).toBe(false);
  });

  it("leadScore consulta a Map de contexto", () => {
    const r = rule({ field: "leadScore", operator: "gte", value: 70 });
    expect(evaluateRule(makeNeg(), r, ctx)).toBe(true);
    expect(evaluateRule(makeNeg(), { ...r, value: 90 }, ctx)).toBe(false);
  });

  it("assignee is_empty marca pool", () => {
    const r = rule({ field: "assignee", operator: "is_empty" });
    expect(evaluateRule(makeNeg({ assigneeId: "" }), r, ctx)).toBe(true);
    expect(evaluateRule(makeNeg(), r, ctx)).toBe(false);
  });

  it("nextTaskAt is_overdue / is_future", () => {
    const past = makeNeg({ nextTaskAt: new Date(NOW - 86_400_000).toISOString() });
    const future = makeNeg({ nextTaskAt: new Date(NOW + 86_400_000).toISOString() });
    expect(evaluateRule(past, rule({ field: "nextTaskAt", operator: "is_overdue" }), ctx)).toBe(true);
    expect(evaluateRule(future, rule({ field: "nextTaskAt", operator: "is_overdue" }), ctx)).toBe(false);
    expect(evaluateRule(future, rule({ field: "nextTaskAt", operator: "is_future" }), ctx)).toBe(true);
  });

  it("createdAt older_than_days / within_last_days", () => {
    const r = rule({ field: "createdAt", operator: "older_than_days", value: 3 });
    expect(evaluateRule(makeNeg(), r, ctx)).toBe(true); // 5 dias
    expect(
      evaluateRule(makeNeg({ createdAt: new Date(NOW - 86_400_000).toISOString() }), r, ctx),
    ).toBe(false);
    const within = rule({ field: "createdAt", operator: "within_last_days", value: 7 });
    expect(evaluateRule(makeNeg(), within, ctx)).toBe(true);
    expect(
      evaluateRule(
        makeNeg({ createdAt: new Date(NOW - 30 * 86_400_000).toISOString() }),
        within,
        ctx,
      ),
    ).toBe(false);
  });

  it("hasOpenTask is_true/is_false", () => {
    const future = makeNeg({ nextTaskAt: new Date(NOW + 86_400_000).toISOString() });
    const past = makeNeg({ nextTaskAt: new Date(NOW - 86_400_000).toISOString() });
    expect(evaluateRule(future, rule({ field: "hasOpenTask", operator: "is_true" }), ctx)).toBe(true);
    expect(evaluateRule(past, rule({ field: "hasOpenTask", operator: "is_true" }), ctx)).toBe(false);
    expect(evaluateRule(makeNeg({ nextTaskAt: undefined }), rule({ field: "hasOpenTask", operator: "is_false" }), ctx)).toBe(
      true,
    );
  });
});

describe("evaluateAdvancedFilter", () => {
  it("op=AND exige todas as regras", () => {
    const f: AdvancedFilter = {
      op: "and",
      rules: [
        rule({ field: "status", operator: "equals", value: "em_andamento" }),
        rule({ field: "totalValue", operator: "gte", value: 500 }),
      ],
    };
    expect(evaluateAdvancedFilter(makeNeg(), f, ctx)).toBe(true);
    expect(evaluateAdvancedFilter(makeNeg({ totalValue: 100 }), f, ctx)).toBe(false);
  });

  it("op=OR aceita qualquer regra", () => {
    const f: AdvancedFilter = {
      op: "or",
      rules: [
        rule({ field: "status", operator: "equals", value: "vendido" }),
        rule({ field: "totalValue", operator: "gte", value: 800 }),
      ],
    };
    expect(evaluateAdvancedFilter(makeNeg(), f, ctx)).toBe(true);
    expect(evaluateAdvancedFilter(makeNeg({ totalValue: 100 }), f, ctx)).toBe(false);
  });

  it("filtro vazio sempre true", () => {
    expect(evaluateAdvancedFilter(makeNeg(), null, ctx)).toBe(true);
    expect(evaluateAdvancedFilter(makeNeg(), { op: "and", rules: [] }, ctx)).toBe(true);
  });
});

describe("encode/decode", () => {
  it("round-trip preserva o filtro", () => {
    const f: AdvancedFilter = {
      op: "and",
      rules: [
        rule({ field: "title", operator: "contains", value: "Acmé Çãoé" }),
        rule({ field: "leadScore", operator: "gte", value: 50 }),
      ],
    };
    const encoded = encodeAdvancedFilter(f);
    expect(encoded).toBeTruthy();
    expect(decodeAdvancedFilter(encoded)).toEqual(f);
  });

  it("decoda nulo/inválido sem lançar", () => {
    expect(decodeAdvancedFilter(null)).toBeNull();
    expect(decodeAdvancedFilter("")).toBeNull();
    expect(decodeAdvancedFilter("@@@@")).toBeNull();
  });

  it("encode com filtro vazio devolve null", () => {
    expect(encodeAdvancedFilter({ op: "and", rules: [] })).toBeNull();
    expect(encodeAdvancedFilter(null)).toBeNull();
  });
});
