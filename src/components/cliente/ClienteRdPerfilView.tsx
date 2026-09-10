import { type ReactNode, useEffect, useMemo, useRef, useState, type ReactElement, type Ref } from "react";
import { formatBRL } from "@/lib/format";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Hand,
  MoreVertical,
  Users,
  Pencil,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type { CrmTaskPatch } from "@/lib/api/crm-tasks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { isNegotiationUnassigned } from "@/lib/crm/negotiation-alerts";
import { negotiationAssigneeBlockedMessage } from "@/lib/crm/negotiation-assignee";
import { CustomerCustomFieldInput } from "@/components/customers/CustomerCustomFieldInput";
import { useToast } from "@/hooks/use-toast";
import {
  invalidateCustomerCustomFieldValues,
  upsertCustomerCustomFieldValues,
  useCustomerCustomFieldValues,
  useCustomerCustomFields,
} from "@/lib/api/customer-custom-fields";
import {
  buildCustomerCustomFieldsDisplayList,
  buildCustomerCustomFieldsDraftValues,
} from "@/lib/customer-custom-field-display";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { negotiationPauseToggleLabel } from "@/lib/crm/negotiation-status";
import type { CrmNegotiationStatus, CrmTask, Customer } from "@/types/domain";

/** Paleta CaleoCRM */
const BRAND_ACCENT = "#5B2FD4";
const RD_PAGE_BG = "hsl(var(--background))";
const RD_CARD_SHADOW = "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)";
const RD_RADIUS = "10px";

/** Valor sentinela do Select de responsável (sem `profiles.id` vazio no Radix). */
const CRM_TASK_ASSIGNEE_NONE = "__none__";

const NEG_ORIGEM_NONE = "__neg_origem_none__";

export type NegotiationPanelSnapshot = {
  assigneeId: string;
  qualification: number;
  totalValue: number;
  closingForecast: string | null;
  createdAt: string;
  otherInfo?: Record<string, string>;
};

export type NegotiationPanelSavePayload = {
  nome: string;
  assigneeId: string | null;
  qualification: number;
  totalValue: number;
  closingForecastLocal: string;
  origem: "" | "organico" | "pago";
  campanha: string;
  telefone: string;
  email: string;
  customFieldValues: Record<string, string>;
};

type NegotiationPanelDraft = {
  nome: string;
  assigneeId: string;
  qualification: string;
  totalValue: string;
  closingForecastLocal: string;
  origem: string;
  campanha: string;
  telefone: string;
  email: string;
  customFieldValues: Record<string, string>;
};

function sourceColumn(cliente: Customer, ...keys: string[]): string {
  const sc = cliente.sourceColumns;
  if (!sc) {
    return "";
  }
  for (const k of keys) {
    const raw = sc[k];
    if (raw != null && String(raw).trim() !== "") {
      return String(raw).trim();
    }
  }
  return "";
}

function PipelineChevrons({
  activeIndex,
  daysContact,
  onStageSelect,
  stages,
}: {
  activeIndex: number;
  daysContact: number;
  onStageSelect?: (stageIndex: number) => void;
  /** Etapas reais do funil; sem funil configurado o stepper fica oculto. */
  stages?: Array<{ key: string; label: string }>;
}) {
  const segments = stages ?? [];
  const interactive = Boolean(onStageSelect);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null);

  useEffect(() => {
    if (!segments.length) {
      return;
    }
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeIndex, segments.length]);

  const scrollStages = (direction: "prev" | "next") => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(260, el.clientWidth * 0.55);
    el.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  };

  if (!segments.length) {
    return null;
  }

  return (
    <div className="w-full border-b border-[var(--crm-border-2)] bg-[var(--crm-surface)]">
      <div className="mx-auto max-w-[1600px] px-3 py-3 md:px-6">
        <div className="flex items-center gap-2 rounded-2xl border border-[var(--crm-border-2)] bg-card/95 p-2 shadow-sm">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl border-[var(--crm-border-2)] bg-white"
            aria-label="Ver etapas anteriores"
            onClick={() => scrollStages("prev")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div
            ref={scrollerRef}
            className="scrollbar-hide flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 py-1"
            role={interactive ? "tablist" : undefined}
            aria-label={interactive ? "Etapas do funil de vendas" : undefined}
          >
            {segments.map((seg, i) => {
              const active = i === activeIndex;
              const position = `${i + 1}/${segments.length}`;
              const commonClass = cn(
                "relative flex h-16 w-[176px] shrink-0 snap-center flex-col items-center justify-center rounded-xl border px-3 text-center outline-none transition-[background-color,border-color,box-shadow,transform] sm:w-[190px]",
                interactive && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--crm-brand)] focus-visible:ring-offset-1",
                active
                  ? "border-transparent bg-[var(--crm-brand)] text-white shadow-md"
                  : "border-[var(--crm-border-2)] bg-[var(--crm-surface-2)] text-[var(--crm-ink-2)]",
              );

              const label = (
                <>
                  <span
                    className={cn(
                      "absolute left-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none",
                      active
                        ? "bg-white/15 text-white"
                        : "bg-white/80 text-[var(--crm-ink-3)]",
                    )}
                  >
                    {position}
                  </span>
                  <span
                    className={cn(
                      "block max-w-full overflow-hidden text-[11px] font-extrabold uppercase leading-tight tracking-wide",
                      active ? "text-white" : "text-[var(--crm-ink-2)]",
                    )}
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                    }}
                    title={seg.label}
                  >
                    {seg.label}
                  </span>
                </>
              );

              if (interactive) {
                return (
                  <button
                    key={seg.key}
                    ref={active ? activeRef as Ref<HTMLButtonElement> : undefined}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={commonClass}
                    onClick={() => onStageSelect?.(i)}
                  >
                    {label}
                  </button>
                );
              }

              return (
                <div
                  key={seg.key}
                  ref={active ? activeRef as Ref<HTMLDivElement> : undefined}
                  className={commonClass}
                >
                  {label}
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl border-[var(--crm-border-2)] bg-white"
            aria-label="Ver próximas etapas"
            onClick={() => scrollStages("next")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function NegField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[var(--crm-surface)] py-2.5 text-[13px] leading-snug last:border-b-0">
      <p className="mb-0.5 text-[var(--crm-ink-3)]">{label}</p>
      <p className="break-words font-medium text-[var(--crm-ink)]">{value.trim() || "—"}</p>
    </div>
  );
}

function NegFieldEdit({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 border-b border-[var(--crm-surface)] py-2.5 text-[13px] leading-snug last:border-b-0 sm:grid-cols-[minmax(100px,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-x-3">
      <span className="text-[var(--crm-ink-3)]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function formatCrmTaskDueLabel(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatCrmTaskUpdatedLabel(iso: string | undefined): string | null {
  if (!iso?.trim()) {
    return null;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function crmTaskAssigneeDisplayName(
  assigneeId: string | null | undefined,
  assignees?: { id: string; nome: string }[],
): string | null {
  const id = assigneeId?.trim();
  if (!id) {
    return null;
  }
  const hit = assignees?.find((a) => a.id === id);
  const nome = hit?.nome?.trim();
  if (nome) {
    return nome;
  }
  return "Responsável atribuído";
}

function isoToDatetimeLocalValue(iso: string | null): string {
  if (!iso?.trim()) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function crmTaskScopeBadge(
  t: CrmTask,
  mode: "negotiation-merge" | "customer-linked" | undefined,
): ReactElement | null {
  if (!mode) {
    return null;
  }
  if (mode === "customer-linked") {
    if (!t.negotiationId) {
      return null;
    }
    return (
      <span className="rounded bg-[var(--crm-info-tint)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-info)]">
        Negociação
      </span>
    );
  }
  const clientScope = !t.negotiationId;
  return (
    <span
      className={
        clientScope
          ? "rounded bg-[var(--crm-surface)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-2)]"
          : "rounded bg-[var(--crm-info-tint)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-info)]"
      }
    >
      {clientScope ? "Cliente" : "Negociação"}
    </span>
  );
}

function ClienteRdPerfilTasksTabBody({
  crmOpenTasks,
  crmCompletedTasks,
  crmTaskScopeLabelMode,
  crmTasksLoading,
  crmTaskAssignees,
  onCompleteCrmTask,
  onReopenCrmTask,
  onDeleteCrmTask,
  onSaveCrmTaskEdit,
  taskMutationBusy,
  onCreateTask,
  openTaskEdit,
  onRequestDeleteTask,
  readOnly = false,
}: {
  crmOpenTasks: CrmTask[] | undefined;
  crmCompletedTasks: CrmTask[] | undefined;
  crmTaskScopeLabelMode: "negotiation-merge" | "customer-linked" | undefined;
  crmTasksLoading: boolean;
  crmTaskAssignees: { id: string; nome: string }[] | undefined;
  onCompleteCrmTask?: (taskId: string) => void;
  onReopenCrmTask?: (taskId: string) => void;
  onDeleteCrmTask?: (taskId: string) => void;
  onSaveCrmTaskEdit?: (payload: { id: string; patch: CrmTaskPatch }) => void | Promise<void>;
  taskMutationBusy: boolean;
  onCreateTask: () => void;
  openTaskEdit: (t: CrmTask) => void;
  onRequestDeleteTask: (task: { id: string; title: string }) => void;
  readOnly?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-[var(--crm-surface)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--crm-ink)]">Próximas tarefas</h2>
        <Calendar className="h-4 w-4 text-[var(--crm-ink-3)]" aria-hidden />
      </div>
      {readOnly ? (
        <p className="border-b border-[var(--crm-surface)] px-4 py-3 text-sm text-[var(--crm-ink-3)] md:px-6">
          {negotiationAssigneeBlockedMessage()}
        </p>
      ) : null}
      {crmOpenTasks !== undefined ? (
        <div className="px-4 py-4 md:px-6">
          {crmTasksLoading ? (
            <div className="space-y-3">
              <div className="h-14 animate-pulse rounded-lg bg-[var(--crm-surface)]" />
              <div className="h-14 animate-pulse rounded-lg bg-[var(--crm-surface)]" />
            </div>
          ) : crmOpenTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center md:flex-row md:justify-between md:text-left">
              <p className="max-w-md text-sm leading-relaxed text-[var(--crm-ink-3)]">
                Não há tarefas abertas. Crie uma para acompanhar o próximo passo.
              </p>
              <Button
                type="button"
                className="shrink-0 border-0 px-5 py-2.5 font-semibold text-white shadow-none hover:opacity-95"
                style={{ backgroundColor: BRAND_ACCENT, borderRadius: RD_RADIUS }}
                onClick={onCreateTask}
                disabled={readOnly}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar tarefa
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {crmOpenTasks.map((t) => {
                const dueLabel = formatCrmTaskDueLabel(t.dueAt);
                const assigneeLabel = crmTaskAssigneeDisplayName(t.assigneeId, crmTaskAssignees);
                return (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-[var(--crm-surface)] bg-[var(--crm-surface)] px-3 py-2.5"
                  >
                    <Checkbox
                      className="mt-0.5 border-[var(--crm-ink-3)] data-[state=checked]:border-[var(--crm-brand)] data-[state=checked]:bg-[var(--crm-brand)]"
                      checked={false}
                      disabled={readOnly || !onCompleteCrmTask || taskMutationBusy}
                      aria-label={`Marcar como concluída: ${t.title}`}
                      onCheckedChange={(c) => {
                        if (c === true) {
                          onCompleteCrmTask?.(t.id);
                        }
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium text-[var(--crm-ink)]">{t.title}</p>
                        {crmTaskScopeBadge(t, crmTaskScopeLabelMode)}
                      </div>
                      {dueLabel ? (
                        <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">Prazo: {dueLabel}</p>
                      ) : null}
                      {assigneeLabel ? (
                        <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">Responsável: {assigneeLabel}</p>
                      ) : null}
                      {t.notes?.trim() ? (
                        <p className="mt-1 text-xs leading-snug text-[var(--crm-ink-3)]">{t.notes.trim()}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5">
                      {onSaveCrmTaskEdit && !readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)] hover:text-[var(--crm-ink)]"
                          disabled={taskMutationBusy}
                          aria-label={`Editar tarefa: ${t.title}`}
                          onClick={() => openTaskEdit(t)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {onDeleteCrmTask && !readOnly ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-[var(--crm-ink-3)] hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger)]"
                          disabled={taskMutationBusy}
                          aria-label={`Excluir tarefa: ${t.title}`}
                          onClick={() => onRequestDeleteTask({ id: t.id, title: t.title })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!readOnly && !crmTasksLoading && crmOpenTasks.length > 0 ? (
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="outline"
                className="border-[var(--crm-border-2)] text-[var(--crm-ink)] hover:bg-[var(--crm-surface)]"
                style={{ borderRadius: RD_RADIUS }}
                onClick={onCreateTask}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nova tarefa
              </Button>
            </div>
          ) : null}
          {!crmTasksLoading && crmCompletedTasks != null && crmCompletedTasks.length > 0 ? (
            <Collapsible className="mt-6 border-t border-[var(--crm-surface)] pt-4">
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-lg px-1 py-2 text-left text-sm font-semibold text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]">
                <span>
                  Tarefas concluídas
                  <span className="ml-2 font-normal text-[var(--crm-ink-3)]">({crmCompletedTasks.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[var(--crm-ink-3)] transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <ul className="space-y-2">
                  {crmCompletedTasks.map((t) => {
                    const doneLabel = formatCrmTaskUpdatedLabel(t.updatedAt);
                    const assigneeLabel = crmTaskAssigneeDisplayName(t.assigneeId, crmTaskAssignees);
                    return (
                      <li
                        key={t.id}
                        className="flex items-start gap-2 rounded-lg border border-[var(--crm-surface)] bg-[var(--crm-surface)] px-3 py-2.5"
                      >
                        <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--crm-ink-3)]" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium text-[var(--crm-ink-3)] line-through">{t.title}</p>
                            {crmTaskScopeBadge(t, crmTaskScopeLabelMode)}
                          </div>
                          {doneLabel ? (
                            <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">Concluída em {doneLabel}</p>
                          ) : null}
                          {assigneeLabel ? (
                            <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">Responsável: {assigneeLabel}</p>
                          ) : null}
                          {t.notes?.trim() ? (
                            <p className="mt-1 text-xs leading-snug text-[var(--crm-ink-3)]">{t.notes.trim()}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-start gap-0.5">
                          {onReopenCrmTask && !readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--inbox-green-tint)] hover:text-[var(--inbox-green)]"
                              disabled={taskMutationBusy}
                              aria-label={`Reabrir tarefa: ${t.title}`}
                              onClick={() => onReopenCrmTask(t.id)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {onSaveCrmTaskEdit && !readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)] hover:text-[var(--crm-ink)]"
                              disabled={taskMutationBusy}
                              aria-label={`Editar tarefa concluída: ${t.title}`}
                              onClick={() => openTaskEdit(t)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {onDeleteCrmTask && !readOnly ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-[var(--crm-ink-3)] hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger)]"
                              disabled={taskMutationBusy}
                              aria-label={`Excluir tarefa concluída: ${t.title}`}
                              onClick={() => onRequestDeleteTask({ id: t.id, title: t.title })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex w-full max-w-[260px] shrink-0 flex-col items-center md:items-start">
            <div
              className="flex w-full items-center justify-center overflow-hidden bg-[var(--crm-surface)] p-3"
              style={{ borderRadius: RD_RADIUS, boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.04)" }}
            >
              <img
                src="/illustrations/proximas-tarefas-vazio.png"
                alt="Ilustração: acompanhamento de negociação"
                className="h-auto w-full max-h-[200px] object-contain object-center"
                width={240}
                height={200}
                decoding="async"
              />
            </div>
          </div>
          <p className="max-w-md text-center text-sm leading-relaxed text-[var(--crm-ink-3)] md:text-left">
            Não existem tarefas pendentes para essa Negociação
          </p>
          <Button
            type="button"
            className="shrink-0 border-0 px-5 py-2.5 font-semibold text-white shadow-none hover:opacity-95"
            style={{ backgroundColor: BRAND_ACCENT, borderRadius: RD_RADIUS }}
            onClick={onCreateTask}
            disabled={readOnly}
          >
            <Plus className="mr-2 h-4 w-4" />
            Criar tarefa
          </Button>
        </div>
      )}
    </>
  );
}

export type ClienteRdPerfilViewProps = {
  cliente: Customer;
  daysContact: number;
  pipelineActiveIndex: number;
  /** Etapas reais do funil (ficha CRM); sem isso usa o funil legado fixo de 6 etapas. */
  pipelineStages?: Array<{ key: string; label: string }>;
  /** Nome da lista/funil exibido ao lado da etapa (ex.: COMERCIAL). */
  funnelLabel?: string;
  qualificationStars: number;
  onBack: () => void;
  onRefresh: () => void;
  onMarkLoss: () => void;
  onMarkWin: () => void;
  /** Status da negociação persistida — habilita Pausar/Retomar na ficha CRM. */
  negotiationStatus?: CrmNegotiationStatus;
  onTogglePauseNegotiation?: () => void;
  pauseTogglePending?: boolean;
  onEdit: () => void;
  onOpenInbox: () => void;
  onBlock: () => void;
  onCreateNote: () => void;
  onCreateTask: () => void;
  /** Quando definido, troca o bloco ilustrado por tarefas reais (lista pode ser vazia). */
  crmOpenTasks?: CrmTask[];
  /** Tarefas concluídas (ex.: histórico); exibidas em bloco recolhível quando houver itens. */
  crmCompletedTasks?: CrmTask[];
  /**
   * Rótulo de escopo nas linhas de tarefa.
   * `negotiation-merge`: Cliente vs Negociação (lista unificada na tela da negociação).
   * `customer-linked`: só indica tarefas vinculadas a uma negociação (perfil do cliente).
   */
  crmTaskScopeLabelMode?: "negotiation-merge" | "customer-linked";
  crmTasksLoading?: boolean;
  onCompleteCrmTask?: (taskId: string) => void;
  crmCompleteTaskPending?: boolean;
  /** Volta tarefa concluída para aberta. */
  onReopenCrmTask?: (taskId: string) => void;
  onDeleteCrmTask?: (taskId: string) => void;
  crmDeleteTaskPending?: boolean;
  /** Editar título, prazo e observações (tarefa aberta ou concluída). */
  onSaveCrmTaskEdit?: (payload: { id: string; patch: CrmTaskPatch }) => void | Promise<void>;
  crmEditTaskPending?: boolean;
  /** Colaboradores do tenant para rótulo e Select de responsável (`profiles.id`). */
  crmTaskAssignees?: { id: string; nome: string }[];
  /** Clique em uma etapa do funil (atualiza estágio persistido no cliente quando implementado na página). */
  onPipelineStageChange?: (stageIndex: number) => void;
  /** Rótulo do responsável da negociação (ficha `/crm/negociacao/:id`). */
  negotiationAssigneeLabel?: string;
  /** Exibe ação de assumir negócio do pool CRM. */
  showClaimNegotiation?: boolean;
  onClaimNegotiation?: () => void;
  claimNegotiationPending?: boolean;
  /** Devolver negócio ao pool (admin/operação). */
  showReleaseNegotiation?: boolean;
  onReleaseNegotiation?: () => void;
  releaseNegotiationPending?: boolean;
  /** Conteúdo da aba “Arquivos” (ex.: documentos do lead na ficha CRM). */
  negotiationDocumentsSlot?: ReactNode;
  /** Conteúdo da aba “Produtos” (vendas vinculadas à negociação). */
  negotiationProductsSlot?: ReactNode;
  /** Conteúdo da aba “Ligações” (histórico de chamadas do lead). */
  negotiationCallsSlot?: ReactNode;
  /** Conteúdo da aba “Comentários” (thread + @mentions na negociação). */
  negotiationCommentsSlot?: ReactNode;
  /** Dados da negociação persistida (ficha CRM); habilita edição com lápis. */
  negotiationPanelSnapshot?: NegotiationPanelSnapshot;
  onSaveNegotiationPanel?: (payload: NegotiationPanelSavePayload) => Promise<void>;
  negotiationPanelSavePending?: boolean;
  /** Cliente vinculado: permite editar telefone, e-mail e campos de `source_columns`. */
  negotiationPanelCustomerLinked?: boolean;
  /** Aba inicial das tabs inferiores (ex.: `tarefas` com `?criarTarefa=1`). */
  mainTabDefault?: string;
  /** Bloqueia alterações no lead até assumir (atendimento sem responsável). */
  negotiationReadOnly?: boolean;
  /** Bloqueia ações de cliente como editar cadastro e bloquear/reativar. */
  customerActionsDisabled?: boolean;
  /** Bloqueia ações do CRM como etapa, tarefa, ganho/perda e assumir/devolver. */
  crmActionsDisabled?: boolean;
};

export function ClienteRdPerfilView({
  cliente,
  daysContact,
  pipelineActiveIndex,
  pipelineStages,
  funnelLabel,
  qualificationStars,
  onBack,
  onRefresh,
  onMarkLoss,
  onMarkWin,
  negotiationStatus,
  onTogglePauseNegotiation,
  pauseTogglePending,
  onEdit,
  onOpenInbox,
  onBlock,
  onCreateNote,
  onCreateTask,
  crmOpenTasks,
  crmCompletedTasks,
  crmTaskScopeLabelMode,
  crmTasksLoading,
  onCompleteCrmTask,
  crmCompleteTaskPending,
  onReopenCrmTask,
  onDeleteCrmTask,
  crmDeleteTaskPending,
  onSaveCrmTaskEdit,
  crmEditTaskPending,
  crmTaskAssignees,
  onPipelineStageChange,
  negotiationAssigneeLabel,
  showClaimNegotiation,
  onClaimNegotiation,
  claimNegotiationPending,
  showReleaseNegotiation,
  onReleaseNegotiation,
  releaseNegotiationPending,
  negotiationDocumentsSlot,
  negotiationProductsSlot,
  negotiationCallsSlot,
  negotiationCommentsSlot,
  negotiationPanelSnapshot,
  onSaveNegotiationPanel,
  negotiationPanelSavePending,
  negotiationPanelCustomerLinked,
  mainTabDefault = "historico",
  negotiationReadOnly = false,
  customerActionsDisabled = false,
  crmActionsDisabled = false,
}: ClienteRdPerfilViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: customFieldDefs = [] } = useCustomerCustomFields();
  const { data: customFieldValueRows = [], isLoading: customFieldsLoading } = useCustomerCustomFieldValues(
    cliente.id,
  );
  const customFieldsById = useMemo(
    () =>
      buildCustomerCustomFieldsDisplayList({
        fields: customFieldDefs,
        valueRows: customFieldValueRows,
        sourceColumns: cliente.sourceColumns,
      }),
    [customFieldDefs, customFieldValueRows, cliente.sourceColumns],
  );

  const activeStageLabel = useMemo(() => {
    if (pipelineStages?.length) {
      const idx = Math.min(Math.max(pipelineActiveIndex, 0), pipelineStages.length - 1);
      return pipelineStages[idx]?.label ?? "—";
    }
    return "—";
  }, [pipelineActiveIndex, pipelineStages]);

  const [promoVisible, setPromoVisible] = useState(true);
  const [negoPanelEditing, setNegoPanelEditing] = useState(false);
  const [negoDraft, setNegoDraft] = useState<NegotiationPanelDraft | null>(null);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [taskEditTarget, setTaskEditTarget] = useState<CrmTask | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDueLocal, setTaskEditDueLocal] = useState("");
  const [taskEditNotes, setTaskEditNotes] = useState("");
  const [taskEditAssigneeId, setTaskEditAssigneeId] = useState("");
  const [crmTaskDelete, setCrmTaskDelete] = useState<{ id: string; title: string } | null>(null);

  const openTaskEdit = (t: CrmTask) => {
    if (negotiationReadOnly) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    setTaskEditTarget(t);
    setTaskEditTitle(t.title);
    setTaskEditDueLocal(isoToDatetimeLocalValue(t.dueAt));
    setTaskEditNotes(t.notes ?? "");
    setTaskEditAssigneeId(t.assigneeId ?? "");
    setTaskEditOpen(true);
  };

  const taskMutationBusy = Boolean(
    crmCompleteTaskPending || crmEditTaskPending || crmDeleteTaskPending,
  );

  const negoSaveBusy = Boolean(negotiationPanelSavePending);

  const startNegoPanelEdit = () => {
    if (negotiationReadOnly) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!negotiationPanelSnapshot || !onSaveNegotiationPanel) return;
    setNegoDraft({
      nome: cliente.nome,
      assigneeId: isNegotiationUnassigned(negotiationPanelSnapshot.assigneeId)
        ? ""
        : negotiationPanelSnapshot.assigneeId,
      qualification: String(negotiationPanelSnapshot.qualification),
      totalValue: String(negotiationPanelSnapshot.totalValue),
      closingForecastLocal: isoToDatetimeLocalValue(negotiationPanelSnapshot.closingForecast),
      origem: cliente.origem ?? "",
      campanha: sourceColumn(cliente, "campanha", "Campanha"),
      telefone: cliente.telefone ?? "",
      email: cliente.email ?? "",
      customFieldValues: buildCustomerCustomFieldsDraftValues({
        fields: customFieldDefs,
        valueRows: customFieldValueRows,
        sourceColumns: cliente.sourceColumns,
      }),
    });
    setNegoPanelEditing(true);
  };

  const cancelNegoPanelEdit = () => {
    setNegoPanelEditing(false);
    setNegoDraft(null);
  };

  const submitNegoPanelEdit = () => {
    if (!negoDraft || !onSaveNegotiationPanel) return;
    const nome = negoDraft.nome.trim();
    if (!nome) {
      toast({
        title: "Nome obrigatório",
        description: "Informe o nome da negociação ou cliente.",
        variant: "destructive",
      });
      return;
    }
    const qualification = Math.min(
      5,
      Math.max(0, Math.round(Number.parseInt(negoDraft.qualification, 10) || 0)),
    );
    const totalValue = Math.max(0, Number.parseFloat(negoDraft.totalValue) || 0);
    const payload: NegotiationPanelSavePayload = {
      nome,
      assigneeId: negoDraft.assigneeId.trim() || null,
      qualification,
      totalValue,
      closingForecastLocal: negoDraft.closingForecastLocal,
      origem:
        negoDraft.origem === "organico" || negoDraft.origem === "pago" ? negoDraft.origem : "",
      campanha: negoDraft.campanha.trim(),
      telefone: negoDraft.telefone.trim(),
      email: negoDraft.email.trim(),
      customFieldValues: { ...negoDraft.customFieldValues },
    };

    void (async () => {
      try {
        await onSaveNegotiationPanel(payload);
        if (cliente.id && customFieldDefs.length > 0) {
          await upsertCustomerCustomFieldValues(
            cliente.id,
            customFieldDefs,
            payload.customFieldValues,
          );
          invalidateCustomerCustomFieldValues(queryClient, cliente.id);
        }
        setNegoPanelEditing(false);
        setNegoDraft(null);
      } catch {
        // feedback via toast na página que chama o save
      }
    })();
  };

  const qualView = negotiationPanelSnapshot
    ? String(negotiationPanelSnapshot.qualification)
    : String(qualificationStars);

  const totalViewValue =
    negotiationPanelSnapshot != null ? negotiationPanelSnapshot.totalValue : cliente.totalGasto;

  const prevView = negotiationPanelSnapshot?.closingForecast
    ? new Date(negotiationPanelSnapshot.closingForecast).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";

  const createdViewSrc = negotiationPanelSnapshot?.createdAt ?? cliente.cadastradoEm ?? "";

  const createdView = createdViewSrc
    ? new Date(createdViewSrc).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "";

  const fonteView =
    cliente.origem === "organico"
      ? "Orgânico"
      : cliente.origem === "pago"
        ? "Pago"
        : "";

  return (
    <div
      className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      style={{ backgroundColor: RD_PAGE_BG }}
    >
      <header
        className="border-b border-[var(--crm-surface-2)] bg-card px-4 py-4 md:px-6"
        style={{ boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)" }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]"
              onClick={onBack}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--crm-ink)] md:text-2xl">{cliente.nome}</h1>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuItem
                      disabled={negotiationReadOnly || customerActionsDisabled}
                      onClick={() => {
                        if (negotiationReadOnly || customerActionsDisabled) {
                          toast({
                            title: "Ação indisponível",
                            description: negotiationReadOnly
                              ? negotiationAssigneeBlockedMessage()
                              : "Seu papel nao tem permissao para editar este cadastro.",
                            variant: "destructive",
                          });
                          return;
                        }
                        onEdit();
                      }}
                    >
                      Editar cadastro
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenInbox();
                      }}
                    >
                      Abrir no Inbox
                    </DropdownMenuItem>
                    {cliente.status !== "bloqueado" ? (
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        disabled={negotiationReadOnly || customerActionsDisabled}
                        onClick={() => {
                          if (negotiationReadOnly || customerActionsDisabled) {
                            toast({
                              title: "Ação indisponível",
                              description: negotiationReadOnly
                                ? negotiationAssigneeBlockedMessage()
                                : "Seu papel nao tem permissao para bloquear este cliente.",
                              variant: "destructive",
                            });
                            return;
                          }
                          onBlock();
                        }}
                      >
                        Bloquear cliente
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]"
                  onClick={onRefresh}
                  aria-label="Atualizar"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]" aria-hidden>
                  <Crosshair className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {activeStageLabel !== "—" ? (
                  <span className="rounded-md bg-[var(--crm-brand-tint)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--crm-brand-2)]">
                    {activeStageLabel}
                  </span>
                ) : null}
                {funnelLabel ? (
                  <span className="rounded-md bg-[var(--crm-surface)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-2)]">
                    {funnelLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:shrink-0">
            {showClaimNegotiation && onClaimNegotiation && !crmActionsDisabled && !negotiationReadOnly ? (
              <Button
                type="button"
                className="rounded-[10px] border-0 bg-primary px-4 py-2.5 font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
                disabled={claimNegotiationPending || releaseNegotiationPending}
                onClick={onClaimNegotiation}
              >
                <Hand className="mr-2 h-4 w-4" aria-hidden />
                {claimNegotiationPending ? "Assumindo…" : "Assumir negócio"}
              </Button>
            ) : null}
            {showReleaseNegotiation && onReleaseNegotiation && !crmActionsDisabled && !negotiationReadOnly ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-[10px] border-[var(--crm-brand-border)] bg-card px-4 py-2.5 font-semibold text-[var(--crm-brand)] shadow-none hover:bg-[var(--crm-brand-tint)]"
                disabled={releaseNegotiationPending || claimNegotiationPending}
                onClick={onReleaseNegotiation}
              >
                <Users className="mr-2 h-4 w-4" aria-hidden />
                {releaseNegotiationPending ? "Devolvendo…" : "Devolver ao pool"}
              </Button>
            ) : null}
            {negotiationPauseToggleLabel(negotiationStatus ?? "em_andamento") &&
            onTogglePauseNegotiation ? (
              <Button
                type="button"
                variant="outline"
                data-testid="crm-toggle-pause"
                className="rounded-[10px] border-[var(--crm-border-2)] px-4 py-2.5 font-semibold shadow-none hover:bg-[var(--crm-surface)] disabled:opacity-50"
                disabled={negotiationReadOnly || crmActionsDisabled || pauseTogglePending}
                title={
                  negotiationReadOnly
                    ? "Assuma o negócio para pausar ou retomar"
                    : crmActionsDisabled
                      ? "Seu papel não tem permissão"
                      : undefined
                }
                onClick={onTogglePauseNegotiation}
              >
                {negotiationStatus === "pausado" ? (
                  <Play className="mr-2 h-4 w-4" aria-hidden />
                ) : (
                  <Pause className="mr-2 h-4 w-4" aria-hidden />
                )}
                {negotiationPauseToggleLabel(negotiationStatus ?? "em_andamento")}
              </Button>
            ) : null}
            <Button
              type="button"
              data-testid="crm-mark-loss"
              className="rounded-[10px] border-0 bg-red-600 px-4 py-2.5 font-semibold text-white shadow-none hover:bg-red-700 disabled:opacity-50"
              disabled={negotiationReadOnly || crmActionsDisabled}
              title={
                negotiationReadOnly
                  ? "Assuma o negócio para marcar perda"
                  : crmActionsDisabled
                    ? "Seu papel nao tem permissao para marcar perda"
                    : undefined
              }
              onClick={onMarkLoss}
            >
              <ThumbsDown className="mr-2 h-4 w-4" />
              Marcar perda
            </Button>
            <Button
              type="button"
              className="rounded-[10px] border-0 bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-none hover:bg-emerald-700 disabled:opacity-50"
              disabled={negotiationReadOnly || crmActionsDisabled}
              title={
                negotiationReadOnly
                  ? "Assuma o negócio para marcar venda"
                  : crmActionsDisabled
                    ? "Seu papel nao tem permissao para marcar venda"
                    : undefined
              }
              onClick={onMarkWin}
            >
              <ThumbsUp className="mr-2 h-4 w-4" />
              Marcar venda
            </Button>
          </div>
        </div>
      </header>

      {negotiationReadOnly ? (
        <div className="border-b border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-4 py-2.5 text-sm text-[var(--crm-amber-ink)] md:px-6">
          {negotiationAssigneeBlockedMessage()}
        </div>
      ) : null}

      <PipelineChevrons
        activeIndex={pipelineActiveIndex}
        daysContact={daysContact}
        stages={pipelineStages}
        onStageSelect={negotiationReadOnly || crmActionsDisabled ? undefined : onPipelineStageChange}
      />

      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[minmax(280px,340px)_1fr] lg:items-start">
        <aside className="space-y-4">
          <Collapsible
            defaultOpen
            className="overflow-hidden border border-[var(--crm-surface-2)] bg-[var(--crm-surface)]"
            style={{ borderRadius: RD_RADIUS, boxShadow: RD_CARD_SHADOW }}
          >
            <div className="flex items-center justify-between border-b border-[var(--crm-surface)] bg-[var(--crm-surface)] px-2 py-2 pl-4 md:px-3">
              <span className="text-sm font-semibold text-[var(--crm-ink)]">Negociação</span>
              <div className="flex shrink-0 items-center">
                {onSaveNegotiationPanel && negotiationPanelSnapshot && !negotiationReadOnly && !crmActionsDisabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-border-2)] hover:text-[var(--crm-ink)]"
                    disabled={negoPanelEditing || negoSaveBusy}
                    aria-label="Editar campos da negociação"
                    onClick={startNegoPanelEdit}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="group h-8 w-8 text-[var(--crm-ink-3)] hover:bg-[var(--crm-border-2)]"
                    aria-label="Recolher ou expandir"
                  >
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
            <CollapsibleContent>
              <div className="px-4 py-1">
                {!negoPanelEditing || !negoDraft ? (
                  <>
                    <NegField label="Nome" value={cliente.nome} />
                    {negotiationAssigneeLabel !== undefined ? (
                      <NegField label="Responsável" value={negotiationAssigneeLabel} />
                    ) : null}
                    <NegField label="Qualificação" value={qualView} />
                    <NegField label="Criada em" value={createdView} />
                    <NegField
                      label="Valor total"
                      value={
                        totalViewValue > 0
                          ? formatBRL(totalViewValue)
                          : ""
                      }
                    />
                    <NegField label="Previsão de fechamento" value={prevView} />
                    <NegField label="Fonte" value={fonteView} />
                    <NegField label="Canal de origem" value={sourceColumn(cliente, "canal_origem", "Canal de origem")} />
                    <NegField label="Campanha" value={sourceColumn(cliente, "campanha", "Campanha")} />
                    {customFieldsLoading && customFieldDefs.length > 0 ? (
                      <p className="border-b border-[var(--crm-surface)] py-2.5 text-[12px] text-[var(--crm-ink-3)] last:border-b-0">
                        Carregando campos personalizados…
                      </p>
                    ) : (
                      customFieldsById.map(({ field, value, raw }) =>
                        field.kind === "galeria" ? (
                          <div key={field.id} className="border-b border-[var(--crm-surface)] py-2.5 last:border-b-0">
                            <CustomerCustomFieldInput
                              field={field}
                              value={raw}
                              onChange={() => undefined}
                              disabled
                              labelClassName="text-[11px] font-medium uppercase tracking-wide text-[var(--crm-ink-3)]"
                            />
                          </div>
                        ) : (
                          <NegField key={field.id} label={field.nome} value={value} />
                        ),
                      )
                    )}
                    <NegField
                      label="Outras informações"
                      value={Object.entries(negotiationPanelSnapshot?.otherInfo ?? {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join("; ")}
                    />
                    <NegField label="Telefone" value={cliente.telefone ?? ""} />
                    <NegField label="E-mail" value={cliente.email ?? ""} />
                  </>
                ) : (
                  <>
                    <NegFieldEdit label="Nome">
                      <Input
                        value={negoDraft.nome}
                        onChange={(e) => setNegoDraft({ ...negoDraft, nome: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                        autoComplete="name"
                      />
                    </NegFieldEdit>
                    <NegFieldEdit label="Responsável">
                      <Select
                        value={negoDraft.assigneeId.trim() ? negoDraft.assigneeId : CRM_TASK_ASSIGNEE_NONE}
                        onValueChange={(v) =>
                          setNegoDraft({
                            ...negoDraft,
                            assigneeId: v === CRM_TASK_ASSIGNEE_NONE ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-9 border-[var(--crm-border-2)]">
                          <SelectValue placeholder="Pool (sem responsável)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CRM_TASK_ASSIGNEE_NONE}>Pool (sem responsável)</SelectItem>
                          {(crmTaskAssignees ?? []).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.nome?.trim() || a.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </NegFieldEdit>
                    <NegFieldEdit label="Qualificação">
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={1}
                        value={negoDraft.qualification}
                        onChange={(e) => setNegoDraft({ ...negoDraft, qualification: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                      />
                    </NegFieldEdit>
                    <NegFieldEdit label="Criada em">
                      <Input value={createdView || "—"} readOnly className="h-9 border-[var(--crm-border)] bg-[var(--crm-surface)]" />
                    </NegFieldEdit>
                    <NegFieldEdit label="Valor total">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={negoDraft.totalValue}
                        onChange={(e) => setNegoDraft({ ...negoDraft, totalValue: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                      />
                    </NegFieldEdit>
                    <NegFieldEdit label="Previsão de fechamento">
                      <Input
                        type="datetime-local"
                        value={negoDraft.closingForecastLocal}
                        onChange={(e) =>
                          setNegoDraft({ ...negoDraft, closingForecastLocal: e.target.value })
                        }
                        className="h-9 border-[var(--crm-border-2)]"
                      />
                    </NegFieldEdit>
                    <NegFieldEdit label="Fonte">
                      <Select
                        value={negoDraft.origem || NEG_ORIGEM_NONE}
                        onValueChange={(v) =>
                          setNegoDraft({
                            ...negoDraft,
                            origem: v === NEG_ORIGEM_NONE ? "" : v,
                          })
                        }
                        disabled={!negotiationPanelCustomerLinked}
                      >
                        <SelectTrigger className="h-9 border-[var(--crm-border-2)]">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEG_ORIGEM_NONE}>—</SelectItem>
                          <SelectItem value="organico">Orgânico</SelectItem>
                          <SelectItem value="pago">Pago</SelectItem>
                        </SelectContent>
                      </Select>
                    </NegFieldEdit>
                    <NegFieldEdit label="Campanha">
                      <Input
                        value={negoDraft.campanha}
                        onChange={(e) => setNegoDraft({ ...negoDraft, campanha: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                        disabled={!negotiationPanelCustomerLinked}
                      />
                    </NegFieldEdit>
                    {customFieldDefs.map((field) => (
                      <NegFieldEdit key={field.id} label={field.nome}>
                        <CustomerCustomFieldInput
                          field={field}
                          value={negoDraft.customFieldValues[field.id] ?? ""}
                          onChange={(value) =>
                            setNegoDraft({
                              ...negoDraft,
                              customFieldValues: {
                                ...negoDraft.customFieldValues,
                                [field.id]: value,
                              },
                            })
                          }
                          inputClassName="h-9 border-[var(--crm-border-2)]"
                          labelClassName="sr-only"
                        />
                      </NegFieldEdit>
                    ))}
                    <NegFieldEdit label="Telefone">
                      <Input
                        value={negoDraft.telefone}
                        onChange={(e) => setNegoDraft({ ...negoDraft, telefone: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                        disabled={!negotiationPanelCustomerLinked}
                        autoComplete="tel"
                      />
                    </NegFieldEdit>
                    <NegFieldEdit label="E-mail">
                      <Input
                        type="email"
                        value={negoDraft.email}
                        onChange={(e) => setNegoDraft({ ...negoDraft, email: e.target.value })}
                        className="h-9 border-[var(--crm-border-2)]"
                        disabled={!negotiationPanelCustomerLinked}
                        autoComplete="email"
                      />
                    </NegFieldEdit>
                    {!negotiationPanelCustomerLinked ? (
                      <p className="pt-2 text-[11px] leading-snug text-[var(--crm-ink-3)]">
                        Vincule um cliente ao lead para editar telefone, e-mail, fonte e campos adicionais do cadastro.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--crm-surface)] pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[var(--crm-border-2)]"
                        disabled={negoSaveBusy}
                        onClick={cancelNegoPanelEdit}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        className="border-0 font-semibold text-white"
                        style={{ backgroundColor: BRAND_ACCENT, borderRadius: RD_RADIUS }}
                        disabled={negoSaveBusy}
                        onClick={submitNegoPanelEdit}
                      >
                        {negoSaveBusy ? "Salvando…" : "Salvar"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </aside>

        <main className="min-w-0 space-y-6">
          <Tabs defaultValue={mainTabDefault} className="w-full">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-0 rounded-none border-b border-[var(--crm-surface-2)] bg-transparent p-0">
              {((): Array<[string, string]> => {
                const tabs: Array<[string, string]> = [
                  ["historico", "Histórico"],
                  ["email", "E-mail"],
                  ["tarefas", "Tarefas"],
                ];
                if (negotiationCommentsSlot) tabs.push(["comentarios", "Comentários"]);
                tabs.push(
                  ["questionarios", "Questionários"],
                  ["produtos", "Produtos"],
                  ["ligacoes", "Ligações"],
                  ["arquivos", "Arquivos"],
                  ["propostas", "Propostas"],
                );
                return tabs;
              })().map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className={cn(
                    "rounded-none border-b-[3px] border-transparent px-4 py-3 text-sm font-medium text-[var(--crm-ink-3)] data-[state=active]:border-b-[var(--crm-brand)] data-[state=active]:bg-transparent data-[state=active]:text-[var(--crm-brand)] data-[state=active]:shadow-none",
                  )}
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent
              value="historico"
              className="mt-0 space-y-4 border border-t-0 border-[var(--crm-surface-2)] bg-card p-4 md:p-5"
              style={{ boxShadow: RD_CARD_SHADOW }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Select defaultValue="CaleoCRM">
                    <SelectTrigger className="h-9 w-[200px] rounded-md border-[var(--crm-border-2)] bg-card text-sm">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CaleoCRM">Do: CaleoCRM</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select defaultValue="todos">
                    <SelectTrigger className="h-9 w-[220px] rounded-md border-[var(--crm-border-2)] bg-card text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Exibir: Todos os eventos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="border-0 py-2.5 font-semibold text-white shadow-none hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND_ACCENT, borderRadius: RD_RADIUS }}
                  disabled={negotiationReadOnly || customerActionsDisabled}
                  title={
                    negotiationReadOnly
                      ? "Assuma o negócio para criar anotação"
                      : customerActionsDisabled
                        ? "Seu papel nao tem permissao para criar anotação"
                        : undefined
                  }
                  onClick={onCreateNote}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar anotação
                </Button>
              </div>

              <div className="relative pl-6">
                <div className="absolute bottom-0 left-[7px] top-2 w-px bg-[var(--crm-border-2)]" aria-hidden />

                {promoVisible ? (
                  <div
                    className="relative mb-6 border border-[var(--crm-surface-2)] bg-card pl-4"
                    style={{ borderRadius: RD_RADIUS, boxShadow: RD_CARD_SHADOW }}
                  >
                    <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-[var(--crm-brand-2)]" aria-hidden />
                    <button
                      type="button"
                      className="absolute right-3 top-3 rounded p-1 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]"
                      onClick={() => setPromoVisible(false)}
                      aria-label="Fechar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="p-4 pr-10">
                      <p className="font-semibold text-[var(--crm-brand-2)]">Feche até 40% mais vendas</p>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--crm-ink-3)]">
                        Instale a extensão do WhatsApp no CaleoCRM para acompanhar negociações e responder mais rápido, sem sair do CRM.
                      </p>
                    </div>
                  </div>
                ) : null}

                <p className="text-sm text-[var(--crm-ink-3)]">Linha do tempo de atividades do cliente.</p>
              </div>
            </TabsContent>

            {(["email", "questionarios", "propostas"] as const).map((value) => (
              <TabsContent
                key={value}
                value={value}
                className="mt-0 border border-t-0 border-[var(--crm-surface-2)] bg-card p-8 text-center text-sm text-[var(--crm-ink-3)]"
                style={{ boxShadow: RD_CARD_SHADOW }}
              >
                {negotiationReadOnly
                  ? negotiationAssigneeBlockedMessage()
                  : "Nenhum conteúdo nesta aba ainda."}
              </TabsContent>
            ))}
            <TabsContent
              value="produtos"
              className={cn(
                "mt-0 border border-t-0 border-[var(--crm-surface-2)] bg-card",
                negotiationProductsSlot
                  ? "p-4 md:p-5 text-left"
                  : "p-8 text-center text-sm text-[var(--crm-ink-3)]",
              )}
              style={{ boxShadow: RD_CARD_SHADOW }}
            >
              {negotiationProductsSlot ?? "Nenhum conteúdo nesta aba ainda."}
            </TabsContent>
            <TabsContent
              value="ligacoes"
              className={cn(
                "mt-0 border border-t-0 border-[var(--crm-surface-2)] bg-card",
                negotiationCallsSlot ? "p-4 md:p-5 text-left" : "p-8 text-center text-sm text-[var(--crm-ink-3)]",
              )}
              style={{ boxShadow: RD_CARD_SHADOW }}
            >
              {negotiationCallsSlot ?? "Nenhum conteúdo nesta aba ainda."}
            </TabsContent>
            {negotiationCommentsSlot ? (
              <TabsContent
                value="comentarios"
                className="mt-0 border border-t-0 border-[var(--crm-surface-2)] bg-card p-4 md:p-5"
                style={{ boxShadow: RD_CARD_SHADOW }}
              >
                {negotiationCommentsSlot}
              </TabsContent>
            ) : null}
            <TabsContent
              value="tarefas"
              className="mt-0 overflow-hidden border border-t-0 border-[var(--crm-surface-2)] bg-card p-0"
              style={{ boxShadow: RD_CARD_SHADOW }}
            >
              <ClienteRdPerfilTasksTabBody
                crmOpenTasks={crmOpenTasks}
                crmCompletedTasks={crmCompletedTasks}
                crmTaskScopeLabelMode={crmTaskScopeLabelMode}
                crmTasksLoading={crmTasksLoading ?? false}
                crmTaskAssignees={crmTaskAssignees}
                onCompleteCrmTask={onCompleteCrmTask}
                onReopenCrmTask={onReopenCrmTask}
                onDeleteCrmTask={onDeleteCrmTask}
                onSaveCrmTaskEdit={onSaveCrmTaskEdit}
                taskMutationBusy={taskMutationBusy}
                onCreateTask={onCreateTask}
                openTaskEdit={openTaskEdit}
                onRequestDeleteTask={(t) => setCrmTaskDelete(t)}
                readOnly={negotiationReadOnly || crmActionsDisabled}
              />
            </TabsContent>
            <TabsContent
              value="arquivos"
              className={cn(
                "mt-0 border border-t-0 border-[var(--crm-surface-2)] bg-card",
                negotiationDocumentsSlot
                  ? "p-4 md:p-5"
                  : "p-8 text-center text-sm text-[var(--crm-ink-3)]",
              )}
              style={{ boxShadow: RD_CARD_SHADOW }}
            >
              {negotiationDocumentsSlot ?? "Nenhum conteúdo nesta aba ainda."}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <AlertDialog
        open={crmTaskDelete != null}
        onOpenChange={(open) => {
          if (!open) {
            setCrmTaskDelete(null);
          }
        }}
      >
        <AlertDialogContent className="border-[var(--crm-border-2)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {crmTaskDelete
                ? `“${crmTaskDelete.title}” será removida permanentemente. Esta ação não pode ser desfeita.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--crm-border-2)]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--crm-danger)] text-white hover:bg-[var(--crm-danger-strong)]"
              onClick={() => {
                if (crmTaskDelete && onDeleteCrmTask) {
                  onDeleteCrmTask(crmTaskDelete.id);
                }
                setCrmTaskDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={taskEditOpen}
        onOpenChange={(open) => {
          setTaskEditOpen(open);
          if (!open) {
            setTaskEditTarget(null);
            setTaskEditAssigneeId("");
          }
        }}
      >
        <DialogContent className="border-[var(--crm-border-2)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
            <DialogDescription>Atualize título, prazo, responsável ou observações.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="crm-task-edit-title">Título</Label>
              <Input
                id="crm-task-edit-title"
                value={taskEditTitle}
                onChange={(e) => setTaskEditTitle(e.target.value)}
                className="border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-edit-due">Prazo (opcional)</Label>
              <Input
                id="crm-task-edit-due"
                type="datetime-local"
                value={taskEditDueLocal}
                onChange={(e) => setTaskEditDueLocal(e.target.value)}
                className="border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-edit-notes">Observações (opcional)</Label>
              <Textarea
                id="crm-task-edit-notes"
                value={taskEditNotes}
                onChange={(e) => setTaskEditNotes(e.target.value)}
                rows={3}
                className="resize-none border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-edit-assignee">Responsável (opcional)</Label>
              <Select
                value={taskEditAssigneeId.trim() ? taskEditAssigneeId : CRM_TASK_ASSIGNEE_NONE}
                onValueChange={(v) => setTaskEditAssigneeId(v === CRM_TASK_ASSIGNEE_NONE ? "" : v)}
              >
                <SelectTrigger id="crm-task-edit-assignee" className="border-[var(--crm-border-2)]">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CRM_TASK_ASSIGNEE_NONE}>Sem responsável</SelectItem>
                  {(crmTaskAssignees ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome?.trim() || a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTaskEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[var(--crm-brand)] hover:bg-[var(--crm-brand-strong)]"
              disabled={!onSaveCrmTaskEdit || !taskEditTarget || taskMutationBusy}
              onClick={() => {
                void (async () => {
                  if (!taskEditTarget || !onSaveCrmTaskEdit) {
                    return;
                  }
                  const title = taskEditTitle.trim();
                  if (!title) {
                    toast({
                      title: "Título obrigatório",
                      description: "Informe um título para a tarefa.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const patch: CrmTaskPatch = {
                    title,
                    dueAt: taskEditDueLocal.trim() ? new Date(taskEditDueLocal).toISOString() : null,
                    notes: taskEditNotes.trim(),
                    assigneeId: taskEditAssigneeId.trim() ? taskEditAssigneeId.trim() : null,
                  };
                  try {
                    await Promise.resolve(onSaveCrmTaskEdit({ id: taskEditTarget.id, patch }));
                    setTaskEditOpen(false);
                    setTaskEditTarget(null);
                  } catch {
                    /* toast na página */
                  }
                })();
              }}
            >
              {crmEditTaskPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
