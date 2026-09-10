import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { cn } from "@/lib/utils";
import type { CrmFunnel } from "@/data/crm-funnels";

export type FunnelDeleteResult =
  | { transfer: false }
  | { transfer: true; mode: "single"; toFunnelId: string; toStageId: string }
  | {
      transfer: true;
      mode: "per-stage";
      toFunnelId: string;
      mappings: Array<{ fromStageId: string; toStageId: string }>;
    };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnels: CrmFunnel[];
  sourceFunnel: CrmFunnel;
  negotiationCount: number;
  disabled?: boolean;
  onConfirm: (result: FunnelDeleteResult) => void;
};

function ChoiceButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

export function CrmFunnelDeleteDialog({
  open,
  onOpenChange,
  funnels,
  sourceFunnel,
  negotiationCount,
  disabled,
  onConfirm,
}: Props) {
  const targetFunnels = useMemo(
    () => funnels.filter((f) => f.id !== sourceFunnel.id),
    [funnels, sourceFunnel.id],
  );

  const [transfer, setTransfer] = useState(true);
  const [mode, setMode] = useState<"single" | "per-stage">("single");
  const [toFunnelId, setToFunnelId] = useState(targetFunnels[0]?.id ?? "");
  const [toStageId, setToStageId] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});

  const toFunnel = useMemo(
    () => targetFunnels.find((f) => f.id === toFunnelId),
    [targetFunnels, toFunnelId],
  );

  // Reinicia o estado ao abrir.
  useEffect(() => {
    if (!open) return;
    const hasTarget = targetFunnels.length > 0;
    setTransfer(hasTarget);
    setMode("single");
    const f0 = targetFunnels[0];
    setToFunnelId(f0?.id ?? "");
    setToStageId(f0?.stages[0]?.id ?? "");
    setMappings(
      Object.fromEntries(
        sourceFunnel.stages.map((s) => [s.id, f0?.stages[0]?.id ?? ""]),
      ),
    );
  }, [open, targetFunnels, sourceFunnel.stages]);

  // Ao trocar o funil destino, ajusta etapa única e remapeia o "etapa por etapa".
  useEffect(() => {
    if (!toFunnel) return;
    const firstStage = toFunnel.stages[0]?.id ?? "";
    setToStageId((cur) => (toFunnel.stages.some((s) => s.id === cur) ? cur : firstStage));
    setMappings((cur) => {
      const next: Record<string, string> = {};
      for (const s of sourceFunnel.stages) {
        const existing = cur[s.id];
        next[s.id] = toFunnel.stages.some((t) => t.id === existing) ? existing : firstStage;
      }
      return next;
    });
  }, [toFunnel, sourceFunnel.stages]);

  const canConfirm = (() => {
    if (disabled) return false;
    if (!transfer) return true;
    if (targetFunnels.length === 0 || !toFunnel) return false;
    if (mode === "single") return Boolean(toStageId);
    return sourceFunnel.stages.every((s) => Boolean(mappings[s.id]));
  })();

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (!transfer) {
      onConfirm({ transfer: false });
      return;
    }
    if (mode === "single") {
      onConfirm({ transfer: true, mode: "single", toFunnelId, toStageId });
      return;
    }
    onConfirm({
      transfer: true,
      mode: "per-stage",
      toFunnelId,
      mappings: sourceFunnel.stages.map((s) => ({
        fromStageId: s.id,
        toStageId: mappings[s.id],
      })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,640px)] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Excluir funil "{sourceFunnel.listName}"</DialogTitle>
          <DialogDescription>
            {negotiationCount > 0 ? (
              <>
                Este funil tem{" "}
                <strong>
                  {negotiationCount} negociação{negotiationCount === 1 ? "" : "ões"}
                </strong>
                . Escolha o que fazer antes de excluir.
              </>
            ) : (
              "Este funil não tem negociações. Você pode excluí-lo direto."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-2">
            <ChoiceButton
              active={transfer}
              onClick={() => targetFunnels.length > 0 && setTransfer(true)}
              title="Transferir para outro funil"
              description={
                targetFunnels.length === 0
                  ? "Nenhum outro funil disponível para receber."
                  : "Move as negociações para um funil/etapa que você escolher."
              }
            />
            <ChoiceButton
              active={!transfer}
              onClick={() => setTransfer(false)}
              title="Não transferir"
              description="As negociações ficam órfãs (aparecem no banner do CRM para reatribuir) e o funil/etapa é removido do cadastro dos clientes. Nada é apagado."
            />
          </div>

          {transfer && targetFunnels.length > 0 ? (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="space-y-1.5">
                <Label>Funil de destino</Label>
                <Select value={toFunnelId} onValueChange={setToFunnelId} disabled={disabled}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetFunnels.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.listName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <ChoiceButton
                  active={mode === "single"}
                  onClick={() => setMode("single")}
                  title="Tudo em uma etapa"
                  description="Todas as negociações vão para uma única etapa do funil de destino."
                />
                <ChoiceButton
                  active={mode === "per-stage"}
                  onClick={() => setMode("per-stage")}
                  title="Etapa por etapa"
                  description="Cada etapa deste funil vai para uma etapa que você escolher no destino."
                />
              </div>

              {mode === "single" ? (
                <div className="space-y-1.5">
                  <Label>Etapa de destino</Label>
                  <Select value={toStageId} onValueChange={setToStageId} disabled={disabled || !toFunnel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {toFunnel?.stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-3">
                  {sourceFunnel.stages.map((s) => (
                    <div key={s.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <span className="truncate text-xs font-medium text-foreground" title={s.title}>
                        {s.title}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={mappings[s.id] ?? ""}
                        onValueChange={(v) => setMappings((cur) => ({ ...cur, [s.id]: v }))}
                        disabled={disabled || !toFunnel}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Etapa destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {toFunnel?.stages.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={disabled}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={transfer ? "default" : "destructive"}
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            {disabled ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {transfer ? "Transferir e excluir funil" : "Excluir sem transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
