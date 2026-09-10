/** Regras de negócio: quando a IA (n8n) pode enviar mensagens. */

export type ChatAiMode = "off" | "qualifying" | "full" | "handoff";

export type AiBlockReason =
  | "ai_off"
  | "handoff_mode"
  | "negotiation_closed"
  | "customer_opt_out"
  | "qualifying_stage_limit";

export type AiEligibilityInput = {
  aiMode: string | null | undefined;
  chatAssigneeId?: string | null;
  negotiationAssigneeId?: string | null;
  negotiationStatus?: string | null;
  negotiationStageId?: string | null;
  customerOptOut?: boolean;
};

export type AiEligibilityResult = {
  allowed: boolean;
  reason: AiBlockReason | null;
  aiMode: ChatAiMode;
};

/** Estágios em que o modo `qualifying` pode responder (antes de negociação ativa). */
export const QUALIFYING_AI_STAGE_IDS = new Set(["lead", "contato"]);

const ALERTABLE_NEGOTIATION_STATUSES = new Set(["em_andamento", "nao_pausado"]);

export function normalizeChatAiMode(value: string | null | undefined): ChatAiMode {
  const v = String(value ?? "off").trim().toLowerCase();
  if (v === "qualifying" || v === "full" || v === "handoff") {
    return v;
  }
  return "off";
}

export function evaluateAiReplyEligibility(input: AiEligibilityInput): AiEligibilityResult {
  const aiMode = normalizeChatAiMode(input.aiMode);

  if (aiMode === "off") {
    return { allowed: false, reason: "ai_off", aiMode };
  }
  if (aiMode === "handoff") {
    return { allowed: false, reason: "handoff_mode", aiMode };
  }
  if (input.customerOptOut === true) {
    return { allowed: false, reason: "customer_opt_out", aiMode };
  }

  const status = input.negotiationStatus?.trim();
  if (status && !ALERTABLE_NEGOTIATION_STATUSES.has(status)) {
    return { allowed: false, reason: "negotiation_closed", aiMode };
  }

  if (aiMode === "qualifying") {
    const stage = input.negotiationStageId?.trim();
    if (stage && !QUALIFYING_AI_STAGE_IDS.has(stage)) {
      return { allowed: false, reason: "qualifying_stage_limit", aiMode };
    }
  }

  return { allowed: true, reason: null, aiMode };
}

export function aiBlockReasonMessage(reason: AiBlockReason): string {
  switch (reason) {
    case "ai_off":
      return "IA desligada neste chat.";
    case "handoff_mode":
      return "Chat em handoff (somente humano).";
    case "negotiation_closed":
      return "Negócio encerrado ou fora de atendimento ativo.";
    case "customer_opt_out":
      return "Cliente solicitou não receber mensagens.";
    case "qualifying_stage_limit":
      return "Modo qualificação só atua nos estágios iniciais do funil.";
    default:
      return "IA bloqueada pelas regras de negócio.";
  }
}
