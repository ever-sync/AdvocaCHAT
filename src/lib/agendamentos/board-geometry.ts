// Geometria da grade de agendamentos: conversões entre minutos-do-dia e pixels,
// e snap à granularidade. Usado pelo SchedulingBoard (clique-no-horário, drag).

export const START_HOUR = 7;
export const END_HOUR = 21;
export const PX_PER_MIN = 0.9;

export const DAY_START_MIN = START_HOUR * 60;
export const DAY_END_MIN = END_HOUR * 60;
export const TOTAL_MIN = DAY_END_MIN - DAY_START_MIN;
export const BODY_HEIGHT = TOTAL_MIN * PX_PER_MIN;

/** Minuto-do-dia (0..1440) → posição vertical (px) na grade. */
export function minutesToY(min: number): number {
  return (min - DAY_START_MIN) * PX_PER_MIN;
}

/** Posição vertical (px) → minuto-do-dia, limitado à janela da grade. */
export function yToMinutes(y: number): number {
  const min = DAY_START_MIN + y / PX_PER_MIN;
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, min));
}

/** Arredonda minutos ao passo de granularidade (ex.: 15). */
export function snapMinutes(min: number, granularity: number): number {
  const g = granularity > 0 ? granularity : 15;
  return Math.round(min / g) * g;
}

/** Lista de horas cheias exibidas no gutter. */
export function hourMarks(): number[] {
  const out: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) out.push(h);
  return out;
}

/** Minuto-do-dia local de um instante ISO (tz do navegador). */
export function localMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
