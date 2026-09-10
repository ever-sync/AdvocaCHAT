import { z } from "zod";

/**
 * Validador seguro para colunas JSONB flexíveis (ex: other_info, source_columns).
 *
 * Ele aceita qualquer coisa via .catch({}), mas ativamente varre o objeto
 * permitindo apenas valores primitivos (string, number, boolean) e faz cast para string.
 * Sub-objetos e arrays são removidos para impedir crashes no React.
 */
export const SafeStringRecordSchema = z
  .record(z.string(), z.any())
  .transform((obj) => {
    const out: Record<string, string> = {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return out;
    }

    for (const [k, v] of Object.entries(obj)) {
      if (v != null && typeof v !== "object") {
        out[k] = String(v);
      }
    }
    return out;
  })
  .catch({});
