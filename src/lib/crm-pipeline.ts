import {
  resolveConfiguredLostStageId,
  resolveConfiguredSaleStageId,
  type CrmFunnel,
} from "@/data/crm-funnels";
import type { CrmNegotiationStatus, Customer, CustomerStatus } from "@/types/domain";

/** Persistido em `customer.sourceColumns` — evita migração de coluna dedicada. */
export const CRM_PIPELINE_STAGE_KEY = "crm_pipeline_stage";

/**
 * Funil do quadro CRM (alinhado a `CrmFunnel.id`).
 * Fonte canônica por negociação: `public.crm_negotiations.funnel_id`; ver `resolveKanbanStageId`.
 */
export const CRM_FUNNEL_ID_KEY = "crm_funnel_id";

export const PIPELINE_STAGE_KEYS = [
  "lead",
  "contato",
  "andamento",
  "contrato",
  "venda",
  "perdido",
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGE_KEYS)[number];

export function buildPipelineLabels(daysContact: number): Array<{ key: PipelineStageKey; label: string }> {
  const days = Math.max(0, daysContact);
  return [
    { key: "lead", label: "LEAD QUALIFICADA" },
    { key: "contato", label: `CONTATO FEITO (${days} DIAS)` },
    { key: "andamento", label: "EM ANDAMENTO" },
    { key: "contrato", label: "ENVIO CONTRATO" },
    { key: "venda", label: "VENDA" },
    { key: "perdido", label: "PERDIDO" },
  ];
}

export function pipelineStageKeyFromIndex(index: number): PipelineStageKey | undefined {
  return PIPELINE_STAGE_KEYS[index];
}

export type CustomerPipelineNegotiationRef = {
  funnelId: string;
  stageId: string;
  status: CrmNegotiationStatus;
};

export function customerDaysSinceCreated(cliente: Customer): number {
  const created = new Date(cliente.cadastradoEm || Date.now()).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

/** Funil do cliente: `source_columns` ou primeiro funil efetivo do tenant. */
export function resolveCustomerFunnelId(customer: Customer, funnels: CrmFunnel[]): string {
  const stored = customer.sourceColumns?.[CRM_FUNNEL_ID_KEY]?.trim();
  if (stored && funnels.some((f) => f.id === stored)) {
    return stored;
  }
  return funnels[0]?.id ?? "comercial";
}

export function resolveCustomerPipelineIndex(
  stages: CrmFunnel["stages"],
  funnelId: string,
  funnels: CrmFunnel[],
  opts: {
    storedStageId?: string;
    negotiation?: CustomerPipelineNegotiationRef;
    customerStatus: CustomerStatus;
  },
): number {
  if (!stages.length) {
    return 0;
  }

  if (opts.negotiation?.status === "perdido") {
    const lostId = resolveConfiguredLostStageId(funnels, funnelId);
    const lostIdx = stages.findIndex((s) => s.id === lostId || s.isLostStage);
    return lostIdx >= 0 ? lostIdx : stages.length - 1;
  }

  if (opts.negotiation?.status === "vendido") {
    const saleId = resolveConfiguredSaleStageId(funnels, funnelId);
    const saleIdx = stages.findIndex(
      (s) => s.id === opts.negotiation!.stageId || s.id === saleId || s.isSaleStage,
    );
    if (saleIdx >= 0) {
      return saleIdx;
    }
  }

  if (opts.negotiation) {
    const negIdx = stages.findIndex((s) => s.id === opts.negotiation!.stageId);
    if (negIdx >= 0) {
      return negIdx;
    }
  }

  const stored = opts.storedStageId?.trim();
  if (stored) {
    const storedIdx = stages.findIndex((s) => s.id === stored);
    if (storedIdx >= 0) {
      return storedIdx;
    }
    const legacyIdx = PIPELINE_STAGE_KEYS.indexOf(stored as PipelineStageKey);
    if (legacyIdx >= 0 && legacyIdx < stages.length) {
      return legacyIdx;
    }
  }

  if (opts.customerStatus === "bloqueado") {
    const lostId = resolveConfiguredLostStageId(funnels, funnelId);
    const blockedIdx = stages.findIndex((s) => s.id === lostId || s.isLostStage);
    if (blockedIdx >= 0) {
      return blockedIdx;
    }
  }

  return 0;
}

export function resolveCustomerPipelineView(
  customer: Customer,
  funnels: CrmFunnel[],
  negotiations: CustomerPipelineNegotiationRef[] = [],
): {
  funnelId: string;
  funnelLabel: string;
  pipelineStages: Array<{ key: string; label: string }>;
  pipelineActiveIndex: number;
  daysContact: number;
} {
  const funnelId = resolveCustomerFunnelId(customer, funnels);
  const funnel = funnels.find((f) => f.id === funnelId) ?? funnels[0];
  const stages = funnel?.stages ?? [];
  const pipelineStages = stages.map((s) => ({ key: s.id, label: s.title }));
  const primaryNegotiation =
    negotiations.find((n) => n.status === "em_andamento") ??
    negotiations.find((n) => n.status === "perdido" || n.status === "vendido") ??
    negotiations[0];
  const pipelineActiveIndex = resolveCustomerPipelineIndex(stages, funnelId, funnels, {
    storedStageId: customer.sourceColumns?.[CRM_PIPELINE_STAGE_KEY],
    negotiation: primaryNegotiation,
    customerStatus: customer.status,
  });

  return {
    funnelId: funnel?.id ?? funnelId,
    funnelLabel: funnel?.listName ?? funnelId,
    pipelineStages,
    pipelineActiveIndex: Math.min(
      Math.max(pipelineActiveIndex, 0),
      Math.max(pipelineStages.length - 1, 0),
    ),
    daysContact: customerDaysSinceCreated(customer),
  };
}

/** Legado fixo de 6 etapas — preferir `resolveCustomerPipelineView` com funil do tenant. */
export function getPipelineStateForCustomer(cliente: Customer): { activeIndex: number; daysContact: number } {
  const daysContact = customerDaysSinceCreated(cliente);
  const raw = cliente.sourceColumns?.[CRM_PIPELINE_STAGE_KEY]?.trim().toLowerCase();
  if (raw) {
    const idx = PIPELINE_STAGE_KEYS.indexOf(raw as PipelineStageKey);
    if (idx >= 0) {
      return { activeIndex: idx, daysContact };
    }
  }
  if (cliente.status === "bloqueado") {
    return { activeIndex: 5, daysContact };
  }
  if (cliente.status === "inativo") {
    return { activeIndex: 0, daysContact };
  }
  return { activeIndex: 2, daysContact };
}
