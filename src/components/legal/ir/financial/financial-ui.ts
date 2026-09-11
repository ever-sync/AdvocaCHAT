import type { IrFinancialContext } from "@/types/legal-ir-calculations";
import { normalizeIrMoney } from "@/lib/legal-ir-import";
import type { IrPanelProps } from "../ir-ui";
export { formatIrMoney, normalizeIrMoney } from "@/lib/legal-ir-import";
export { isIrOwner as financialOwner, personName } from "../ir-ui";
export type FinancialPanelProps = IrPanelProps & {
  financial: IrFinancialContext;
};
export const financialKey = (props: IrPanelProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "case",
  props.legalCase.id,
  "financial",
  section,
];
export const financialWorkspaceKey = (props: IrPanelProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "financial",
  section,
];
export function moneyInput(value?: string | null) {
  return value == null ? "" : value.replace(".", ",");
}
export function requiredMoney(value: string, label = "Valor") {
  const normalized = normalizeIrMoney(value, "pt-BR");
  if (normalized === null)
    throw new Error(`${label}: informe o valor; vazio não equivale a zero.`);
  return normalized;
}
export function optionalMoney(value: string) {
  return normalizeIrMoney(value, "pt-BR");
}
export function coefficient(value: string, label = "Coeficiente") {
  const text = value.trim().replace(",", ".");
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,9})?$/.test(text))
    throw new Error(
      `${label}: informe um decimal não negativo, sem milhar, com até nove casas.`,
    );
  return text;
}
export const PERIODICITY = {
  monthly: "Mensal por pagador",
  annual: "Ajuste anual",
} as const;
export const TAX_KINDS = {
  ordinary: "Rendimento ordinário",
  thirteenth: "13º salário",
  rra: "Rendimentos recebidos acumuladamente",
  regressive: "Tributação regressiva",
  foreign: "Rendimento do exterior",
  other: "Outra natureza",
  unknown: "Ainda não classificado",
} as const;
export const DEDUCTION_MODES = {
  legal: "Deduções legais",
  simplified: "Desconto simplificado",
  most_favorable: "Comparar opções admitidas",
} as const;
export const IMPORT_STATUS = {
  draft: "Aguardando conferência",
  reviewed: "Conferida",
  rejected: "Correção necessária",
  superseded: "Importação substituída",
} as const;
export const CALCULATION_STATUS = {
  incomplete: "Cálculo recusado / incompleto",
  draft: "Cenário para revisão",
  in_review: "Em revisão",
  approved: "Revisado internamente",
  superseded: "Versão substituída",
} as const;
export const TAX_RESIDENCY = {
  resident: "Residente fiscal no Brasil",
  non_resident: "Não residente fiscal",
  unknown: "Residência fiscal não confirmada",
} as const;
