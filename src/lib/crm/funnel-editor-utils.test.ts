import { describe, expect, it } from "vitest";
import {
  createDefaultStage,
  slugifyFunnelKey,
  uniqueKey,
  validateFunnelsDraft,
} from "./funnel-editor-utils";

describe("funnel-editor-utils", () => {
  it("slugify normaliza texto", () => {
    expect(slugifyFunnelKey("Isenção de IR")).toBe("isencao-de-ir");
  });

  it("uniqueKey evita colisão", () => {
    const set = new Set(["lead", "lead-2"]);
    expect(uniqueKey(set, "lead")).toBe("lead-3");
  });

  it("createDefaultStage gera id (chave) aleatório único", () => {
    const funnel = {
      id: "comercial",
      listName: "COMERCIAL",
      stages: [{ id: "lead", title: "LEAD" }],
    };
    const stage = createDefaultStage(funnel, "Nova etapa");
    expect(stage.title).toBe("NOVA ETAPA");
    // Chave aleatória: não é slug do título, não colide com etapas existentes.
    expect(stage.id).not.toBe("nova-etapa");
    expect(stage.id).not.toBe("lead");
    expect(stage.id.length).toBeGreaterThan(8);
    // Duas gerações produzem chaves diferentes.
    expect(createDefaultStage(funnel, "Nova etapa").id).not.toBe(stage.id);
  });

  it("validateFunnelsDraft detecta etapa sem título", () => {
    const err = validateFunnelsDraft([
      {
        id: "f1",
        listName: "F1",
        stages: [{ id: "a", title: "" }],
      },
    ]);
    expect(err).toContain("Preencha nome");
  });
});
