import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";

import type { LegalCaseDocument } from "@/types/legal";
import { ExpansionSelect } from "./ExpansionShared";

export function ExpansionText({
  label,
  value,
  onChange,
  required = false,
  maxLength = 200,
  multiline = false,
  type = "text",
  disabled = false,
  hint,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  required?: boolean;
  maxLength?: number;
  multiline?: boolean;
  type?: "text" | "date" | "datetime-local" | "email" | "url";
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            required={required}
            maxLength={maxLength}
            disabled={disabled}
          />
        ) : (
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            type={type}
            required={required}
            maxLength={maxLength}
            disabled={disabled}
          />
        )
      }
    </LegalField>
  );
}
export function ExpansionCheck({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        className="mt-1 h-4 w-4 shrink-0"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function ExpansionDocumentField({
  label,
  value,
  onChange,
  docs,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  docs: LegalCaseDocument[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <ExpansionSelect
      label={label}
      value={value}
      onChange={onChange}
      required={required}
      hint={hint}
    >
      <option value="">Não selecionado</option>
      {docs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.display_name}
        </option>
      ))}
    </ExpansionSelect>
  );
}
export function ExpansionDocuments({
  label,
  values,
  onChange,
  docs,
  max = 20,
}: {
  label: string;
  values: string[];
  onChange(v: string[]): void;
  docs: LegalCaseDocument[];
  max?: number;
}) {
  const unavailable = values.filter((id) => !docs.some((d) => d.id === id));
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">
        Até {max} arquivos. Cada seleção será revalidada no servidor.
      </p>
      {docs.map((d) => (
        <ExpansionCheck
          key={d.id}
          label={d.display_name}
          checked={values.includes(d.id)}
          disabled={!values.includes(d.id) && values.length >= max}
          onChange={(checked) =>
            onChange(
              checked ? [...values, d.id] : values.filter((id) => id !== d.id),
            )
          }
        />
      ))}
      {!docs.length && (
        <p className="text-sm text-muted-foreground">
          Nenhum arquivo pronto nesta categoria. Envie o arquivo na aba
          Documentos.
        </p>
      )}
      {unavailable.length > 0 && (
        <p role="alert" className="text-sm text-amber-700">
          Há arquivos selecionados sem acesso atual. Reexamine a seleção antes
          de salvar.
        </p>
      )}
    </fieldset>
  );
}
export function ExpansionFacts({
  items,
}: {
  items: [string, string | null | undefined][];
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap break-words">
            {value || "Não informado"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
