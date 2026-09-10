import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CrmNegotiationRecord } from "@/types/domain";

type DealChoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  negotiations: CrmNegotiationRecord[];
  onLinkExisting: (negotiationId: string) => void;
  onCreateNew: () => void;
  pending?: boolean;
};

export function DealChoiceDialog({
  open,
  onOpenChange,
  negotiations,
  onLinkExisting,
  onCreateNew,
  pending,
}: DealChoiceDialogProps) {
  const active = negotiations.filter((n) => n.status === "em_andamento");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Oportunidade no CRM</DialogTitle>
          <DialogDescription>
            Este cliente já tem negócios em andamento. Vincule a um existente ou abra uma nova oportunidade.
          </DialogDescription>
        </DialogHeader>
        {active.length > 0 ? (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {active.map((neg) => (
              <li key={neg.id}>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start py-2 text-left"
                  disabled={pending}
                  onClick={() => onLinkExisting(neg.id)}
                >
                  <span className="block font-medium">{neg.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {neg.funnelId} · {neg.stageId}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" disabled={pending} onClick={onCreateNew}>
            Nova oportunidade
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
