export type CrmStageRequiredField =
  | "total_value"
  | "qualification"
  | "closing_forecast"
  | "next_task_at";

export type CrmStageDef = {
  id: string;
  title: string;
  /** Campos obrigatórios ao mover o card para esta etapa. */
  requiredFields?: CrmStageRequiredField[];
  /**
   * Etapa onde o CRM move o negócio ao registrar venda (apenas uma por funil).
   * Fallback legado quando ausente: id `venda`.
   */
  isSaleStage?: boolean;
  /**
   * Etapa de perda (apenas uma por funil). Quando o card chega aqui, é tratado como perdido.
   * Fallback legado quando ausente: id `perdido`.
   */
  isLostStage?: boolean;
  /**
   * Modelo de tarefa (`crm_task_templates.id`) criado automaticamente quando o negócio
   * entra nesta etapa. Usado em conjunto com o campo obrigatório `next_task_at`.
   */
  taskTemplateId?: string | null;
  /**
   * Probabilidade de fechamento (0–100) das negociações nesta etapa.
   * Usada no forecast: valor ponderado = total_value × (probability / 100).
   */
  probability?: number | null;
};

export type CrmFunnel = {
  id: string;
  listName: string;
  stages: CrmStageDef[];
};

/** Funis padrão do sistema (usados quando o tenant não tem configuração salva). */
export const DEFAULT_CRM_FUNNELS: CrmFunnel[] = [];

/** Alias histórico — igual a `DEFAULT_CRM_FUNNELS`. */
export const FUNNELS = DEFAULT_CRM_FUNNELS;

export function parseTenantCrmFunnelsJson(raw: unknown): CrmFunnel[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const out: CrmFunnel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    const listName = String(rec.listName ?? "").trim();
    const stagesRaw = rec.stages;
    if (!id || !listName || !Array.isArray(stagesRaw)) {
      return null;
    }
    const stages: CrmStageDef[] = [];
    for (const st of stagesRaw) {
      if (!st || typeof st !== "object") {
        return null;
      }
      const sr = st as Record<string, unknown>;
      const sid = String(sr.id ?? "").trim();
      const title = String(sr.title ?? "").trim();
      if (!sid || !title) {
        return null;
      }
      const requiredRaw = sr.requiredFields;
      let requiredFields: CrmStageRequiredField[] | undefined;
      if (Array.isArray(requiredRaw)) {
        const allowed = new Set<CrmStageRequiredField>([
          "total_value",
          "qualification",
          "closing_forecast",
          "next_task_at",
        ]);
        requiredFields = requiredRaw
          .map((v) => String(v).trim() as CrmStageRequiredField)
          .filter((v) => allowed.has(v));
        if (requiredFields.length === 0) requiredFields = undefined;
      }
      const rawSale = sr.isSaleStage;
      const isSaleStage =
        rawSale === true || rawSale === "true" || rawSale === 1 || rawSale === "1";
      const rawLost = sr.isLostStage;
      const isLostStage =
        rawLost === true || rawLost === "true" || rawLost === 1 || rawLost === "1";
      const taskTemplateId = String(sr.taskTemplateId ?? "").trim() || undefined;
      let probability: number | undefined;
      if (sr.probability != null && sr.probability !== "") {
        const p = Number(sr.probability);
        if (Number.isFinite(p)) {
          probability = Math.min(100, Math.max(0, Math.round(p)));
        }
      }
      stages.push({
        id: sid,
        title,
        ...(requiredFields ? { requiredFields } : {}),
        ...(isSaleStage ? { isSaleStage: true } : {}),
        ...(isLostStage ? { isLostStage: true } : {}),
        ...(taskTemplateId ? { taskTemplateId } : {}),
        ...(probability != null ? { probability } : {}),
      });
    }
    if (stages.length === 0) {
      return null;
    }
    const saleMarks = stages.filter((s) => s.isSaleStage).length;
    if (saleMarks > 1) {
      return null;
    }
    const lostMarks = stages.filter((s) => s.isLostStage).length;
    if (lostMarks > 1) {
      return null;
    }
    out.push({ id, listName, stages });
  }
  if (out.length === 0) {
    return null;
  }
  const ids = new Set(out.map((f) => f.id));
  if (ids.size !== out.length) {
    return null;
  }
  return out;
}

export function funnelListName(funnelId: string): string {
  return DEFAULT_CRM_FUNNELS.find((f) => f.id === funnelId)?.listName ?? funnelId;
}

export function funnelListNameIn(funnels: CrmFunnel[], funnelId: string): string {
  const list = Array.isArray(funnels) ? funnels : DEFAULT_CRM_FUNNELS;
  return list.find((f) => f.id === funnelId)?.listName ?? funnelId;
}

export function funnelStageTitle(funnelId: string, stageId: string): string {
  const funnel = DEFAULT_CRM_FUNNELS.find((f) => f.id === funnelId);
  return funnel?.stages.find((s) => s.id === stageId)?.title ?? stageId;
}

export function funnelStageTitleIn(funnels: CrmFunnel[], funnelId: string, stageId: string): string {
  const list = Array.isArray(funnels) ? funnels : DEFAULT_CRM_FUNNELS;
  const funnel = list.find((f) => f.id === funnelId);
  return funnel?.stages.find((s) => s.id === stageId)?.title ?? stageId;
}

/** Id da etapa de destino ao registrar/marcar venda (`venda` se nada estiver marcado). */
export function resolveConfiguredSaleStageId(funnels: CrmFunnel[], funnelId: string): string {
  const funnel = funnels.find((f) => f.id === funnelId);
  const marked = funnel?.stages.find((s) => s.isSaleStage);
  if (marked) {
    return marked.id;
  }
  return "venda";
}

/** Id da etapa de destino para perda (`perdido` se nada estiver marcado). */
export function resolveConfiguredLostStageId(funnels: CrmFunnel[], funnelId: string): string {
  const funnel = funnels.find((f) => f.id === funnelId);
  const marked = funnel?.stages.find((s) => s.isLostStage);
  if (marked) {
    return marked.id;
  }
  return "perdido";
}

/** Etapa tratada como coluna comercial histórica (valor obrigatório se não há config própria). */
export function isLegacyContractOrSaleSlug(stageId: string): boolean {
  return stageId === "contrato" || stageId === "venda";
}
