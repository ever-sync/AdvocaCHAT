import { useEffect, useMemo, useState } from "react";
import { AlarmClockCheck, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  followupMinutesFromNow,
  pickMostUrgentFollowup,
} from "@/lib/inboxFollowupStatus";
import type { CrmTask } from "@/types/domain";

export type ChatFollowupBadgeProps = {
  followups: CrmTask[];
  className?: string;
  /** Callback opcional pra clicar no badge (ex.: abrir aba "CRM" do perfil). */
  onClick?: () => void;
};

function formatMinutesAgo(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs}min`;
  const hours = Math.floor(abs / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Chip discreto no header do chat mostrando o follow-up mais urgente entre
 * as tarefas em aberto vinculadas ao chat (via customer ou negociação).
 *
 * - Vencido: vermelho com "⏰ Vencido há 2h"
 * - Próximo (até 1h): amarelo com "⏰ Em 15min"
 * - Agendado: cinza com "📌 Em 3 dias" (só mostra se a tarefa for nas próximas 48h pra não virar ruído)
 *
 * Tick por minuto pra refletir passagem do tempo enquanto a tela está aberta.
 */
export function ChatFollowupBadge({ followups, className, onClick }: ChatFollowupBadgeProps) {
  // Tick por minuto, sem armazenar valor (só re-render).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (followups.length === 0) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [followups.length]);

  const urgent = useMemo(() => pickMostUrgentFollowup(followups), [followups]);

  if (!urgent) return null;

  // Não mostrar lembretes agendados pra mais de 48h (vira ruído visual).
  if (urgent.status === "scheduled") {
    const minutes = followupMinutesFromNow(urgent.task);
    if (minutes == null || minutes > 48 * 60) return null;
  }

  const minutes = followupMinutesFromNow(urgent.task);
  const label = (() => {
    if (minutes == null) return urgent.task.title;
    if (urgent.status === "overdue") return `Vencido há ${formatMinutesAgo(minutes)}`;
    if (urgent.status === "soon") return `Em ${formatMinutesAgo(minutes)}`;
    return `Em ${formatMinutesAgo(minutes)}`;
  })();

  const Icon = urgent.status === "overdue" ? AlarmClockCheck : CalendarClock;
  const tone =
    urgent.status === "overdue"
      ? "bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]"
      : urgent.status === "soon"
        ? "bg-[var(--crm-amber-tint)] text-[var(--crm-amber-ink)]"
        : "bg-wchat-50 text-muted-foreground";

  const extraCount = followups.length > 1 ? ` · +${followups.length - 1}` : "";
  const fullTitle =
    urgent.task.title + (followups.length > 1 ? ` (${followups.length} lembretes no total)` : "");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={fullTitle}
      aria-label={`Lembrete: ${label} — ${urgent.task.title}`}
      data-testid="chat-followup-badge"
      data-status={urgent.status}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
        tone,
        onClick && "hover:opacity-85 cursor-pointer",
        !onClick && "cursor-default",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="truncate max-w-[140px]">{label}</span>
      {extraCount ? <span aria-hidden>{extraCount}</span> : null}
    </button>
  );
}
