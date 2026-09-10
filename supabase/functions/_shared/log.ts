/** Log JSON estruturado para Edge Functions (Supabase / Deno). */
export function logStructured(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    level,
    message,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
