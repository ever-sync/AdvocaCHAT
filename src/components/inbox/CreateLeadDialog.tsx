import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_CRM_FUNNELS } from "@/data/crm-funnels";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { useEnsureLeadFromChat, useLinkChatNegotiation } from "@/lib/api/crm-lead";
import { useCrmNegotiationsForCustomer, useUpdateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { chatAssigneeBlockedMessage } from "@/lib/crm/negotiation-assignee";
import { useToast } from "@/hooks/use-toast";
import type { InboxChat } from "@/types/domain";

type CreateLeadDialogProps = {
  chat: InboxChat;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEditCrm: boolean;
  canActOnChat: boolean;
};

export function CreateLeadDialog({
  chat,
  open,
  onOpenChange,
  canEditCrm,
  canActOnChat,
}: CreateLeadDialogProps) {
  const { toast } = useToast();
  const { data: funnels = DEFAULT_CRM_FUNNELS } = useEffectiveCrmFunnels();
  const { data: customerNegotiations = [] } = useCrmNegotiationsForCustomer(
    chat.customerId ?? undefined,
    { enabled: open && Boolean(chat.customerId) },
  );
  const ensureLead = useEnsureLeadFromChat();
  const linkNegotiation = useLinkChatNegotiation();
  const updateNegotiation = useUpdateCrmNegotiation();

  const [funnelId, setFunnelId] = useState("");
  const [stageId, setStageId] = useState("");

  const selectedFunnel = useMemo(
    () => funnels.find((f) => f.id === funnelId) ?? funnels[0],
    [funnels, funnelId],
  );

  useEffect(() => {
    if (open && funnels.length > 0) {
      const first = funnels[0];
      setFunnelId(first.id);
      setStageId(first.stages[0]?.id ?? "");
    }
  }, [open, funnels]);

  const handleFunnelChange = (id: string) => {
    setFunnelId(id);
    const f = funnels.find((x) => x.id === id);
    setStageId(f?.stages[0]?.id ?? "");
  };

  const activeDeals = useMemo(
    () => customerNegotiations.filter((n) => n.status === "em_andamento"),
    [customerNegotiations],
  );

  const pending = ensureLead.isPending || linkNegotiation.isPending || updateNegotiation.isPending;

  const blocked = () => {
    if (!canEditCrm) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para criar ou vincular lead no CRM.",
        variant: "destructive",
      });
      return true;
    }
    if (!canActOnChat) {
      toast({ title: "Assuma a conversa", description: chatAssigneeBlockedMessage(), variant: "destructive" });
      return true;
    }
    return false;
  };

  const handleCreate = () => {
    if (blocked()) return;
    if (!funnelId || !stageId) {
      toast({ title: "Selecione funil e etapa", variant: "destructive" });
      return;
    }
    void (async () => {
      try {
        const negId = await ensureLead.mutateAsync({ chatId: chat.id, forceNew: true });
        if (negId) {
          await updateNegotiation.mutateAsync({ id: negId, patch: { funnelId, stageId } });
        }
        toast({ title: "Lead no CRM", description: "Lead criado e vinculado ao CRM." });
        onOpenChange(false);
      } catch (e) {
        toast({
          title: "Erro ao criar lead no CRM",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    })();
  };

  const handleLink = (negotiationId: string) => {
    if (blocked()) return;
    void linkNegotiation
      .mutateAsync({ chatId: chat.id, negotiationId })
      .then(() => {
        toast({ title: "Lead no CRM", description: "Negociação existente vinculada à conversa." });
        onOpenChange(false);
      })
      .catch((e: Error) => {
        toast({ title: "Erro ao vincular", description: e.message, variant: "destructive" });
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Criar lead no CRM</DialogTitle>
          <DialogDescription>Escolha o funil e a etapa onde o lead vai entrar.</DialogDescription>
        </DialogHeader>

        {activeDeals.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Este cliente já tem negócios em andamento — vincule a um existente:
            </p>
            {activeDeals.map((n) => (
              <div key={n.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm">{n.title}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-lg"
                  disabled={pending}
                  onClick={() => handleLink(n.id)}
                >
                  Vincular
                </Button>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">ou crie um novo abaixo:</p>
          </div>
        ) : null}

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="lead-funnel">Funil</Label>
            <Select value={funnelId} onValueChange={handleFunnelChange}>
              <SelectTrigger id="lead-funnel">
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
          <div className="space-y-1.5">
            <Label htmlFor="lead-stage">Etapa</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger id="lead-stage">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {(selectedFunnel?.stages ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={pending || !funnelId || !stageId} onClick={handleCreate}>
            Criar lead
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
