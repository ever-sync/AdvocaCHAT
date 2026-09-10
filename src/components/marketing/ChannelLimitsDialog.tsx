// Diálogo de limites de envio por canal (Fase 5).
// Configura marketing_flow_channel_limits por tenant: máx/hora e respeitar
// horário comercial. Vazio = sem limite.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  FLOW_CHANNELS,
  FLOW_CHANNEL_LABELS,
  useChannelLimits,
  useUpsertChannelLimit,
  type ChannelLimit,
  type FlowChannel,
} from "@/lib/api/marketing-flow-channel-limits";

export function ChannelLimitsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useChannelLimits();
  const upsert = useUpsertChannelLimit();
  const [draft, setDraft] = useState<Record<FlowChannel, ChannelLimit> | null>(null);

  useEffect(() => {
    if (open && data) setDraft(data);
  }, [open, data]);

  const setChannel = (channel: FlowChannel, patch: Partial<ChannelLimit>) => {
    setDraft((prev) => (prev ? { ...prev, [channel]: { ...prev[channel], ...patch } } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    try {
      for (const channel of FLOW_CHANNELS) {
        await upsert.mutateAsync(draft[channel]);
      }
      toast({ title: "Limites salvos" });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Erro ao salvar limites",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Limites de envio por canal</DialogTitle>
          <DialogDescription>
            Protege seus leads de excesso de mensagens. Em branco = sem limite. Aplica-se a todos os
            fluxos deste workspace.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !draft ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Carregando…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {FLOW_CHANNELS.map((channel) => {
              const limit = draft[channel];
              return (
                <div
                  key={channel}
                  className="flex flex-col gap-3 rounded-lg border border-border p-3"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {FLOW_CHANNEL_LABELS[channel]}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
                      Máximo por hora
                      <Input
                        type="number"
                        min={0}
                        value={limit.maxPerHour ?? ""}
                        placeholder="Sem limite"
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setChannel(channel, {
                            maxPerHour: v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)),
                          });
                        }}
                        className="h-9"
                      />
                    </label>
                    <label className="flex items-center gap-2 pt-4 text-xs text-muted-foreground">
                      <Switch
                        checked={limit.enforceBusinessHours}
                        onCheckedChange={(checked) =>
                          setChannel(channel, { enforceBusinessHours: checked })
                        }
                      />
                      Só em horário comercial
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={upsert.isPending || !draft}>
            {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Salvar limites
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
