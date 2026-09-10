import type { ReactNode } from "react";

/**
 * Quebra um texto pelos trechos que casam com `query` (case-insensitive)
 * e envolve cada ocorrência num `<mark>`. Sem regex — usamos `indexOf`
 * em loop pra evitar escaping/perf surpresas em queries longas com
 * caracteres especiais.
 *
 * Retorna o texto original (sem ReactNode wrapper) quando a query
 * é vazia, pra preservar a forma da prop no consumidor.
 */
export function highlightTextMatches(text: string, query: string): ReactNode {
  if (!text) return text;
  const needle = query.trim();
  if (!needle) return text;

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  if (!lowerText.includes(lowerNeedle)) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerNeedle, cursor);
    if (idx === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark
        key={`m-${idx}`}
        className="rounded-sm bg-yellow-200 px-0.5 text-yellow-900 dark:bg-yellow-500/40 dark:text-yellow-50"
      >
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    cursor = idx + needle.length;
  }

  return <>{parts}</>;
}

/** Retorna true se `text` contém `query` (case-insensitive, trim). */
export function textContainsQuery(text: string | null | undefined, query: string): boolean {
  if (!text) return false;
  const needle = query.trim();
  if (!needle) return false;
  return text.toLowerCase().includes(needle.toLowerCase());
}
