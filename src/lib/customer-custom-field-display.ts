import {
  customFieldValueToString,
  type CustomerCustomFieldDefinition,
  type CustomerCustomFieldValueRow,
} from "@/lib/api/customer-custom-fields";
import { formatCustomFieldValueForDisplay } from "@/lib/custom-field-kinds";
import { slugifyFunnelKey } from "@/lib/crm/funnel-editor-utils";

function normalizeCustomFieldMatchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Chaves legadas em `customers.source_columns` que podem guardar o valor do campo. */
export function customerCustomFieldSourceColumnKeys(fieldNome: string): string[] {
  const trimmed = fieldNome.trim();
  if (!trimmed) {
    return [];
  }
  const keys = new Set<string>();
  keys.add(trimmed);
  keys.add(trimmed.toLowerCase());
  const slug = slugifyFunnelKey(trimmed);
  keys.add(slug);
  keys.add(slug.replace(/-/g, "_"));
  return [...keys];
}

export function readCustomerCustomFieldFromSourceColumns(
  sourceColumns: Record<string, string> | undefined | null,
  fieldNome: string,
): string {
  if (!sourceColumns) {
    return "";
  }
  for (const key of customerCustomFieldSourceColumnKeys(fieldNome)) {
    const raw = sourceColumns[key];
    if (raw != null && String(raw).trim() !== "") {
      return String(raw).trim();
    }
  }
  const target = normalizeCustomFieldMatchKey(fieldNome);
  if (!target) {
    return "";
  }
  for (const [key, raw] of Object.entries(sourceColumns)) {
    if (raw == null || String(raw).trim() === "") {
      continue;
    }
    if (normalizeCustomFieldMatchKey(key) === target) {
      return String(raw).trim();
    }
  }
  return "";
}

export type CustomerCustomFieldDisplayItem = {
  field: CustomerCustomFieldDefinition;
  value: string;
  /** Valor cru (ex.: JSON da galeria) para renders especiais. */
  raw: string;
};

const EMPTY_VALUE_ROW: CustomerCustomFieldValueRow = {
  fieldId: "",
  valueText: null,
  valueNumeric: null,
  valueDate: null,
};

function normalizeBooleanDraftValue(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) {
    return "0";
  }
  if (v === "1" || v === "true" || v === "sim" || v === "yes") {
    return "1";
  }
  if (v === "0" || v === "false" || v === "nao" || v === "não" || v === "no") {
    return "0";
  }
  return raw;
}

function rawCustomFieldValueForField(
  field: CustomerCustomFieldDefinition,
  valueRows: CustomerCustomFieldValueRow[],
  sourceColumns?: Record<string, string> | null,
): string {
  const values = new Map(valueRows.map((row) => [row.fieldId, row]));
  const row = values.get(field.id);
  let raw = customFieldValueToString(field.kind, row ?? { ...EMPTY_VALUE_ROW, fieldId: field.id });
  if (!raw.trim()) {
    raw = readCustomerCustomFieldFromSourceColumns(sourceColumns, field.nome);
  }
  if (field.kind === "booleano") {
    return normalizeBooleanDraftValue(raw);
  }
  return raw;
}

/** Valores no formato do formulário (ex.: booleano como "1"/"0", não "Sim"/"Não"). */
export function buildCustomerCustomFieldsDraftValues(input: {
  fields: CustomerCustomFieldDefinition[];
  valueRows: CustomerCustomFieldValueRow[];
  sourceColumns?: Record<string, string> | null;
}): Record<string, string> {
  return Object.fromEntries(
    input.fields.map((field) => [
      field.id,
      rawCustomFieldValueForField(field, input.valueRows, input.sourceColumns),
    ]),
  );
}

export function buildCustomerCustomFieldsDisplayList(input: {
  fields: CustomerCustomFieldDefinition[];
  valueRows: CustomerCustomFieldValueRow[];
  sourceColumns?: Record<string, string> | null;
}): CustomerCustomFieldDisplayItem[] {
  return input.fields.map((field) => {
    const raw = rawCustomFieldValueForField(field, input.valueRows, input.sourceColumns);
    const display = raw.trim() ? formatCustomFieldValueForDisplay(field.kind, raw) : "";
    return { field, value: display, raw };
  });
}
