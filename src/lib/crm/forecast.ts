import type { CrmFunnel, CrmStageDef } from "@/data/crm-funnels";

export type ForecastDeal = {
  id: string;
  totalValue: number;
  funnelId: string;
  stageId: string;
  assigneeId: string | null;
  closingForecast: string | null;
  status: string;
};

export type ForecastStageRow = {
  stageId: string;
  title: string;
  count: number;
  total: number;
  weighted: number;
  probability: number;
};

export type ForecastMonthRow = {
  month: string; // "YYYY-MM" ou "sem-data"
  label: string;
  count: number;
  total: number;
  weighted: number;
};

export type ForecastSellerRow = {
  assigneeId: string | null;
  name: string;
  count: number;
  total: number;
  weighted: number;
};

export type ForecastSummary = {
  openCount: number;
  pipelineTotal: number;
  weightedTotal: number;
  byStage: ForecastStageRow[];
  byMonth: ForecastMonthRow[];
  bySeller: ForecastSellerRow[];
};

/**
 * Probabilidade efetiva de uma etapa. Usa a configurada; quando ausente, estima:
 * etapa de perda = 0, de venda = 100, demais por uma rampa suave conforme a posição.
 */
export function stageProbability(
  stage: CrmStageDef | undefined,
  index: number,
  total: number,
): number {
  if (!stage) return 0;
  if (stage.probability != null) return Math.min(100, Math.max(0, stage.probability));
  if (stage.isLostStage) return 0;
  if (stage.isSaleStage) return 100;
  if (total <= 1) return 50;
  return Math.round(((index + 1) / (total + 1)) * 100);
}

export function resolveDealProbability(deal: ForecastDeal, funnels: CrmFunnel[]): number {
  const funnel = funnels.find((f) => f.id === deal.funnelId);
  const stages = funnel?.stages ?? [];
  const idx = stages.findIndex((s) => s.id === deal.stageId);
  return stageProbability(idx < 0 ? undefined : stages[idx], idx < 0 ? 0 : idx, stages.length || 1);
}

function monthKey(iso: string | null): { key: string; label: string } {
  if (!iso) return { key: "sem-data", label: "Sem previsão" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { key: "sem-data", label: "Sem previsão" };
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const key = `${y}-${String(m).padStart(2, "0")}`;
  const label = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" });
  return { key, label };
}

export function buildForecast(
  deals: ForecastDeal[],
  funnels: CrmFunnel[],
  sellerName: (id: string | null) => string,
): ForecastSummary {
  let pipelineTotal = 0;
  let weightedTotal = 0;

  const stageMap = new Map<string, ForecastStageRow>();
  const monthMap = new Map<string, ForecastMonthRow>();
  const sellerMap = new Map<string, ForecastSellerRow>();

  for (const deal of deals) {
    const prob = resolveDealProbability(deal, funnels);
    const total = Number.isFinite(deal.totalValue) ? deal.totalValue : 0;
    const weighted = (total * prob) / 100;
    pipelineTotal += total;
    weightedTotal += weighted;

    // por etapa
    const funnel = funnels.find((f) => f.id === deal.funnelId);
    const stage = funnel?.stages.find((s) => s.id === deal.stageId);
    const stageKey = `${deal.funnelId}:${deal.stageId}`;
    const stageRow = stageMap.get(stageKey) ?? {
      stageId: deal.stageId,
      title: stage?.title ?? deal.stageId,
      count: 0,
      total: 0,
      weighted: 0,
      probability: prob,
    };
    stageRow.count += 1;
    stageRow.total += total;
    stageRow.weighted += weighted;
    stageMap.set(stageKey, stageRow);

    // por mês de previsão
    const { key, label } = monthKey(deal.closingForecast);
    const monthRow = monthMap.get(key) ?? { month: key, label, count: 0, total: 0, weighted: 0 };
    monthRow.count += 1;
    monthRow.total += total;
    monthRow.weighted += weighted;
    monthMap.set(key, monthRow);

    // por vendedor
    const sellerKey = deal.assigneeId ?? "none";
    const sellerRow = sellerMap.get(sellerKey) ?? {
      assigneeId: deal.assigneeId,
      name: sellerName(deal.assigneeId),
      count: 0,
      total: 0,
      weighted: 0,
    };
    sellerRow.count += 1;
    sellerRow.total += total;
    sellerRow.weighted += weighted;
    sellerMap.set(sellerKey, sellerRow);
  }

  const byMonth = [...monthMap.values()].sort((a, b) => {
    if (a.month === "sem-data") return 1;
    if (b.month === "sem-data") return -1;
    return a.month.localeCompare(b.month);
  });

  const byStage = [...stageMap.values()].sort((a, b) => b.weighted - a.weighted);
  const bySeller = [...sellerMap.values()].sort((a, b) => b.weighted - a.weighted);

  return {
    openCount: deals.length,
    pipelineTotal,
    weightedTotal,
    byStage,
    byMonth,
    bySeller,
  };
}
