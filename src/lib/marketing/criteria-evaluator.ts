// Avaliador TypeScript de condicoes do fluxo (Fase 7 do plano completo).
// Espelha _mfc_apply_operator de 20260628140000_marketing_flow_triggers.sql.
// Usado pelo SimulatorDialog. O worker tem seu proprio mirror inline (Deno).
//
// Operadores nao-suportados ou erro de parse -> failsafe true (mesmo
// comportamento que o lado PG).

export type EvalContext = {
  cliente?: Record<string, unknown>;
  negociacao?: Record<string, unknown>;
  contexto?: Record<string, unknown>;
};

export function readFieldPath(path: string, ctx: EvalContext): unknown {
  const parts = (path ?? "").split(".");
  if (parts.length === 0 || !parts[0]) return undefined;
  const [root, ...rest] = parts;
  let source: unknown;
  if (root === "cliente") source = ctx.cliente;
  else if (root === "negociacao") source = ctx.negociacao;
  else if (root === "contexto") source = ctx.contexto;
  else return undefined;
  for (const part of rest) {
    if (source == null || typeof source !== "object") return undefined;
    source = (source as Record<string, unknown>)[part];
  }
  return source;
}

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function applyOperator(op: string, lhs: unknown, rhs: unknown): boolean {
  switch (op) {
    case "exists":
      return lhs != null && lhs !== "";
    case "not_exists":
      return lhs == null || lhs === "";
    case "equals":
      return toText(lhs) === toText(rhs);
    case "not_equals":
      return toText(lhs) !== toText(rhs);
    case "contains": {
      const a = toText(lhs).toLowerCase();
      const b = toText(rhs).toLowerCase();
      return a.length > 0 && b.length > 0 && a.includes(b);
    }
    case "not_contains": {
      const a = toText(lhs).toLowerCase();
      const b = toText(rhs).toLowerCase();
      if (!a || !b) return true;
      return !a.includes(b);
    }
    case "greater_than": {
      const a = toNumber(lhs);
      const b = toNumber(rhs);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "less_than": {
      const a = toNumber(lhs);
      const b = toNumber(rhs);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case "before": {
      const a = new Date(toText(lhs)).getTime();
      const b = new Date(toText(rhs)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case "after": {
      const a = new Date(toText(lhs)).getTime();
      const b = new Date(toText(rhs)).getTime();
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case "in":
      return Array.isArray(rhs) && rhs.some((v) => toText(v) === toText(lhs));
    case "not_in":
      return !Array.isArray(rhs) || !rhs.some((v) => toText(v) === toText(lhs));
    case "between": {
      if (!Array.isArray(rhs) || rhs.length < 2) return false;
      const a = toNumber(lhs);
      const lo = toNumber(rhs[0]);
      const hi = toNumber(rhs[1]);
      return Number.isFinite(a) && Number.isFinite(lo) && Number.isFinite(hi) && a >= lo && a <= hi;
    }
    default:
      // failsafe true
      return true;
  }
}

export function evaluateSimpleCondition(
  field: string,
  operator: string,
  value: unknown,
  ctx: EvalContext,
): boolean {
  return applyOperator(operator, readFieldPath(field, ctx), value);
}
