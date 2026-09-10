// Grafo dos fluxos de automacao (Fase 2 do plano completo).
//
// Ate a Fase 1 o fluxo era um array linear `definition.steps[]`: o "proximo
// passo" era o indice seguinte, e ramificacoes (split/teste-ab/esperar-condicao)
// apontavam por id via config (trueStepId/falseStepId/variants[].nextStepId/
// alternativeStepId). Isso nao expressa reconvergencia (merge) e faz ramos
// "vazarem" um pro outro pelo fallback idx+1.
//
// A Fase 2 introduz arestas EXPLICITAS (`definition.edges`, format >= 2) como
// representacao canonica do grafo. Fluxos legados (sem edges) continuam lendo
// pelo formato antigo: derivamos as arestas a partir da ordem do array + dos
// ponteiros de config. Assim o worker e o editor consomem sempre um grafo
// normalizado, com retrocompatibilidade total e migracao lazy (o proximo
// publish salva o format 2).

// Tipos de ramificacao detectados por actionId — mantido local (sem importar
// flow-action-configs) para o modulo ficar puro e sem ciclo de import. Espelha
// os actionIds com saidas multiplas em ACTION_CONFIG_REGISTRY.
const SPLIT_ACTIONS = new Set(["dividir-caminho", "dividir-por-segmentacao"]);
const AB_TEST_ACTIONS = new Set(["teste-ab"]);
const WAIT_UNTIL_ACTIONS = new Set(["esperar-condicao"]);
const AI_CLASSIFY_ACTIONS = new Set(["classificar-ia"]);

type BranchKind = "split" | "ab-test" | "wait-until" | "ai-classify" | "linear";

function branchKind(actionId: string): BranchKind {
  if (SPLIT_ACTIONS.has(actionId)) return "split";
  if (AB_TEST_ACTIONS.has(actionId)) return "ab-test";
  if (WAIT_UNTIL_ACTIONS.has(actionId)) return "wait-until";
  if (AI_CLASSIFY_ACTIONS.has(actionId)) return "ai-classify";
  return "linear";
}

// ---------------------------------------------------------------- Tipos

/** Aresta dirigida entre dois nos. `branch` rotula a saida (ex.: "sim"/"não"). */
export type FlowGraphEdge = {
  from: string;
  to: string;
  /** Rotulo da saida; ausente = saida linear/default unica. */
  branch?: string;
};

export type FlowGraphNodeLike = {
  id: string;
  actionId: string;
  config?: Record<string, unknown>;
};

export type FlowGraph = {
  nodeIds: string[];
  edges: FlowGraphEdge[];
  /** id do primeiro no (entrada do fluxo); null se nao ha nos. */
  entryId: string | null;
  /** true quando o grafo veio de `definition.edges` (format 2). */
  explicit: boolean;
};

export const FLOW_DEFINITION_FORMAT = 2 as const;

// ---------------------------------------------------------------- Helpers

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Le os nos (steps) crus da definition, mantendo a ordem do array. */
export function parseGraphNodes(
  definition: Record<string, unknown> | undefined,
): FlowGraphNodeLike[] {
  const raw = definition?.steps;
  if (!Array.isArray(raw)) return [];
  const out: FlowGraphNodeLike[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    const id = str(rec.id);
    const actionId = str(rec.actionId);
    if (!id || !actionId) continue;
    out.push({
      id,
      actionId,
      config: rec.config && typeof rec.config === "object"
        ? (rec.config as Record<string, unknown>)
        : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------- Derivacao do legado

/**
 * Deriva as arestas de um fluxo legado a partir da ordem dos nos + ponteiros de
 * config. Cada saida de ramificacao vira uma aresta rotulada; nos sem
 * ramificacao recebem a aresta linear (no seguinte no array), exceto o no de
 * merge `unir-caminho`, cuja unica saida tambem e a linear.
 */
export function deriveEdgesFromLegacy(nodes: FlowGraphNodeLike[]): FlowGraphEdge[] {
  const edges: FlowGraphEdge[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  const linkIfExists = (from: string, to: string, branch?: string) => {
    if (to && ids.has(to)) edges.push({ from, to, branch });
  };

  nodes.forEach((node, index) => {
    const next = nodes[index + 1]?.id ?? "";
    const c = asRecord(node.config);
    const kind = branchKind(node.actionId);

    if (kind === "split") {
      linkIfExists(node.id, str(c.trueStepId), "sim");
      linkIfExists(node.id, str(c.falseStepId), "não");
      return;
    }
    if (kind === "ab-test") {
      const variants = Array.isArray(c.variants) ? c.variants : [];
      variants.forEach((v, i) => {
        const vr = asRecord(v);
        const label = str(vr.label) || `Variante ${String.fromCharCode(65 + i)}`;
        linkIfExists(node.id, str(vr.nextStepId), label);
      });
      return;
    }
    if (kind === "ai-classify") {
      const cats = Array.isArray(c.categories) ? c.categories : [];
      cats.forEach((v, i) => {
        const vr = asRecord(v);
        const label = str(vr.label) || `Categoria ${i + 1}`;
        linkIfExists(node.id, str(vr.nextStepId), label);
      });
      return;
    }
    if (kind === "wait-until") {
      // Condicao atendida = avanca linear; timeout = caminho alternativo.
      linkIfExists(node.id, next, "condição atendida");
      linkIfExists(node.id, str(c.alternativeStepId), "tempo esgotado");
      return;
    }
    // Linear (inclui unir-caminho, que tem uma unica saida).
    linkIfExists(node.id, next);
  });

  return edges;
}

/** Le arestas explicitas (`definition.edges`), mantendo so as validas. */
export function parseExplicitEdges(
  definition: Record<string, unknown> | undefined,
  nodeIds: Set<string>,
): FlowGraphEdge[] {
  const raw = definition?.edges;
  if (!Array.isArray(raw)) return [];
  const out: FlowGraphEdge[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    const from = str(rec.from);
    const to = str(rec.to);
    if (!from || !to || !nodeIds.has(from) || !nodeIds.has(to)) continue;
    const branch = str(rec.branch);
    out.push(branch ? { from, to, branch } : { from, to });
  }
  return out;
}

// ---------------------------------------------------------------- Normalizacao

function hasExplicitEdges(definition: Record<string, unknown> | undefined): boolean {
  const fmt = Number(definition?.format ?? 0);
  return fmt >= FLOW_DEFINITION_FORMAT && Array.isArray(definition?.edges);
}

/**
 * Constroi o grafo normalizado da definition: usa arestas explicitas quando o
 * formato e >= 2; senao deriva do legado (ordem + ponteiros).
 */
export function buildFlowGraph(
  definition: Record<string, unknown> | undefined,
): FlowGraph {
  const nodes = parseGraphNodes(definition);
  const nodeIds = nodes.map((n) => n.id);
  const idSet = new Set(nodeIds);
  const explicit = hasExplicitEdges(definition);
  const edges = explicit
    ? parseExplicitEdges(definition, idSet)
    : deriveEdgesFromLegacy(nodes);
  return {
    nodeIds,
    edges,
    entryId: nodeIds[0] ?? null,
    explicit,
  };
}

/**
 * Aumenta a definition com o grafo explicito (`edges` + `format: 2`),
 * preservando o resto. Idempotente: se ja for format 2 com edges, mantem as
 * arestas existentes (respeita o que um editor de grafo tenha desenhado);
 * senao deriva do legado (ordem + ponteiros de config). Usado no publish para
 * congelar o grafo da versao publicada.
 */
export function withExplicitGraph(
  definition: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = definition ?? {};
  const graph = buildFlowGraph(base);
  return {
    ...base,
    format: FLOW_DEFINITION_FORMAT,
    edges: graph.edges,
  };
}

// ---------------------------------------------------------------- Travessia

/**
 * Proximo no a partir de `fromId`, dado um `branch` opcional escolhido em
 * runtime (split/teste-ab/wait-until). Sem branch, segue a aresta linear
 * (a primeira sem rotulo, ou a unica existente). Retorna null se nao ha saida.
 */
export function nextNodeId(
  graph: FlowGraph,
  fromId: string,
  branch?: string,
): string | null {
  const outgoing = graph.edges.filter((e) => e.from === fromId);
  if (outgoing.length === 0) return null;
  if (branch != null) {
    const match = outgoing.find((e) => e.branch === branch);
    if (match) return match.to;
  }
  const linear = outgoing.find((e) => e.branch == null);
  return (linear ?? outgoing[0]).to;
}

// ---------------------------------------------------------------- Analise (validacao)

export type FlowGraphIssue = {
  code: "GRAPH_BROKEN_TARGET" | "GRAPH_UNREACHABLE" | "GRAPH_CYCLE";
  nodeId?: string;
  detail?: string;
};

/**
 * Analisa o grafo em busca de problemas estruturais que tornam o fluxo
 * inseguro de ativar: alvo inexistente, no inalcancavel e ciclo.
 */
export function analyzeFlowGraph(graph: FlowGraph): FlowGraphIssue[] {
  const issues: FlowGraphIssue[] = [];
  const idSet = new Set(graph.nodeIds);

  // 1) Alvos quebrados (defesa; parsers ja filtram, mas edges explicitas podem
  //    referenciar nos removidos se vierem de import).
  for (const edge of graph.edges) {
    if (!idSet.has(edge.to)) {
      issues.push({ code: "GRAPH_BROKEN_TARGET", nodeId: edge.from, detail: edge.to });
    }
  }

  if (!graph.entryId) return issues;

  // 2) Alcancabilidade a partir da entrada (BFS).
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }
  const reachable = new Set<string>();
  const queue: string[] = [graph.entryId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const to of adj.get(id) ?? []) {
      if (!reachable.has(to)) queue.push(to);
    }
  }
  for (const id of graph.nodeIds) {
    if (!reachable.has(id)) {
      issues.push({ code: "GRAPH_UNREACHABLE", nodeId: id });
    }
  }

  // 3) Ciclo (DFS com pilha de recursao).
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of graph.nodeIds) color.set(id, WHITE);
  let cycleNode: string | null = null;

  const visit = (id: string): boolean => {
    color.set(id, GRAY);
    for (const to of adj.get(id) ?? []) {
      const c = color.get(to) ?? WHITE;
      if (c === GRAY) {
        cycleNode = to;
        return true;
      }
      if (c === WHITE && visit(to)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const id of graph.nodeIds) {
    if ((color.get(id) ?? WHITE) === WHITE && visit(id)) break;
  }
  if (cycleNode) {
    issues.push({ code: "GRAPH_CYCLE", nodeId: cycleNode });
  }

  return issues;
}
