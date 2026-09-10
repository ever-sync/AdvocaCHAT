import {
  Activity,
  Calendar,
  DollarSign,
  Flame,
  Snowflake,
  Star,
  Thermometer,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  LEAD_SCORE_TIER_LABEL,
  type LeadScoreResult,
} from "@/lib/crm/lead-score";
import { cn } from "@/lib/utils";

const TIER_COLOR: Record<LeadScoreResult["tier"], { fill: string; ring: string; text: string; icon: typeof Flame }> = {
  hot: {
    fill: "bg-[var(--crm-danger-strong)]",
    ring: "ring-[var(--crm-danger-strong)]/30",
    text: "text-[var(--crm-danger-strong)]",
    icon: Flame,
  },
  warm: {
    fill: "bg-[var(--crm-orange)]",
    ring: "ring-[var(--crm-orange)]/30",
    text: "text-[var(--crm-orange)]",
    icon: Thermometer,
  },
  tepid: {
    fill: "bg-[var(--crm-brand)]",
    ring: "ring-[var(--crm-brand)]/30",
    text: "text-[var(--crm-brand)]",
    icon: Thermometer,
  },
  cold: {
    fill: "bg-[var(--crm-ink-3)]",
    ring: "ring-[var(--crm-ink-3)]/30",
    text: "text-[var(--crm-ink-3)]",
    icon: Snowflake,
  },
};

type BreakdownRow = {
  key: keyof LeadScoreResult;
  label: string;
  max: number;
  icon: typeof Activity;
  hint: (score: LeadScoreResult) => string;
};

const ROWS: BreakdownRow[] = [
  {
    key: "recency",
    label: "Recência",
    max: 25,
    icon: Activity,
    hint: (s) =>
      s.recency >= 20
        ? "Contato fresco — bom momento pra avançar."
        : s.recency > 0
          ? "Já tem alguns dias sem retomar; agende um follow-up."
          : "Sem interação há +14 dias. Reanime urgente.",
  },
  {
    key: "engagement",
    label: "Engajamento",
    max: 20,
    icon: Star,
    hint: (s) =>
      s.engagement >= 14
        ? "Cliente engajado — sinal forte de interesse."
        : s.engagement > 0
          ? "Engajamento moderado. Estimule mais interação."
          : "Sem pontos de interação registrados.",
  },
  {
    key: "value",
    label: "Valor (relativo ao funil)",
    max: 20,
    icon: DollarSign,
    hint: (s) =>
      s.value >= 14
        ? "Ticket acima da mediana — vale o esforço."
        : s.value > 0
          ? "Valor próximo da mediana do funil."
          : "Sem valor preenchido ou ticket bem abaixo da mediana.",
  },
  {
    key: "qualification",
    label: "Qualificação",
    max: 15,
    icon: Star,
    hint: (s) =>
      s.qualification >= 12
        ? "Lead bem qualificado."
        : s.qualification >= 6
          ? "Qualificação mediana. Valide perfil/intenção."
          : "Estrelas baixas — qualifique antes de avançar.",
  },
  {
    key: "pipeline",
    label: "Progresso no funil",
    max: 10,
    icon: TrendingUp,
    hint: (s) =>
      s.pipeline >= 7
        ? "Etapa avançada — perto da decisão."
        : s.pipeline >= 4
          ? "Em andamento. Mantenha cadência."
          : "Etapa inicial. Foque em qualificar.",
  },
  {
    key: "nextTask",
    label: "Próxima tarefa",
    max: 10,
    icon: Calendar,
    hint: (s) =>
      s.nextTask >= 10
        ? "Tarefa futura agendada — caminho claro."
        : s.nextTask === 0
          ? "Tarefa atrasada. Conclua ou reagende."
          : "Sem tarefa. Agende um follow-up pra não esfriar.",
  },
];

export function NegotiationScoreCard({
  score,
  className,
}: {
  score: LeadScoreResult;
  className?: string;
}) {
  const style = TIER_COLOR[score.tier];
  const Icon = style.icon;

  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--crm-border)] bg-card p-4",
        className,
      )}
    >
      <header className="mb-3 flex items-center gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white ring-4",
            style.fill,
            style.ring,
          )}
          aria-label={`Lead score ${score.total} de 100`}
        >
          <span className="text-base font-bold tabular-nums">{score.total}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("flex items-center gap-1.5 text-sm font-semibold", style.text)}>
            <Icon className="h-4 w-4" aria-hidden />
            {LEAD_SCORE_TIER_LABEL[score.tier]} · Lead score
          </div>
          <p className="text-xs text-[var(--crm-ink-3)]">
            Combina recência, engajamento, valor, qualificação, etapa e tarefa futura.
            <br />
            Atualiza em tempo real conforme você muda os dados do negócio.
          </p>
        </div>
      </header>

      <ul className="space-y-2.5">
        {ROWS.map((row) => {
          const value = Number(score[row.key] ?? 0);
          const pct = row.max > 0 ? Math.round((value / row.max) * 100) : 0;
          const ItemIcon = row.icon;
          return (
            <li key={row.key} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--crm-surface)] text-[var(--crm-ink-2)]">
                <ItemIcon className="h-3.5 w-3.5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--crm-ink)]">{row.label}</span>
                  <span className="text-[10px] font-medium tabular-nums text-[var(--crm-ink-3)]">
                    {value}/{row.max}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--crm-surface-2)]">
                  <div
                    className={cn(
                      "h-full transition-all",
                      value >= row.max * 0.75
                        ? "bg-[var(--crm-success)]"
                        : value >= row.max * 0.4
                          ? "bg-[var(--crm-brand)]"
                          : value > 0
                            ? "bg-[var(--crm-orange)]"
                            : "bg-[var(--crm-ink-3)]/40",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] leading-snug text-[var(--crm-ink-3)]">
                  {row.hint(score)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 rounded-md bg-[var(--crm-surface)]/60 px-3 py-2 text-[10px] text-[var(--crm-ink-3)]">
        <Wrench className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Negócios fechados (vendido/perdido) recebem 0 — não há ação útil pelo score.
      </p>
    </section>
  );
}
