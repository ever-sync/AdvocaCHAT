import {
  Loader2,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
} from "lucide-react";
import { type CallLogScope, useCallLogs, useCallLogsRealtime } from "@/lib/api/call-logs";
import { cn } from "@/lib/utils";
import type { CallLog, CallStatus } from "@/types/domain";

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

function statusMeta(status: CallStatus): { label: string; className: string; Icon: typeof PhoneCall } {
  switch (status) {
    case "completed":
      return { label: "Atendida", className: "text-emerald-600", Icon: PhoneCall };
    case "no_answer":
      return { label: "Não atendida", className: "text-amber-600", Icon: PhoneMissed };
    case "busy":
      return { label: "Ocupado", className: "text-amber-600", Icon: PhoneOff };
    case "failed":
      return { label: "Falhou", className: "text-red-600", Icon: PhoneOff };
    case "canceled":
      return { label: "Cancelada", className: "text-muted-foreground", Icon: PhoneOff };
    default:
      return { label: "Em andamento", className: "text-blue-600", Icon: PhoneIncoming };
  }
}

function CallRow({ call }: { call: CallLog }) {
  const meta = statusMeta(call.status);
  const duration = formatDuration(call.durationSeconds);
  const inProgress = !["completed", "no_answer", "busy", "failed", "canceled"].includes(call.status);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-[var(--crm-surface)] bg-card px-3 py-2">
      <meta.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.className, inProgress && "animate-pulse")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className={cn("text-sm font-medium", meta.className)}>{meta.label}</span>
          {duration ? <span className="text-xs text-[var(--crm-ink-3)]">· {duration}</span> : null}
        </div>
        <p className="text-[11px] text-[var(--crm-ink-3)]">
          {formatDateTime(call.startedAt ?? call.createdAt)}
          {call.toNumber ? ` · ${call.toNumber}` : ""}
        </p>
        {call.recordingUrl ? (
          <a
            href={call.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-primary hover:underline"
          >
            Ouvir gravação
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function CallLogsPanel({
  scope,
  className,
}: {
  scope: CallLogScope;
  className?: string;
}) {
  const { data: calls = [], isLoading } = useCallLogs(scope);
  useCallLogsRealtime(scope);

  return (
    <div
      className={cn(
        "rounded-[20px] border border-[var(--crm-border-2)] bg-card/90 p-4 shadow-sm",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-ink-3)]">Ligações</p>
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-[var(--crm-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : calls.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--crm-ink-3)]">Nenhuma ligação registrada para este lead.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {calls.map((call) => (
            <CallRow key={call.id} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}
