import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

const PRESET_REASONS = [
  "Preço alto",
  "Comprou com concorrente",
  "Sem interesse",
  "Sem resposta",
  "Fora da rota / região",
  "Não é aposentado / INSS",
  "Sem margem / sem condições",
  "Desistiu / desistência",
  "Atendimento ruim",
  "Lead duplicado",
  "Dados incorretos",
  "Não atende / telefone inválido",
  "Optou por outro produto",
  "Prazo / timing",
  "Sem documentação",
];

type MarkLostDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  onConfirm: (reason: string) => void | Promise<void>;
  pending?: boolean;
};

export function MarkLostDialog({
  open,
  onOpenChange,
  title = "Marcar como perdido",
  onConfirm,
  pending,
}: MarkLostDialogProps) {
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    void Promise.resolve(onConfirm(trimmed))
      .then(() => {
        setReason("");
        onOpenChange(false);
      })
      .catch(() => {
        /* Mantém o diálogo aberto quando onConfirm falha. */
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            O motivo da perda é obrigatório para relatórios e melhoria do funil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setReason(preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Motivo</Label>
            <Textarea
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva por que o negócio foi perdido"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="crm-mark-loss-confirm"
            disabled={!reason.trim() || pending}
            onClick={handleConfirm}
          >
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
