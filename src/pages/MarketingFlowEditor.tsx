import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  Sparkles,
  Undo2,
  UserPlus,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MarketingFlowActionsPanel } from "@/components/marketing/MarketingFlowActionsPanel";
import { MarketingFlowTriggerSettingsPanel } from "@/components/marketing/MarketingFlowTriggerSettingsPanel";
import {
  ACTION_ICONS,
  DRAG_MIME,
  type DragPayload,
} from "@/components/marketing/flow-actions";
import {
  useMarketingFlow,
  usePublishMarketingFlow,
  useUpdateMarketingFlow,
  type MarketingFlowRecord,
} from "@/lib/api/marketing-flows";
import {
  validateFlow,
  type ValidationIssue,
  type ValidationResult,
} from "@/lib/marketing/flow-validation";
import {
  getConfigKind,
  parseConfig,
  summarizeConfig,
} from "@/lib/marketing/flow-action-configs";
import {
  getMarketingTriggerDefinition,
  summarizeMarketingTrigger,
} from "@/lib/marketing/flow-triggers";
import { pickConfigComponent } from "@/components/marketing/action-configs";
import { FlowExecutionsPanel } from "@/components/marketing/FlowExecutionsPanel";
import { SimulatorDialog } from "@/components/marketing/SimulatorDialog";
import { FlowCanvas, type NodePositions } from "@/components/marketing/FlowCanvas";
import { ManualEnrollDialog } from "@/components/marketing/ManualEnrollDialog";
import { FlowBranchMap } from "@/components/marketing/FlowBranchMap";
import { withExplicitGraph, FLOW_DEFINITION_FORMAT } from "@/lib/marketing/flow-graph";
import type { MarketingFlowEdge } from "@/lib/marketing/flow-types";
import { cn } from "@/lib/utils";

type FlowTab = "editor" | "configuracoes" | "saida" | "historico";

const SUBTITLE_VARIANTS = ["plain", "primary", "chip", "multiline"] as const;
type SubtitleVariant = (typeof SUBTITLE_VARIANTS)[number];

type FlowStep = {
  id: string;
  actionId: string;
  label: string;
  iconKey: string;
  iconClass: string;
  subtitle?: string;
  subtitleVariant?: SubtitleVariant;
  config?: Record<string, unknown>;
};

function isSubtitleVariant(value: unknown): value is SubtitleVariant {
  return (
    typeof value === "string" &&
    (SUBTITLE_VARIANTS as readonly string[]).includes(value)
  );
}

/** Reidrata o array de steps salvo no jsonb `definition.steps`. */
function parseStepsFromDefinition(definition: Record<string, unknown> | undefined): FlowStep[] {
  const raw = definition?.steps;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): FlowStep | null => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const actionId = typeof rec.actionId === "string" ? rec.actionId : null;
      const label = typeof rec.label === "string" ? rec.label : null;
      const iconKey = typeof rec.iconKey === "string" ? rec.iconKey : null;
      const iconClass = typeof rec.iconClass === "string" ? rec.iconClass : null;
      if (!actionId || !label || !iconKey || !iconClass) return null;
      const subtitle = typeof rec.subtitle === "string" ? rec.subtitle : undefined;
      const subtitleVariant = isSubtitleVariant(rec.subtitleVariant)
        ? rec.subtitleVariant
        : undefined;
      const config =
        rec.config && typeof rec.config === "object"
          ? (rec.config as Record<string, unknown>)
          : undefined;
      const id =
        typeof rec.id === "string" && rec.id.length > 0 ? rec.id : `step-${index + 1}`;
      return { id, actionId, label, iconKey, iconClass, subtitle, subtitleVariant, config };
    })
    .filter((step): step is FlowStep => step !== null);
}

type FlowCriteria = { conditions: string[] };

function parseCriteria(criteria: Record<string, unknown> | undefined): FlowCriteria {
  const raw = criteria?.conditions;
  if (!Array.isArray(raw)) return { conditions: [] };
  const conditions = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((s) => s.length > 0);
  return { conditions };
}

type FlowSettings = {
  allowReentry: boolean;
  autoAbandonDays: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function parseFlowSettings(definition: Record<string, unknown> | undefined): FlowSettings {
  const rec = asRecord(definition?.settings);
  const allowReentry = rec.allowReentry === true;
  let autoAbandonDays: number | null = null;
  if (
    typeof rec.autoAbandonDays === "number" &&
    Number.isFinite(rec.autoAbandonDays) &&
    rec.autoAbandonDays > 0
  ) {
    autoAbandonDays = Math.floor(rec.autoAbandonDays);
  }
  return { allowReentry, autoAbandonDays };
}

function parseExitConditions(definition: Record<string, unknown> | undefined): string[] {
  const raw = definition?.exitConditions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((s) => s.length > 0);
}

/** Reidrata as arestas explicitas do grafo (format >= 2). */
function parseEdgesFromDefinition(
  definition: Record<string, unknown> | undefined,
): MarketingFlowEdge[] {
  const raw = definition?.edges;
  if (!Array.isArray(raw)) return [];
  const out: MarketingFlowEdge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const from = typeof rec.from === "string" ? rec.from : "";
    const to = typeof rec.to === "string" ? rec.to : "";
    if (!from || !to) continue;
    const branch = typeof rec.branch === "string" && rec.branch ? rec.branch : undefined;
    out.push(branch ? { from, to, branch } : { from, to });
  }
  return out;
}

/** Reidrata as posicoes dos nos salvas em `definition.positions`. */
function parsePositionsFromDefinition(
  definition: Record<string, unknown> | undefined,
): NodePositions {
  const raw = definition?.positions;
  if (!raw || typeof raw !== "object") return {};
  const out: NodePositions = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const rec = value as Record<string, unknown>;
    if (typeof rec.x === "number" && typeof rec.y === "number") {
      out[id] = { x: rec.x, y: rec.y };
    }
  }
  return out;
}

/**
 * Monta a definition normalizada com grafo explicito. Respeita as arestas
 * desenhadas no canvas; se nenhuma foi desenhada (fluxo legado linear), deriva
 * do legado via withExplicitGraph. Sempre carimba format 2 + positions.
 */
function buildGraphDefinition(
  base: Record<string, unknown>,
  steps: FlowStep[],
  edges: MarketingFlowEdge[],
  positions: NodePositions,
): Record<string, unknown> {
  const withSteps = { ...base, steps, positions };
  if (edges.length > 0) {
    return { ...withSteps, edges, format: FLOW_DEFINITION_FORMAT };
  }
  return withExplicitGraph(withSteps);
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-1 py-3 text-base font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active ? (
        <span
          className="absolute -top-px left-0 right-0 h-[3px] rounded-full bg-primary"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function CriteriaEditDialog({
  open,
  onOpenChange,
  initialConditions,
  isPending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialConditions: string[];
  isPending: boolean;
  onSave: (conditions: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(initialConditions.join("\n"));
    }
  }, [open, initialConditions]);

  const handleSave = () => {
    const conditions = draft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    onSave(conditions);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Critérios de entrada</DialogTitle>
          <DialogDescription>
            Liste cada critério em uma linha. Os leads precisam atender a todos para percorrer este fluxo.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={"Você paga imposto de renda? é igual a Sim\nSelecione o benefício: não é igual a Na Ativa"}
          rows={8}
          className="font-medium"
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Salvar critérios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const SUBTITLE_VARIANT_LABELS: Record<SubtitleVariant, string> = {
  plain: "Sem destaque",
  primary: "Destaque",
  chip: "Etiqueta",
  multiline: "Multilinha",
};

function StepEditDialog({
  step,
  steps,
  flowId,
  onOpenChange,
  onSave,
}: {
  step: FlowStep | null;
  steps: FlowStep[];
  flowId: string;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<FlowStep>) => void;
}) {
  const configKind = step ? getConfigKind(step.actionId) : null;
  const ConfigComponent = step ? pickConfigComponent(step.actionId) : null;
  const configContext = useMemo(
    () => ({
      steps: steps
        .filter((s) => !step || s.id !== step.id)
        .map((s) => ({ id: s.id, label: s.label })),
      currentFlowId: flowId,
    }),
    [steps, step, flowId],
  );

  // Estado pro caminho "subtitle livre" (actions sem config schema).
  const [subtitleDraft, setSubtitleDraft] = useState("");
  const [variantDraft, setVariantDraft] = useState<SubtitleVariant>("plain");

  // Estado pro caminho "config estruturada" (actions cobertas pelo registry).
  const [configDraft, setConfigDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!step) return;
    setSubtitleDraft(step.subtitle ?? "");
    setVariantDraft(step.subtitleVariant ?? "plain");
    if (configKind) {
      setConfigDraft(parseConfig(configKind, step.config) as Record<string, unknown>);
    }
    // intencional: rebaseia drafts ao trocar de step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleSaveConfig = () => {
    if (!step || !configKind) return;
    const subtitle = summarizeConfig(configKind, configDraft);
    onSave({
      config: configDraft,
      subtitle: subtitle || undefined,
      subtitleVariant: subtitle ? "plain" : undefined,
    });
  };

  const handleSaveSubtitle = () => {
    const trimmed = subtitleDraft.trim();
    if (!trimmed) {
      onSave({ subtitle: undefined, subtitleVariant: undefined });
    } else {
      onSave({ subtitle: trimmed, subtitleVariant: variantDraft });
    }
  };

  if (!step) return null;

  // Painel lateral (estilo n8n): configura o nó sem modal, com o canvas visível.
  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200"
      role="dialog"
      aria-label={`Configurar ${step.label}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white",
              step.iconClass,
            )}
          >
            {(() => {
              const Icon = ACTION_ICONS[step.iconKey];
              return Icon ? <Icon className="h-4 w-4" aria-hidden /> : null;
            })()}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{step.label}</h2>
            <p className="text-xs text-muted-foreground">
              {ConfigComponent
                ? "Os valores são salvos com o fluxo no “Salvar” do cabeçalho."
                : "Descrição livre do passo (em branco remove)."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Fechar painel"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {ConfigComponent && configKind ? (
          <ConfigComponent
            value={parseConfig(configKind, configDraft)}
            onChange={(next) => setConfigDraft(next as Record<string, unknown>)}
            context={configContext}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="step-subtitle">Descrição</Label>
              {variantDraft === "multiline" ? (
                <Textarea
                  id="step-subtitle"
                  value={subtitleDraft}
                  onChange={(event) => setSubtitleDraft(event.target.value)}
                  rows={4}
                />
              ) : (
                <Input
                  id="step-subtitle"
                  value={subtitleDraft}
                  onChange={(event) => setSubtitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSaveSubtitle();
                    }
                  }}
                />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="step-variant">Estilo</Label>
              <Select
                value={variantDraft}
                onValueChange={(value) => setVariantDraft(value as SubtitleVariant)}
              >
                <SelectTrigger id="step-variant">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBTITLE_VARIANTS.map((variant) => (
                    <SelectItem key={variant} value={variant}>
                      {SUBTITLE_VARIANT_LABELS[variant]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={ConfigComponent ? handleSaveConfig : handleSaveSubtitle}
        >
          Aplicar
        </Button>
      </div>
    </aside>
  );
}

function FlowSettingsPanel({
  flow,
  onPatch,
  onTriggerChange,
  isPending,
}: {
  flow: MarketingFlowRecord;
  onPatch: (overrides: Record<string, unknown>) => void;
  onTriggerChange: (trigger: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const settings = parseFlowSettings(flow.definition);
  const [abandonDraft, setAbandonDraft] = useState(
    settings.autoAbandonDays != null ? String(settings.autoAbandonDays) : "",
  );

  useEffect(() => {
    setAbandonDraft(
      settings.autoAbandonDays != null ? String(settings.autoAbandonDays) : "",
    );
  }, [settings.autoAbandonDays]);

  const commitAbandonDays = () => {
    const trimmed = abandonDraft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const next =
      parsed != null && Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : null;
    if (next === settings.autoAbandonDays) return;
    onPatch({ settings: { ...settings, autoAbandonDays: next } });
  };

  const handleToggleReentry = (checked: boolean) => {
    if (checked === settings.allowReentry) return;
    onPatch({ settings: { ...settings, allowReentry: checked } });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Configurações</h2>
        <p className="text-sm text-muted-foreground">
          Defina como os leads se comportam neste fluxo.
        </p>
      </div>

      <MarketingFlowTriggerSettingsPanel
        flow={flow}
        onTriggerChange={onTriggerChange}
        isPending={isPending}
      />

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="allow-reentry" className="text-sm font-semibold">
              Permitir reentrada
            </Label>
            <p className="text-xs text-muted-foreground">
              Se ativado, um mesmo lead pode percorrer o fluxo mais de uma vez.
            </p>
          </div>
          <Switch
            id="allow-reentry"
            checked={settings.allowReentry}
            onCheckedChange={handleToggleReentry}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="abandon-days" className="text-sm font-semibold">
              Abandono automático após inatividade
            </Label>
            <p className="text-xs text-muted-foreground">
              Remove o lead do fluxo se não houver interação por N dias. Deixe vazio para desabilitar.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="abandon-days"
              type="number"
              min={1}
              value={abandonDraft}
              onChange={(event) => setAbandonDraft(event.target.value)}
              onBlur={commitAbandonDays}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              disabled={isPending}
              className="max-w-24"
            />
            <span className="text-sm text-muted-foreground">dias</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowExitPanel({
  flow,
  onPatch,
  isPending,
}: {
  flow: MarketingFlowRecord;
  onPatch: (overrides: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const persisted = parseExitConditions(flow.definition);
  const [draft, setDraft] = useState(persisted.join("\n"));

  useEffect(() => {
    setDraft(persisted.join("\n"));
    // só re-sincroniza quando o conjunto persistido muda externamente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persisted.join("\n")]);

  const commit = () => {
    const next = draft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (next.join("\n") === persisted.join("\n")) return;
    onPatch({ exitConditions: next });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Saída do fluxo</h2>
        <p className="text-sm text-muted-foreground">
          Condições que tiram o lead deste fluxo antes do fim.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="exit-conditions" className="text-sm font-semibold">
              Condições de saída
            </Label>
            <p className="text-xs text-muted-foreground">
              Uma condição por linha. O lead sai do fluxo se atender qualquer uma delas.
            </p>
          </div>
          <Textarea
            id="exit-conditions"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            rows={6}
            disabled={isPending}
            placeholder={"Lead concluiu uma compra\nLead optou por sair (opt-out)"}
          />
        </div>
      </div>
    </div>
  );
}

function ValidationIssueList({
  issues,
  onSelectIssue,
  stepsById,
}: {
  issues: ValidationIssue[];
  onSelectIssue?: (stepId: string) => void;
  stepsById?: Map<string, FlowStep>;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {issues.map((issue, index) => {
        const Icon = issue.severity === "error" ? AlertCircle : AlertTriangle;
        const tone =
          issue.severity === "error"
            ? "text-destructive"
            : "text-amber-600 dark:text-amber-400";
        const clickable = Boolean(issue.stepId && onSelectIssue);
        return (
          <li key={`${issue.code}-${index}`}>
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSelectIssue!(issue.stepId!) : undefined}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                issue.severity === "error"
                  ? "border-destructive/15 bg-destructive/5 hover:bg-destructive/10"
                  : "border-amber-500/15 bg-amber-500/5 hover:bg-amber-500/10",
                clickable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-hidden />
              <span className="min-w-0 leading-snug text-foreground">
                <span className="block font-medium">{issue.message}</span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {getValidationIssueHint(issue, stepsById?.get(issue.stepId ?? ""))}
                  {clickable ? (
                    <span className="ml-1 font-medium text-primary">— ver passo</span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function getValidationIssueHint(issue: ValidationIssue, step?: FlowStep): string {
  switch (issue.code) {
    case "FLOW_NO_STEPS":
      return "Adicione pelo menos um passo no editor.";
    case "STEP_NO_EXECUTOR":
      return step?.actionId === "teste-ab"
        ? "Este teste não executa no worker ainda. Use um passo executável ou deixe para fluxos de rascunho."
        : step?.actionId === "classificar-ia"
          ? "A classificação por IA ainda não tem executor. Troque por uma ação ativa antes de publicar."
          : "Troque a ação por uma que já tenha executor no worker.";
    case "GRAPH_BROKEN_TARGET":
      return step?.actionId === "dividir-caminho" || step?.actionId === "dividir-por-segmentacao"
        ? "Abra esse split e reconecte os caminhos sim/não para passos existentes."
        : step?.actionId === "teste-ab"
          ? "A variante aponta para um passo removido. Atualize o destino dessa ramificação."
          : "Reconecte essa saída para um passo existente.";
    case "GRAPH_UNREACHABLE":
      return step?.actionId === "unir-caminho"
        ? "Esse merge ficou solto. Refaça as entradas dele ou remova o passo."
        : "Ligue esse passo a partir da entrada do fluxo.";
    case "GRAPH_CYCLE":
      return step?.actionId === "esperar-condicao"
        ? "Esse wait está formando um ciclo. Garanta um timeout ou outro caminho de saída."
        : "Confirme se esse loop tem uma saída real.";
    case "FLOW_NO_TRIGGER":
      return "Defina um gatilho para permitir entrada automática.";
    case "FLOW_NO_CRITERIA":
      return "Se quiser filtrar entradas, adicione critérios; caso contrário, pode ignorar.";
    case "FLOW_NO_EXIT":
      return "Considere uma condição de saída para evitar fluxos sem fim.";
    case "WAIT_NO_DURATION":
      return "Defina uma espera maior que zero.";
    case "MSG_EMPTY":
      return "Escreva a mensagem que este passo vai disparar.";
    case "EMAIL_NO_SUBJECT":
      return "Adicione um assunto objetivo para o e-mail.";
    case "EMAIL_NO_BODY":
      return "Escreva o conteúdo do e-mail.";
    case "TASK_NO_TITLE":
      return "Dê um título claro para a tarefa.";
    case "DEAL_NO_FUNNEL":
      return "Selecione o funil de destino.";
    case "DEAL_NO_STAGE":
      return "Selecione a etapa de destino.";
    case "TAG_EMPTY":
      return "Informe a etiqueta que será aplicada.";
    case "WEBHOOK_NO_URL":
      return "Cole a URL do webhook que vai receber o payload.";
    case "WEBHOOK_INVALID_URL":
      return "Use uma URL completa começando com http:// ou https://.";
    case "SPLIT_NO_FIELD":
      return "Escolha o campo comparado por esse split.";
    case "SPLIT_NO_VALUE":
      return "Informe o valor usado nessa comparação.";
    case "SPLIT_NO_TRUE_STEP":
      return "Conecte o caminho \"sim\" a um passo válido.";
    case "SPLIT_NO_FALSE_STEP":
      return "Conecte o caminho \"não\" a um passo válido.";
    case "ABTEST_FEW_VARIANTS":
      return "Adicione ao menos duas variantes para dividir o tráfego.";
    case "ABTEST_WEIGHTS":
      return "Ajuste os pesos para somarem 100% no total.";
    case "ABTEST_NO_STEP":
      return "Cada variante precisa apontar para um passo de destino.";
    case "WAITUNTIL_NO_FIELD":
      return "Escolha o campo que será monitorado.";
    case "WAITUNTIL_NO_VALUE":
      return "Informe o valor que a condição precisa atingir.";
    case "WAITUNTIL_INTERVAL":
      return "Use um intervalo de verificação de pelo menos 1 minuto.";
    case "WAITUNTIL_NO_TIMEOUT":
      return "Defina um timeout para o lead não ficar preso.";
    case "SMART_NO_PROMPT":
      return "Explique o que a IA deve gerar nesse passo.";
    case "VAR_EMPTY":
      return "Adicione pelo menos uma variável com nome.";
    case "DEAL_TITLE_EMPTY":
      return "Escreva o novo nome da negociação.";
    case "DEAL_STATUS_INVALID":
      return "Selecione um status válido.";
    case "QUALIFICATION_RANGE":
      return "Escolha uma nota entre 0 e 5.";
    case "SUPPRESS_CHANNEL_INVALID":
      return "Selecione o canal a suprimir.";
    case "NOTE_EMPTY":
      return "Escreva a anotação antes de salvar.";
    case "SALE_VALUE_INVALID":
      return "Informe um valor numérico válido.";
    case "AI_NO_PROMPT":
      return "Escreva o que a IA precisa analisar.";
    case "AI_NO_CATEGORIES":
      return "Adicione pelo menos uma categoria de saída.";
    case "AI_NO_NEXT_STEP":
      return "Cada categoria precisa apontar para um passo.";
    default:
      return "Clique para revisar o passo relacionado.";
  }
}

function FlowValidationDialog({
  open,
  result,
  isPublishing,
  onOpenChange,
  onConfirm,
  onSelectIssue,
  stepsById,
}: {
  open: boolean;
  result: ValidationResult | null;
  isPublishing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onSelectIssue?: (stepId: string) => void;
  stepsById?: Map<string, FlowStep>;
}) {
  const hasErrors = (result?.errors.length ?? 0) > 0;
  const title = hasErrors ? "Não foi possível ativar o fluxo" : "Atenção antes de ativar";
  const description = hasErrors
    ? "Corrija os erros abaixo para poder ativar este fluxo."
    : "Os avisos abaixo não bloqueiam a ativação. Confirme para publicar mesmo assim.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl gap-5">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-base leading-6">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {result && result.errors.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-destructive/15 bg-destructive/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Erros ({result.errors.length})
              </p>
              <ValidationIssueList
                issues={result.errors}
                onSelectIssue={onSelectIssue}
                stepsById={stepsById}
              />
            </div>
          ) : null}
          {result && result.warnings.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                Avisos ({result.warnings.length})
              </p>
              <ValidationIssueList
                issues={result.warnings}
                onSelectIssue={onSelectIssue}
                stepsById={stepsById}
              />
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPublishing}
            className="min-w-32"
          >
            {hasErrors ? "Fechar" : "Cancelar"}
          </Button>
          {!hasErrors ? (
            <Button type="button" onClick={onConfirm} disabled={isPublishing} className="min-w-48">
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Publicar mesmo assim
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MarketingFlowEditor() {
  const { flowId } = useParams<{ flowId: string }>();
  const { toast } = useToast();
  const { data: flow, isLoading, error } = useMarketingFlow(flowId);
  const updateFlow = useUpdateMarketingFlow();
  const publishFlow = usePublishMarketingFlow();
  const [tab, setTab] = useState<FlowTab>("editor");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [edges, setEdges] = useState<MarketingFlowEdge[]>([]);
  const [positions, setPositions] = useState<NodePositions>({});
  const [manualEnrollOpen, setManualEnrollOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [validationDialog, setValidationDialog] = useState<{
    open: boolean;
    result: ValidationResult | null;
  }>({ open: false, result: null });
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [focusStepId, setFocusStepId] = useState<string | null>(null);
  const [canvasEpoch, setCanvasEpoch] = useState(0);
  const stepCounter = useRef(0);
  const stepIdPrefix = useId();
  const hydratedFor = useRef<string | null>(null);

  // Hidrata os steps do banco apenas uma vez por fluxo carregado — depois disso
  // o estado local manda. Evita reverter edições enquanto a query refaz.
  useEffect(() => {
    if (!flow) return;
    if (hydratedFor.current === flow.id) return;
    const loaded = parseStepsFromDefinition(flow.definition);
    setSteps(loaded);
    setEdges(parseEdgesFromDefinition(flow.definition));
    setPositions(parsePositionsFromDefinition(flow.definition));
    stepCounter.current = loaded.length;
    hydratedFor.current = flow.id;
    pastRef.current = [];
    futureRef.current = [];
  }, [flow]);

  // --- Histórico (undo/redo) -------------------------------------------------
  // Pilhas de snapshots {steps, edges, positions}. Cada mutacao empilha o estado
  // ANTES da mudanca; undo/redo restauram e incrementam canvasEpoch pra o canvas
  // (React Flow, estado interno semeado no mount) remontar com o grafo restaurado.
  type FlowSnapshot = {
    steps: FlowStep[];
    edges: MarketingFlowEdge[];
    positions: NodePositions;
  };
  const stepsRef = useRef<FlowStep[]>(steps);
  const edgesRef = useRef<MarketingFlowEdge[]>(edges);
  const positionsRef = useRef<NodePositions>(positions);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const pastRef = useRef<FlowSnapshot[]>([]);
  const futureRef = useRef<FlowSnapshot[]>([]);

  const captureSnapshot = useCallback(
    (): FlowSnapshot => ({
      steps: stepsRef.current,
      edges: edgesRef.current,
      positions: positionsRef.current,
    }),
    [],
  );

  const pushHistory = useCallback(() => {
    pastRef.current = [...pastRef.current.slice(-49), captureSnapshot()];
    futureRef.current = [];
  }, [captureSnapshot]);

  const applySnapshot = useCallback((snap: FlowSnapshot) => {
    setSteps(snap.steps);
    setEdges(snap.edges);
    setPositions(snap.positions);
    setCanvasEpoch((e) => e + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [captureSnapshot(), ...futureRef.current.slice(0, 49)];
    applySnapshot(prev);
  }, [captureSnapshot, applySnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current.slice(-49), captureSnapshot()];
    applySnapshot(next);
  }, [captureSnapshot, applySnapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Solta uma acao no canvas na posicao do cursor (coords ja em flow-space).
  const handleDropOnCanvas = (
    payload: DragPayload,
    point: { x: number; y: number },
  ) => {
    pushHistory();
    stepCounter.current += 1;
    const newStep: FlowStep = {
      id: `${stepIdPrefix}-${stepCounter.current}`,
      actionId: payload.actionId,
      label: payload.label,
      iconKey: payload.iconKey,
      iconClass: payload.iconClass,
      subtitle: payload.defaultSubtitle,
      subtitleVariant: payload.defaultSubtitle ? "plain" : undefined,
    };
    setSteps((prev) => [...prev, newStep]);
    setPositions((prev) => ({ ...prev, [newStep.id]: point }));
  };

  // O canvas (React Flow) emite o grafo normalizado apos cada commit interno.
  const handleGraphChange = (next: {
    edges: MarketingFlowEdge[];
    positions: NodePositions;
  }) => {
    pushHistory();
    setEdges(next.edges);
    setPositions(next.positions);
  };

  const handleRemoveStep = (stepId: string) => {
    pushHistory();
    setSteps((prev) => prev.filter((step) => step.id !== stepId));
    setEdges((prev) => prev.filter((e) => e.from !== stepId && e.to !== stepId));
    setPositions((prev) => {
      if (!(stepId in prev)) return prev;
      const next = { ...prev };
      delete next[stepId];
      return next;
    });
  };

  const handleUpdateStep = (stepId: string, patch: Partial<FlowStep>) => {
    pushHistory();
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    );
    setEditingStepId(null);
  };

  const handleDuplicateStep = (stepId: string) => {
    const src = stepsRef.current.find((step) => step.id === stepId);
    if (!src) return;
    pushHistory();
    stepCounter.current += 1;
    const newId = `${stepIdPrefix}-${stepCounter.current}`;
    const newStep: FlowStep = { ...src, id: newId };
    setSteps((prev) => [...prev, newStep]);
    setPositions((prev) => {
      const base = prev[stepId] ?? { x: 0, y: 0 };
      return { ...prev, [newId]: { x: base.x + 40, y: base.y + 40 } };
    });
  };

  const editingStep = editingStepId
    ? steps.find((step) => step.id === editingStepId) ?? null
    : null;

  const startEditName = () => {
    if (!flow) return;
    setNameDraft(flow.name);
    setIsEditingName(true);
  };

  const commitName = () => {
    if (!flow) {
      setIsEditingName(false);
      return;
    }
    const next = nameDraft.trim();
    setIsEditingName(false);
    if (!next || next === flow.name) return;
    updateFlow.mutate(
      { id: flow.id, patch: { name: next } },
      {
        onError: (e) =>
          toast({
            title: "Erro ao renomear",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const flowCriteria = flow ? parseCriteria(flow.criteria) : { conditions: [] };
  const branchingSteps = useMemo(() => {
    const outgoing = new Map<string, number>();
    for (const edge of edges) {
      outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    }
    return steps.filter((step) => (outgoing.get(step.id) ?? 0) > 1);
  }, [edges, steps]);

  // Conteúdo do nó de gatilho dentro do canvas (memoizado: o canvas sincroniza
  // o nó num efeito que depende desta referência).
  const canvasTrigger = useMemo(() => {
    const triggerRec = asRecord(flow?.trigger);
    const type = typeof triggerRec.type === "string" ? triggerRec.type : "";
    const definition = getMarketingTriggerDefinition(type);
    const summary = type ? summarizeMarketingTrigger(type, triggerRec.config) : "";
    const n = flowCriteria.conditions.length;
    return {
      label: definition?.label ?? "Defina o gatilho",
      summary: summary || undefined,
      criteriaSummary:
        n > 0 ? `${n} critério${n === 1 ? "" : "s"} de entrada` : "Sem critérios — todos entram",
    };

  }, [flow?.trigger, flowCriteria.conditions.length]);

  const handleSaveCriteria = (conditions: string[]) => {
    if (!flow) return;
    updateFlow.mutate(
      { id: flow.id, patch: { criteria: { ...flow.criteria, conditions } } },
      {
        onSuccess: () => {
          setCriteriaDialogOpen(false);
          toast({ title: "Critérios atualizados" });
        },
        onError: (e) =>
          toast({
            title: "Erro ao salvar critérios",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const patchTrigger = (trigger: Record<string, unknown>) => {
    if (!flow) return;
    updateFlow.mutate(
      { id: flow.id, patch: { trigger } },
      {
        onError: (e) =>
          toast({
            title: "Erro ao salvar gatilho",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const patchDefinition = (overrides: Record<string, unknown>) => {
    if (!flow) return;
    updateFlow.mutate(
      { id: flow.id, patch: { definition: { ...flow.definition, ...overrides } } },
      {
        onError: (e) =>
          toast({
            title: "Erro ao salvar",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const persist = () => {
    if (!flow) return;
    const nextDefinition = buildGraphDefinition(flow.definition, steps, edges, positions);
    updateFlow.mutate(
      { id: flow.id, patch: { definition: nextDefinition } },
      {
        onSuccess: () => toast({ title: "Fluxo salvo" }),
        onError: (e) =>
          toast({
            title: "Erro ao salvar",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const buildSnapshot = (currentFlow: MarketingFlowRecord) => ({
    name: currentFlow.name,
    definition: buildGraphDefinition(currentFlow.definition, steps, edges, positions),
    criteria: currentFlow.criteria,
    trigger: currentFlow.trigger,
  });

  const validation = useMemo<ValidationResult | null>(() => {
    if (!flow) return null;
    return validateFlow(buildSnapshot(flow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, steps, edges, positions]);

  const highlightedIssues = useMemo(() => {
    if (!validation) return [];
    return [...validation.errors, ...validation.warnings].slice(0, 4);
  }, [validation]);

  const stepsById = useMemo(() => new Map(steps.map((step) => [step.id, step] as const)), [steps]);

  // Passos com issues de validacao: memoizado para o canvas pintar erro/aviso
  // sem recriar o mapa a cada render.
  const stepIssueById = useMemo(() => {
    const map: Record<string, "error" | "warning"> = {};
    for (const issue of validation?.warnings ?? []) {
      if (issue.stepId && !map[issue.stepId]) {
        map[issue.stepId] = "warning";
      }
    }
    for (const issue of validation?.errors ?? []) {
      if (issue.stepId) {
        map[issue.stepId] = "error";
      }
    }
    return map;
  }, [validation]);

  const doPublish = (result: ValidationResult) => {
    if (!flow) return;
    const snapshot = buildSnapshot(flow);
    publishFlow.mutate(
      {
        id: flow.id,
        definition: snapshot.definition,
        criteria: snapshot.criteria,
        trigger: snapshot.trigger,
        validationSnapshot: {
          warnings: result.warnings,
          publishedAt: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          setValidationDialog({ open: false, result: null });
          toast({ title: "Fluxo ativado", description: "Versão publicada com sucesso." });
        },
        onError: (e) =>
          toast({
            title: "Erro ao publicar",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const handlePublishClick = () => {
    if (!flow || !validation) return;
    if (!validation.ok || validation.warnings.length > 0) {
      setValidationDialog({ open: true, result: validation });
      return;
    }
    doPublish(validation);
  };

  const handleExport = () => {
    if (!flow) return;
    const snapshot = buildSnapshot(flow);
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      flows: [
        {
          name: flow.name,
          status: flow.status,
          definition: snapshot.definition,
          criteria: snapshot.criteria,
          trigger: snapshot.trigger,
        },
      ],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeName = flow.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "fluxo";
    anchor.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast({ title: "Fluxo exportado" });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f3f5f8]">
      <header className="flex items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-6">
          <Link
            to="/marketing?aba=automacao-2"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Voltar
          </Link>
          {flow ? (
            isEditingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitName();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    setIsEditingName(false);
                  }
                }}
                className="h-8 w-64 text-sm font-semibold"
              />
            ) : (
              <button
                type="button"
                onClick={startEditName}
                className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
                title="Renomear fluxo"
              >
                <span className="max-w-[260px] truncate">{flow.name}</span>
                <Pencil
                  className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </button>
            )
          ) : null}
          <nav className="flex items-center gap-6" aria-label="Seções do fluxo">
            <TabButton
              label="Editor"
              active={tab === "editor"}
              onClick={() => setTab("editor")}
            />
            <TabButton
              label="Configurações"
              active={tab === "configuracoes"}
              onClick={() => setTab("configuracoes")}
            />
            <TabButton
              label="Saída"
              active={tab === "saida"}
              onClick={() => setTab("saida")}
            />
            <TabButton
              label="Execuções"
              active={tab === "historico"}
              onClick={() => setTab("historico")}
            />
          </nav>
        </div>

        <div className="flex items-center gap-2 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-primary hover:bg-primary/10"
            aria-label="Simular fluxo"
            onClick={() => setSimulatorOpen(true)}
            disabled={!flow}
          >
            <Sparkles className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-primary hover:bg-primary/10"
            aria-label="Exportar fluxo"
            onClick={handleExport}
            disabled={!flow}
          >
            <FileDown className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={undo}
            disabled={!flow}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={redo}
            disabled={!flow}
            aria-label="Refazer (Ctrl+Shift+Z)"
            title="Refazer (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="gap-2 text-primary hover:bg-primary/10"
            onClick={() => setManualEnrollOpen(true)}
            disabled={!flow}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Inscrever leads
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-primary hover:bg-primary/10"
            onClick={persist}
            disabled={!flow || updateFlow.isPending}
          >
            {updateFlow.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Salvar
          </Button>
          {flow && validation ? (
            <button
              type="button"
              onClick={() => setValidationDialog({ open: true, result: validation })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                validation.errors.length > 0
                  ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                  : validation.warnings.length > 0
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400",
              )}
            >
              {validation.errors.length > 0 ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                  {validation.errors.length} erro(s)
                  {validation.warnings.length > 0 ? ` · ${validation.warnings.length} aviso(s)` : ""}
                </>
              ) : validation.warnings.length > 0 ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  {validation.warnings.length} aviso(s)
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Pronto para ativar
                </>
              )}
            </button>
          ) : null}
          <Button
            type="button"
            onClick={handlePublishClick}
            disabled={!flow || publishFlow.isPending}
            className="gap-2"
          >
            {publishFlow.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Salvar e Ativar
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Carregando fluxo…
          </span>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-destructive">
          Não foi possível carregar o fluxo. {error.message}
        </div>
      ) : !flow ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Fluxo não encontrado.
        </div>
      ) : null}

      {flow && tab === "editor" ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* O gatilho vive DENTRO do canvas como nó de entrada (estilo n8n). */}
          <div className="border-b border-border bg-card px-6 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Gatilho: {canvasTrigger.label}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {flowCriteria.conditions.length} critério(s) de entrada
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {steps.length} passo(s)
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {edges.length} conexão(ões)
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  {branchingSteps.length} ramificação(ões)
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setTab("configuracoes")}
                >
                  Ajustar gatilho
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSimulatorOpen(true)}
                >
                  Simular fluxo
                </Button>
              </div>
            </div>

            {validation && highlightedIssues.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/25">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {validation.errors.length > 0 ? "Problemas para resolver" : "Atenção no fluxo"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {highlightedIssues.map((issue, index) => (
                    <div key={`${issue.code}-${issue.stepId ?? index}`} className="flex max-w-full flex-col">
                      <button
                        type="button"
                      onClick={() => {
                        if (issue.stepId) {
                          setTab("editor");
                          setFocusStepId(issue.stepId);
                        }
                      }}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-medium transition-colors",
                          issue.severity === "error"
                            ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300",
                        )}
                        title={issue.stepId ? "Focar este passo no canvas" : issue.message}
                      >
                        <span className="truncate">{issue.message}</span>
                        {issue.stepId ? <span aria-hidden>→</span> : null}
                      </button>
                      <span className="mt-1 block max-w-full text-xs text-muted-foreground">
                        {getValidationIssueHint(issue, stepsById.get(issue.stepId ?? ""))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative min-h-0 flex-1">
            <div className="pointer-events-none absolute right-6 top-6 z-10">
              <button
                type="button"
                onClick={() => setActionsOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 shadow-md transition-colors hover:border-sky-400 hover:text-sky-400"
              >
                Ações
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <MarketingFlowActionsPanel open={actionsOpen} onOpenChange={setActionsOpen} />

            <FlowCanvas
              key={`${flow.id}:${canvasEpoch}:${steps.map((s) => s.id).join(",")}`}
              steps={steps}
              edges={edges}
              positions={positions}
              onEditStep={(id) => {
                setActionsOpen(false);
                setEditingStepId(id);
              }}
              onRemoveStep={handleRemoveStep}
              onDuplicateStep={handleDuplicateStep}
              stepIssueById={stepIssueById}
              onGraphChange={handleGraphChange}
              onDropAction={handleDropOnCanvas}
              focusStepId={focusStepId}
              onFocusHandled={() => setFocusStepId(null)}
              trigger={canvasTrigger}
              onEditTrigger={() => setTab("configuracoes")}
              onEditCriteria={() => setCriteriaDialogOpen(true)}
            />

            {steps.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
                <p className="font-medium text-slate-100">Comece arrastando uma ação</p>
                <p className="max-w-sm">
                  Abra <span className="font-semibold text-slate-200">Ações</span> e arraste para o
                  canvas. Conecte os cartões para definir o caminho do lead.
                </p>
              </div>
            ) : null}
          </div>

          {steps.length > 0 ? (
            <details className="border-t border-border bg-card px-6 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Mapa de ramificações
              </summary>
              <div className="pt-4">
                <FlowBranchMap steps={steps} />
              </div>
            </details>
          ) : null}
        </div>
      ) : flow ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {tab === "configuracoes" ? (
            <FlowSettingsPanel
              flow={flow}
              onPatch={patchDefinition}
              onTriggerChange={patchTrigger}
              isPending={updateFlow.isPending}
            />
          ) : tab === "saida" ? (
            <FlowExitPanel
              flow={flow}
              onPatch={patchDefinition}
              isPending={updateFlow.isPending}
            />
          ) : tab === "historico" ? (
            <FlowExecutionsPanel flowId={flow.id} />
          ) : null}
        </div>
      ) : null}

      <CriteriaEditDialog
        open={criteriaDialogOpen}
        onOpenChange={setCriteriaDialogOpen}
        initialConditions={flowCriteria.conditions}
        isPending={updateFlow.isPending}
        onSave={handleSaveCriteria}
      />

      <StepEditDialog
        step={editingStep}
        steps={steps}
        flowId={flow?.id ?? ""}
        onOpenChange={(open) => {
          if (!open) setEditingStepId(null);
        }}
        onSave={(patch) => {
          if (editingStepId) handleUpdateStep(editingStepId, patch);
        }}
      />

      <FlowValidationDialog
        open={validationDialog.open}
        result={validationDialog.result}
        isPublishing={publishFlow.isPending}
        onOpenChange={(open) => {
          if (!open) setValidationDialog({ open: false, result: null });
        }}
        onConfirm={() => {
          if (validationDialog.result) doPublish(validationDialog.result);
        }}
        onSelectIssue={(stepId) => {
          setValidationDialog({ open: false, result: null });
          setTab("editor");
          setFocusStepId(stepId);
        }}
        stepsById={stepsById}
      />

      <SimulatorDialog
        open={simulatorOpen}
        onOpenChange={setSimulatorOpen}
        definition={flow ? { ...flow.definition, steps } : null}
      />

      {flow ? (
        <ManualEnrollDialog
          open={manualEnrollOpen}
          onOpenChange={setManualEnrollOpen}
          flowId={flow.id}
          flowActive={flow.status === "ativo"}
        />
      ) : null}
    </div>
  );
}
