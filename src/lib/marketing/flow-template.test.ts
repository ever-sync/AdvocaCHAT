import { describe, expect, it } from "vitest";
import { applyTemplateFilter, deepMerge, renderTemplate } from "./flow-template";

const ctx = {
  customer: { nome: "Ana", saldo: 1234.5 },
  negotiation: { titulo: "Plano Pro" },
  context: {
    vars: { cupom: "BEMVINDO" },
    webhook: { "step-1": { status: 200, body: { score: 87 } } },
  },
};

describe("renderTemplate", () => {
  it("resolve variáveis de cliente/negociacao/contexto", () => {
    expect(renderTemplate("Oi {{cliente.nome}}!", ctx)).toBe("Oi Ana!");
    expect(renderTemplate("{{negociacao.titulo}}", ctx)).toBe("Plano Pro");
    expect(renderTemplate("{{contexto.vars.cupom}}", ctx)).toBe("BEMVINDO");
  });

  it("lê saída de webhook gravada no contexto (dados entre passos)", () => {
    expect(renderTemplate("Score: {{contexto.webhook.step-1.body.score}}", ctx)).toBe("Score: 87");
  });

  it("usa fallback quando o valor está vazio/ausente", () => {
    expect(renderTemplate('{{cliente.apelido | "amigo"}}', ctx)).toBe("amigo");
    expect(renderTemplate('{{cliente.nome | "amigo"}}', ctx)).toBe("Ana");
  });

  it("aplica formatador currency", () => {
    const out = renderTemplate("{{cliente.saldo | currency}}", ctx);
    expect(out).toContain("R$");
    expect(out).toContain("1.234,50");
  });

  it("aplica upper/lower", () => {
    expect(renderTemplate("{{cliente.nome | upper}}", ctx)).toBe("ANA");
    expect(renderTemplate("{{cliente.nome | lower}}", ctx)).toBe("ana");
  });

  it("serializa objeto quando não há formatador", () => {
    expect(renderTemplate("{{contexto.webhook.step-1.body}}", ctx)).toBe('{"score":87}');
  });

  it("variável desconhecida vira string vazia (sem fallback)", () => {
    expect(renderTemplate("[{{foo.bar}}]", ctx)).toBe("[]");
  });
});

describe("applyTemplateFilter", () => {
  it("date formata ISO em pt-BR", () => {
    expect(applyTemplateFilter("2026-05-30T12:00:00Z", "date")).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
  it("date inválida retorna o valor original", () => {
    expect(applyTemplateFilter("nao-e-data", "date")).toBe("nao-e-data");
  });
});

describe("deepMerge", () => {
  it("mescla objetos aninhados sem perder chaves irmãs", () => {
    const base = { webhook: { "step-1": { status: 200 } }, vars: { a: 1 } };
    const patch = { webhook: { "step-2": { status: 500 } } };
    expect(deepMerge(base, patch)).toEqual({
      webhook: { "step-1": { status: 200 }, "step-2": { status: 500 } },
      vars: { a: 1 },
    });
  });
  it("substitui escalares e arrays", () => {
    expect(deepMerge({ a: 1, list: [1] }, { a: 2, list: [2, 3] })).toEqual({ a: 2, list: [2, 3] });
  });
});
