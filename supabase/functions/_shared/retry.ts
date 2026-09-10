/** Aguarda com atraso pseudo-aleatorio (jitter) para evitar thundering herd em retries. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelayMs(attemptIndex: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attemptIndex);
  return Math.floor(exp * (0.5 + Math.random() * 0.5));
}

export type WithRetriesOptions = {
  /** Padrao: 3 */
  maxAttempts?: number;
  /** Base do backoff exponencial em ms (tentativa 0). Padrao: 400 */
  baseDelayMs?: number;
  /** Teto do delay em ms. Padrao: 8000 */
  maxDelayMs?: number;
  /**
   * Decide se o erro deve disparar nova tentativa. Por padrao retenta tudo,
   * exceto erros que carregam a flag `retryable === false` (ex.: UazapiHttpError 4xx).
   */
  shouldRetry?: (error: unknown, attemptIndex: number) => boolean;
};

/**
 * Default: respeita `error.retryable` quando presente; caso contrario retenta.
 */
function defaultShouldRetry(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable?: boolean }).retryable !== false;
  }
  return true;
}

/**
 * Executa `operation` ate `maxAttempts` vezes em caso de falha, com backoff exponencial + jitter entre tentativas.
 *
 * Erros marcados como nao-retentaveis (ex.: 4xx em `UazapiHttpError`) abortam imediatamente.
 */
export async function withRetries<T>(operation: () => Promise<T>, options?: WithRetriesOptions): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 400;
  const maxDelayMs = options?.maxDelayMs ?? 8000;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const hasMoreAttempts = attempt < maxAttempts - 1;
      if (!hasMoreAttempts || !shouldRetry(error, attempt)) {
        break;
      }
      await sleep(jitteredDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}
