import { AlertTriangle, CalendarCheck2, CalendarX2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NegotiationAlert } from "@/lib/crm/negotiation-alerts";

const ICON_BY_KIND = {
  stale: AlertTriangle,
  no_future_task: CalendarX2,
} as const;

type CrmNegotiationAlertBadgesProps = {
  alerts: NegotiationAlert[];
  className?: string;
  compact?: boolean;
  /** ISO da próxima tarefa aberta. Renderiza um badge neutro quando há tarefa futura e nenhum alerta "no_future_task". */
  nextTaskAt?: string | null;
};

function formatNextTask(iso: string): { label: string; full: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffMin = Math.round(diffMs / 60_000);
  const abs = Math.abs(diffMin);

  let label: string;
  if (abs < 60) {
    label = diffMin >= 0 ? `${abs}min` : `${abs}min atrás`;
  } else if (abs < 60 * 24) {
    const h = Math.round(abs / 60);
    label = diffMin >= 0 ? `${h}h` : `${h}h atrás`;
  } else if (abs < 60 * 24 * 7) {
    const days = Math.round(abs / (60 * 24));
    label = diffMin >= 0 ? `${days}d` : `${days}d atrás`;
  } else {
    label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  const full = d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return { label, full };
}

export function CrmNegotiationAlertBadges({
  alerts,
  className,
  compact = false,
  nextTaskAt,
}: CrmNegotiationAlertBadgesProps) {
  const hasNoFutureTaskAlert = alerts.some((a) => a.kind === "no_future_task");
  const nextTaskMeta =
    !hasNoFutureTaskAlert && nextTaskAt?.trim() ? formatNextTask(nextTaskAt) : null;

  if (alerts.length === 0 && !nextTaskMeta) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {alerts.map((alert) => {
        const Icon = ICON_BY_KIND[alert.kind];
        return (
          <span
            key={alert.kind}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
              alert.severity === "danger"
                ? "border-[var(--crm-danger-border)] bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]"
                : "border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
              compact && "px-1 py-px text-[9px]",
            )}
            title={alert.label}
          >
            <Icon className={cn("shrink-0 opacity-90", compact ? "h-3 w-3" : "h-3.5 w-3.5")} aria-hidden />
            {!compact ? alert.label : null}
          </span>
        );
      })}
      {nextTaskMeta ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-1.5 py-0.5 text-[10px] font-medium leading-tight text-[var(--crm-ink-2)]",
            compact && "px-1 py-px text-[9px]",
          )}
          title={`Próxima tarefa: ${nextTaskMeta.full}`}
        >
          <CalendarCheck2
            className={cn("shrink-0 opacity-90", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
            aria-hidden
          />
          {compact ? nextTaskMeta.label : `Próx: ${nextTaskMeta.label}`}
        </span>
      ) : null}
    </div>
  );
}
