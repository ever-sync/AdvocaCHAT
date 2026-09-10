// Logica pura de backoff/retry compartilhada pelos workers (sem dependencia de
// Deno), para poder ser testada sob Node/vitest alem de rodar nas edge functions.

/** Minutos de espera antes do proximo retry de um job de fluxo, por tentativa. */
export const FLOW_RETRY_DELAY_MINUTES = [0, 1, 5, 30, 120] as const;

/**
 * Retorna o atraso (em minutos) para a proxima tentativa de um job de fluxo.
 * `attempts` e o numero da tentativa ja consumida (>= 1 apos o claim).
 */
export function flowRetryDelayMinutes(attempts: number): number {
  const i = Math.min(Math.max(attempts, 0), FLOW_RETRY_DELAY_MINUTES.length - 1);
  return FLOW_RETRY_DELAY_MINUTES[i] ?? 120;
}

/**
 * Backoff (em segundos) para a proxima tentativa de entrega de webhook.
 * Cresce de forma quadratica e satura em 1 hora. `attempts` e o numero da
 * tentativa ja consumida (>= 1).
 */
export function webhookBackoffSeconds(attempts: number): number {
  const a = Math.max(attempts, 1);
  return Math.min(a * a * 30, 3600);
}
