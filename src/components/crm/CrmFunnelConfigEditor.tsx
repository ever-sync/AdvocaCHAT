import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { CrmFunnelMigrateDialog } from "@/components/crm/CrmFunnelMigrateDialog";
import { CrmFunnelDeleteDialog, type FunnelDeleteResult } from "@/components/crm/CrmFunnelDeleteDialog";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { CrmFunnel, CrmStageRequiredField } from "@/data/crm-funnels";
import {
  addFunnel,
  addStage,
  createDefaultFunnel,
  createDefaultStage,
  moveStage,
  removeFunnel,
  removeStage,
  setExclusiveLostStage,
  setExclusiveSaleStage,
  slugifyFunnelKey,
  uniqueKey,
  updateFunnel,
  updateStage,
} from "@/lib/crm/funnel-editor-utils";
import type { PendingFunnelMigration } from "@/lib/crm/funnel-migration";
import { mergePendingMigrations, replaceFunnelMigrations } from "@/lib/crm/funnel-migration";
import { CRM_STAGE_REQUIRED_FIELD_OPTIONS } from "@/lib/crm/stage-requirements";
import { useCrmTaskTemplates } from "@/lib/api/crm-task-templates";
import { cn } from "@/lib/utils";

const STAGE_TASK_TEMPLATE_NONE = "__none__";

type CrmFunnelConfigEditorProps = {
  funnels: CrmFunnel[];
  onChange: (funnels: CrmFunnel[]) => void;
  disabled?: boolean;
  countNegotiationsByFunnel?: (funnelId: string) => Promise<number>;
  countNegotiationsByStage?: (funnelId: string, stageId: string) => Promise<number>;
  pendingMigrations?: PendingFunnelMigration[];
  onPendingMigrationsChange?: (migrations: PendingFunnelMigration[]) => void;
};

function toggleStageField(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  field: CrmStageRequiredField,
  checked: boolean,
): CrmFunnel[] {
  return funnels.map((funnel) => {
    if (funnel.id !== funnelId) return funnel;
    return {
      ...funnel,
      stages: funnel.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        const next = new Set(stage.requiredFields ?? []);
        if (checked) next.add(field);
        else next.delete(field);
        const requiredFields = [...next];
        return {
          ...stage,
          requiredFields: requiredFields.length > 0 ? requiredFields : undefined,
        };
      }),
    };
  });
}

function setStageTaskTemplate(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  templateId: string | null,
): CrmFunnel[] {
  return funnels.map((funnel) => {
    if (funnel.id !== funnelId) return funnel;
    return {
      ...funnel,
      stages: funnel.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return { ...stage, taskTemplateId: templateId || undefined };
      }),
    };
  });
}

function setStageProbability(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
  probability: number | null,
): CrmFunnel[] {
  return funnels.map((funnel) => {
    if (funnel.id !== funnelId) return funnel;
    return {
      ...funnel,
      stages: funnel.stages.map((stage) => {
        if (stage.id !== stageId) return stage;
        return { ...stage, probability: probability == null ? undefined : probability };
      }),
    };
  });
}

type MigratePrompt =
  | {
      kind: "funnel";
      funnelId: string;
      funnelName: string;
      count: number;
    }
  | {
      kind: "stage";
      funnelId: string;
      funnelName: string;
      stageId: string;
      stageTitle: string;
      count: number;
    };

function CopyKeyButton({ value, disabled }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0"
      disabled={disabled || !value}
      title="Copiar chave (para usar no n8n)"
      aria-label="Copiar chave da etapa"
      onClick={() => {
        if (!value) return;
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function buildFunnelDeleteMigrations(
  fromFunnelId: string,
  result: FunnelDeleteResult,
): PendingFunnelMigration[] {
  if (!result.transfer) {
    return [{ kind: "funnel_clear", fromFunnelId }];
  }
  if (result.mode === "single") {
    return [
      {
        kind: "funnel",
        fromFunnelId,
        toFunnelId: result.toFunnelId,
        toStageId: result.toStageId,
      },
    ];
  }
  return result.mappings.map((m) => ({
    kind: "funnel_stage",
    fromFunnelId,
    fromStageId: m.fromStageId,
    toFunnelId: result.toFunnelId,
    toStageId: m.toStageId,
  }));
}

export function CrmFunnelConfigEditor({
  funnels,
  onChange,
  disabled,
  countNegotiationsByFunnel,
  countNegotiationsByStage,
  pendingMigrations = [],
  onPendingMigrationsChange,
}: CrmFunnelConfigEditorProps) {
  const { data: taskTemplates = [] } = useCrmTaskTemplates();
  const [funnelId, setFunnelId] = useState(funnels[0]?.id ?? "");
  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const [newFunnelName, setNewFunnelName] = useState("");
  const [deleteFunnelOpen, setDeleteFunnelOpen] = useState(false);
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const [migratePrompt, setMigratePrompt] = useState<MigratePrompt | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const queueMigration = useCallback(
    (migration: PendingFunnelMigration) => {
      if (!onPendingMigrationsChange) {
        return;
      }
      onPendingMigrationsChange(mergePendingMigrations(pendingMigrations, migration));
    },
    [onPendingMigrationsChange, pendingMigrations],
  );

  useEffect(() => {
    if (!funnels.some((f) => f.id === funnelId)) {
      setFunnelId(funnels[0]?.id ?? "");
    }
  }, [funnelId, funnels]);

  const activeFunnel = useMemo(
    () => funnels.find((f) => f.id === funnelId) ?? funnels[0],
    [funnelId, funnels],
  );

  const deleteSourceFunnel = useMemo(
    () =>
      migratePrompt?.kind === "funnel"
        ? funnels.find((f) => f.id === migratePrompt.funnelId) ?? null
        : null,
    [funnels, migratePrompt],
  );

  const requestDeleteFunnel = useCallback(async () => {
    if (!activeFunnel) {
      return;
    }
    if (!countNegotiationsByFunnel) {
      setDeleteFunnelOpen(true);
      return;
    }
    setCountLoading(true);
    try {
      const count = await countNegotiationsByFunnel(activeFunnel.id);
      if (count > 0) {
        setMigratePrompt({
          kind: "funnel",
          funnelId: activeFunnel.id,
          funnelName: activeFunnel.listName,
          count,
        });
        return;
      }
      setDeleteFunnelOpen(true);
    } finally {
      setCountLoading(false);
    }
  }, [activeFunnel, countNegotiationsByFunnel]);

  const requestDeleteStage = useCallback(
    async (stageId: string) => {
      if (!activeFunnel) {
        return;
      }
      const stage = activeFunnel.stages.find((s) => s.id === stageId);
      if (!stage) {
        return;
      }
      if (!countNegotiationsByStage) {
        setDeleteStageId(stageId);
        return;
      }
      setCountLoading(true);
      try {
        const count = await countNegotiationsByStage(activeFunnel.id, stageId);
        if (count > 0) {
          setMigratePrompt({
            kind: "stage",
            funnelId: activeFunnel.id,
            funnelName: activeFunnel.listName,
            stageId,
            stageTitle: stage.title,
            count,
          });
          return;
        }
        setDeleteStageId(stageId);
      } finally {
        setCountLoading(false);
      }
    },
    [activeFunnel, countNegotiationsByStage],
  );

  const pendingMigrationCount = pendingMigrations.length;

  if (funnels.length === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-dashed border-border px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">Nenhum funil configurado.</p>
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => setNewFunnelOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Criar primeiro funil
        </Button>
        <NewFunnelDialog
          open={newFunnelOpen}
          onOpenChange={setNewFunnelOpen}
          name={newFunnelName}
          onNameChange={setNewFunnelName}
          disabled={disabled}
          onConfirm={() => {
            const funnel = createDefaultFunnel(newFunnelName || "Novo funil", funnels);
            onChange(addFunnel(funnels, funnel));
            setFunnelId(funnel.id);
            setNewFunnelName("");
            setNewFunnelOpen(false);
          }}
        />
      </div>
    );
  }

  const selectedId = activeFunnel?.id ?? funnels[0].id;

  const handleFunnelListNameChange = (value: string) => {
    if (!activeFunnel) return;
    onChange(updateFunnel(funnels, activeFunnel.id, { listName: value }));
  };

  const handleFunnelIdChange = (value: string) => {
    if (!activeFunnel) return;
    const nextId = slugifyFunnelKey(value);
    const taken = new Set(funnels.filter((f) => f.id !== activeFunnel.id).map((f) => f.id));
    const id = uniqueKey(taken, nextId);
    onChange(updateFunnel(funnels, activeFunnel.id, { id }));
    setFunnelId(id);
  };

  const handleStageTitleChange = (stageId: string, title: string) => {
    if (!activeFunnel) return;
    onChange(
      updateStage(funnels, activeFunnel.id, stageId, {
        title,
      }),
    );
  };

  return (
    <div className="space-y-5 rounded-xl border border-border/70 bg-muted/20 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="crm-funnel-select" className="text-sm font-medium">
              Funil
            </Label>
            <Select
              value={selectedId}
              onValueChange={setFunnelId}
              disabled={disabled}
            >
              <SelectTrigger id="crm-funnel-select" className="h-9 bg-background">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.listName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={disabled}
            onClick={() => setNewFunnelOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Novo funil
          </Button>
        </div>
      </div>

      {activeFunnel ? (
        <>
          <div className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 sm:p-5">
            <div className="space-y-1.5">
              <Label htmlFor="crm-funnel-name">Nome exibido no CRM</Label>
              <Input
                id="crm-funnel-name"
                value={activeFunnel.listName}
                disabled={disabled}
                onChange={(e) => handleFunnelListNameChange(e.target.value)}
                placeholder="Ex.: COMERCIAL"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-funnel-id">Identificador (slug)</Label>
              <Input
                id="crm-funnel-id"
                value={activeFunnel.id}
                disabled={disabled}
                className="font-mono text-sm"
                onChange={(e) => handleFunnelIdChange(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Usado internamente. Negociações antigas mantêm o id anterior se você alterar.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Etapas do Kanban</h3>
                <p className="text-xs text-muted-foreground">
                  Ordem de cima para baixo = colunas da esquerda para a direita no quadro.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  const stage = createDefaultStage(activeFunnel);
                  onChange(addStage(funnels, activeFunnel.id, stage));
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Adicionar etapa
              </Button>
            </div>

            <div className="space-y-3">
              {activeFunnel.stages.map((stage, index) => (
                <div
                  key={`${activeFunnel.id}-${stage.id}-${index}`}
                  className={cn(
                    "rounded-lg border border-border bg-card px-4 py-4 sm:px-5",
                    index % 2 === 1 && "bg-muted/15",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={disabled || index === 0}
                        aria-label="Mover etapa para cima"
                        onClick={() =>
                          onChange(moveStage(funnels, activeFunnel.id, stage.id, "up"))
                        }
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        disabled={disabled || index === activeFunnel.stages.length - 1}
                        aria-label="Mover etapa para baixo"
                        onClick={() =>
                          onChange(moveStage(funnels, activeFunnel.id, stage.id, "down"))
                        }
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nome da etapa</Label>
                          <Input
                            value={stage.title}
                            disabled={disabled}
                            onChange={(e) =>
                              handleStageTitleChange(stage.id, e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">ID da etapa (chave)</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              value={stage.id}
                              readOnly
                              disabled
                              tabIndex={-1}
                              className="cursor-not-allowed bg-muted/50 font-mono text-sm"
                              aria-label="ID da etapa (gerado automaticamente)"
                            />
                            <CopyKeyButton value={stage.id} />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Chave fixa desta etapa — use no n8n. Gerada automaticamente, não editável.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Campos obrigatórios ao mover card para esta etapa
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          {CRM_STAGE_REQUIRED_FIELD_OPTIONS.map((opt) => {
                            const checked = (stage.requiredFields ?? []).includes(opt.id);
                            return (
                              <label
                                key={opt.id}
                                className="flex cursor-pointer items-center gap-2 text-sm"
                                title={opt.description}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={disabled}
                                  onCheckedChange={(value) => {
                                    onChange(
                                      toggleStageField(
                                        funnels,
                                        activeFunnel.id,
                                        stage.id,
                                        opt.id,
                                        value === true,
                                      ),
                                    );
                                  }}
                                />
                                <span>{opt.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {(stage.requiredFields ?? []).includes("next_task_at") ? (
                          <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
                            <Label className="text-xs font-medium">Tarefa a criar nesta etapa</Label>
                            <Select
                              value={
                                stage.taskTemplateId?.trim()
                                  ? stage.taskTemplateId
                                  : STAGE_TASK_TEMPLATE_NONE
                              }
                              disabled={disabled}
                              onValueChange={(v) =>
                                onChange(
                                  setStageTaskTemplate(
                                    funnels,
                                    activeFunnel.id,
                                    stage.id,
                                    v === STAGE_TASK_TEMPLATE_NONE ? null : v,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Escolher tarefa pronta" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={STAGE_TASK_TEMPLATE_NONE}>
                                  Nenhuma (apenas exigir)
                                </SelectItem>
                                {taskTemplates.map((tpl) => (
                                  <SelectItem key={tpl.id} value={tpl.id}>
                                    {tpl.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {taskTemplates.length === 0
                                ? "Cadastre tarefas prontas em Configuração do chat → Tarefas."
                                : "Criada automaticamente para a negociação ao entrar nesta etapa."}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Probabilidade de fechamento (%)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          inputMode="numeric"
                          className="h-9 w-32"
                          disabled={disabled}
                          placeholder="—"
                          value={stage.probability == null ? "" : String(stage.probability)}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (raw === "") {
                              onChange(setStageProbability(funnels, activeFunnel.id, stage.id, null));
                              return;
                            }
                            const n = Number(raw);
                            if (!Number.isFinite(n)) return;
                            const clamped = Math.min(100, Math.max(0, Math.round(n)));
                            onChange(setStageProbability(funnels, activeFunnel.id, stage.id, clamped));
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Usada na previsão de vendas: valor ponderado = valor × probabilidade.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label
                          className="flex cursor-pointer items-start gap-2 text-sm"
                          title={
                            stage.isSaleStage
                              ? "Negócios vão para esta etapa ao registrar venda pelo chat ou marcar vendido."
                              : "Só pode existir uma etapa de venda por funil; ao marcar, as outras desmarcam."
                          }
                        >
                          <Checkbox
                            checked={Boolean(stage.isSaleStage)}
                            disabled={disabled || Boolean(stage.isLostStage)}
                            onCheckedChange={(value) =>
                              onChange(
                                setExclusiveSaleStage(
                                  funnels,
                                  activeFunnel.id,
                                  stage.id,
                                  value === true,
                                ),
                              )
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">Etapa de venda automática</span>
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              Ao registrar uma venda, o negócio passa para esta coluna (máximo uma por funil).
                            </span>
                          </span>
                        </label>
                        <label
                          className="flex cursor-pointer items-start gap-2 text-sm"
                          title={
                            stage.isLostStage
                              ? "Negócios marcados como perdidos vão para esta etapa."
                              : "Só pode existir uma etapa de perda por funil; ao marcar, as outras desmarcam."
                          }
                        >
                          <Checkbox
                            checked={Boolean(stage.isLostStage)}
                            disabled={disabled || Boolean(stage.isSaleStage)}
                            onCheckedChange={(value) =>
                              onChange(
                                setExclusiveLostStage(
                                  funnels,
                                  activeFunnel.id,
                                  stage.id,
                                  value === true,
                                ),
                              )
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">Etapa de perda</span>
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              Ao marcar um negócio como perdido, ele passa para esta coluna (máximo uma por funil).
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={disabled || activeFunnel.stages.length <= 1}
                      aria-label="Excluir etapa"
                      onClick={() => void requestDeleteStage(stage.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {pendingMigrationCount > 0 ? (
            <p className="rounded-md border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-3 py-2 text-xs text-[var(--crm-amber-ink)]">
              {pendingMigrationCount} migração{pendingMigrationCount === 1 ? "" : "ões"} pendente
              {pendingMigrationCount === 1 ? "" : "s"} — salve os funis para aplicar no banco.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => {
                const stage = createDefaultStage(activeFunnel);
                onChange(addStage(funnels, activeFunnel.id, stage));
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Adicionar etapa
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={disabled || funnels.length <= 1 || countLoading}
              onClick={() => void requestDeleteFunnel()}
            >
              {countLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Excluir funil
            </Button>
          </div>
        </>
      ) : null}

      <NewFunnelDialog
        open={newFunnelOpen}
        onOpenChange={setNewFunnelOpen}
        name={newFunnelName}
        onNameChange={setNewFunnelName}
        disabled={disabled}
        onConfirm={() => {
          const funnel = createDefaultFunnel(newFunnelName || "Novo funil", funnels);
          onChange(addFunnel(funnels, funnel));
          setFunnelId(funnel.id);
          setNewFunnelName("");
          setNewFunnelOpen(false);
        }}
      />

      <AlertDialog open={deleteFunnelOpen} onOpenChange={setDeleteFunnelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
            <AlertDialogDescription>
              O funil &quot;{activeFunnel?.listName}&quot; será removido desta configuração. Não há
              negociações vinculadas a este funil no banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!activeFunnel) return;
                const next = removeFunnel(funnels, activeFunnel.id);
                onChange(next);
                setFunnelId(next[0]?.id ?? "");
                setDeleteFunnelOpen(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteStageId != null}
        onOpenChange={(open) => !open && setDeleteStageId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa será removida da configuração. Não há negociações nesta etapa no banco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!activeFunnel || !deleteStageId) return;
                onChange(removeStage(funnels, activeFunnel.id, deleteStageId));
                setDeleteStageId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {migratePrompt?.kind === "funnel" && deleteSourceFunnel ? (
        <CrmFunnelDeleteDialog
          open
          onOpenChange={(open) => !open && setMigratePrompt(null)}
          funnels={funnels}
          sourceFunnel={deleteSourceFunnel}
          negotiationCount={migratePrompt.count}
          disabled={disabled}
          onConfirm={(result) => {
            const fromFunnelId = migratePrompt.funnelId;
            const nextMigrations = buildFunnelDeleteMigrations(fromFunnelId, result);
            if (onPendingMigrationsChange) {
              onPendingMigrationsChange(
                replaceFunnelMigrations(pendingMigrations, fromFunnelId, nextMigrations),
              );
            }
            const next = removeFunnel(funnels, fromFunnelId);
            onChange(next);
            setFunnelId(next[0]?.id ?? "");
            setMigratePrompt(null);
          }}
        />
      ) : null}

      {migratePrompt?.kind === "stage" ? (
        <CrmFunnelMigrateDialog
          open
          onOpenChange={(open) => !open && setMigratePrompt(null)}
          funnels={funnels}
          defaultTargetFunnelId={migratePrompt.funnelId}
          negotiationCount={migratePrompt.count}
          title="Migrar negociações antes de excluir a etapa"
          description={`A etapa "${migratePrompt.stageTitle}" (${migratePrompt.funnelName}) ainda tem negociações. Escolha a etapa de destino:`}
          confirmLabel="Migrar e excluir etapa"
          disabled={disabled}
          onConfirm={({ stageId: toStageId }) => {
            queueMigration({
              kind: "stage",
              funnelId: migratePrompt.funnelId,
              fromStageId: migratePrompt.stageId,
              toStageId,
            });
            if (activeFunnel) {
              onChange(removeStage(funnels, activeFunnel.id, migratePrompt.stageId));
            }
            setMigratePrompt(null);
          }}
        />
      ) : null}
    </div>
  );
}

function NewFunnelDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  disabled,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (value: string) => void;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo funil</DialogTitle>
          <DialogDescription>
            Serão criadas etapas iniciais (Lead e Contato). Você pode renomear e reordenar depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label htmlFor="new-funnel-name">Nome do funil</Label>
          <Input
            id="new-funnel-name"
            value={name}
            disabled={disabled}
            placeholder="Ex.: Parcerias"
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirm();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={disabled || !name.trim()} onClick={onConfirm}>
            Criar funil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
