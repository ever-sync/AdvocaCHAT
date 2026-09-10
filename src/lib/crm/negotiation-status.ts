import type { CrmNegotiationStatus, CustomerStatus } from "@/types/domain";

const PAUSABLE: CrmNegotiationStatus[] = ["em_andamento"];

/** Negociação ativa pode ser pausada (não aplica a vendido/perdido). */
export function negotiationCanPause(status: CrmNegotiationStatus): boolean {
  return PAUSABLE.includes(status);
}

export function negotiationCanResume(status: CrmNegotiationStatus): boolean {
  return status === "pausado";
}

export function negotiationPauseToggleLabel(status: CrmNegotiationStatus): "Pausar" | "Retomar" | null {
  if (negotiationCanPause(status)) {
    return "Pausar";
  }
  if (negotiationCanResume(status)) {
    return "Retomar";
  }
  return null;
}

/** Espelha status da negociação no cadastro do cliente (bulk e ficha). */
export function customerStatusForNegotiationPause(
  negotiationStatus: CrmNegotiationStatus,
  currentCustomerStatus: CustomerStatus,
): CustomerStatus | undefined {
  if (negotiationStatus === "pausado") {
    return "inativo";
  }
  if (negotiationStatus === "em_andamento") {
    if (currentCustomerStatus === "inativo") {
      return "ativo";
    }
  }
  return undefined;
}
