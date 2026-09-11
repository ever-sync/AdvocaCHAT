export {
  AssistanceAccessNotice as ExpansionAccessNotice,
  AssistanceNotice as ExpansionNotice,
  AssistanceSelect as ExpansionSelect,
  AssistancePagination as ExpansionPagination,
} from "../assistance/AssistanceShared";
import { AssistanceSelect } from "../assistance/AssistanceShared";
import {
  EXPANSION_CATEGORIES,
  expansionCategoryAccess,
  type ExpansionProps,
} from "./expansion-ui";
import type { ExpansionCategory } from "@/types/legal-expansion";
export function ExpansionCategoryField({
  props,
  value,
  onChange,
  disabled = false,
}: {
  props: ExpansionProps;
  value: ExpansionCategory;
  onChange(v: ExpansionCategory): void;
  disabled?: boolean;
}) {
  return (
    <AssistanceSelect
      label="Categoria e acesso do conteúdo"
      value={value}
      onChange={(v) => onChange(v as ExpansionCategory)}
      disabled={disabled}
      required
      hint="A categoria é preservada nas versões da mesma série. Conteúdo combinado exige acesso médico e fiscal."
    >
      {Object.entries(EXPANSION_CATEGORIES)
        .filter(([value]) =>
          expansionCategoryAccess(props, value as ExpansionCategory),
        )
        .map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
    </AssistanceSelect>
  );
}

import { AssistanceDialog } from "../assistance/AssistanceShared";
import type { ComponentProps } from "react";
export function ExpansionDialog({
  onSubmit,
  ...props
}: Omit<ComponentProps<typeof AssistanceDialog>, "onSubmit"> & {
  onSubmit?: () => Promise<unknown>;
}) {
  return (
    <AssistanceDialog
      {...props}
      onSubmit={
        onSubmit
          ? async () => {
              await onSubmit();
            }
          : undefined
      }
    />
  );
}
