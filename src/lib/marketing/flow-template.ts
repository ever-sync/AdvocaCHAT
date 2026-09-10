// Motor de template e merge de contexto dos fluxos (Fase 3 — dados entre passos).
//
// Esta e a copia CANONICA e TESTAVEL da logica que o worker
// (supabase/functions/marketing-flow-worker/index.ts) reimplementa inline. O
// boundary Deno x Vite impede import direto, entao mantemos as duas em sincronia
// (mesmo padrao de flow-graph.ts <-> buildLinearNextMap). Os testes em
// flow-template.test.ts cobrem o algoritmo.

export type TemplateContext = {
  customer: Record<string, unknown> | null;
  negotiation: Record<string, unknown> | null;
  context: Record<string, unknown>;
};

/** Merge profundo de objetos planos (arrays e escalares sao substituidos). */
export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const prev = out[key];
    if (
      value && typeof value === "object" && !Array.isArray(value) &&
      prev && typeof prev === "object" && !Array.isArray(prev)
    ) {
      out[key] = deepMerge(prev as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Formatadores de template: date/datetime (pt-BR), currency (BRL), upper, lower. */
export function applyTemplateFilter(value: unknown, filter: string): string {
  const name = filter.trim().toLowerCase();
  if (name === "upper") return String(value ?? "").toUpperCase();
  if (name === "lower") return String(value ?? "").toLowerCase();
  if (name === "date" || name === "datetime") {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value ?? "");
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      ...(name === "datetime" ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  }
  if (name === "currency") {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return String(value ?? "");
}

/**
 * Renderiza `{{cliente.nome}}`, `{{negociacao.titulo}}`, `{{contexto.X}}`.
 * Filtros com pipe: `{{x | "padrão"}}` (fallback p/ valor vazio) e formatadores
 * `{{valor | currency}}` / `{{data | date}}` / upper / lower.
 */
export function renderTemplate(text: string, ctx: TemplateContext): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
    const segments = raw.split("|").map((s) => s.trim());
    const path = segments[0];
    const filters = segments.slice(1);

    const parts = path.split(".");
    const [root, ...rest] = parts;
    let source: unknown;
    if (root === "cliente") source = ctx.customer ?? {};
    else if (root === "negociacao") source = ctx.negotiation ?? {};
    else if (root === "contexto") source = ctx.context ?? {};
    else source = undefined;
    if (source !== undefined) {
      for (const part of rest) {
        if (source == null || typeof source !== "object") {
          source = undefined;
          break;
        }
        source = (source as Record<string, unknown>)[part];
      }
    }

    let fallback = "";
    const formatters: string[] = [];
    for (const f of filters) {
      const quoted = f.match(/^["'](.*)["']$/);
      if (quoted) fallback = quoted[1];
      else if (f) formatters.push(f);
    }

    const isEmpty =
      source == null ||
      (typeof source !== "object" && String(source) === "") ||
      (typeof source === "object" && Object.keys(source as object).length === 0);
    if (isEmpty) return fallback;

    if (formatters.length > 0) {
      let out: unknown = source;
      for (const fmt of formatters) out = applyTemplateFilter(out, fmt);
      return String(out);
    }
    return typeof source === "object" ? JSON.stringify(source) : String(source);
  });
}
