import { useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateCrmTaskTemplate,
  useCrmTaskTemplates,
  useCrmTaskTemplatesRealtime,
  useDeleteCrmTaskTemplate,
  useUpdateCrmTaskTemplate,
} from "@/lib/api/crm-task-templates";
import { useToast } from "@/hooks/use-toast";
import type { CrmTaskTemplate } from "@/types/domain";

type ChatTaskTemplatesSettingsSectionProps = {
  canEdit: boolean;
  canDelete: boolean;
};

export function ChatTaskTemplatesSettingsSection({
  canEdit,
  canDelete,
}: ChatTaskTemplatesSettingsSectionProps) {
  const { toast } = useToast();
  useCrmTaskTemplatesRealtime();
  const { data: templates = [], isLoading } = useCrmTaskTemplates();
  const createTemplate = useCreateCrmTaskTemplate();
  const updateTemplate = useUpdateCrmTaskTemplate();
  const deleteTemplate = useDeleteCrmTaskTemplate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDays, setDueDays] = useState("");

  const openCreate = () => {
    setEditingId(null);
    setTitle("");
    setNotes("");
    setDueDays("");
    setDialogOpen(true);
  };

  const openEdit = (tpl: CrmTaskTemplate) => {
    setEditingId(tpl.id);
    setTitle(tpl.title);
    setNotes(tpl.notes);
    setDueDays(tpl.defaultDueDays != null ? String(tpl.defaultDueDays) : "");
    setDialogOpen(true);
  };

  const save = () => {
    const trimmed = title.trim();
    if (trimmed.length < 2) {
      toast({
        title: "Título inválido",
        description: "Use pelo menos 2 caracteres para o modelo.",
        variant: "destructive",
      });
      return;
    }
    const parsedDue = dueDays.trim() ? Number(dueDays) : null;
    const defaultDueDays =
      parsedDue != null && Number.isFinite(parsedDue) && parsedDue > 0 ? Math.trunc(parsedDue) : null;

    const promise = editingId
      ? updateTemplate.mutateAsync({ id: editingId, title: trimmed, notes, defaultDueDays })
      : createTemplate.mutateAsync({ title: trimmed, notes, defaultDueDays });

    void promise
      .then(() => {
        toast({ title: editingId ? "Modelo atualizado" : "Modelo criado" });
        setDialogOpen(false);
      })
      .catch((e: Error) => {
        toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tarefas</CardTitle>
              <CardDescription>
                Tarefas prontas (modelos) para o atendente aplicar no CRM em um clique. O prazo padrão é
                somado à data de criação. O uso aparece nos Relatórios.
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel não tem permissão para criar modelos de tarefa.",
                    variant: "destructive",
                  });
                  return;
                }
                openCreate();
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova tarefa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando modelos…</p>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nenhuma tarefa pronta cadastrada. Clique em &quot;Nova tarefa&quot; para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{tpl.title}</span>
                      {tpl.defaultDueDays != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <CalendarClock className="h-3 w-3" />
                          vence em {tpl.defaultDueDays} {tpl.defaultDueDays === 1 ? "dia" : "dias"}
                        </span>
                      ) : null}
                    </div>
                    {tpl.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tpl.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg"
                      disabled={!canEdit}
                      onClick={() => {
                        if (!canEdit) {
                          toast({
                            title: "Ação indisponível",
                            description: "Seu papel não tem permissão para editar modelos de tarefa.",
                            variant: "destructive",
                          });
                          return;
                        }
                        openEdit(tpl);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                      disabled={deleteTemplate.isPending || !canDelete}
                      onClick={() => {
                        if (!canDelete) {
                          toast({
                            title: "Ação indisponível",
                            description: "Seu papel não tem permissão para excluir modelos de tarefa.",
                            variant: "destructive",
                          });
                          return;
                        }
                        void deleteTemplate
                          .mutateAsync(tpl.id)
                          .then(() => {
                            toast({ title: "Modelo removido" });
                          })
                          .catch((e: Error) => {
                            toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
                          });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen && canEdit}
        onOpenChange={(open) => {
          if (!canEdit) {
            setDialogOpen(false);
            return;
          }
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar tarefa pronta" : "Nova tarefa pronta"}</DialogTitle>
            <DialogDescription>
              O modelo pré-preenche título, observações e prazo ao criar uma tarefa no CRM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-template-title">Título *</Label>
              <Input
                id="task-template-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Ligar para confirmar proposta"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-template-due">Prazo padrão (dias)</Label>
              <Input
                id="task-template-due"
                type="number"
                min={1}
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                placeholder="Ex.: 2 (vence em 2 dias). Deixe vazio para sem prazo."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-template-notes">Observações</Label>
              <Textarea
                id="task-template-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="Roteiro ou detalhes que aparecem na tarefa."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              disabled={
                !canEdit ||
                title.trim().length < 2 ||
                createTemplate.isPending ||
                updateTemplate.isPending
              }
              onClick={save}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
