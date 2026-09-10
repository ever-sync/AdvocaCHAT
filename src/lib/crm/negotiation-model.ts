import {
  resolveConfiguredLostStageId,
  resolveConfiguredSaleStageId,
  type CrmFunnel,
} from "@/data/crm-funnels";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import { mapRowToCustomer } from "@/lib/api/customers";
import { SafeStringRecordSchema } from "@/lib/safe-json-schema";
import type {
  CrmNegotiation,
  CrmNegotiationRecord,
  CrmNegotiationStatus,
  Customer,
  CustomerStatus,
} from "@/types/domain";

const CRM_NEGOTIATION_STATUSES = [
  "em_andamento",
  "vendido",
  "perdido",
  "pausado",
  "nao_pausado",
] as const satisfies readonly CrmNegotiationStatus[];

export function parseCrmNegotiationStatus(raw: unknown): CrmNegotiationStatus {
  if (typeof raw === "string" && (CRM_NEGOTIATION_STATUSES as readonly string[]).includes(raw)) {
    // Legado: tratado como em_andamento na UX (migration 20260629150000).
    if (raw === "nao_pausado") {
      return "em_andamento";
    }
    return raw as CrmNegotiationStatus;
  }
  return "em_andamento";
}

/** Identificadores persistidos em `crm_negotiations` são UUIDs. */
export function isPersistedCrmNegotiationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Ordem de precedência para `stageId` exibido no Kanban:
 *
 * 1. **Status terminal** — `perdido` / `vendido` → etapa `isLostStage` / `isSaleStage` do funil.
 * 2. **crm_negotiations** — `persisted.stageId` quando válido no funil (fonte canônica por negócio).
 * 3. **Cliente vinculado** — só quando **não** há linha persistida (`persisted` ausente): mocks/offline.
 * 4. **crm_negotiation_stages** / localStorage — override por `negotiation_id`.
 * 5. **Fallback** — `base.stageId` ou primeira etapa do funil.
 */

export type CrmStageOverride = { funnel_id: string; stage_id: string };

export function customerStageForFunnel(
  customer: Customer | undefined,
  funnelId: string,
  validStageIds: Set<string>,
): string | null {
  if (!customer?.sourceColumns) {
    return null;
  }
  const stage = customer.sourceColumns[CRM_PIPELINE_STAGE_KEY]?.trim();
  if (!stage || !validStageIds.has(stage)) {
    return null;
  }
  const f = customer.sourceColumns[CRM_FUNNEL_ID_KEY]?.trim();
  if (f && f !== funnelId) {
    return null;
  }
  return stage;
}

/** Cliente aparece no funil se não tem `crm_funnel_id` (herda ex.: funil padrão na UI) ou se bate com `funnelId`. */
export function customerMatchesCrmFunnel(customer: Customer, funnelId: string): boolean {
  const f = customer.sourceColumns?.[CRM_FUNNEL_ID_KEY]?.trim();
  if (!f) {
    return true;
  }
  return f === funnelId;
}

export function normalizeLeadTitle(title: string | null | undefined): string {
  return (title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/\s+/g, " ") // colapsa espaços
    .trim()
    .toLowerCase();
}

/**
 * Dígitos normalizados do telefone do cliente (últimos 11, mín. 8) — chave estável
 * para agrupar a mesma lead num funil. Regra do produto: 1 telefone por pipeline.
 */
export function customerPhoneDigits(customer: Customer | null | undefined): string {
  if (!customer) return "";
  const raw =
    customer.phoneDigits ||
    customer.phoneE164 ||
    customer.celular ||
    customer.telefone ||
    "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits.length > 11 ? digits.slice(-11) : digits;
}

/** Resolve o cliente de uma linha `crm_negotiations` (id direto ou título igual ao nome). */
export function resolveCustomerIdForNegotiationRecord(
  row: Pick<CrmNegotiationRecord, "customerId" | "title">,
  customers: Customer[],
): string | null {
  const direct = row.customerId?.trim();
  if (direct) {
    return direct;
  }
  const title = normalizeLeadTitle(row.title);
  if (!title) {
    return null;
  }
  return customers.find((c) => normalizeLeadTitle(c.nome) === title)?.id ?? null;
}

/**
 * Clientes que já têm negociação no funil — evita card sintético `customer:{uuid}` duplicado.
 * Considera `customer_id` e negociações sem vínculo mas com título igual ao nome do cliente.
 */
export function buildLinkedCustomerIdsForKanban(
  dbRecords: CrmNegotiationRecord[],
  customers: Customer[],
  funnelId: string,
): Set<string> {
  const linked = new Set<string>();
  for (const row of dbRecords) {
    if (row.funnelId !== funnelId) {
      continue;
    }
    const customerId = resolveCustomerIdForNegotiationRecord(row, customers);
    if (customerId) {
      linked.add(customerId);
    }
  }
  return linked;
}

/**
 * Chave estável para agrupar cards da mesma lead num funil. Precedência:
 * telefone do cliente (1 telefone por pipeline) → id do cliente → nome → título.
 * O funil já está no groupKey, então a chave não precisa repeti-lo.
 */
export function resolveKanbanCustomerKey(
  card: Pick<CrmNegotiation, "id" | "customerId" | "title" | "funnelId">,
  customers: Customer[],
): string | null {
  // Resolve o registro de cliente (por id direto ou por nome).
  const cid = card.customerId?.trim() ?? "";
  let customer = cid ? customers.find((c) => c.id === cid) : undefined;
  if (!customer) {
    const title = normalizeLeadTitle(card.title);
    if (title) {
      customer = customers.find((c) => normalizeLeadTitle(c.nome) === title);
    }
  }

  if (customer) {
    const digits = customerPhoneDigits(customer);
    return digits ? `phone:${digits}` : `cust:${customer.id}`;
  }
  if (cid) {
    return `cust:${cid}`;
  }
  const title = normalizeLeadTitle(card.title);
  return title ? `title:${title}` : null;
}

function kanbanCardPreferenceScore(card: CrmNegotiation): number {
  let score = 0;
  if (card.status === "em_andamento") {
    score += 100;
  }
  if (card.assigneeId?.trim()) {
    score += 50;
  }
  if (isPersistedCrmNegotiationId(card.id)) {
    score += 25;
  }
  score += new Date(card.createdAt).getTime() / 1_000_000_000;
  return score;
}

/** Mantém um card por lead/funil quando há negociações duplicadas no banco. */
export function dedupeNegotiationsForKanban(
  cards: CrmNegotiation[],
  customers: Customer[],
): CrmNegotiation[] {
  const byGroup = new Map<string, CrmNegotiation[]>();
  const ungrouped: CrmNegotiation[] = [];

  for (const card of cards) {
    const customerKey = resolveKanbanCustomerKey(card, customers);
    if (!customerKey) {
      ungrouped.push(card);
      continue;
    }
    const groupKey = `${card.funnelId}::${customerKey}`;
    const list = byGroup.get(groupKey) ?? [];
    list.push(card);
    byGroup.set(groupKey, list);
  }

  const deduped: CrmNegotiation[] = [...ungrouped];
  for (const group of byGroup.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    const best = [...group].sort((a, b) => kanbanCardPreferenceScore(b) - kanbanCardPreferenceScore(a))[0];
    deduped.push(best);
  }
  return deduped;
}



export type KanbanTerminalStages = { lostStageId: string; saleStageId: string };

export function resolveKanbanStageId(params: {
  base: CrmNegotiation;
  funnelId: string;
  validStageIds: Set<string>;
  customer: Customer | undefined;
  stageOverride: CrmStageOverride | undefined;
  /** Linha `crm_negotiations` quando a listagem vier do banco (fases 2+). */
  persisted?: Pick<CrmNegotiationRecord, "stageId" | "funnelId"> | null;
  /** Etapas terminais do funil (`isLostStage` / `isSaleStage`) — evita cair na 1ª coluna. */
  terminalStages?: KanbanTerminalStages;
}): string {
  const { base, funnelId, validStageIds, customer, stageOverride, persisted, terminalStages } =
    params;

  if (base.status === "perdido") {
    const lostId = terminalStages?.lostStageId;
    if (lostId && validStageIds.has(lostId)) {
      return lostId;
    }
  }
  if (base.status === "vendido") {
    const saleId = terminalStages?.saleStageId;
    if (saleId && validStageIds.has(saleId)) {
      return saleId;
    }
  }

  const persistedMatchesFunnel = Boolean(persisted && persisted.funnelId === funnelId);

  if (persistedMatchesFunnel && validStageIds.has(persisted!.stageId)) {
    return persisted!.stageId;
  }

  // Negociação no banco: não deixa `source_columns` do cliente sobrescrever a etapa persistida.
  if (!persistedMatchesFunnel) {
    const fromCustomer = customerStageForFunnel(customer, funnelId, validStageIds);
    if (fromCustomer) {
      return fromCustomer;
    }
  }

  if (
    stageOverride &&
    stageOverride.funnel_id === funnelId &&
    validStageIds.has(stageOverride.stage_id)
  ) {
    return stageOverride.stage_id;
  }

  if (validStageIds.has(base.stageId)) {
    return base.stageId;
  }
  const first = [...validStageIds][0];
  return first ?? base.stageId;
}

/** Mapeia resposta Supabase (snake_case) para `CrmNegotiationRecord`. */
export function mapCrmNegotiationDbRow(row: Record<string, unknown>): CrmNegotiationRecord {
  const customerObj = row.customer ? mapRowToCustomer(row.customer as Parameters<typeof mapRowToCustomer>[0]) : undefined;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    title: String(row.title),
    funnelId: String(row.funnel_id),
    stageId: String(row.stage_id),
    status: parseCrmNegotiationStatus(row.status),
    assigneeId: row.assignee_id != null ? String(row.assignee_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    starCount: Number(row.star_count ?? 0),
    qualification: Number(row.qualification ?? 0),
    totalValue: Number(row.total_value ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    nextTaskAt: row.next_task_at != null ? String(row.next_task_at) : null,
    closingForecast: row.closing_forecast != null ? String(row.closing_forecast) : null,
    lastContactAt: row.last_contact_at != null ? String(row.last_contact_at) : null,
    lastInteractionAt: row.last_interaction_at != null ? String(row.last_interaction_at) : null,
    sourceChatId: row.source_chat_id != null ? String(row.source_chat_id) : null,
    lostReason: row.lost_reason != null ? String(row.lost_reason) : null,
    sourceChatPreview: parseSourceChatEmbed(row.source_chat)?.lastMessagePreview ?? null,
    sourceChatUnread: parseSourceChatEmbed(row.source_chat)?.unreadCount ?? 0,
    otherInfo: SafeStringRecordSchema.parse(row.other_info),
    customer: customerObj,
  };
}



function parseSourceChatEmbed(raw: unknown): { lastMessagePreview: string | null; unreadCount: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  return {
    lastMessagePreview: rec.last_message_preview != null ? String(rec.last_message_preview) : null,
    unreadCount: Number(rec.unread_count ?? 0),
  };
}

/** Converte registro persistido em card de Kanban (`assigneeId` exige string para filtros da UI). */
export function crmNegotiationRecordToCard(row: CrmNegotiationRecord): CrmNegotiation {
  return {
    id: row.id,
    funnelId: row.funnelId,
    stageId: row.stageId,
    status: row.status,
    assigneeId: row.assigneeId ?? "",
    title: row.title,
    starCount: row.starCount,
    createdAt: row.createdAt,
    nextTaskAt: row.nextTaskAt ?? undefined,
    closingForecast: row.closingForecast ?? undefined,
    lastContactAt: row.lastContactAt ?? undefined,
    lastInteractionAt: row.lastInteractionAt ?? undefined,
    qualification: row.qualification,
    totalValue: row.totalValue,
    customerId: row.customerId ?? undefined,
    sourceChatId: row.sourceChatId ?? undefined,
    sourceChatPreview: row.sourceChatPreview ?? undefined,
    sourceChatUnread: row.sourceChatUnread,
    otherInfo: row.otherInfo,
    customer: row.customer,
  };
}

// --- Cards sintéticos de cliente (restaurado: Crm.tsx e testes dependem) ---
export function syntheticCustomerCardId(customerId: string): string {
  return `customer:${customerId}`;
}

export function parseSyntheticCustomerCardId(cardId: string): string | null {
  if (!cardId.startsWith("customer:")) {
    return null;
  }
  const rest = cardId.slice("customer:".length);
  return rest || null;
}

export function isSyntheticCustomerCardId(cardId: string): boolean {
  return parseSyntheticCustomerCardId(cardId) != null;
}

export function findNegotiationForCustomerInFunnel(
  dbRecords: CrmNegotiationRecord[],
  params: { funnelId: string; customerId: string; customerName: string },
): CrmNegotiationRecord | undefined {
  const nameKey = normalizeLeadTitle(params.customerName);
  return dbRecords.find((row) => {
    if (row.funnelId !== params.funnelId) {
      return false;
    }
    if (row.customerId?.trim() === params.customerId) {
      return true;
    }
    return normalizeLeadTitle(row.title) === nameKey;
  });
}

/** Status inferido do cadastro quando ainda não há linha em `crm_negotiations`. */
export function customerStatusToSyntheticNegotiationStatus(
  status: CustomerStatus,
): CrmNegotiationStatus {
  if (status === "inativo") {
    return "pausado";
  }
  if (status === "bloqueado") {
    return "perdido";
  }
  return "em_andamento";
}

/**
 * Clientes com etapa em `source_columns` mas sem negociação no funil atual.
 * Id estável: `customer:{uuid}` — materializa ao arrastar ou marcar perda/venda.
 */
export function buildSyntheticCustomerNegotiationCards(params: {
  customers: Customer[];
  funnelId: string;
  funnels: CrmFunnel[];
  linkedCustomerIds: Set<string>;
}): CrmNegotiation[] {
  const { customers, funnelId, funnels, linkedCustomerIds } = params;
  const funnelDef = funnels.find((f) => f.id === funnelId);
  if (!funnelDef?.stages.length) {
    return [];
  }

  const validStageIds = new Set(funnelDef.stages.map((s) => s.id));
  const terminalStages: KanbanTerminalStages = {
    lostStageId: resolveConfiguredLostStageId(funnels, funnelId),
    saleStageId: resolveConfiguredSaleStageId(funnels, funnelId),
  };

  const cards: CrmNegotiation[] = [];
  for (const customer of customers) {
    if (linkedCustomerIds.has(customer.id)) {
      continue;
    }
    if (!customerMatchesCrmFunnel(customer, funnelId)) {
      continue;
    }

    const status = customerStatusToSyntheticNegotiationStatus(customer.status);
    let stageId = customerStageForFunnel(customer, funnelId, validStageIds);
    if (!stageId && customer.status === "bloqueado") {
      const lostId = terminalStages.lostStageId;
      if (lostId && validStageIds.has(lostId)) {
        stageId = lostId;
      }
    }
    if (!stageId) {
      continue;
    }

    const base: CrmNegotiation = {
      id: syntheticCustomerCardId(customer.id),
      funnelId,
      stageId,
      status,
      assigneeId: "",
      title: customer.nome?.trim() || "Cliente",
      starCount: 0,
      createdAt: customer.cadastradoEm ?? new Date().toISOString(),
      qualification: 0,
      totalValue: 0,
      customerId: customer.id,
    };

    cards.push({
      ...base,
      stageId: resolveKanbanStageId({
        base,
        funnelId,
        validStageIds,
        customer,
        stageOverride: undefined,
        persisted: null,
        terminalStages,
      }),
    });
  }

  return cards;
}
