import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  CalendarX2,
  Clock,
  Footprints,
  Hand,
  MessageCircle,
  Pause,
  Play,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LeadScoreBadge } from "@/components/crm/LeadScoreBadge";
import { NegotiationScoreCard } from "@/components/crm/NegotiationScoreCard";
import {
  NegotiationAiSummaryButton,
  NegotiationSuggestMessageButton,
} from "@/components/crm/NegotiationAiSummary";
import { formatBRL } from "@/lib/format";
import type { CrmNegotiation, CrmNegotiationStatus } from "@/types/domain";
import type { LeadScoreResult } from "@/lib/crm/lead-score";
import {
  daysSinceLastTouch,
  getNegotiationAlerts,
  type NegotiationAlert,
} from "@/lib/crm/negotiation-alerts";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  CrmNegotiationStatus,
  { label: string; tone: string; icon: typeof Footprints }
> = {
  em_andamento: {
    label: "Em andamento",
    tone: "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
    icon: Footprints,
  },
  vendido: {
    label: "Vendido",
    tone: "bg-[var(--crm-success-tint)] text-[var(--crm-success-strong)]",
    icon: ThumbsUp,
  },
  perdido: {
    label: "Perdido",
    tone: "bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]",
    icon: ThumbsDown,
  },
  pausado: {
    label: "Pausado",
    tone: "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
    icon: Pause,
  },
  nao_pausado: {
    label: "Não pausado",
    tone: "bg-[var(--crm-surface-2)] text-[var(--crm-ink-2)]",
    icon: Play,
  },
};

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? "agora" : "agora";
  if (abs < 3_600_000) {
    const m = Math.floor(abs / 60_000);
    return diff >= 0 ? `${m} min atrás` : `em ${m} min`;
  }
  if (abs < 86_400_000) {
    const h = Math.floor(abs / 3_600_000);
    return diff >= 0 ? `${h} h atrás` : `em ${h} h`;
  }
  const d = Math.floor(abs / 86_400_000);
  return diff >= 0 ? `há ${d} dia${d === 1 ? "" : "s"}` : `em ${d} dia${d === 1 ? "" : "s"}`;
}

export function NegotiationHeroStrip({
  negotiation,
  leadScore,
  stageTitle,
  funnelLabel,
  hasChat,
  onOpenChat,
  staleNegotiationDays,
  showClaimNegotiation,
  onClaimNegotiation,
  claimNegotiationPending,
}: {
  negotiation: CrmNegotiation;
  leadScore?: LeadScoreResult;
  stageTitle?: string;
  funnelLabel?: string;
  hasChat: boolean;
  onOpenChat: () => void;
  /** Limite (dias) que define "parado" — vem de tenant_settings. */
  staleNegotiationDays?: number;
  showClaimNegotiation?: boolean;
  onClaimNegotiation?: () => void;
  claimNegotiationPending?: boolean;
}) {
  const navigate = useNavigate();
  const statusMeta = STATUS_META[negotiation.status] ?? STATUS_META.em_andamento;
  const StatusIcon = statusMeta.icon;
  const lastTouch = negotiation.lastInteractionAt ?? negotiation.lastContactAt ?? null;
  const nextTaskAt = negotiation.nextTaskAt ?? null;
  const nextTaskOverdue = (() => {
    if (!nextTaskAt) return false;
    const t = new Date(nextTaskAt).getTime();
    return Number.isFinite(t) && t < Date.now();
  })();

  // Dias desde a última interação — usado pra colorir o chip de "Última int.".
  const lastTouchDays = useMemo(
    () =>
      daysSinceLastTouch({
        status: negotiation.status,
        nextTaskAt: negotiation.nextTaskAt,
        lastContactAt: negotiation.lastContactAt,
        lastInteractionAt: negotiation.lastInteractionAt,
        createdAt: negotiation.createdAt,
      }),
    [negotiation],
  );

  // Alertas (parado / sem tarefa) com o threshold do tenant.
  const alerts = useMemo<NegotiationAlert[]>(
    () =>
      getNegotiationAlerts(
        {
          status: negotiation.status,
          nextTaskAt: negotiation.nextTaskAt,
          lastContactAt: negotiation.lastContactAt,
          lastInteractionAt: negotiation.lastInteractionAt,
          createdAt: negotiation.createdAt,
        },
        undefined,
        staleNegotiationDays,
      ),
    [negotiation, staleNegotiationDays],
  );

  // Cor do chip "Última int." pelo SLA cumprido:
  // ≤ 1 dia → verde, 1–3 → neutro, 3–threshold → âmbar, ≥ threshold → vermelho.
  const threshold = staleNegotiationDays ?? 7;
  const lastTouchTone =
    !lastTouch
      ? "neutral"
      : lastTouchDays <= 1
        ? "success"
        : lastTouchDays < 3
          ? "neutral"
          : lastTouchDays < threshold
            ? "warning"
            : "danger";

  const lastTouchClass: Record<typeof lastTouchTone, { wrap: string; icon: string }> = {
    success: {
      wrap: "text-[var(--crm-success-strong)]",
      icon: "text-[var(--crm-success-strong)]",
    },
    neutral: { wrap: "", icon: "text-[var(--crm-ink-3)]" },
    warning: { wrap: "text-[var(--crm-orange)]", icon: "text-[var(--crm-orange)]" },
    danger: {
      wrap: "text-[var(--crm-danger-strong)]",
      icon: "text-[var(--crm-danger-strong)]",
    },
  };

  return (
    <div className="border-b border-[var(--crm-surface-2)] bg-card/60 px-4 py-2 md:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--crm-ink-2)]">
        {/* Status */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            statusMeta.tone,
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" aria-hidden />
          {statusMeta.label}
        </span>

        {/* Valor */}
        {negotiation.totalValue > 0 ? (
          <span className="font-semibold text-[var(--crm-ink)] tabular-nums">
            {formatBRL(negotiation.totalValue)}
          </span>
        ) : null}

        {/* Etapa + funil */}
        {stageTitle ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[var(--crm-ink-3)]">Etapa</span>
            <span className="font-medium text-[var(--crm-ink-2)]">{stageTitle}</span>
            {funnelLabel ? (
              <span className="text-[var(--crm-ink-3)]">· {funnelLabel}</span>
            ) : null}
          </span>
        ) : null}

        {/* Última interação — colorida pela "frescura" */}
        <span
          className={cn("inline-flex items-center gap-1.5", lastTouchClass[lastTouchTone].wrap)}
          title={lastTouch ? new Date(lastTouch).toLocaleString("pt-BR") : "Sem interação registrada"}
        >
          <Clock className={cn("h-3.5 w-3.5", lastTouchClass[lastTouchTone].icon)} aria-hidden />
          <span
            className={
              lastTouchTone === "neutral" ? "text-[var(--crm-ink-3)]" : ""
            }
          >
            Última int.
          </span>
          <span className="font-medium">{fmtRelative(lastTouch)}</span>
        </span>

        {/* Próxima tarefa */}
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            nextTaskOverdue ? "text-[var(--crm-danger-strong)]" : "",
          )}
          title={nextTaskAt ? new Date(nextTaskAt).toLocaleString("pt-BR") : "Sem tarefa agendada"}
        >
          <Calendar
            className={cn(
              "h-3.5 w-3.5",
              nextTaskOverdue ? "text-[var(--crm-danger-strong)]" : "text-[var(--crm-ink-3)]",
            )}
            aria-hidden
          />
          <span className={nextTaskOverdue ? "" : "text-[var(--crm-ink-3)]"}>
            Próx. tarefa
          </span>
          <span className="font-medium">
            {nextTaskAt ? fmtRelative(nextTaskAt) : "sem tarefa"}
          </span>
        </span>

        {/* Alertas SLA: parado / sem tarefa futura */}
        {alerts.map((a) => {
          const Icon = a.kind === "stale" ? AlertTriangle : CalendarX2;
          const tone =
            a.severity === "danger"
              ? "border-[var(--crm-danger-border)] bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]"
              : "border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]";
          return (
            <span
              key={a.kind}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                tone,
              )}
              title={
                a.kind === "stale"
                  ? `Negócio parado — limite do tenant: ${threshold} dias`
                  : "Sem tarefa futura agendada — perde cadência sem isso"
              }
            >
              <Icon className="h-3 w-3" aria-hidden />
              {a.label}
            </span>
          );
        })}

        {/* Lead score (popover) */}
        {leadScore ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Lead score ${leadScore.total} de 100 — abrir detalhes`}
                className="rounded transition-opacity hover:opacity-80"
              >
                <LeadScoreBadge score={leadScore} variant="compact" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[340px] border-[var(--crm-border)] bg-card p-0 shadow-lg"
            >
              <NegotiationScoreCard score={leadScore} className="border-0 shadow-none" />
            </PopoverContent>
          </Popover>
        ) : null}

        {/* Quick actions — empurra pra direita em telas largas */}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {showClaimNegotiation && onClaimNegotiation ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 bg-primary font-semibold text-primary-foreground shadow-none hover:bg-primary/90"
              disabled={claimNegotiationPending}
              onClick={onClaimNegotiation}
            >
              <Hand className="h-4 w-4" aria-hidden />
              {claimNegotiationPending ? "Assumindo…" : "Assumir negócio"}
            </Button>
          ) : null}
          <NegotiationAiSummaryButton negotiationId={negotiation.id} variant="outline" />
          <NegotiationSuggestMessageButton
            negotiationId={negotiation.id}
            variant="outline"
          />
          {hasChat ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={onOpenChat}
              title="Abrir a conversa do cliente no WhatsApp"
            >
              <MessageCircle className="h-4 w-4 text-[var(--crm-wa-teal)]" aria-hidden />
              Abrir conversa
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
