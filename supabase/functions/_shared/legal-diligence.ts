import { PortalError } from "./legal-portal.ts";

/** Hard byte/time cap, including a stalled stream or a never-resolving cancel. */
export async function diligenceBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximum: number,
  timeoutMs = 5000,
): Promise<Uint8Array> {
  if (!stream) throw new PortalError(400, "Solicitação vazia.");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > maximum) {
            throw new PortalError(413, "Solicitação muito grande.");
          }
          chunks.push(value);
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new PortalError(408, "O envio excedeu o tempo disponível.")),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function diligenceBody(
  request: Request,
  limit: number,
): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith(
      "application/json",
    )
  ) throw new PortalError(415, "Envie uma solicitação JSON.");
  const bytes = await diligenceBytes(request.body, limit);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    if (
      !value || typeof value !== "object" || Array.isArray(value) ||
      text.includes("\u0000")
    ) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PortalError(400, "Solicitação inválida.");
  }
}
