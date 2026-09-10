import { useMemo, useState } from "react";
import { addHours, format, setHours, setMinutes, startOfTomorrow } from "date-fns";
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

type SnoozeChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (until: Date) => void | Promise<void>;
  pending?: boolean;
};

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SnoozeChatDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: SnoozeChatDialogProps) {
  const defaultCustom = useMemo(() => toDatetimeLocalValue(addHours(new Date(), 1)), [open]);
  const [customLocal, setCustomLocal] = useState(defaultCustom);

  const presets = useMemo(() => {
    const now = new Date();
    const tomorrow9 = setMinutes(setHours(startOfTomorrow(), 9), 0);
    return [
      { label: "1 hora", until: addHours(now, 1) },
      { label: "3 horas", until: addHours(now, 3) },
      { label: "Amanhã 9h", until: tomorrow9 },
    ];
  }, [open]);

  const apply = (until: Date) => {
    void Promise.resolve(onConfirm(until)).then(() => onOpenChange(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setCustomLocal(defaultCustom);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adiar conversa</DialogTitle>
          <DialogDescription>
            A conversa sai da fila ativa até o horário escolhido e volta ao receber mensagem do cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => apply(preset.until)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snooze-until">Horário personalizado</Label>
            <Input
              id="snooze-until"
              type="datetime-local"
              value={customLocal}
              onChange={(e) => setCustomLocal(e.target.value)}
            />
            {customLocal ? (
              <p className="text-xs text-muted-foreground">
                Até{" "}
                {format(new Date(customLocal), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={pending || !customLocal}
            onClick={() => {
              const until = new Date(customLocal);
              if (Number.isNaN(until.getTime()) || until <= new Date()) return;
              apply(until);
            }}
          >
            Adiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
