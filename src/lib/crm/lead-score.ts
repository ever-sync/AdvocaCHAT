import type { CrmNegotiation } from "@/types/domain";

/**
 * Score automático de lead (0–100), composto por sinais já presentes no
 * registro da negociação + contexto do funil. É uma função pura: não chama
 * banco. Pensado para ser barato o suficiente para rodar a cada render do
 * Kanban.
 *
 * Componentes:
 *   - Recency        (0–25): quanto mais recente a última interação, melhor.
 *   - Engagement     (0–20): starCount (pontos de interação) saturando em 10.
 *   - Value          (0–20): valor total relativo à mediana do funil (log).
 *   - Qualification  (0–15): qualification (0–5) × 3.
 *   - Pipeline       (0–10): probabilidade da etapa (config do funil).
 *   - Next task      (0–10): tarefa futura agendada (10) / nenhuma (5) /
 *                            atrasada (0).
 *
 * O total é normalizado em 0–100 e categorizado em tiers para UI:
 *   hot:  ≥ 75
 *   warm: ≥ 50
 *   tepid:≥ 25
 *   cold: <  25
 *
 * Negócios fechados (vendido/perdido) recebem score 0 — não há ação útil a
 * tomar com base no score deles.
 */

export type LeadScoreTier = "hot" | "warm" | "tepid" | "cold";

export type LeadScoreBreakdown = {
  total: number;
  recency: number;
  engagement: number;
  value: number;
  qualification: number;
  pipeline: number;
  nextTask: number;
};

export type LeadScoreResult = LeadScoreBreakdown & {
  tier: LeadScoreTier;
};

export type LeadScoreContext = {
  /**
   * Mediana de `totalValue` entre negócios abertos no funil. Usada para
   * normalizar o componente "Value" (evita que um único outlier vire único
   * "high-value"). Quando ausente ou 0, esse componente vira 0.
   */
  funnelMedianValue?: number | null;
  /**
   * Probabilidade da etapa atual da negociação (0–100), vindo do JSON do
   * funil. Ausente → estima 30 (neutro) ou 0 se etapa é de perda.
   */
  stageProbabilityPct?: number | null;
  /**
   * Agora em ms — injetável para testar.
   */
  nowMs?: number;
};

const TIER_THRESHOLDS = { hot: 75, warm: 50, tepid: 25 } as const;

export function leadScoreTier(total: number): LeadScoreTier {
  if (total >= TIER_THRESHOLDS.hot) return "hot";
  if (total >= TIER_THRESHOLDS.warm) return "warm";
  if (total >= TIER_THRESHOLDS.tepid) return "tepid";
  return "cold";
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function lastTouchMs(neg: CrmNegotiation): number | null {
  const sources = [neg.lastInteractionAt, neg.lastContactAt, neg.createdAt];
  for (const iso of sources) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export function computeLeadScore(
  neg: CrmNegotiation,
  ctx: LeadScoreContext = {},
): LeadScoreResult {
  // Fechados não pontuam — não há ação útil.
  if (neg.status === "vendido" || neg.status === "perdido") {
    return {
      total: 0,
      recency: 0,
      engagement: 0,
      value: 0,
      qualification: 0,
      pipeline: 0,
      nextTask: 0,
      tier: "cold",
    };
  }

  const now = ctx.nowMs ?? Date.now();

  // Recency: 25 quando há contato hoje; 0 quando passa de 14 dias.
  let recency = 0;
  const touch = lastTouchMs(neg);
  if (touch != null) {
    const days = (now - touch) / 86_400_000;
    if (days <= 1) recency = 25;
    else if (days >= 14) recency = 0;
    else recency = clamp(25 - ((days - 1) / 13) * 25, 0, 25);
  }

  // Engagement: starCount → satura em 10 (= 20 pontos).
  const engagement = clamp(((neg.starCount ?? 0) / 10) * 20, 0, 20);

  // Value: log-scale relativo à mediana do funil. Sem mediana → 0.
  let value = 0;
  const median = ctx.funnelMedianValue ?? 0;
  const totalValue = neg.totalValue ?? 0;
  if (median > 0 && totalValue > 0) {
    const ratio = totalValue / median;
    // ratio 1 → 10 pontos; ratio 4 → 20 pontos (≈log2 * 5); ratio 0.25 → 0.
    const scaled = (Math.log2(ratio) + 1) * 10;
    value = clamp(scaled, 0, 20);
  }

  // Qualification: 0–5 × 3.
  const qualification = clamp((neg.qualification ?? 0) * 3, 0, 15);

  // Pipeline: probabilidade da etapa atual (0–100) → max 10.
  const stageProb = ctx.stageProbabilityPct ?? 30; // 30 neutro quando funil não configurou
  const pipeline = clamp((stageProb / 100) * 10, 0, 10);

  // Next task: futura = 10; sem = 5 (neutro); atrasada = 0.
  let nextTask = 5;
  if (neg.nextTaskAt) {
    const t = new Date(neg.nextTaskAt).getTime();
    if (Number.isFinite(t)) {
      nextTask = t >= now ? 10 : 0;
    }
  }

  const total = Math.round(
    recency + engagement + value + qualification + pipeline + nextTask,
  );

  return {
    total: clamp(total, 0, 100),
    recency: Math.round(recency),
    engagement: Math.round(engagement),
    value: Math.round(value),
    qualification: Math.round(qualification),
    pipeline: Math.round(pipeline),
    nextTask: Math.round(nextTask),
    tier: leadScoreTier(total),
  };
}

/**
 * Constrói o contexto de scoring para um conjunto de negociações. Calcula a
 * mediana de valor entre as abertas e indexa probabilidades por stageId.
 */
export function buildScoringContext(
  openNegotiations: Pick<CrmNegotiation, "totalValue" | "status">[],
  stages: { id: string; probability?: number | null }[],
): {
  funnelMedianValue: number;
  stageProbabilities: Map<string, number>;
} {
  const values: number[] = [];
  for (const n of openNegotiations) {
    if (n.status === "vendido" || n.status === "perdido") continue;
    const v = n.totalValue ?? 0;
    if (v > 0) values.push(v);
  }
  values.sort((a, b) => a - b);
  let median = 0;
  if (values.length > 0) {
    const mid = Math.floor(values.length / 2);
    median = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }

  const stageProbabilities = new Map<string, number>();
  for (const s of stages) {
    if (typeof s.probability === "number" && Number.isFinite(s.probability)) {
      stageProbabilities.set(s.id, clamp(s.probability, 0, 100));
    }
  }

  return { funnelMedianValue: median, stageProbabilities };
}

export const LEAD_SCORE_TIER_LABEL: Record<LeadScoreTier, string> = {
  hot: "Quente",
  warm: "Morno",
  tepid: "Tépido",
  cold: "Frio",
};
