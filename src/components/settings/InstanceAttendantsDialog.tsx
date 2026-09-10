import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAtendimentoUsers,
  useInstanceAttendantIds,
  useSetInstanceAttendants,
} from "@/lib/api/instance-attendants";
import { useToast } from "@/hooks/use-toast";

type InstanceAttendantsDialogProps = {
  instance: { id: string; displayName: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
};

export function InstanceAttendantsDialog({
  instance,
  open,
  onOpenChange,
  canEdit,
}: InstanceAttendantsDialogProps) {
  const { toast } = useToast();
  const instanceId = instance?.id ?? null;
  const usersQ = useAtendimentoUsers({ enabled: open });
  const currentQ = useInstanceAttendantIds(instanceId, { enabled: open });
  const save = useSetInstanceAttendants();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Quando abre (ou os dados chegam), inicializa a seleção com os atuais.
  useEffect(() => {
    if (open && currentQ.data) {
      setSelected(new Set(currentQ.data));
    }
  }, [open, currentQ.data]);

  const users = useMemo(() => usersQ.data ?? [], [usersQ.data]);
  const loading = usersQ.isLoading || currentQ.isLoading;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    if (!instanceId) return;
    if (!canEdit) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel não tem permissão para configurar atendentes.",
        variant: "destructive",
      });
      return;
    }
    void save
      .mutateAsync({ instanceId, profileIds: Array.from(selected) })
      .then(() => {
        toast({ title: "Atendentes salvos" });
        onOpenChange(false);
      })
      .catch((e: Error) => {
        toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Atendentes da instância
          </DialogTitle>
          <DialogDescription>
            {instance ? <>Quem atende <strong>{instance.displayName}</strong>. </> : null}
            Com mais de um, os chats são distribuídos em rodízio (round-robin) entre eles. Sem
            nenhum, os chats ficam no pool até alguém assumir.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto py-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando atendentes…</p>
          ) : users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
              Nenhum atendente cadastrado. Crie usuários com papel “atendimento” na aba
              Colaboradores.
            </div>
          ) : (
            users.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 hover:bg-secondary/60"
              >
                <Checkbox
                  checked={selected.has(u.id)}
                  onCheckedChange={() => toggle(u.id)}
                  disabled={!canEdit}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.nome || u.email}</span>
                  {u.nome ? <span className="block truncate text-xs text-muted-foreground">{u.email}</span> : null}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="rounded-xl" disabled={!canEdit || save.isPending || loading} onClick={handleSave}>
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
