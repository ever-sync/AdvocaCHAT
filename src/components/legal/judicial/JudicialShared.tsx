import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LegalField } from "../LegalShared";
import { selectClassName } from "../legal-ui";
import type { LegalOperationsProps } from "../operations/operations-ui";
import {
  JUDICIAL_CATEGORIES,
  judicialCategoryAccess,
  type JudicialCategory,
} from "./judicial-ui";

export function JudicialDialog({
  title,
  description,
  children,
  onClose,
  onSubmit,
  pending,
  disabled = false,
  actionLabel = "Salvar rascunho",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose(): void;
  onSubmit(): Promise<void>;
  pending: boolean;
  disabled?: boolean;
  actionLabel?: string;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <fieldset disabled={pending} className="space-y-4">
            {children}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || disabled}>
              {pending ? "Salvando…" : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function JudicialCategoryField({
  props,
  value,
  onChange,
}: {
  props: LegalOperationsProps;
  value: JudicialCategory;
  onChange(category: JudicialCategory): void;
}) {
  const options = (
    Object.keys(JUDICIAL_CATEGORIES) as JudicialCategory[]
  ).filter((category) => judicialCategoryAccess(props, category));
  return (
    <LegalField
      label="Categoria e acesso do conteúdo"
      hint="A categoria inicial exige acesso conjunto a saúde e fiscal. Só altere após examinar o conteúdo e sua finalidade."
    >
      {(id) => (
        <select
          id={id}
          required
          className={selectClassName}
          value={options.includes(value) ? value : ""}
          onChange={(event) => onChange(event.target.value as JudicialCategory)}
        >
          <option value="" disabled>
            Selecione uma categoria autorizada
          </option>
          {options.map((category) => (
            <option key={category} value={category}>
              {JUDICIAL_CATEGORIES[category]}
            </option>
          ))}
        </select>
      )}
    </LegalField>
  );
}
export function JudicialAccessNotice({ children }: { children?: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
    >
      {children ??
        "Seu acesso atual não permite consultar esta categoria do caso. Solicite ao responsável a revisão das permissões necessárias."}
    </div>
  );
}

export function JudicialText({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  maxLength = 4000,
  hint,
  multiline = false,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
  type?: string;
  maxLength?: number;
  hint?: string;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <textarea
            id={id}
            required={required}
            readOnly={readOnly}
            maxLength={maxLength}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            id={id}
            type={type}
            required={required}
            readOnly={readOnly}
            maxLength={maxLength}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </LegalField>
  );
}
export function JudicialSelect({
  label,
  value,
  onChange,
  options,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) => (
        <select
          id={id}
          className={selectClassName}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Selecione</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </LegalField>
  );
}
export function JudicialCheck({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        className="mt-1 h-4 w-4 shrink-0"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {hint && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
