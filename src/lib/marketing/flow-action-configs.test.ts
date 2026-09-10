import { describe, expect, it } from "vitest";
import {
  getConfigKind,
  parseConfig,
  summarizeConfig,
  validateActionConfig,
} from "./flow-action-configs";
import { isExecutableMarketingFlowAction } from "./flow-types";

function step(actionId: string, config: Record<string, unknown>) {
  return {
    id: "s1",
    actionId,
    label: actionId,
    iconKey: "x",
    iconClass: "y",
    config,
  };
}

describe("Fase 4 — ações de negociação (registry + executável)", () => {
  const actions = [
    "atualizar-nome-negociacao",
    "atualizar-status",
    "adicionar-anotacao",
    "marcar-venda",
    "definir-qualificacao",
    "suprimir-canal",
    "transferir-humano",
  ];

  it("todas têm config kind e são executáveis", () => {
    for (const a of actions) {
      expect(isExecutableMarketingFlowAction(a)).toBe(true);
      // transferir-humano não tem config estruturado (sem campos) — kind opcional.
      if (a !== "transferir-humano") {
        expect(getConfigKind(a)).not.toBeNull();
      }
    }
  });
});

describe("set-qualification (estrelas)", () => {
  it("parse limita a 0–5 e arredonda", () => {
    expect(parseConfig("set-qualification", { qualification: 9 }).qualification).toBe(5);
    expect(parseConfig("set-qualification", { qualification: -2 }).qualification).toBe(0);
    expect(parseConfig("set-qualification", { qualification: 3.6 }).qualification).toBe(4);
    expect(parseConfig("set-qualification", { qualification: "x" }).qualification).toBe(0);
  });

  it("valida (após parse normalizar, fica sempre na faixa)", () => {
    expect(
      validateActionConfig(step("definir-qualificacao", { qualification: 4 }), "set-qualification"),
    ).toHaveLength(0);
    // parse já limita: 7 vira 5, então valida sem erro.
    expect(
      validateActionConfig(step("definir-qualificacao", { qualification: 7 }), "set-qualification"),
    ).toHaveLength(0);
  });

  it("summarize mostra as estrelas", () => {
    expect(summarizeConfig("set-qualification", { qualification: 0 })).toBe("Zerar estrelas");
    expect(summarizeConfig("set-qualification", { qualification: 3 })).toContain("★★★");
  });
});

describe("suppress-channel (opt-out)", () => {
  it("parse normaliza canal inválido para 'all'", () => {
    expect(parseConfig("suppress-channel", { channel: "xpto" }).channel).toBe("all");
    expect(parseConfig("suppress-channel", { channel: "whatsapp" }).channel).toBe("whatsapp");
  });

  it("valida (parse normaliza canal inválido, então passa)", () => {
    expect(
      validateActionConfig(step("suprimir-canal", { channel: "email" }), "suppress-channel"),
    ).toHaveLength(0);
    expect(
      validateActionConfig(step("suprimir-canal", { channel: "zzz" }), "suppress-channel"),
    ).toHaveLength(0);
  });

  it("summarize descreve o opt-out", () => {
    expect(summarizeConfig("suppress-channel", { channel: "whatsapp" })).toBe("Opt-out: WhatsApp");
    expect(summarizeConfig("suppress-channel", { channel: "all" })).toBe("Opt-out: Todos os canais");
  });
});

describe("update-deal-title", () => {
  it("erra quando o nome está vazio", () => {
    const issues = validateActionConfig(step("atualizar-nome-negociacao", { title: "" }), "update-deal-title");
    expect(issues.some((i) => i.code === "DEAL_TITLE_EMPTY")).toBe(true);
  });
  it("aceita nome com template", () => {
    const issues = validateActionConfig(
      step("atualizar-nome-negociacao", { title: "Deal {{cliente.nome}}" }),
      "update-deal-title",
    );
    expect(issues).toHaveLength(0);
  });
});

describe("update-deal-status", () => {
  it("parse normaliza status inválido para em_andamento", () => {
    expect(parseConfig("update-deal-status", { status: "xpto" }).status).toBe("em_andamento");
    expect(parseConfig("update-deal-status", { status: "vendido" }).status).toBe("vendido");
  });
  it("summarize traduz o status (valores reais do banco)", () => {
    expect(summarizeConfig("update-deal-status", { status: "vendido" })).toBe("Ganha (venda)");
    expect(summarizeConfig("update-deal-status", { status: "perdido" })).toBe("Perdida");
  });
});

describe("mark-sale", () => {
  it("erra com valor não numérico", () => {
    const issues = validateActionConfig(step("marcar-venda", { valueCents: "abc" }), "mark-sale");
    expect(issues.some((i) => i.code === "SALE_VALUE_INVALID")).toBe(true);
  });
  it("aceita valor vazio (mantém atual)", () => {
    expect(validateActionConfig(step("marcar-venda", { valueCents: "" }), "mark-sale")).toHaveLength(0);
  });
  it("summarize formata em BRL", () => {
    expect(summarizeConfig("mark-sale", { valueCents: "19900" })).toContain("R$");
  });
});

describe("add-note", () => {
  it("erra quando vazia", () => {
    expect(
      validateActionConfig(step("adicionar-anotacao", { note: "  " }), "add-note").some(
        (i) => i.code === "NOTE_EMPTY",
      ),
    ).toBe(true);
  });
});

describe("ai-classify (Fase 6)", () => {
  it("é executável e tem config kind", () => {
    expect(getConfigKind("classificar-ia")).toBe("ai-classify");
    expect(isExecutableMarketingFlowAction("classificar-ia")).toBe(true);
  });
  it("erra sem prompt e com menos de 2 categorias", () => {
    const issues = validateActionConfig(
      step("classificar-ia", { prompt: "", categories: [{ label: "Quente", nextStepId: "s2" }] }),
      "ai-classify",
    );
    expect(issues.some((i) => i.code === "AI_NO_PROMPT")).toBe(true);
    expect(issues.some((i) => i.code === "AI_FEW_CATEGORIES")).toBe(true);
  });
  it("erra categoria sem passo de destino", () => {
    const issues = validateActionConfig(
      step("classificar-ia", {
        prompt: "Classifique",
        categories: [
          { label: "Quente", nextStepId: "s2" },
          { label: "Frio", nextStepId: "" },
        ],
      }),
      "ai-classify",
    );
    expect(issues.some((i) => i.code === "AI_NO_STEP")).toBe(true);
  });
  it("config válida não gera erros e summarize lista rótulos", () => {
    const cfg = {
      prompt: "Classifique",
      categories: [
        { label: "Quente", nextStepId: "s2" },
        { label: "Frio", nextStepId: "s3" },
      ],
    };
    expect(validateActionConfig(step("classificar-ia", cfg), "ai-classify")).toHaveLength(0);
    expect(summarizeConfig("ai-classify", cfg)).toBe("IA → Quente / Frio");
  });
});
