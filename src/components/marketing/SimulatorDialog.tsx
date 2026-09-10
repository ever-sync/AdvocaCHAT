// Simulador de fluxo (Fase 7 do plano completo).
// - Usuario preenche dados de um lead "fake" e o simulador caminha pelos
//   steps publicados, decidindo splits com o evaluator TS.
// - Mostra a trilha com label de cada step, decisao do split e razao do fim
//   (concluido / step alvo inexistente / loop / atingiu limite).

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateSimpleCondition, type EvalContext } from "@/lib/marketing/criteria-evaluator";
import { getConfigKind, parseConfig } from "@/lib/marketing/flow-action-configs";
import {
  analyzeFlowGraph,
  buildFlowGraph,
  type FlowGraphIssue,
  nextNodeId,
} from "@/lib/marketing/flow-graph";
import { cn } from "@/lib/utils";

type SimStep = {
  id: string;
  actionId: string;
  label: string;
  config?: Record<string, unknown>;
};

type TraceEntry = {
  step: SimStep;
  branchLabel?: string;
  branchNote?: string;
  decision?: { result: boolean; field: string; operator: string; value: string };
  nextStepId?: string;
  nextStepLabel?: string;
};

const MAX_HOPS = 50;

function parseSteps(definition: Record<string, unknown> | null | undefined): SimStep[] {
  const raw = (definition as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): SimStep | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : null;
      const actionId = typeof rec.actionId === "string" ? rec.actionId : null;
      const label = typeof rec.label === "string" ? rec.label : actionId ?? "";
      if (!id || !actionId) return null;
      const config =
        rec.config && typeof rec.config === "object"
          ? (rec.config as Record<string, unknown>)
          : undefined;
      return { id, actionId, label, config };
    })
    .filter((s): s is SimStep => s !== null);
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickWeightedVariant<T extends { weight: number }>(items: T[], seed: string): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (items.length === 0 || total <= 0) return items[0] ?? null;
  let cursor = hashSeed(seed) % total;
  for (const item of items) {
    const weight = Math.max(0, item.weight);
    if (cursor < weight) return item;
    cursor -= weight;
  }
  return items[items.length - 1] ?? null;
}

function resolveBranchLabel(step: SimStep, ctx: EvalContext): { label?: string; note?: string; decision?: TraceEntry["decision"] } {
  const kind = getConfigKind(step.actionId);
  if (kind === "split") {
    const cfg = parseConfig("split", step.config);
    const result = evaluateSimpleCondition(cfg.field, cfg.operator, cfg.value, ctx);
    return {
      label: result ? "sim" : "não",
      decision: {
        result,
        field: cfg.field,
        operator: cfg.operator,
        value: cfg.value,
      },
    };
  }
  if (kind === "ab-test") {
    const cfg = parseConfig("ab-test", step.config);
    const variant = pickWeightedVariant(cfg.variants, `${ctx.cliente?.nome ?? ""}|${ctx.cliente?.email ?? ""}|${ctx.cliente?.telefone ?? ""}`);
    return {
      label: variant?.label || variant?.id,
      note: variant
        ? `Variante simulada com base no peso configurado (${variant.weight}%).`
        : "Sem variante configurada.",
    };
  }
  if (kind === "wait-until") {
    const cfg = parseConfig("wait-until", step.config);
    const result = evaluateSimpleCondition(cfg.field, cfg.operator, cfg.value, ctx);
    return {
      label: result ? "condição atendida" : "tempo esgotado",
      note: result
        ? "A condição já está satisfeita no contexto informado."
        : "A condição ainda não está satisfeita, então o fluxo cairia no timeout.",
      decision: {
        result,
        field: cfg.field,
        operator: cfg.operator,
        value: cfg.value,
      },
    };
  }
  if (kind === "ai-classify") {
    const cfg = parseConfig("ai-classify", step.config);
    const choice = pickWeightedVariant(
      cfg.categories.map((category, index) => ({
        ...category,
        weight: 1,
        nextStepId: category.nextStepId,
        label: category.label || `Categoria ${index + 1}`,
      })),
      `${ctx.cliente?.nome ?? ""}|${ctx.cliente?.email ?? ""}|${ctx.cliente?.telefone ?? ""}|${cfg.prompt}`,
    );
    return {
      label: choice?.label || choice?.nextStepId,
      note: choice
        ? "Classificação simulada para mostrar o caminho do fluxo."
        : "Sem categoria configurada.",
    };
  }
  return {};
}

function describeGraphIssue(issue: FlowGraphIssue): string {
  switch (issue.code) {
    case "GRAPH_BROKEN_TARGET":
      return `Aresta quebrada em ${issue.nodeId ?? "nó"} → ${issue.detail ?? "destino ausente"}`;
    case "GRAPH_UNREACHABLE":
      return `Nó inalcançável${issue.nodeId ? `: ${issue.nodeId}` : ""}`;
    case "GRAPH_CYCLE":
      return `Ciclo detectado${issue.nodeId ? ` em ${issue.nodeId}` : ""}`;
  }
}

function walkFlow(
  steps: SimStep[],
  definition: Record<string, unknown> | null | undefined,
  ctx: EvalContext,
): {
  trace: TraceEntry[];
  outcome: "completed" | "missing" | "loop" | "limit";
  issues: FlowGraphIssue[];
} {
  if (steps.length === 0) {
    return {
      trace: [],
      outcome: "completed",
      issues: [],
    };
  }
  const graph = buildFlowGraph(definition ?? undefined);
  const issues = analyzeFlowGraph(graph);
  const stepMap = new Map(steps.map((step) => [step.id, step] as const));
  const trace: TraceEntry[] = [];
  const visited = new Set<string>();
  let currentId = graph.entryId;
  while (currentId && trace.length < MAX_HOPS) {
    if (visited.has(currentId)) {
      return { trace, outcome: "loop", issues };
    }
    visited.add(currentId);
    const step = stepMap.get(currentId);
    if (!step) {
      return { trace, outcome: "missing", issues };
    }
    const entry: TraceEntry = { step };
    const resolution = resolveBranchLabel(step, ctx);
    if (resolution.decision) entry.decision = resolution.decision;
    if (resolution.label) entry.branchLabel = resolution.label;
    if (resolution.note) entry.branchNote = resolution.note;
    const nextId = resolution.label
      ? nextNodeId(graph, step.id, resolution.label)
      : nextNodeId(graph, step.id);
    if (nextId) {
      entry.nextStepId = nextId;
      entry.nextStepLabel = stepMap.get(nextId)?.label ?? nextId;
      trace.push(entry);
      currentId = nextId;
      continue;
    }
    const outgoing = graph.edges.filter((edge) => edge.from === step.id);
    trace.push(entry);
    if (outgoing.length > 0) {
      return { trace, outcome: "missing", issues };
    }
    return { trace, outcome: "completed", issues };
  }
  if (trace.length >= MAX_HOPS) {
    return { trace, outcome: "limit", issues };
  }
  return { trace, outcome: currentId ? "loop" : "completed", issues };
}

export function SimulatorDialog({
  open,
  onOpenChange,
  definition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: Record<string, unknown> | null | undefined;
}) {
  const steps = useMemo(() => parseSteps(definition), [definition]);
  const graph = useMemo(() => buildFlowGraph(definition ?? undefined), [definition]);
  const issues = useMemo(() => analyzeFlowGraph(graph), [graph]);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");
  const [trace, setTrace] = useState<TraceEntry[] | null>(null);
  const [outcome, setOutcome] = useState<"completed" | "missing" | "loop" | "limit" | null>(null);

  const handleRun = () => {
    const tags = tagsCsv
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const ctx: EvalContext = {
      cliente: {
        nome,
        email,
        telefone,
        etiquetas: tags,
      },
      negociacao: {},
      contexto: {},
    };
    const res = walkFlow(steps, definition, ctx);
    setTrace(res.trace);
    setOutcome(res.outcome);
  };

  const handleReset = () => {
    setTrace(null);
    setOutcome(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleReset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Simulador
          </DialogTitle>
          <DialogDescription>
            Preencha os dados de um lead fictício e veja o caminho que ele percorreria neste fluxo.
            Avalia o rascunho atual — não dispara execução real.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            {graph.explicit ? "Grafo explícito" : "Modo legado"}
          </Badge>
          <Badge variant="outline" className="gap-1">
            {steps.length} passos
          </Badge>
          <Badge variant="outline" className="gap-1">
            {issues.length} alertas
          </Badge>
        </div>

        {issues.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="mb-2 inline-flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              O grafo tem alertas estruturais
            </div>
            <ul className="space-y-1">
              {issues.slice(0, 4).map((issue, index) => (
                <li key={`${issue.code}-${issue.nodeId ?? index}`}>• {describeGraphIssue(issue)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-nome">Nome</Label>
            <Input id="sim-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-email">E-mail</Label>
            <Input id="sim-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-telefone">Telefone</Label>
            <Input id="sim-telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-tags">Etiquetas (vírgula)</Label>
            <Input
              id="sim-tags"
              value={tagsCsv}
              onChange={(e) => setTagsCsv(e.target.value)}
              placeholder="vip, fidelizado"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={handleRun} disabled={steps.length === 0} className="gap-2">
            <Play className="h-4 w-4" aria-hidden />
            Simular
          </Button>
          {trace ? (
            <Button type="button" variant="ghost" onClick={handleReset}>
              Limpar
            </Button>
          ) : null}
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground self-center">
              Adicione passos no editor antes de simular.
            </p>
          ) : null}
        </div>

        {trace ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
            <ol className="flex flex-col gap-2">
              {trace.map((entry, index) => (
                <li
                  key={`${entry.step.id}-${index}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{entry.step.label}</p>
                    {entry.branchLabel ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Caminho escolhido:{" "}
                        <span className="font-semibold text-foreground">{entry.branchLabel}</span>
                      </p>
                    ) : null}
                    {entry.branchNote ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.branchNote}
                      </p>
                    ) : null}
                    {entry.decision ? (
                      <p
                        className={cn(
                          "mt-0.5 inline-flex items-center gap-1.5 text-xs",
                          entry.decision.result
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-amber-600 dark:text-amber-400",
                        )}
                        >
                          Condição{" "}
                          <code className="rounded bg-background px-1 py-0.5 font-mono">
                            {entry.decision.field} {entry.decision.operator}{" "}
                            {entry.decision.value || "—"}
                          </code>{" "}
                          →{" "}
                          <span className="font-semibold">{entry.decision.result ? "sim" : "não"}</span>
                          <ArrowRight className="h-3 w-3" aria-hidden />
                          <span>{entry.nextStepLabel || entry.nextStepId || "—"}</span>
                      </p>
                    ) : null}
                    {entry.nextStepLabel && !entry.decision ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Próximo passo: <span className="font-semibold text-foreground">{entry.nextStepLabel}</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-3 border-t border-border pt-3 text-sm">
              {outcome === "completed" ? (
                <p className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Lead chegaria ao fim do fluxo.
                </p>
              ) : outcome === "missing" ? (
                <p className="inline-flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-4 w-4" aria-hidden />
                  Um split aponta para um passo inexistente. Lead pararia neste ponto.
                </p>
              ) : outcome === "loop" ? (
                <p className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Loader2 className="h-4 w-4" aria-hidden />
                  Detectei um loop. Lead voltaria a um passo já percorrido.
                </p>
              ) : outcome === "limit" ? (
                <p className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  Simulação interrompida em {MAX_HOPS} passos.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
