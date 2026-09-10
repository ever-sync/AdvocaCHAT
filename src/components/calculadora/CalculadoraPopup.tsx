import { Calculator } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalculadoraContent } from "./CalculadoraContent";
import { cn } from "@/lib/utils";

type CalculadoraPopupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CalculadoraPopup({ open, onOpenChange }: CalculadoraPopupProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "left-auto top-auto max-h-[min(85dvh,640px)] w-[min(calc(100vw-1.5rem),22rem)] max-w-none translate-x-0 translate-y-0 gap-0 p-0",
          "right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:right-4 md:bottom-20 md:right-5",
          "data-[state=closed]:slide-out-to-bottom-2 data-[state=closed]:slide-out-to-right-2",
          "data-[state=open]:slide-in-from-bottom-2 data-[state=open]:slide-in-from-right-2",
          "data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100",
        )}
        overlayClassName="bg-black/30"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 pr-12 text-left">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calculator className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">Calculadora</DialogTitle>
              <DialogDescription className="text-xs">
                Retroativo e honorários do lead
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto overscroll-contain px-4 py-3">
          <CalculadoraContent compact />
        </div>
      </DialogContent>
    </Dialog>
  );
}
