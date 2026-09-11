import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
export function AssistanceAccessNotice() {
  return (
    <p
      role="status"
      className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
    >
      O conteúdo não está disponível com a autorização atual. Atualize a
      consulta antes de continuar.
    </p>
  );
}
export function AssistanceNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-lg border p-3 text-sm ${error ? "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20" : "bg-muted/30 text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}
export function AssistanceStringList({
  title,
  description,
  values,
  onChange,
  disabled = false,
  itemLabel,
  addLabel,
}: {
  title: string;
  description: string;
  values: string[];
  onChange(values: string[]): void;
  disabled?: boolean;
  itemLabel: string;
  addLabel: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      {values.map((value, index) => (
        <div className="flex items-end gap-2" key={index}>
          <div className="min-w-0 flex-1">
            <LegalField label={`${itemLabel} ${index + 1}`}>
              {(id) => (
                <Textarea
                  id={id}
                  value={value}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      values.map((old, at) =>
                        at === index ? event.target.value : old,
                      ),
                    )
                  }
                  rows={2}
                  maxLength={2000}
                />
              )}
            </LegalField>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            aria-label={`Remover ${itemLabel.toLowerCase()} ${index + 1}`}
            onClick={() => onChange(values.filter((_, at) => at !== index))}
          >
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || values.length >= 20}
        onClick={() => onChange([...values, ""])}
      >
        {addLabel}
      </Button>
    </section>
  );
}
export function AssistanceSingleLine({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}) {
  return (
    <LegalField label={label}>
      {(id) => (
        <Input
          id={id}
          value={value}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </LegalField>
  );
}

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { selectClassName } from "../legal-ui";
import type { AssistanceCategory } from "@/types/legal-assistance";
import {
  assistanceCategoryAccess,
  ASSISTANCE_CATEGORIES,
  type AssistanceProps,
} from "./assistance-ui";
export function AssistanceDialog({
  title,
  description,
  children,
  onClose,
  onSubmit,
  pending = false,
  disabled = false,
  actionLabel = "Salvar rascunho",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose(): void;
  onSubmit?(): Promise<void>;
  pending?: boolean;
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (onSubmit) void onSubmit();
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            {children}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              {onSubmit ? "Cancelar" : "Fechar"}
            </Button>
            {onSubmit && (
              <Button type="submit" disabled={pending || disabled}>
                {pending ? "Processando…" : actionLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function AssistanceSelect({
  label,
  value,
  onChange,
  children,
  required = false,
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  children: ReactNode;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) => (
        <select
          id={id}
          className={selectClassName}
          value={value}
          required={required}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
      )}
    </LegalField>
  );
}
export function AssistanceCategoryField({
  props,
  value,
  onChange,
  disabled = false,
}: {
  props: AssistanceProps;
  value: AssistanceCategory;
  onChange(value: AssistanceCategory): void;
  disabled?: boolean;
}) {
  return (
    <AssistanceSelect
      label="Categoria e acesso do conteúdo"
      value={value}
      onChange={(v) => onChange(v as AssistanceCategory)}
      disabled={disabled}
      required
      hint="Conteúdo que reúne informações médicas e fiscais exige acesso conjunto. A categoria é revalidada no servidor."
    >
      <option value="">Selecione após examinar o conteúdo</option>
      {(Object.keys(ASSISTANCE_CATEGORIES) as AssistanceCategory[])
        .filter((c) => assistanceCategoryAccess(props, c))
        .map((c) => (
          <option key={c} value={c}>
            {ASSISTANCE_CATEGORIES[c]}
          </option>
        ))}
    </AssistanceSelect>
  );
}
export function AssistancePagination({
  offset,
  limit,
  hasMore,
  pending,
  onChange,
}: {
  offset: number;
  limit: number;
  hasMore: boolean;
  pending: boolean;
  onChange(offset: number): void;
}) {
  if (offset === 0 && !hasMore) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Página {Math.floor(offset / limit) + 1} · até {limit} registros
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !hasMore}
          onClick={() => onChange(offset + limit)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
