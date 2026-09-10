import { useEffect, useMemo, useState } from "react";
import { addDays, addHours, format, setHours, setMinutes, startOfTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Textarea } from "@/components/ui/textarea";
import { useCreateCrmTask } from "@/lib/api/crm-tasks";
import { useToast } from "@/hooks/use-toast";
import type { InboxChat } from "@/types/domain";

export type FollowUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chat: InboxChat | null;
  /** ID do operador logado — vira `assigneeId` da tarefa criada. */
  profileId?: string | null;
};

/** Converte uma Date pro formato exigido pelo <input type="datetime-local"> (sem fuso). */
function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Cria um follow-up (uma `crm_tasks` com `due_at` e nota) vinculado ao
 * customer ou à negociação primária do chat. O sistema de CRM já lista
 * essas tarefas no Kanban e no perfil do cliente — esse dialog é só o
 * atalho do Inbox pra criar uma rápido sem sair da conversa.
 */
export function FollowUpDialog({
  open,
  onOpenChange,
  chat,
  profileId,
}: FollowUpDialogProps) {
  const { toast } = useToast();
  const createTask = useCreateCrmTask({
    onSuccess: () => {
      toast({
        title: "Lembrete agendado",
        description: "Você verá esta tarefa no CRM e no perfil do cliente.",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Não foi possível agendar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const [whenLocal, setWhenLocal] = useState(() =>
    toDatetimeLocalValue(addDays(setHours(setMinutes(new Date(), 0), 9), 1)),
  );
  const [title, setTitle] = useState("Retomar contato");
  const [notes, setNotes] = useState("");

  // Reset ao reabrir (defaults relativos a "agora" também precisam atualizar).
  useEffect(() => {
    if (open) {
      setWhenLocal(toDatetimeLocalValue(addDays(setHours(setMinutes(new Date(), 0), 9), 1)));
      setTitle("Retomar contato");
      setNotes("");
    }
  }, [open]);

  const presets = useMemo(() => {
    // Recalcula a cada abertura para que "Em 3 horas" reflita o agora real.
    const now = new Date();
    const tomorrow9 = setMinutes(setHours(startOfTomorrow(), 9), 0);
    return [
      { label: "Em 3 horas", date: addHours(now, 3) },
      { label: "Amanhã 9h", date: tomorrow9 },
      { label: "Em 3 dias", date: addDays(tomorrow9, 2) },
      { label: "Em 1 semana", date: addDays(now, 7) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Só dá pra criar se houver vínculo (constraint de crm_tasks).
  const negotiationId = chat?.primaryNegotiationId ?? null;
  const customerId = chat?.customerId ?? null;
  const canCreate = Boolean(negotiationId || customerId);

  function handleSubmit() {
    if (!chat) return;
    const dueDate = new Date(whenLocal);
    if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
      toast({
        title: "Horário inválido",
        description: "Escolha um horário no futuro.",
        variant: "destructive",
      });
      return;
    }
    if (!canCreate) {
      toast({
        title: "Sem vínculo com CRM",
        description: "Vincule um cliente ou crie um lead antes de agendar um lembrete.",
        variant: "destructive",
      });
      return;
    }
    createTask.mutate({
      title: title.trim() || "Retomar contato",
      dueAt: dueDate.toISOString(),
      notes: notes.trim(),
      assigneeId: profileId ?? null,
      negotiationId,
      customerId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Lembrete de follow-up</DialogTitle>
          <DialogDescription>
            Agenda uma tarefa no CRM com prazo. Aparece pra você no perfil do cliente e no Kanban.
          </DialogDescription>
        </DialogHeader>

        {!canCreate ? (
          <p className="rounded-md border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-3 py-2 text-sm text-[var(--crm-amber-ink)]">
            Vincule um cliente ou crie um lead nesta conversa antes de agendar um lembrete.
          </p>
        ) : null}

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant="outline"
                disabled={createTask.isPending || !canCreate}
                onClick={() => setWhenLocal(toDatetimeLocalValue(preset.date))}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-when">Quando me lembrar</Label>
            <Input
              id="followup-when"
              type="datetime-local"
              value={whenLocal}
              onChange={(e) => setWhenLocal(e.target.value)}
              disabled={createTask.isPending}
            />
            {whenLocal ? (
              <p className="text-xs text-muted-foreground">
                Em{" "}
                {format(new Date(whenLocal), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-title">Título</Label>
            <Input
              id="followup-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ligar pra confirmar interesse"
              maxLength={120}
              disabled={createTask.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="followup-notes">Nota (opcional)</Label>
            <Textarea
              id="followup-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="O que combinamos, o que checar, links, etc."
              rows={3}
              maxLength={1000}
              disabled={createTask.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createTask.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createTask.isPending || !canCreate}
          >
            {createTask.isPending ? "Agendando…" : "Agendar lembrete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
