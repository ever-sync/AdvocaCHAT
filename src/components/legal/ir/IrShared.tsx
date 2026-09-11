import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function IrAccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
export function IrDialog({
  title,
  description,
  children,
  onClose,
  pending,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  pending?: boolean;
  wide?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        className={`max-h-[90dvh] overflow-y-auto ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function IrSelection({
  label,
  values,
  selected,
  onChange,
  disabled,
  empty = "Nenhum item disponível",
}: {
  label: string;
  values: { id: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  empty?: string;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {values.length ? (
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {values.map((value) => (
            <label className="flex items-start gap-2 text-sm" key={value.id}>
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                checked={selected.includes(value.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, value.id]
                      : selected.filter((id) => id !== value.id),
                  )
                }
              />
              <span className="min-w-0 break-words">{value.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </fieldset>
  );
}
