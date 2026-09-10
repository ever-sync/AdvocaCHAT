import { isLegacyContractOrSaleSlug, type CrmFunnel } from "@/data/crm-funnels";
export type CrmStageRequiredField =
  | "total_value"
  | "qualification"
  | "closing_forecast"
  | "next_task_at";

export const CRM_STAGE_REQUIRED_FIELD_OPTIONS: {
  id: CrmStageRequiredField;
  label: string;
  description: string;
}[] = [
  {
    id: "total_value",
    label: "Valor do negócio",
    description: "Exige valor maior que zero ao entrar na etapa",
  },
  {
    id: "qualification",
    label: "Qualificação",
    description: "Exige nota de qualificação (1–5)",
  },
  {
    id: "closing_forecast",
    label: "Previsão de fechamento",
    description: "Exige data prevista de fechamento",
  },
  {
    id: "next_task_at",
    label: "Próxima tarefa",
    description: "Exige tarefa agendada com vencimento",
  },
];

const FIELD_LABELS: Record<CrmStageRequiredField, string> = Object.fromEntries(
  CRM_STAGE_REQUIRED_FIELD_OPTIONS.map((o) => [o.id, o.label.toLowerCase()]),
) as Record<CrmStageRequiredField, string>;

export function stageRequiredFields(
  funnels: CrmFunnel[],
  funnelId: string,
  stageId: string,
): CrmStageRequiredField[] {
  const stage = funnels.find((f) => f.id === funnelId)?.stages.find((s) => s.id === stageId);
  if (stage?.requiredFields?.length) {
    return stage.requiredFields;
  }
  if (stage?.isSaleStage || isLegacyContractOrSaleSlug(stageId)) {
    return ["total_value"];
  }
  return [];
}

/** Campos usados na validação de etapa (card Kanban ou registro persistido). */
export type NegotiationStageValidationInput = {
  totalValue?: number | null;
  qualification?: number | null;
  closingForecast?: string | null;
  nextTaskAt?: string | null;
};

export function validateNegotiationForStage(
  negotiation: NegotiationStageValidationInput,
  required: CrmStageRequiredField[],
): string | null {
  for (const field of required) {
    if (field === "total_value" && (negotiation.totalValue ?? 0) <= 0) {
      return `Informe o ${FIELD_LABELS[field]} para avançar.`;
    }
    if (field === "qualification" && (negotiation.qualification ?? 0) <= 0) {
      return `Informe a ${FIELD_LABELS[field]} para avançar.`;
    }
    if (field === "closing_forecast" && !negotiation.closingForecast) {
      return `Informe a ${FIELD_LABELS[field]} para avançar.`;
    }
    if (field === "next_task_at" && !negotiation.nextTaskAt) {
      return `Agende a ${FIELD_LABELS[field]} para avançar.`;
    }
  }
  return null;
}

export function parseStageRequiredFields(raw: unknown): CrmStageRequiredField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const allowed = new Set<CrmStageRequiredField>([
    "total_value",
    "qualification",
    "closing_forecast",
    "next_task_at",
  ]);
  const out = raw
    .map((v) => String(v).trim() as CrmStageRequiredField)
    .filter((v) => allowed.has(v));
  return out.length > 0 ? out : undefined;
}
