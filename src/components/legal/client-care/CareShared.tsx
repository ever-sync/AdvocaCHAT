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
import { selectClassName, DOCUMENT_CATEGORIES } from "../legal-ui";
import { CARE_SCOPES, careMemberLabel } from "./client-care-ui";
import type { CareMembership, PortalCategory, PortalScope } from "./types";
export function CareDialog({
  title,
  description,
  children,
  close,
  submit,
  pending,
  label = "Salvar rascunho",
  disabled = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  close(): void;
  submit(): Promise<void>;
  pending: boolean;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={pending} className="space-y-4">
            {children}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || disabled}>
              {pending ? "Salvando…" : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function CareScopeChecklist({
  value,
  options,
  change,
  disabled,
}: {
  value: PortalScope[];
  options: PortalScope[];
  change(value: PortalScope[]): void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">
        Permissões individuais deste acesso
      </legend>
      {options.map((scope) => (
        <label key={scope} className="flex items-start gap-2 text-sm">
          <input
            className="mt-1 accent-primary"
            type="checkbox"
            checked={value.includes(scope)}
            onChange={(e) =>
              change(
                e.target.checked
                  ? [...value, scope]
                  : value.filter((s) => s !== scope),
              )
            }
          />
          <span>{CARE_SCOPES[scope]}</span>
        </label>
      ))}
    </fieldset>
  );
}
export function CareMemberField({
  members,
  value,
  change,
}: {
  members: CareMembership[];
  value: string;
  change(value: string): void;
}) {
  return (
    <LegalField label="Destinatário autorizado">
      {(id) => (
        <select
          id={id}
          className={selectClassName}
          required
          value={value}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Selecione um acesso</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {careMemberLabel(m)}
            </option>
          ))}
        </select>
      )}
    </LegalField>
  );
}
export function CareCategoryField({
  value,
  categories,
  change,
}: {
  value: PortalCategory;
  categories: PortalCategory[];
  change(value: PortalCategory): void;
}) {
  return (
    <LegalField label="Categoria do conteúdo">
      {(id) => (
        <select
          id={id}
          className={selectClassName}
          required
          value={categories.includes(value) ? value : ""}
          onChange={(e) => change(e.target.value as PortalCategory)}
        >
          <option value="" disabled>
            Selecione a categoria
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {DOCUMENT_CATEGORIES[c]}
            </option>
          ))}
        </select>
      )}
    </LegalField>
  );
}
