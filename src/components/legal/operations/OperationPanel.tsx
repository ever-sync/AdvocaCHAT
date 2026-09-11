import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
import { LegalEmpty, LegalError, LegalLoading } from "../LegalShared";

export function OperationPanel({ title, description, children, actions }: { title: string; description: string; children: ReactNode; actions?: ReactNode }) {
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 space-y-1.5"><CardTitle className="text-lg">{title}</CardTitle><CardDescription>{description}</CardDescription></div>{actions}</div></CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>;
}

export function OperationRecords({ pending, error, retry, empty, count, children }: { pending: boolean; error: unknown; retry: () => void; empty: string; count: number; children: ReactNode }) {
  if (pending) return <LegalLoading />;
  if (error) return <LegalError error={error} retry={retry} />;
  if (!count) return <LegalEmpty title={empty} />;
  return <div className="space-y-3">{children}</div>;
}

export function ProviderNotConfigured({ provider, children }: { provider: string; children: ReactNode }) {
  return <div className="space-y-2 rounded-lg border bg-muted/30 p-4 text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{provider}</p><Badge variant="secondary">Não configurado</Badge></div><p className="text-muted-foreground">{children}</p></div>;
}

export function OperationReasonDialog({ open, onClose, title, description, onSave, pending, actionLabel = "Salvar decisão", destructive = false }: { open: boolean; onClose: () => void; title: string; description: string; onSave: (reason: string) => Promise<boolean>; pending: boolean; actionLabel?: string; destructive?: boolean }) {
  const [reason, setReason] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); if (await onSave(reason.trim())) { setReason(""); onClose(); } }
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !pending) { setReason(""); onClose(); } }}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><form onSubmit={(event) => void submit(event)} className="space-y-4"><LegalField label="Justificativa da decisão">{(id) => <Textarea id={id} required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />}</LegalField><DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || reason.trim().length < 3}>{actionLabel}</Button></DialogFooter></form></DialogContent></Dialog>;
}
