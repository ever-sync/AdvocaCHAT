// Tipos do construtor de formulários (Marketing → Converter → Formulários).
// Portado de formularios/types/index.ts, adaptado ao modelo do CaleoCRM.

export type FormFieldType =
  | "text"
  | "email"
  | "phone"
  | "select"
  | "checkbox"
  | "radio"
  | "date"
  | "textarea"
  | "hidden"
  | "title"
  | "description"
  | "image";

export interface FormFieldOption {
  label: string;
  value: string;
}

export type FormFieldWidth = 33 | 66 | 100;
export type FormFieldGap = 2 | 3 | 4 | 6;
export type FormConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "greater_than"
  | "less_than";

export type FormConditionJoin = "all" | "any";
export type FormConditionCompareTarget =
  | { kind: "value"; value: string }
  | { kind: "field"; field: string };

export function formFieldWidthToGridSpan(width: FormFieldWidth | undefined): number {
  switch (width) {
    case 33:
      return 4;
    case 66:
      return 8;
    case 100:
    default:
      return 12;
  }
}

export function isVisualField(type: FormFieldType): boolean {
  return type === "title" || type === "description" || type === "image";
}

const FORM_FIELD_GAP_CSS: Record<FormFieldGap, string> = {
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  6: "1.5rem",
};

export function formFieldGapToCss(gap: FormFieldGap | undefined): string {
  return FORM_FIELD_GAP_CSS[gap ?? 3];
}

export function formFieldGapLabel(gap: FormFieldGap): string {
  switch (gap) {
    case 2:
      return "Compacto — 8px";
    case 4:
      return "Amplo — 16px";
    case 6:
      return "Bem amplo — 24px";
    case 3:
    default:
      return "Confortável — 12px";
  }
}

export interface FormFieldCondition {
  field: string;
  operator: FormConditionOperator;
  value: string;
  compareTarget?: FormConditionCompareTarget;
}

export interface FormFieldConditionGroup {
  join: FormConditionJoin;
  conditions: FormFieldCondition[];
}

export interface FormFieldConditionalLogic {
  groups: FormFieldConditionGroup[];
}

export interface FormStepRoutingRule {
  id?: string;
  label?: string;
  goToStepId: string;
  conditionalLogic: FormFieldConditionalLogic;
}

export function groupFormFieldsIntoRows(fields: FormField[], compact = false): FormField[][] {
  const rows: FormField[][] = [];
  let current: FormField[] = [];
  let remaining = 12;

  for (const field of fields.filter((item) => item.type !== "hidden")) {
    const span = compact ? 12 : formFieldWidthToGridSpan(field.layoutWidth);

    if (field.lineBreakBefore && current.length > 0) {
      rows.push(current);
      current = [];
      remaining = 12;
    }

    if (current.length > 0 && span > remaining) {
      rows.push(current);
      current = [];
      remaining = 12;
    }

    current.push(field);
    remaining -= span;

    if (remaining <= 0) {
      rows.push(current);
      current = [];
      remaining = 12;
    }
  }

  if (current.length > 0) rows.push(current);
  return rows;
}

/** Para onde o valor do campo vai no envio. */
export type FormFieldMapping =
  | { kind: "default"; key: "nome" | "email" | "telefone" }
  | { kind: "custom"; fieldId: string }
  | { kind: "extra" };

export interface FormField {
  id: string;
  type: FormFieldType;
  name: string;
  label: string;
  layoutWidth?: FormFieldWidth;
  lineBreakBefore?: boolean;
  placeholder?: string;
  required: boolean;
  options?: FormFieldOption[];
  defaultValue?: string;
  helpText?: string;
  /** Mapeamento p/ o cadastro do contato (default/custom) ou "Outras informações" (extra). */
  mapping?: FormFieldMapping;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  conditionalLogic?: FormFieldConditionalLogic;
}

export interface FormStep {
  id?: string;
  title: string;
  fieldIds?: string[];
  fields?: string[];
  conditionalLogic?: FormFieldConditionalLogic;
  routingRules?: FormStepRoutingRule[];
}

export interface FormAutoWinnerConfig {
  enabled: boolean;
  minDays: number;
  minViews: number;
  appliedAt?: string | null;
  winnerVariantId?: string | null;
}

export interface FormSettings {
  multiStep: boolean;
  steps?: FormStep[];
  showProgressBar: boolean;
  allowDuplicates: boolean;
  requireEmailVerification: boolean;
  conversational?: boolean;
  progressiveProfiling?: boolean;
  fieldGap?: FormFieldGap;
  customerTags?: string[];
  createActivityOnSubmit?: boolean;
  activityTitle?: string;
  activityBody?: string;
  abAutoWinner?: FormAutoWinnerConfig;
}

export interface FormTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: number;
  logoUrl?: string;
}

/** Registro de formulário no formato consumido pela aplicação (camelCase). */
export interface MarketingFormRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string | null;
  description: string | null;
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
  allowedDomains: string[];
  isActive: boolean;
  emailTemplateId: string | null;
  submitWebhookUrl: string | null;
  submitRedirectUrl: string | null;
  submitMessage: string;
  totalViews: number;
  totalSubmissions: number;
  createdAt: string;
  updatedAt: string;
}

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  select: "Lista suspensa",
  checkbox: "Caixas de seleção",
  radio: "Múltipla escolha",
  date: "Data",
  textarea: "Texto longo",
  hidden: "Campo oculto",
  title: "Título",
  description: "Descrição",
  image: "Imagem",
};

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  multiStep: false,
  showProgressBar: true,
  allowDuplicates: true,
  requireEmailVerification: false,
  conversational: false,
  progressiveProfiling: true,
  fieldGap: 3,
  customerTags: [],
  createActivityOnSubmit: false,
};

export const DEFAULT_FORM_THEME: FormTheme = {
  primaryColor: "#6d28d9",
  backgroundColor: "#ffffff",
  textColor: "#0f172a",
  fontFamily: "Inter, system-ui, sans-serif",
  borderRadius: 8,
};

const FIELDS_WITH_OPTIONS: ReadonlySet<FormFieldType> = new Set(["select", "radio", "checkbox"]);

export function fieldNeedsOptions(type: FormFieldType): boolean {
  return FIELDS_WITH_OPTIONS.has(type);
}

/** Slug curto único o suficiente para nomear campos novos. */
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Identificador (name) sugerido a partir de um rótulo. */
export function slugifyFieldName(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "campo_$1");
  return base || `campo_${shortId()}`;
}

export function slugifyFormName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}-${shortId()}` : `form-${shortId()}`;
}

/** Cria um campo novo com defaults sãos para o tipo informado. */
export function createDefaultField(type: FormFieldType): FormField {
  const id = `field_${shortId()}`;
  const label = FIELD_TYPE_LABELS[type] || "Campo";
  const field: FormField = {
    id,
    type,
    name: `${type}_${shortId()}`,
    label,
    layoutWidth: 100,
    lineBreakBefore: false,
    required: false,
  };

  if (isVisualField(type)) {
    if (type === "title") {
      field.label = "Título do Formulário";
    } else if (type === "description") {
      field.label = "Descrição do Formulário";
      field.defaultValue = "Preencha os campos abaixo para continuar.";
    } else if (type === "image") {
      field.label = "Imagem";
      field.defaultValue = "";
    }
    return field;
  }

  field.mapping = { kind: "extra" };
  if (fieldNeedsOptions(type)) {
    field.options = [
      { label: "Opção 1", value: "opcao_1" },
      { label: "Opção 2", value: "opcao_2" },
    ];
  }
  return field;
}

export function createDefaultFormStep(index: number, fieldIds: string[] = []): FormStep {
  return {
    id: `step_${shortId()}`,
    title: `Etapa ${index + 1}`,
    fieldIds,
  };
}

export function stepFieldIds(step: FormStep | null | undefined): string[] {
  if (!step) return [];
  if (Array.isArray(step.fieldIds)) return step.fieldIds;
  if (Array.isArray(step.fields)) return step.fields;
  return [];
}

export function stepRoutingRules(step: FormStep | null | undefined): FormStepRoutingRule[] {
  return Array.isArray(step?.routingRules) ? step!.routingRules! : [];
}

export function buildDefaultFormSteps(fields: FormField[]): FormStep[] {
  const visibleFields = fields.filter((field) => field.type !== "hidden");
  if (visibleFields.length === 0) {
    return [createDefaultFormStep(0, [])];
  }

  const groups: FormField[][] = [];
  let current: FormField[] = [];
  for (const field of visibleFields) {
    if (field.lineBreakBefore && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(field);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, index) => createDefaultFormStep(index, group.map((field) => field.id)));
}

function normalizeConditionValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function compareValues(actual: string, expected: string, operator: FormConditionOperator): boolean {
  const actualNumber = Number(actual.replace(",", "."));
  const expectedNumber = Number(expected.replace(",", "."));
  const canCompareNumbers = Number.isFinite(actualNumber) && Number.isFinite(expectedNumber);

  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "contains":
      return actual.includes(expected);
    case "not_contains":
      return !actual.includes(expected);
    case "greater_than":
      if (canCompareNumbers) return actualNumber > expectedNumber;
      return actual > expected;
    case "less_than":
      if (canCompareNumbers) return actualNumber < expectedNumber;
      return actual < expected;
    default:
      return true;
  }
}

export function fieldConditionMatches(
  fieldValue: unknown,
  condition: FormFieldCondition,
  values: Record<string, unknown> = {},
): boolean {
  if (condition.operator === "is_empty") {
    if (fieldValue === undefined || fieldValue === null) return true;
    if (Array.isArray(fieldValue)) return fieldValue.length === 0;
    return String(fieldValue).trim() === "";
  }

  if (condition.operator === "is_not_empty") {
    return !fieldConditionMatches(fieldValue, { ...condition, operator: "is_empty" });
  }

  const compareValue =
    condition.compareTarget?.kind === "field"
      ? values[condition.compareTarget.field]
      : condition.compareTarget?.kind === "value"
        ? condition.compareTarget.value
        : condition.value;
  const actual = Array.isArray(fieldValue)
    ? fieldValue.map((item) => normalizeConditionValue(item)).join(" | ")
    : normalizeConditionValue(fieldValue);
  const expectedValue = normalizeConditionValue(compareValue);

  if (!actual) {
    return false;
  }

  return compareValues(actual, expectedValue, condition.operator);
}

export function conditionGroupMatches(
  group: FormFieldConditionGroup,
  values: Record<string, unknown>,
): boolean {
  if (group.conditions.length === 0) return true;
  if (group.join === "any") {
    return group.conditions.some((condition) => fieldConditionMatches(values[condition.field], condition, values));
  }
  return group.conditions.every((condition) => fieldConditionMatches(values[condition.field], condition, values));
}

export function conditionalLogicMatches(
  logic: FormFieldConditionalLogic | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!logic || logic.groups.length === 0) return true;
  return logic.groups.some((group) => conditionGroupMatches(group, values));
}

export function isFormFieldVisible(field: FormField, values: Record<string, unknown>): boolean {
  return conditionalLogicMatches(field.conditionalLogic, values);
}

export function isFormStepVisible(step: FormStep, values: Record<string, unknown>): boolean {
  return conditionalLogicMatches(step.conditionalLogic, values);
}

export function getVisibleFormFields(fields: FormField[], values: Record<string, unknown>): FormField[] {
  return fields.filter((field) => field.type === "hidden" || isFormFieldVisible(field, values));
}

// ----------------------------------------------------- Campos do contato

export type DefaultContactKey = "nome" | "email" | "telefone";

export const DEFAULT_CONTACT_FIELDS: { key: DefaultContactKey; label: string; type: FormFieldType }[] = [
  { key: "nome", label: "Nome", type: "text" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "telefone", label: "Telefone", type: "phone" },
];

const DEFAULT_CONTACT_PLACEHOLDERS: Record<DefaultContactKey, string> = {
  nome: "Seu nome",
  email: "voce@exemplo.com",
  telefone: "(11) 99999-9999",
};

/** Cria um campo de formulário mapeado a um campo padrão do contato. */
export function buildDefaultContactField(key: DefaultContactKey): FormField {
  const def = DEFAULT_CONTACT_FIELDS.find((d) => d.key === key)!;
  return {
    id: `field_${shortId()}`,
    type: def.type,
    name: key,
    label: def.label,
    layoutWidth: 100,
    lineBreakBefore: false,
    placeholder: DEFAULT_CONTACT_PLACEHOLDERS[key],
    required: key !== "email" ? true : false,
    mapping: { kind: "default", key },
  };
}

/** Converte o tipo (kind) de um campo personalizado de contato em tipo/opções de formulário. */
export function customFieldKindToFormField(
  kind: string,
  options: string[] = [],
): { type: FormFieldType; options?: FormFieldOption[] } {
  switch (kind) {
    case "lista":
      return { type: "select", options: options.map((o) => ({ label: o, value: o })) };
    case "booleano":
      return {
        type: "select",
        options: [
          { label: "Sim", value: "1" },
          { label: "Não", value: "0" },
        ],
      };
    case "data":
      return { type: "date" };
    case "email":
      return { type: "email" };
    case "telefone":
      return { type: "phone" };
    case "texto_longo":
      return { type: "textarea" };
    default:
      return { type: "text" };
  }
}

/** Cria um campo de formulário mapeado a um campo personalizado do contato. */
export function buildCustomContactField(field: {
  id: string;
  nome: string;
  kind: string;
  options?: string[];
}): FormField {
  const { type, options } = customFieldKindToFormField(field.kind, field.options ?? []);
  const result: FormField = {
    id: `field_${shortId()}`,
    type,
    name: `c_${field.id.replace(/-/g, "").slice(0, 12)}`,
    label: field.nome,
    required: false,
    mapping: { kind: "custom", fieldId: field.id },
  };
  if (options) result.options = options;
  return result;
}
