import type { LegalCase, LegalCaseMember, LegalWorkspaceContext } from "@/types/legal";

export type LegalOperationsProps = {
  legalCase: LegalCase;
  workspace: LegalWorkspaceContext;
  canEdit: boolean;
  member?: LegalCaseMember;
  members?: LegalCaseMember[];
};

export function operationsKey(props: LegalOperationsProps, section: string) {
  return ["legal", props.workspace.user_id, props.workspace.tenant_id, "case", props.legalCase.id, "operations", section];
}

export function canAccessOperationCategory(props: LegalOperationsProps, category: string) {
  return category === "general" || props.legalCase.owner_id === props.workspace.user_id ||
    (category === "medical" && Boolean(props.member?.can_view_medical)) ||
    (category === "fiscal" && Boolean(props.member?.can_view_fiscal));
}
