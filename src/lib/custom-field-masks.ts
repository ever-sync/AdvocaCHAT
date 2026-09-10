import { formatCep, formatCnpj, formatCpf, formatPhone, onlyDigits } from "@/lib/brasil-api";
import { formatCurrencyInput, maskCurrencyInputChange, parseCurrencyInput } from "@/lib/currency-input";
import type { CustomFieldKind } from "@/lib/custom-field-kinds";

const MASKED_KINDS = new Set<CustomFieldKind>([
  "cpf",
  "cnpj",
  "cep",
  "telefone",
  "moeda",
  "porcentagem",
  "inteiro",
  "numero",
]);

export function customFieldKindHasInputMask(kind: CustomFieldKind): boolean {
  return MASKED_KINDS.has(kind);
}

function maskDecimalBrInputChange(raw: string): string {
  let cleaned = raw.replace(/[^\d,]/g, "");
  const commaIndex = cleaned.indexOf(",");
  if (commaIndex >= 0) {
    const intPart = cleaned.slice(0, commaIndex);
    const decPart = cleaned.slice(commaIndex + 1).replace(/,/g, "");
    cleaned = `${intPart},${decPart}`;
  }
  return cleaned;
}

function maskPercentInputChange(raw: string): string {
  const num = raw.replace(/[^\d,]/g, "").replace(/(,.*),/g, "$1");
  if (!num) {
    return "";
  }
  return `${num}%`;
}

function formatPercentForInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  const text = String(value).replace(".", ",");
  return `${text}%`;
}

function formatDecimalBrForInput(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  return String(value).replace(".", ",");
}

/** Aplica máscara enquanto o usuário digita. */
export function applyCustomFieldInputMask(kind: CustomFieldKind, raw: string): string {
  switch (kind) {
    case "cpf":
      return formatCpf(raw);
    case "cnpj":
      return formatCnpj(raw);
    case "cep":
      return formatCep(raw);
    case "telefone":
      return formatPhone(raw);
    case "moeda":
      return maskCurrencyInputChange(raw);
    case "porcentagem":
      return maskPercentInputChange(raw);
    case "inteiro":
      return onlyDigits(raw);
    case "numero":
      return maskDecimalBrInputChange(raw);
    default:
      return raw;
  }
}

/** Formata valor vindo do banco para exibir no input mascarado. */
export function formatCustomFieldStoredValueForInput(
  kind: CustomFieldKind,
  row: { text?: string | null; numeric?: number | null; date?: string | null },
): string {
  if (kind === "moeda" && row.numeric != null && Number.isFinite(row.numeric)) {
    return formatCurrencyInput(row.numeric);
  }
  if (kind === "porcentagem" && row.numeric != null && Number.isFinite(row.numeric)) {
    return formatPercentForInput(row.numeric);
  }
  if (kind === "inteiro" && row.numeric != null && Number.isFinite(row.numeric)) {
    return String(Math.trunc(row.numeric));
  }
  if (kind === "numero" && row.numeric != null && Number.isFinite(row.numeric)) {
    return formatDecimalBrForInput(row.numeric);
  }

  const text = row.text?.trim() ?? "";
  if (!text) {
    return "";
  }

  if (customFieldKindHasInputMask(kind)) {
    return applyCustomFieldInputMask(kind, text);
  }

  return text;
}

/** Converte o valor mascarado do formulário para persistência. */
export function normalizeCustomFieldInputForSave(kind: CustomFieldKind, masked: string): string {
  const trimmed = masked.trim();
  if (!trimmed) {
    return "";
  }

  switch (kind) {
    case "cpf":
    case "cnpj":
    case "cep":
    case "telefone":
      return onlyDigits(trimmed);
    case "moeda":
      return trimmed;
    case "porcentagem":
      return trimmed.replace(/%/g, "").replace(",", ".").trim();
    case "inteiro":
      return onlyDigits(trimmed);
    case "numero":
      return trimmed.replace(",", ".");
    default:
      return trimmed;
  }
}

export function parseCustomFieldNumericForSave(kind: CustomFieldKind, normalized: string): number {
  if (kind === "moeda") {
    return parseCurrencyInput(normalized);
  }

  const n = Number(normalized.replace(",", "."));
  if (!Number.isFinite(n)) {
    throw new Error("Valor numérico inválido.");
  }

  if (kind === "inteiro") {
    return Math.trunc(n);
  }

  if (kind === "porcentagem" && (n < 0 || n > 100)) {
    throw new Error("Porcentagem deve estar entre 0 e 100.");
  }

  return n;
}

export function getCustomFieldInputMaxLength(kind: CustomFieldKind): number | undefined {
  switch (kind) {
    case "cpf":
      return 14;
    case "cnpj":
      return 18;
    case "cep":
      return 9;
    case "telefone":
      return 15;
    default:
      return undefined;
  }
}
