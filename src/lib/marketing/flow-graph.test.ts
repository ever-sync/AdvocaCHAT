import { describe, expect, it } from "vitest";
import {
  analyzeFlowGraph,
  buildFlowGraph,
  nextNodeId,
  withExplicitGraph,
  FLOW_DEFINITION_FORMAT,
} from "./flow-graph";

function node(id: string, actionId: string, config?: Record<string, unknown>) {
  return { id, actionId, label: id, iconKey: "x", iconClass: "y", config };
}

describe("buildFlowGraph — legado (sem edges)", () => {
  it("deriva arestas lineares pela ordem do array", () => {
    const def = { steps: [node("a", "whatsapp"), node("b", "espera"), node("c", "email")] };
    const g = buildFlowGraph(def);
    expect(g.explicit).toBe(false);
    expect(g.entryId).toBe("a");
    expect(g.edges).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
  });

  it("deriva ramos sim/não de um split", () => {
    const def = {
      steps: [
        node("s", "dividir-caminho", { field: "x", trueStepId: "t", falseStepId: "f" }),
        node("t", "whatsapp"),
        node("f", "email"),
      ],
    };
    const g = buildFlowGraph(def);
    expect(g.edges).toContainEqual({ from: "s", to: "t", branch: "sim" });
    expect(g.edges).toContainEqual({ from: "s", to: "f", branch: "não" });
    // O split NAO deve ter aresta linear (so os dois ramos).
    expect(g.edges.filter((e) => e.from === "s")).toHaveLength(2);
  });

  it("deriva ramos por categoria de uma classificação por IA", () => {
    const def = {
      steps: [
        node("ia", "classificar-ia", {
          prompt: "x",
          categories: [
            { label: "Quente", nextStepId: "q" },
            { label: "Frio", nextStepId: "f" },
          ],
        }),
        node("q", "whatsapp"),
        node("f", "email"),
      ],
    };
    const g = buildFlowGraph(def);
    expect(g.edges).toContainEqual({ from: "ia", to: "q", branch: "Quente" });
    expect(g.edges).toContainEqual({ from: "ia", to: "f", branch: "Frio" });
    expect(g.edges.filter((e) => e.from === "ia")).toHaveLength(2);
  });

  it("ignora ponteiro de ramo apontando para passo inexistente", () => {
    const def = {
      steps: [node("s", "dividir-caminho", { field: "x", trueStepId: "ghost", falseStepId: "f" }), node("f", "email")],
    };
    const g = buildFlowGraph(def);
    expect(g.edges).toEqual([{ from: "s", to: "f", branch: "não" }]);
  });
});

describe("buildFlowGraph — format 2 (edges explicitas)", () => {
  it("usa as arestas explicitas e marca explicit=true", () => {
    const def = {
      format: 2,
      steps: [node("a", "whatsapp"), node("b", "email")],
      edges: [{ from: "a", to: "b", branch: "linha" }],
    };
    const g = buildFlowGraph(def);
    expect(g.explicit).toBe(true);
    expect(g.edges).toEqual([{ from: "a", to: "b", branch: "linha" }]);
  });

  it("descarta arestas com alvo inexistente", () => {
    const def = {
      format: 2,
      steps: [node("a", "whatsapp")],
      edges: [{ from: "a", to: "missing" }],
    };
    expect(buildFlowGraph(def).edges).toEqual([]);
  });
});

describe("nextNodeId", () => {
  // Grafo explicito (format 2) com saidas controladas: split -> t/f, ambos terminais.
  const g = buildFlowGraph({
    format: 2,
    steps: [
      node("s", "dividir-caminho", { field: "x", trueStepId: "t", falseStepId: "f" }),
      node("t", "whatsapp"),
      node("f", "email"),
    ],
    edges: [
      { from: "s", to: "t", branch: "sim" },
      { from: "s", to: "f", branch: "não" },
    ],
  });

  it("segue o ramo nomeado quando informado", () => {
    expect(nextNodeId(g, "s", "sim")).toBe("t");
    expect(nextNodeId(g, "s", "não")).toBe("f");
  });

  it("retorna null quando o no nao tem saida (no terminal)", () => {
    expect(nextNodeId(g, "t")).toBeNull();
  });

  it("cai na saida linear (sem branch) quando o branch pedido nao existe", () => {
    const lin = buildFlowGraph({
      format: 2,
      steps: [node("a", "whatsapp"), node("b", "email")],
      edges: [{ from: "a", to: "b" }],
    });
    expect(nextNodeId(lin, "a", "inexistente")).toBe("b");
  });
});

describe("analyzeFlowGraph", () => {
  it("não acusa problemas em fluxo linear bem formado", () => {
    const g = buildFlowGraph({ steps: [node("a", "whatsapp"), node("b", "email")] });
    expect(analyzeFlowGraph(g)).toEqual([]);
  });

  it("detecta no inalcancavel", () => {
    const def = {
      format: 2,
      steps: [node("a", "whatsapp"), node("b", "email"), node("orphan", "espera")],
      edges: [{ from: "a", to: "b" }],
    };
    const issues = analyzeFlowGraph(buildFlowGraph(def));
    expect(issues.some((i) => i.code === "GRAPH_UNREACHABLE" && i.nodeId === "orphan")).toBe(true);
  });

  it("detecta ciclo", () => {
    const def = {
      format: 2,
      steps: [node("a", "espera"), node("b", "espera")],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    };
    const issues = analyzeFlowGraph(buildFlowGraph(def));
    expect(issues.some((i) => i.code === "GRAPH_CYCLE")).toBe(true);
  });

  it("reconvergencia (merge) não é inalcancavel nem ciclo", () => {
    const def = {
      steps: [
        node("s", "dividir-caminho", { field: "x", trueStepId: "t", falseStepId: "f" }),
        node("t", "whatsapp"),
        node("f", "email"),
        node("m", "unir-caminho"),
      ],
      format: 2,
      edges: [
        { from: "s", to: "t", branch: "sim" },
        { from: "s", to: "f", branch: "não" },
        { from: "t", to: "m" },
        { from: "f", to: "m" },
      ],
    };
    expect(analyzeFlowGraph(buildFlowGraph(def))).toEqual([]);
  });
});

describe("withExplicitGraph", () => {
  it("congela edges derivadas e seta format 2", () => {
    const out = withExplicitGraph({ steps: [node("a", "whatsapp"), node("b", "email")] });
    expect(out.format).toBe(FLOW_DEFINITION_FORMAT);
    expect(out.edges).toEqual([{ from: "a", to: "b" }]);
    expect(out.steps).toHaveLength(2);
  });

  it("preserva edges existentes de um fluxo já format 2", () => {
    const def = {
      format: 2,
      steps: [node("a", "whatsapp"), node("b", "email")],
      edges: [{ from: "a", to: "b", branch: "custom" }],
    };
    expect(withExplicitGraph(def).edges).toEqual([{ from: "a", to: "b", branch: "custom" }]);
  });
});
