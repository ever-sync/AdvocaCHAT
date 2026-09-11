import { useId, type ReactNode } from "react";
import { AlertCircle, FolderOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { legalErrorMessage } from "./legal-ui";

export function LegalField({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) {
  const id = useId();
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children(id)}{hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}

export function LegalEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-lg border border-dashed bg-card px-5 py-10 text-center"><FolderOpen className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden /><p className="font-medium">{title}</p>{children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}</div>;
}

export function LegalError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden /><p className="min-w-0 flex-1 break-words">{legalErrorMessage(error)}</p>{retry ? <Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button> : null}</div>;
}

export function LegalLoading() {
  return <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Carregando…</div>;
}

