import { formatCustomFieldStoredValueForInput } from "@/lib/custom-field-masks";

/** Tipos de campos personalizados (contatos e catálogo). */

export const CUSTOM_FIELD_KINDS = [
  { value: "texto", label: "Texto curto", group: "Texto" },
  { value: "texto_longo", label: "Texto longo", group: "Texto" },
  { value: "email", label: "E-mail", group: "Texto" },
  { value: "telefone", label: "Telefone", group: "Texto" },
  { value: "url", label: "URL / Link", group: "Texto" },
  { value: "cpf", label: "CPF", group: "Documentos" },
  { value: "cnpj", label: "CNPJ", group: "Documentos" },
  { value: "cep", label: "CEP", group: "Documentos" },
  { value: "numero", label: "Número decimal", group: "Números" },
  { value: "inteiro", label: "Número inteiro", group: "Números" },
  { value: "moeda", label: "Moeda (R$)", group: "Números" },
  { value: "porcentagem", label: "Porcentagem (%)", group: "Números" },
  { value: "data", label: "Data", group: "Data e hora" },
  { value: "hora", label: "Hora", group: "Data e hora" },
  { value: "data_hora", label: "Data e hora", group: "Data e hora" },
  { value: "booleano", label: "Sim / Não", group: "Outros" },
  { value: "lista", label: "Lista de opções", group: "Outros" },
  { value: "cor", label: "Cor", group: "Outros" },
  { value: "galeria", label: "Galeria de imagens", group: "Outros" },
] as const;

export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number]["value"];

export const CUSTOM_FIELD_KIND_VALUES = CUSTOM_FIELD_KINDS.map((k) => k.value) as CustomFieldKind[];

export const FIELD_KIND_LABEL: Record<CustomFieldKind, string> = Object.fromEntries(
  CUSTOM_FIELD_KINDS.map((k) => [k.value, k.label]),
) as Record<CustomFieldKind, string>;

export const FIELD_KIND_GROUPS = [...new Set(CUSTOM_FIELD_KINDS.map((k) => k.group))];

type StorageColumn = "text" | "numeric" | "date";

export function customFieldStorageColumn(kind: CustomFieldKind): StorageColumn {
  if (kind === "data") {
    return "date";
  }
  if (kind === "numero" || kind === "inteiro" || kind === "moeda" || kind === "porcentagem") {
    return "numeric";
  }
  return "text";
}

export function parseCustomFieldOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

export function formatCustomFieldValueForDisplay(kind: CustomFieldKind, raw: string): string {
  if (!raw) {
    return "";
  }
  if (kind === "galeria") {
    const n = parseGalleryValue(raw).length;
    return n > 0 ? `${n} imagem${n === 1 ? "" : "ns"}` : "";
  }
  if (kind === "booleano") {
    return raw === "1" || raw === "true" || raw === "sim" ? "Sim" : raw === "0" || raw === "false" || raw === "nao" ? "Não" : raw;
  }
  return formatCustomFieldStoredValueForInput(kind, { text: raw });
}

/** A galeria guarda um array JSON de URLs de imagem no `value_text`. */
export function parseGalleryValue(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((u) => String(u)).filter(Boolean);
    }
  } catch {
    // valor legado/sem JSON: ignora
  }
  return [];
}

export function serializeGalleryValue(urls: string[]): string {
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  return clean.length ? JSON.stringify(clean) : "";
}
