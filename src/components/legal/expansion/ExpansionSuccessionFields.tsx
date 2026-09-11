import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";
import { selectClassName } from "../legal-ui";

export function SuccessionText({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
  type = "text",
  maxLength = 4000,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "date" | "url";
  maxLength?: number;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <Textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={required}
            maxLength={maxLength}
            disabled={disabled}
            rows={4}
          />
        ) : (
          <Input
            id={id}
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required={required}
            maxLength={maxLength}
            disabled={disabled}
          />
        )
      }
    </LegalField>
  );
}

export function SuccessionSelect({
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
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
        >
          {children}
        </select>
      )}
    </LegalField>
  );
}

export function SuccessionCheck({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}

export function SuccessionNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-lg border p-3 text-sm ${error ? "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20" : "bg-muted/30 text-muted-foreground"}`}
    >
      {children}
    </p>
  );
}

export function SuccessionEvidence({
  label,
  ids,
  documents,
  onChange,
  disabled = false,
  limit = 20,
}: {
  label: string;
  ids: string[];
  documents: { id: string; display_name: string }[];
  onChange(ids: string[]): void;
  disabled?: boolean;
  limit?: number;
}) {
  const available = new Set(documents.map((document) => document.id));
  const missing = ids.filter((id) => !available.has(id));
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-2 rounded border p-3"
    >
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">
        Selecione até {limit} documentos prontos atualmente autorizados. A
        seleção não confere o conteúdo.
      </p>
      {documents.length === 0 && (
        <SuccessionNotice>
          Nenhuma prova documental disponível nesta consulta.
        </SuccessionNotice>
      )}
      {documents.map((document) => (
        <SuccessionCheck
          key={document.id}
          label={document.display_name}
          checked={ids.includes(document.id)}
          disabled={!ids.includes(document.id) && ids.length >= limit}
          onChange={(checked) =>
            onChange(
              checked
                ? [...ids, document.id]
                : ids.filter((id) => id !== document.id),
            )
          }
        />
      ))}
      {missing.length > 0 && (
        <SuccessionNotice error>
          Uma prova selecionada perdeu disponibilidade. Atualize a seleção antes
          de salvar.
        </SuccessionNotice>
      )}
    </fieldset>
  );
}
