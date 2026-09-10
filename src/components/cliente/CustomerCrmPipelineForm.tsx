import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { CrmFunnel } from "@/data/crm-funnels";
import { toCustomerUpsertInput, useUpdateCustomer } from "@/lib/api/customers";
import {
  useCreateCrmNegotiation,
  useCrmNegotiationsForCustomer,
  useUpdateCrmNegotiation,
} from "@/lib/api/crm-negotiations";
import { useCreateCrmTask } from "@/lib/api/crm-tasks";
import { useCrmTaskTemplates } from "@/lib/api/crm-task-templates";
import type { Customer } from "@/types/domain";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import { negotiationAssigneeBlockedMessage } from "@/lib/crm/negotiation-assignee";

const FUNNEL_NONE = "__funnel_none__";
const TASK_TEMPLATE_NONE = "__task_template_none__";

function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function CustomerCrmPipelineForm({
  customer,
  funnels,
  readOnly = false,
  className,
}: {
  customer: Customer;
  funnels: CrmFunnel[];
  readOnly?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const updateCustomer = useUpdateCustomer();
  const updateNegotiation = useUpdateCrmNegotiation();
  const createNegotiation = useCreateCrmNegotiation();
  const createCrmTask = useCreateCrmTask();
  const { data: taskTemplates = [] } = useCrmTaskTemplates();
  const { data: linkedNegotiations = [], isLoading: negotiationsLoading } =
    useCrmNegotiationsForCustomer(customer.id);

  const storedFunnel = customer.sourceColumns?.[CRM_FUNNEL_ID_KEY]?.trim() ?? "";
  const storedStage = customer.sourceColumns?.[CRM_PIPELINE_STAGE_KEY]?.trim() ?? "";

  const [draftFunnel, setDraftFunnel] = useState(storedFunnel);
  const [draftStage, setDraftStage] = useState(storedStage);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTemplateId, setTaskTemplateId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueLocal, setTaskDueLocal] = useState("");
  const [taskNotes, setTaskNotes] = useState("");

  useEffect(() => {
    setDraftFunnel(storedFunnel);
    setDraftStage(storedStage);
  }, [customer.id, storedFunnel, storedStage]);

  useEffect(() => {
    if (taskDialogOpen) {
      return;
    }
    setTaskTemplateId("");
    setTaskTitle("");
    setTaskDueLocal("");
    setTaskNotes("");
  }, [taskDialogOpen]);

  const draftFunnelOk = Boolean(draftFunnel && funnels.some((f) => f.id === draftFunnel));
  const draftCurrentFunnel = draftFunnelOk
    ? funnels.find((f) => f.id === draftFunnel)!
    : null;
  const stages = draftCurrentFunnel?.stages ?? [];
  const draftStageOk = Boolean(
    draftCurrentFunnel && draftStage && draftCurrentFunnel.stages.some((s) => s.id === draftStage),
  );

  const isSaving =
    updateCustomer.isPending ||
    updateNegotiation.isPending ||
    createNegotiation.isPending ||
    createCrmTask.isPending;
  // Sem negociação ativa, salvar deve poder criar uma mesmo que funil/etapa não tenham mudado
  // (ex.: cadastro com sourceColumns gravado por uma versão anterior, sem negociação no CRM).
  const noOpenNegotiation =
    !negotiationsLoading && linkedNegotiations.every((n) => n.status !== "em_andamento");
  const hasChanges = draftFunnel !== storedFunnel || draftStage !== storedStage;
  const canSave =
    !readOnly &&
    !isSaving &&
    (hasChanges || noOpenNegotiation) &&
    draftFunnelOk &&
    draftStageOk;

  const selectedStage = draftCurrentFunnel?.stages.find((s) => s.id === draftStage) ?? null;
  const selectedStageRequiresTask = Boolean(
    selectedStage?.requiredFields?.includes("next_task_at"),
  );

  const persist = async (
    funnelId: string,
    stageId: string,
    task?: { title: string; dueAt: string; notes: string; templateId: string | null },
  ) => {
    if (readOnly) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return false;
    }
    try {
      const openNegotiations = linkedNegotiations.filter((n) => n.status === "em_andamento");

      if (openNegotiations.length === 0) {
        // Sem negociação ativa: cria uma para refletir no Kanban e habilitar Arquivos.
        const created = await createNegotiation.mutateAsync({
          title: customer.nome?.trim() || "Nova negociação",
          funnelId,
          stageId,
          customerId: customer.id,
          nextTaskAt: task?.dueAt ?? null,
        });
        if (task) {
          await createCrmTask.mutateAsync({
            title: task.title,
            negotiationId: created.id,
            customerId: customer.id,
            assigneeId: created.assigneeId ?? null,
            dueAt: task.dueAt,
            notes: task.notes,
            templateId: task.templateId,
          });
        }
        await updateCustomer.mutateAsync({
          id: customer.id,
          input: {
            ...toCustomerUpsertInput(customer),
            sourceColumns: {
              ...customer.sourceColumns,
              [CRM_FUNNEL_ID_KEY]: funnelId,
              [CRM_PIPELINE_STAGE_KEY]: stageId,
            },
          },
        });
        toast({
          title: "Negociação criada",
          description: "Lead adicionado ao CRM no funil e etapa selecionados.",
        });
        return true;
      }

      const targets = openNegotiations.filter(
        (n) => n.funnelId !== funnelId || n.stageId !== stageId,
      );
      if (targets.length > 0) {
        for (const n of targets) {
          if (task) {
            await createCrmTask.mutateAsync({
              title: task.title,
              negotiationId: n.id,
              customerId: customer.id,
              assigneeId: n.assigneeId ?? null,
              dueAt: task.dueAt,
              notes: task.notes,
              templateId: task.templateId,
            });
          }
          await updateNegotiation.mutateAsync({
            id: n.id,
            patch: { funnelId, stageId },
          });
        }
      }

      await updateCustomer.mutateAsync({
        id: customer.id,
        input: {
          ...toCustomerUpsertInput(customer),
          sourceColumns: {
            ...customer.sourceColumns,
            [CRM_FUNNEL_ID_KEY]: funnelId,
            [CRM_PIPELINE_STAGE_KEY]: stageId,
          },
        },
      });

      toast({
        title: "Funil atualizado",
        description: "As mudanças foram salvas no cadastro e no CRM.",
      });
      return true;
    } catch (e) {
      toast({
        title: "Erro ao salvar funil",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    if (selectedStageRequiresTask) {
      const stageTemplateId = selectedStage?.taskTemplateId?.trim() ?? "";
      const tpl = stageTemplateId ? taskTemplates.find((t) => t.id === stageTemplateId) : undefined;
      if (tpl) {
        setTaskTemplateId(tpl.id);
        setTaskTitle(tpl.title);
        setTaskNotes(tpl.notes ?? "");
        if (tpl.defaultDueDays != null) {
          const due = new Date();
          due.setDate(due.getDate() + tpl.defaultDueDays);
          setTaskDueLocal(toDateTimeLocalValue(due));
        }
      }
      setTaskDialogOpen(true);
      return;
    }
    void persist(draftFunnel, draftStage);
  };

  const handleReset = () => {
    setDraftFunnel(storedFunnel);
    setDraftStage(storedStage);
  };

  const funnelSelectValue = draftFunnelOk ? draftFunnel : FUNNEL_NONE;
  const stageSelectValue = draftStageOk ? draftStage : FUNNEL_NONE;

  return (
    <>
      <div
        className={
          className ??
          "rounded-[20px] border border-[#e1e8dc] bg-white/90 p-4 shadow-sm"
        }
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#96a29c]">
          CRM · Funil e etapa
        </p>
        <p className="mt-1 text-xs text-[#6f7b76]">
          Refletem no Kanban e negociações vinculadas a este cadastro.
        </p>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="customer-crm-funnel" className="text-xs text-[#5f6d66]">
              Pipeline
            </Label>
            <Select
              value={funnelSelectValue}
              disabled={readOnly || isSaving}
              onValueChange={(fid) => {
                if (fid === FUNNEL_NONE) return;
                const f = funnels.find((x) => x.id === fid);
                const first = f?.stages[0]?.id ?? "";
                setDraftFunnel(fid);
                setDraftStage(first);
              }}
            >
              <SelectTrigger
                id="customer-crm-funnel"
                className="rounded-xl border-[#dfe6d8] bg-white"
              >
                <SelectValue placeholder="Selecionar funil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FUNNEL_NONE} disabled className="text-muted-foreground">
                  Selecionar funil…
                </SelectItem>
                {funnels.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.listName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="customer-crm-stage" className="text-xs text-[#5f6d66]">
              Etapa
            </Label>
            <Select
              value={stageSelectValue}
              disabled={readOnly || isSaving || !draftFunnelOk || stages.length === 0}
              onValueChange={(sid) => {
                if (sid === FUNNEL_NONE || !draftFunnelOk) return;
                setDraftStage(sid);
              }}
            >
              <SelectTrigger
                id="customer-crm-stage"
                className="rounded-xl border-[#dfe6d8] bg-white"
              >
                <SelectValue placeholder="Selecionar etapa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FUNNEL_NONE} disabled className="text-muted-foreground">
                  Selecionar etapa…
                </SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!readOnly ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            {hasChanges ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isSaving}
                className="rounded-full"
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-full"
            >
              {isSaving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar tarefa da etapa</DialogTitle>
            <DialogDescription>
              Esta etapa exige uma próxima tarefa. Crie uma tarefa personalizada ou selecione uma tarefa pronta antes de salvar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {taskTemplates.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="customer-crm-task-template">Tarefa pronta</Label>
                <Select
                  value={taskTemplateId.trim() ? taskTemplateId : TASK_TEMPLATE_NONE}
                  onValueChange={(value) => {
                    if (value === TASK_TEMPLATE_NONE) {
                      setTaskTemplateId("");
                      return;
                    }
                    const tpl = taskTemplates.find((t) => t.id === value);
                    if (!tpl) return;
                    setTaskTemplateId(tpl.id);
                    setTaskTitle(tpl.title);
                    setTaskNotes(tpl.notes ?? "");
                    if (tpl.defaultDueDays != null) {
                      const due = new Date();
                      due.setDate(due.getDate() + tpl.defaultDueDays);
                      setTaskDueLocal(toDateTimeLocalValue(due));
                    }
                  }}
                >
                  <SelectTrigger id="customer-crm-task-template">
                    <SelectValue placeholder="Selecionar tarefa pronta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TASK_TEMPLATE_NONE}>Personalizada</SelectItem>
                    {taskTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="customer-crm-task-title">Título</Label>
              <Input
                id="customer-crm-task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex.: Ligar para concluir o atendimento"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-crm-task-due">Data para concluir</Label>
              <Input
                id="customer-crm-task-due"
                type="datetime-local"
                value={taskDueLocal}
                onChange={(e) => setTaskDueLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-crm-task-notes">Observações</Label>
              <Textarea
                id="customer-crm-task-notes"
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                rows={3}
                placeholder="Detalhes para o responsável pela tarefa"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isSaving}
              onClick={() => {
                void (async () => {
                  const title = taskTitle.trim();
                  if (!title) {
                    toast({
                      title: "Título obrigatório",
                      description: "Informe um título para a tarefa.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!taskDueLocal) {
                    toast({
                      title: "Data obrigatória",
                      description: "Informe a data para concluir a tarefa.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const due = new Date(taskDueLocal);
                  if (Number.isNaN(due.getTime())) {
                    toast({
                      title: "Data inválida",
                      description: "Revise a data para concluir a tarefa.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const saved = await persist(draftFunnel, draftStage, {
                    title,
                    dueAt: due.toISOString(),
                    notes: taskNotes.trim(),
                    templateId: taskTemplateId.trim() || null,
                  });
                  if (saved) {
                    setTaskDialogOpen(false);
                  }
                })();
              }}
            >
              {isSaving ? "Salvando…" : "Criar tarefa e salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
