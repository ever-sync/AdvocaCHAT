import { Flame, Snowflake, Thermometer } from "lucide-react";
import {
  LEAD_SCORE_TIER_LABEL,
  type LeadScoreResult,
} from "@/lib/crm/lead-score";
import { cn } from "@/lib/utils";

type Variant = "chip" | "compact";

const TIER_STYLES: Record<
  LeadScoreResult["tier"],
  { fill: string; text: string; icon: typeof Flame }
> = {
  hot: {
    fill: "bg-[var(--crm-danger-tint)]",
    text: "text-[var(--crm-danger-strong)]",
    icon: Flame,
  },
  warm: {
    fill: "bg-[var(--crm-amber-tint)]",
    text: "text-[var(--crm-orange)]",
    icon: Thermometer,
  },
  tepid: {
    fill: "bg-[var(--crm-brand-tint)]",
    text: "text-[var(--crm-brand)]",
    icon: Thermometer,
  },
  cold: {
    fill: "bg-[var(--crm-surface-2)]",
    text: "text-[var(--crm-ink-3)]",
    icon: Snowflake,
  },
};

const TIER_BAR_COLOR: Record<LeadScoreResult["tier"], string> = {
  hot: "bg-[var(--crm-danger-strong)]",
  warm: "bg-[var(--crm-orange)]",
  tepid: "bg-[var(--crm-brand)]",
  cold: "bg-[var(--crm-ink-3)]",
};

export function LeadScoreBadge({
  score,
  variant = "chip",
  className,
  showLabel = false,
}: {
  score: LeadScoreResult;
  variant?: Variant;
  className?: string;
  showLabel?: boolean;
}) {
  const style = TIER_STYLES[score.tier];
  const Icon = style.icon;
  const tooltip = [
    `Recência ${score.recency}/25`,
    `Engaj. ${score.engagement}/20`,
    `Valor ${score.value}/20`,
    `Qualif. ${score.qualification}/15`,
    `Funil ${score.pipeline}/10`,
    `Próx. tarefa ${score.nextTask}/10`,
  ].join(" · ");

  if (variant === "compact") {
    // Mini barra horizontal (Kanban card cozy/expanded).
    return (
      <div
        className={cn("inline-flex items-center gap-1.5", className)}
        title={`Lead score ${score.total}/100 (${LEAD_SCORE_TIER_LABEL[score.tier]}) — ${tooltip}`}
      >
        <Icon className={cn("h-3 w-3 shrink-0", style.text)} aria-hidden />
        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--crm-surface-2)]">
          <div
            className={cn("h-full transition-all", TIER_BAR_COLOR[score.tier])}
            style={{ width: `${score.total}%` }}
          />
        </div>
        <span className={cn("text-[10px] font-semibold tabular-nums", style.text)}>
          {score.total}
        </span>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        style.fill,
        style.text,
        className,
      )}
      title={`Lead score ${score.total}/100 (${LEAD_SCORE_TIER_LABEL[score.tier]}) — ${tooltip}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {showLabel ? LEAD_SCORE_TIER_LABEL[score.tier] : null}
      {showLabel ? " · " : null}
      {score.total}
    </span>
  );
}
