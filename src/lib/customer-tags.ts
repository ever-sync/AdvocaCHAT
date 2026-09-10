/** Tags persistidas em `customer.source_columns` (JSON array de strings). */
export const CUSTOMER_TAGS_SOURCE_KEY = "wchat_customer_tags";

export function parseCustomerTags(sourceColumns?: Record<string, string> | null): string[] {
  const raw = sourceColumns?.[CUSTOMER_TAGS_SOURCE_KEY]?.trim();
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch {
    /* formato legado: separadores */
  }
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeCustomerTags(tags: string[]): string {
  const normalized = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  return JSON.stringify(normalized);
}
