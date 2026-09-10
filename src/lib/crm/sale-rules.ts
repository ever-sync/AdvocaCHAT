import {
  isLegacyContractOrSaleSlug,
  resolveConfiguredLostStageId,
  resolveConfiguredSaleStageId,
  type CrmFunnel,
} from "@/data/crm-funnels";
import { isNegotiationUnassigned } from "@/lib/crm/negotiation-alerts";
import { isNegotiationAssignedToProfile } from "@/lib/crm/negotiation-assignee";
import type { MarkWinSaleLine } from "@/components/crm/MarkWinDialog";
import type { UserRole } from "@/types/domain";

export type SaleAttendantContext = "chat" | "crm";

export type SaleAttendantCheck = {
  /** Conversa do inbox: exige atendente na conversa. */
  chatAssigneeId?: string | null;
  /** Negócio CRM: exige responsável (não pode estar no pool). */
  negotiationAssigneeId?: string | null;
  profileId?: string | null;
  role?: UserRole | null;
};

/** Etapa de destino configurada como venda no funil. */
export function isSaleDestinationStage(funnels: CrmFunnel[], funnelId: string, stageId: string): boolean {
  return resolveConfiguredSaleStageId(funnels, funnelId) === stageId;
}

/** Etapa de destino configurada como perda no funil. */
export function isLostDestinationStage(funnels: CrmFunnel[], funnelId: string, stageId: string): boolean {
  return resolveConfiguredLostStageId(funnels, funnelId) === stageId;
}

/** Slug legado do funil fixo na tela de negociação (índice 4 = venda). */
export const LEGACY_PIPELINE_SALE_INDEX = 4;

export function hasSaleAttendant(input: SaleAttendantCheck): boolean {
  const needsChat = input.chatAssigneeId !== undefined;
  const needsNegotiation = input.negotiationAssigneeId !== undefined;

  if (needsChat && !input.chatAssigneeId?.trim()) {
    return false;
  }
  if (needsNegotiation && isNegotiationUnassigned(input.negotiationAssigneeId)) {
    return false;
  }
  if (!needsChat && !needsNegotiation) {
    return false;
  }
  if (input.role === "atendimento") {
    const profileId = input.profileId?.trim();
    if (!profileId) {
      return false;
    }
    if (needsChat && input.chatAssigneeId?.trim() !== profileId) {
      return false;
    }
    if (needsNegotiation && !isNegotiationAssignedToProfile(input.negotiationAssigneeId, profileId)) {
      return false;
    }
  }
  return true;
}

export function saleAttendantBlockedMessage(context: SaleAttendantContext): string {
  if (context === "chat") {
    return "Atribua a conversa a um atendente e assuma o negócio no CRM antes de registrar a venda.";
  }
  return "Assuma o negócio (vincule um responsável) antes de registrar a venda.";
}

export const SALE_STAGE_REQUIRES_DIALOG_MESSAGE =
  "Para ir à etapa de venda, use Marcar venda e registre produtos ou serviços com valor.";

export function negotiationHasCompletedSale(input: {
  status?: string | null;
  totalValue?: number | null;
}): boolean {
  return input.status === "vendido" && (input.totalValue ?? 0) > 0;
}

export function validateMarkWinLines(lines: MarkWinSaleLine[]): string | null {
  if (lines.length === 0) {
    return "Adicione ao menos um produto ou serviço.";
  }
  for (const line of lines) {
    if (!line.productId?.trim()) {
      return "Selecione o produto em cada item.";
    }
    if (line.unitValue <= 0 || line.lineTotal <= 0) {
      return "Informe um valor maior que zero em cada item.";
    }
  }
  return null;
}

/** Etapas que exigem registro de venda (não apenas arrastar). */
export function stageRequiresSaleRegistration(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
): boolean {
  if (isSaleDestinationStage(funnels, funnelId, stageId)) {
    return true;
  }
  const stage = funnels.find((f) => f.id === funnelId)?.stages.find((s) => s.id === stageId);
  return Boolean(stage?.isSaleStage) || isLegacyContractOrSaleSlug(stageId);
}
