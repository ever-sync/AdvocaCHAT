/**
 * Constrói um filtro PostgREST `.or()` para buscar com `ilike` em várias colunas
 * a partir de uma string vinda do usuário, sem permitir injeção de operadores.
 *
 * Proteções aplicadas:
 * - Bound de comprimento (default 64 chars) — impede payloads enormes.
 * - Remove curingas LIKE (`%`, `_`) que viriam do usuário (mantemos só os nossos).
 * - Escapa `\` e `"` que são os únicos chars que precisam ser escapados dentro
 *   de uma string entre aspas no PostgREST.
 * - Envolve o valor em aspas duplas no filtro — assim parênteses, vírgulas,
 *   pontos e demais separadores PostgREST viram literais.
 *
 * Retorna `null` quando a busca fica vazia após o saneamento.
 */
export function buildIlikeOrFilter(
  value: string,
  columns: readonly string[],
  maxLength = 64,
): string | null {
  const trimmed = String(value ?? "").trim().slice(0, maxLength);
  if (!trimmed) return null;
  const sanitized = trimmed
    .replace(/[%_]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  if (!sanitized.trim()) return null;
  return columns.map((col) => `${col}.ilike."%${sanitized}%"`).join(",");
}
