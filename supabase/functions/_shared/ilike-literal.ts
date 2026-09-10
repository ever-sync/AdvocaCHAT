/**
 * Escapes `%`, `_` e `\` para texto literal em filtros PostgREST `.ilike`.
 * Mesma semântica que `escapeIlikeLiteralForPostgrest` no app (src/lib/customer-search-sanitize.ts).
 */
export function escapeIlikeLiteralForPostgrest(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
