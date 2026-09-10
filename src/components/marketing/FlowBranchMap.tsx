// Mapa de ramificacoes do fluxo (Fase 2 — visual).
//
// O canvas principal do editor e linear (coluna horizontal de passos). Como o
// runtime agora percorre um GRAFO (arestas explicitas), passos que ramificam
// (split / teste-ab / esperar-condicao) tem MAIS de uma saida que a faixa
// linear nao mostra. Este painel deriva o grafo dos passos atuais (mesma fonte
// que o worker) e lista, por passo ramificado, cada saida rotulada e o passo de
// destino — alem de marcar reconvergencia (unir-caminho).

import { GitBranch, GitMerge, ArrowRight } from "lucide-react";
import { buildFlowGraph, type FlowGraphEdge } from "@/lib/marketing/flow-graph";

type StepLike = { id: string; actionId: string; label: string; config?: Record<string, unknown> };

const MERGE_ACTION = "unir-caminho";

export function FlowBranchMap({ steps }: { steps: StepLike[] }) {
  const graph = buildFlowGraph({ steps });
  const labelById = new Map(steps.map((s) => [s.id, s.label]));

  // Agrupa arestas por origem; so interessa quem tem 2+ saidas (ramifica).
  const byFrom = new Map<string, FlowGraphEdge[]>();
  for (const edge of graph.edges) {
    if (!byFrom.has(edge.from)) byFrom.set(edge.from, []);
    byFrom.get(edge.from)!.push(edge);
  }
  const branching = steps.filter((s) => (byFrom.get(s.id)?.length ?? 0) > 1);

  // Passos de merge: alvo de 2+ arestas, ou actionId de uniao.
  const inDegree = new Map<string, number>();
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }
  const merges = steps.filter(
    (s) => s.actionId === MERGE_ACTION || (inDegree.get(s.id) ?? 0) > 1,
  );

  if (branching.length === 0 && merges.length === 0) return null;

  return (
    <div className="mx-10 mb-10 flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Ramificações do fluxo</h3>
        <span className="text-xs text-muted-foreground">
          Caminhos que o worker percorre além da linha principal
        </span>
      </div>

      {branching.map((step) => (
        <div key={step.id} className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-3">
          <span className="text-sm font-semibold text-foreground">{step.label}</span>
          <div className="flex flex-wrap gap-2">
            {(byFrom.get(step.id) ?? []).map((edge, i) => (
              <span
                key={`${edge.to}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
              >
                {edge.branch ? (
                  <span className="font-semibold text-primary">{edge.branch}</span>
                ) : (
                  <span className="font-semibold text-muted-foreground">seguir</span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                <span className="text-foreground">
                  {labelById.get(edge.to) ?? "(passo removido)"}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}

      {merges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <GitMerge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Reconvergência
          </span>
          {merges.map((step) => (
            <span
              key={step.id}
              className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
            >
              {step.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
