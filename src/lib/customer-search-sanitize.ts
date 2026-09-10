/**
 * Normaliza o termo antes de embutir em filtros PostgREST `ilike`.
 * - Em `.or(...)`, vírgulas quebram o parser (separam condições).
 * - `%`, `_` e `\` alteram o ILIKE (curingas / escape).
 * Uso também em `.ilike` de coluna única (bairro, cidade, etc.).
 */
export function sanitizeCustomerSearchForPostgrestOrIlike(raw: string): string {
  return raw
    .trim()
    .replace(/,/g, " ")
    .replace(/[%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Escapes `%`, `_` e `\` para uso como texto literal em um filtro PostgREST `.ilike`
 * (evita curingas acidentais quando o valor não é um termo de busca livre).
 */
export function escapeIlikeLiteralForPostgrest(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
