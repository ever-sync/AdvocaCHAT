import { E2E_CHAT_POOL, E2E_POOL_NEGOTIATION_ID } from "@/data/inbox-e2e-fixtures";
import type { CrmNegotiation, CrmNegotiationRecord } from "@/types/domain";

/** Negociação no pool (UUID) para E2E de claim sem Supabase. */
export const E2E_POOL_NEGOTIATION: CrmNegotiation = {
  id: E2E_POOL_NEGOTIATION_ID,
  funnelId: "comercial",
  stageId: "lead",
  status: "em_andamento",
  assigneeId: "",
  title: "E2E Pool Lead",
  starCount: 0,
  createdAt: "2026-05-01T10:00:00.000Z",
  nextTaskAt: "2026-06-01T10:00:00.000Z",
  lastContactAt: "2026-05-01T10:00:00.000Z",
  lastInteractionAt: "2026-05-01T10:00:00.000Z",
  qualification: 2,
  totalValue: 0,
};

/** Registro vinculado ao chat pool do inbox E2E (`useChatNegotiation`). */
export const E2E_POOL_NEGOTIATION_RECORD: CrmNegotiationRecord = {
  id: E2E_POOL_NEGOTIATION.id,
  tenantId: "00000000-0000-4000-8000-0000000000e1",
  title: E2E_POOL_NEGOTIATION.title,
  funnelId: E2E_POOL_NEGOTIATION.funnelId,
  stageId: E2E_POOL_NEGOTIATION.stageId,
  status: E2E_POOL_NEGOTIATION.status,
  assigneeId: null,
  customerId: null,
  sourceChatId: E2E_CHAT_POOL.id,
  starCount: E2E_POOL_NEGOTIATION.starCount,
  qualification: E2E_POOL_NEGOTIATION.qualification,
  totalValue: E2E_POOL_NEGOTIATION.totalValue,
  createdAt: E2E_POOL_NEGOTIATION.createdAt,
  updatedAt: E2E_POOL_NEGOTIATION.createdAt,
  nextTaskAt: E2E_POOL_NEGOTIATION.nextTaskAt,
  lastContactAt: E2E_POOL_NEGOTIATION.lastContactAt,
  lastInteractionAt: E2E_POOL_NEGOTIATION.lastInteractionAt,
};

const E2E_CHAT_NEGOTIATION_BY_CHAT_ID: Record<string, CrmNegotiationRecord> = {
  [E2E_CHAT_POOL.id]: E2E_POOL_NEGOTIATION_RECORD,
};

export function getE2eChatNegotiation(chatId: string): CrmNegotiationRecord | null {
  return E2E_CHAT_NEGOTIATION_BY_CHAT_ID[chatId] ?? null;
}
