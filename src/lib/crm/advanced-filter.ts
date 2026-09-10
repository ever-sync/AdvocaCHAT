import type { Customer, CrmNegotiation, CrmNegotiationStatus } from "@/types/domain";

/**
 * Filtro avançado do CRM: estrutura plana (sem grupos aninhados) — combinador
 * AND/OR de N regras. Cada regra é (campo, operador, valor). Em v1 cobre os
 * casos práticos sem expor complexidade de árvore.
 *
 * URL state: serializa pra JSON e codifica em base64 url-safe na key `?adv=`.
 * Saved views guardam o objeto direto no JSONB.
 */

export type AdvancedFilterFieldId =
  | "title"
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | "assignee"
  | "status"
  | "stage"
  | "qualification"
  | "totalValue"
  | "leadScore"
  | "createdAt"
  | "lastInteractionAt"
  | "nextTaskAt"
  | "hasOpenTask";

export type AdvancedFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "starts_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "is_empty"
  | "is_not_empty"
  | "older_than_days"
  | "within_last_days"
  | "is_overdue"
  | "is_future"
  | "is_true"
  | "is_false";

export type AdvancedFilterValueType = "text" | "number" | "date" | "select" | "bool" | "none";

export type AdvancedFilterRule = {
  id: string;
  field: AdvancedFilterFieldId;
  operator: AdvancedFilterOperator;
  /** Para operadores unários (is_empty, is_overdue, etc.) value é ignorado. */
  value?: string | number | string[] | null;
  /** Apenas para "between": segundo valor (inclusivo). */
  value2?: string | number | null;
};

export type AdvancedFilter = {
  op: "and" | "or";
  rules: AdvancedFilterRule[];
};

export const ADVANCED_FILTER_FIELD_META: Record<
  AdvancedFilterFieldId,
  {
    label: string;
    valueType: AdvancedFilterValueType;
    operators: AdvancedFilterOperator[];
    helpText?: string;
  }
> = {
  title: {
    label: "Título do negócio",
    valueType: "text",
    operators: ["contains", "equals", "starts_with", "not_equals"],
  },
  customerName: {
    label: "Nome do cliente",
    valueType: "text",
    operators: ["contains", "equals", "starts_with"],
  },
  customerPhone: {
    label: "Telefone do cliente",
    valueType: "text",
    operators: ["contains", "equals"],
    helpText: "Compara apenas dígitos (DDD+número).",
  },
  customerEmail: {
    label: "E-mail do cliente",
    valueType: "text",
    operators: ["contains", "equals", "is_empty", "is_not_empty"],
  },
  assignee: {
    label: "Responsável",
    valueType: "select",
    operators: ["equals", "not_equals", "in", "is_empty", "is_not_empty"],
    helpText: "Vazio = pool.",
  },
  status: {
    label: "Status",
    valueType: "select",
    operators: ["equals", "not_equals", "in"],
  },
  stage: {
    label: "Etapa do funil",
    valueType: "select",
    operators: ["equals", "not_equals", "in"],
  },
  qualification: {
    label: "Qualificação (estrelas)",
    valueType: "number",
    operators: ["equals", "gte", "lte", "between"],
  },
  totalValue: {
    label: "Valor total (R$)",
    valueType: "number",
    operators: ["gte", "lte", "between", "equals"],
  },
  leadScore: {
    label: "Lead score (0–100)",
    valueType: "number",
    operators: ["gte", "lte", "between", "equals"],
  },
  createdAt: {
    label: "Criada em",
    valueType: "date",
    operators: ["older_than_days", "within_last_days", "between"],
  },
  lastInteractionAt: {
    label: "Última interação",
    valueType: "date",
    operators: ["older_than_days", "within_last_days", "is_empty"],
  },
  nextTaskAt: {
    label: "Próxima tarefa",
    valueType: "date",
    operators: ["is_overdue", "is_future", "within_last_days", "is_empty"],
  },
  hasOpenTask: {
    label: "Tem tarefa futura?",
    valueType: "bool",
    operators: ["is_true", "is_false"],
  },
};

export const ADVANCED_FILTER_OPERATOR_LABEL: Record<AdvancedFilterOperator, string> = {
  equals: "é igual a",
  not_equals: "não é",
  contains: "contém",
  starts_with: "começa com",
  gt: "maior que",
  gte: "≥",
  lt: "menor que",
  lte: "≤",
  between: "entre",
  in: "está em",
  is_empty: "está vazio",
  is_not_empty: "não está vazio",
  older_than_days: "há mais de X dias",
  within_last_days: "nos últimos X dias",
  is_overdue: "está atrasada",
  is_future: "é futura",
  is_true: "sim",
  is_false: "não",
};

const UNARY_OPS = new Set<AdvancedFilterOperator>([
  "is_empty",
  "is_not_empty",
  "is_overdue",
  "is_future",
  "is_true",
  "is_false",
]);

export function isUnaryOperator(op: AdvancedFilterOperator): boolean {
  return UNARY_OPS.has(op);
}

export function operatorNeedsSecondValue(op: AdvancedFilterOperator): boolean {
  return op === "between";
}

// ─── Codec URL-safe base64 ────────────────────────────────────────────────────

export function encodeAdvancedFilter(filter: AdvancedFilter | null): string | null {
  if (!filter || filter.rules.length === 0) return null;
  try {
    const json = JSON.stringify(filter);
    // btoa só aceita latin1 — usamos encodeURIComponent pra cobrir UTF-8.
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return null;
  }
}

export function decodeAdvancedFilter(encoded: string | null | undefined): AdvancedFilter | null {
  if (!encoded) return null;
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = decodeURIComponent(escape(atob(b64 + pad)));
    const parsed = JSON.parse(json) as AdvancedFilter;
    if (parsed && (parsed.op === "and" || parsed.op === "or") && Array.isArray(parsed.rules)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

export type AdvancedFilterContext = {
  customerById?: Map<string, Customer>;
  scoresByNegId?: Map<string, { total: number }>;
  nowMs?: number;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asTextLower(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function ageInDays(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 86_400_000;
}

function ruleValuesAsList(rule: AdvancedFilterRule): string[] {
  if (Array.isArray(rule.value)) return rule.value.map(String);
  if (rule.value == null) return [];
  return [String(rule.value)];
}

export function evaluateRule(
  neg: CrmNegotiation,
  rule: AdvancedFilterRule,
  ctx: AdvancedFilterContext = {},
): boolean {
  const now = ctx.nowMs ?? Date.now();
  const customer = neg.customerId ? ctx.customerById?.get(neg.customerId) : undefined;

  const getText = (): string => {
    switch (rule.field) {
      case "title":
        return asTextLower(neg.title);
      case "customerName":
        return asTextLower(customer?.nome);
      case "customerPhone":
        return asTextLower(
          customer?.phoneDigits ??
            customer?.phoneE164 ??
            customer?.telefone ??
            "",
        ).replace(/\D/g, "");
      case "customerEmail":
        return asTextLower(customer?.email);
      case "assignee":
        return asTextLower(neg.assigneeId);
      case "status":
        return asTextLower(neg.status);
      case "stage":
        return asTextLower(neg.stageId);
      default:
        return "";
    }
  };

  const getNumber = (): number | null => {
    switch (rule.field) {
      case "qualification":
        return Number(neg.qualification ?? 0);
      case "totalValue":
        return Number(neg.totalValue ?? 0);
      case "leadScore":
        return ctx.scoresByNegId?.get(neg.id)?.total ?? 0;
      default:
        return null;
    }
  };

  const getIso = (): string | null | undefined => {
    switch (rule.field) {
      case "createdAt":
        return neg.createdAt;
      case "lastInteractionAt":
        return neg.lastInteractionAt ?? neg.lastContactAt;
      case "nextTaskAt":
        return neg.nextTaskAt;
      default:
        return null;
    }
  };

  switch (rule.operator) {
    case "equals":
      if (rule.field === "qualification" || rule.field === "totalValue" || rule.field === "leadScore") {
        const n = getNumber();
        const target = asNumber(rule.value);
        return n != null && target != null && n === target;
      }
      return getText() === asTextLower(rule.value);
    case "not_equals":
      if (rule.field === "qualification" || rule.field === "totalValue" || rule.field === "leadScore") {
        const n = getNumber();
        const target = asNumber(rule.value);
        return n != null && target != null && n !== target;
      }
      return getText() !== asTextLower(rule.value);
    case "contains":
      return getText().includes(asTextLower(rule.value));
    case "starts_with":
      return getText().startsWith(asTextLower(rule.value));
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const n = getNumber();
      const target = asNumber(rule.value);
      if (n == null || target == null) return false;
      if (rule.operator === "gt") return n > target;
      if (rule.operator === "gte") return n >= target;
      if (rule.operator === "lt") return n < target;
      return n <= target;
    }
    case "between": {
      const n = getNumber();
      const a = asNumber(rule.value);
      const b = asNumber(rule.value2 ?? null);
      if (n == null || a == null || b == null) return false;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return n >= lo && n <= hi;
    }
    case "in": {
      const list = ruleValuesAsList(rule).map(asTextLower);
      if (list.length === 0) return false;
      return list.includes(getText());
    }
    case "is_empty": {
      if (rule.field === "assignee") {
        return !neg.assigneeId || !neg.assigneeId.trim();
      }
      if (rule.field === "lastInteractionAt" || rule.field === "nextTaskAt") {
        return !getIso();
      }
      return getText().length === 0;
    }
    case "is_not_empty": {
      if (rule.field === "assignee") {
        return Boolean(neg.assigneeId && neg.assigneeId.trim());
      }
      if (rule.field === "lastInteractionAt" || rule.field === "nextTaskAt") {
        return Boolean(getIso());
      }
      return getText().length > 0;
    }
    case "older_than_days": {
      const days = ageInDays(getIso() ?? null, now);
      const target = asNumber(rule.value);
      if (days == null || target == null) return false;
      return days > target;
    }
    case "within_last_days": {
      const days = ageInDays(getIso() ?? null, now);
      const target = asNumber(rule.value);
      if (days == null || target == null) return false;
      return days >= 0 && days <= target;
    }
    case "is_overdue": {
      if (rule.field !== "nextTaskAt") return false;
      if (!neg.nextTaskAt) return false;
      const t = new Date(neg.nextTaskAt).getTime();
      return Number.isFinite(t) && t < now;
    }
    case "is_future": {
      if (rule.field !== "nextTaskAt") return false;
      if (!neg.nextTaskAt) return false;
      const t = new Date(neg.nextTaskAt).getTime();
      return Number.isFinite(t) && t >= now;
    }
    case "is_true":
    case "is_false": {
      if (rule.field === "hasOpenTask") {
        const has = Boolean(
          neg.nextTaskAt && Number.isFinite(new Date(neg.nextTaskAt).getTime())
            && new Date(neg.nextTaskAt).getTime() >= now,
        );
        return rule.operator === "is_true" ? has : !has;
      }
      return false;
    }
    default:
      return true;
  }
}

export function evaluateAdvancedFilter(
  neg: CrmNegotiation,
  filter: AdvancedFilter | null,
  ctx: AdvancedFilterContext = {},
): boolean {
  if (!filter || filter.rules.length === 0) return true;
  if (filter.op === "and") {
    return filter.rules.every((r) => evaluateRule(neg, r, ctx));
  }
  return filter.rules.some((r) => evaluateRule(neg, r, ctx));
}

export function isAdvancedFilterActive(filter: AdvancedFilter | null | undefined): boolean {
  return Boolean(filter && filter.rules.length > 0);
}

export const STATUS_VALUES: { id: CrmNegotiationStatus; label: string }[] = [
  { id: "em_andamento", label: "Em andamento" },
  { id: "vendido", label: "Vendido" },
  { id: "perdido", label: "Perdido" },
  { id: "pausado", label: "Pausado" },
];

export function makeRuleId(): string {
  return `r${Math.random().toString(36).slice(2, 9)}`;
}
