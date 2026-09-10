import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WhatsappInstance } from "@/types/domain";

const STATUS_LABEL: Record<WhatsappInstance["status"], string> = {
  connected: "Conectada",
  connecting: "Conectando",
  disconnected: "Desconectada",
  error: "Erro",
};

const STATUS_CLASS: Record<WhatsappInstance["status"], string> = {
  connected: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  connecting: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  disconnected: "bg-zinc-500/15 text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="break-words text-sm text-foreground">{value}</span>
    </div>
  );
}

export function InstanceDetailsDialog({
  instance,
  open,
  onOpenChange,
}: {
  instance: WhatsappInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {instance?.displayName ?? "Instância"}
            {instance ? (
              <Badge className={STATUS_CLASS[instance.status]}>{STATUS_LABEL[instance.status]}</Badge>
            ) : null}
            {instance?.isDefault ? <Badge className="bg-accent text-accent-foreground">Padrão</Badge> : null}
          </DialogTitle>
          <DialogDescription>Dados de conexão da instância.</DialogDescription>
        </DialogHeader>

        {instance ? (
          <div className="py-1">
            <Row label="Instância" value={instance.uazapiInstanceName} />
            <Row label="Número" value={instance.phoneNumber ?? "aguardando leitura"} />
            <Row label="Base URL" value={instance.uazapiBaseUrl} />
            <Row label="Última sync" value={instance.lastSyncAt ?? "nunca"} />
            {instance.lastError ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{instance.lastError}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
