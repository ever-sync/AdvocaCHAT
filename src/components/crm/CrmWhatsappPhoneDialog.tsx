import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CrmWhatsappPhoneOption } from "@/lib/crm/crm-whatsapp-inbox";

type CrmWhatsappPhoneDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadTitle: string;
  options: CrmWhatsappPhoneOption[];
  onSelect: (option: CrmWhatsappPhoneOption) => void;
};

export function CrmWhatsappPhoneDialog({
  open,
  onOpenChange,
  leadTitle,
  options,
  onSelect,
}: CrmWhatsappPhoneDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-2xl border-[var(--crm-border)] bg-card"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--crm-ink)]">
            <MessageCircle className="h-5 w-5 text-[var(--crm-wa-teal)]" aria-hidden />
            Escolha o número
          </DialogTitle>
          <DialogDescription className="text-[var(--crm-ink-2)]">
            {leadTitle.trim()
              ? `Qual número de ${leadTitle.trim()} você quer usar para abrir a conversa?`
              : "Qual número você quer usar para abrir a conversa?"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          {options.map((option) => (
            <Button
              key={option.key}
              type="button"
              variant="outline"
              className="h-auto min-h-11 justify-start gap-3 border-[var(--crm-success-border)] px-3 py-2.5 text-left font-medium text-[var(--crm-ink)] shadow-none hover:bg-[var(--crm-success-tint)]"
              onClick={() => onSelect(option)}
            >
              <Phone className="h-4 w-4 shrink-0 text-[var(--crm-wa-teal)]" aria-hidden />
              <span className="flex min-w-0 flex-col items-start gap-0.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                  {option.label}
                </span>
                <span className="text-sm tabular-nums">{option.display}</span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
