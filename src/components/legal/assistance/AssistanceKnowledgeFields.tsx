import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LegalField } from "../LegalShared";

export function AssistanceCatalogText({
  label,
  value,
  onChange,
  required = false,
  multiline = false,
  maxLength = 4000,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  type?: "text" | "date" | "url";
  hint?: string;
}) {
  return (
    <LegalField label={label} hint={hint}>
      {(id) =>
        multiline ? (
          <Textarea
            id={id}
            value={value}
            required={required}
            maxLength={maxLength}
            rows={4}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <Input
            id={id}
            type={type}
            value={value}
            required={required}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
          />
        )
      }
    </LegalField>
  );
}
export function AssistanceCatalogCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function AssistanceSourceLink({ url }: { url: string | null }) {
  let href: string | null = null;
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password)
      href = parsed.href;
  } catch {
    /* Source labels are plain text, never executable markup. */
  }
  return href ? (
    <a
      className="break-all text-primary underline"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Consultar fonte registrada
    </a>
  ) : (
    <span className="text-muted-foreground">
      Sem endereço HTTPS válido registrado
    </span>
  );
}
