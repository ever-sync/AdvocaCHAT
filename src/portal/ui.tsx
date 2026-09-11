import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
export function PortalField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function PortalNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-lg border p-4 text-sm ${error ? "border-destructive/40 text-destructive" : "bg-muted/40 text-muted-foreground"}`}
    >
      {children}
    </p>
  );
}
