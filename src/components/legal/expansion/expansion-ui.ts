import type {
  ExpansionCategory,
  ExpansionContext,
  ExpansionMetadata,
} from "@/types/legal-expansion";
import type { LegalOperationsProps } from "../operations/operations-ui";
import {
  assistanceCaseAccess,
  assistanceCategoryAccess,
  assistanceDate,
  assistanceOwner,
} from "../assistance/assistance-ui";
export type ExpansionProps = LegalOperationsProps & {
  context: ExpansionContext;
};
export const expansionCaseAccess = assistanceCaseAccess;
export const expansionCategoryAccess = assistanceCategoryAccess;
export const expansionOwner = assistanceOwner;
export const expansionDate = assistanceDate;
export const EXPANSION_CATEGORIES: Record<ExpansionCategory, string> = {
  general: "Geral",
  medical: "Saúde",
  fiscal: "Fiscal",
  restricted: "Saúde e fiscal — acesso conjunto",
};
export const expansionKey = (props: LegalOperationsProps, section: string) => [
  "legal",
  props.workspace.user_id,
  props.workspace.tenant_id,
  "case",
  props.legalCase.id,
  "expansion",
  section,
  expansionOwner(props),
  Boolean(props.member?.can_view_medical),
  Boolean(props.member?.can_view_fiscal),
  expansionCaseAccess(props),
];
export function expansionVisible(
  props: LegalOperationsProps,
  rows: ExpansionMetadata[],
) {
  return rows.filter(
    (row) =>
      row.tenant_id === props.workspace.tenant_id &&
      (!row.case_id || row.case_id === props.legalCase.id) &&
      (!row.category || expansionCategoryAccess(props, row.category)),
  );
}
export const EXPANSION_STATES: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em conferência",
  reviewed: "Conferência registrada",
  ready: "Preparo interno conferido",
  approved: "Aprovada internamente",
  returned: "Devolvido para ajuste",
  revoked: "Revogado",
  completed: "Concluído",
  active: "Ativo",
  open: "Aberto",
  disabled: "Desativado",
};
