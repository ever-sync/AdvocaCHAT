// Horário de atendimento (business hours) — tipos e helpers compartilhados entre
// a API de configurações, a tela de Configurações e o painel de atendimento.
// Espelha o JSON gravado em tenant_settings.business_hours e consumido por
// public.add_business_minutes() / is_within_business_hours() no banco.

export type BusinessHoursInterval = {
  /** 0 = domingo … 6 = sábado (igual a Date.getDay() / extract(dow)). */
  weekday: number;
  /** "HH:MM" 24h. */
  start: string;
  /** "HH:MM" 24h. */
  end: string;
};

export type BusinessHours = {
  enabled: boolean;
  timezone: string;
  intervals: BusinessHoursInterval[];
};

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Fusos comuns no Brasil; o primeiro é o default. */
export const BUSINESS_TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
] as const;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false,
  timezone: "America/Sao_Paulo",
  intervals: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export function normalizeBusinessHours(value: unknown): BusinessHours {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_BUSINESS_HOURS, intervals: DEFAULT_BUSINESS_HOURS.intervals.map((i) => ({ ...i })) };
  }
  const raw = value as Record<string, unknown>;
  const intervalsRaw = Array.isArray(raw.intervals) ? raw.intervals : [];
  const intervals: BusinessHoursInterval[] = intervalsRaw
    .map((item) => {
      const obj = (item ?? {}) as Record<string, unknown>;
      const weekday = Number(obj.weekday);
      return {
        weekday,
        start: isValidTime(obj.start) ? obj.start : "09:00",
        end: isValidTime(obj.end) ? obj.end : "18:00",
      };
    })
    .filter((i) => Number.isInteger(i.weekday) && i.weekday >= 0 && i.weekday <= 6 && i.start < i.end);
  return {
    enabled: Boolean(raw.enabled),
    timezone: typeof raw.timezone === "string" && raw.timezone.trim() ? raw.timezone : "America/Sao_Paulo",
    intervals,
  };
}

export function normalizeSlaMinutes(value: unknown): number {
  if (value == null) return 15;
  const n = Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.min(1440, Math.max(1, Math.trunc(n)));
}

/** Agrupa as janelas por dia da semana (0–6), ordenadas por horário de abertura. */
export function intervalsByWeekday(hours: BusinessHours): BusinessHoursInterval[][] {
  const byDay: BusinessHoursInterval[][] = [[], [], [], [], [], [], []];
  for (const interval of hours.intervals) {
    if (interval.weekday >= 0 && interval.weekday <= 6) {
      byDay[interval.weekday].push(interval);
    }
  }
  for (const day of byDay) {
    day.sort((a, b) => a.start.localeCompare(b.start));
  }
  return byDay;
}
