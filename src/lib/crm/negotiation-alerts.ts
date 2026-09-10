import type { CrmNegotiationStatus } from "@/types/domain";

/** Dias sem interação/contato para considerar negócio parado (padrão do app). */
export const DEFAULT_STALE_NEGOTIATION_DAYS = 7;

/** @deprecated Use DEFAULT_STALE_NEGOTIATION_DAYS ou valor do tenant. */
export const STALE_NEGOTIATION_DAYS = DEFAULT_STALE_NEGOTIATION_DAYS;

export const MIN_STALE_NEGOTIATION_DAYS = 1;
export const MAX_STALE_NEGOTIATION_DAYS = 90;

export function normalizeStaleNegotiationDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_STALE_NEGOTIATION_DAYS;
  }
  return Math.min(MAX_STALE_NEGOTIATION_DAYS, Math.max(MIN_STALE_NEGOTIATION_DAYS, Math.round(n)));
}

const MS_PER_DAY = 86_400_000;

const ALERTABLE_STATUSES: CrmNegotiationStatus[] = ["em_andamento", "nao_pausado"];

export type NegotiationAlertKind = "stale" | "no_future_task";

/** Filtro de listagem no Kanban CRM. */
export type CrmAlertsFilterMode = "off" | "any" | "stale" | "no_future_task";

export type NegotiationAlert = {
  kind: NegotiationAlertKind;
  label: string;
  severity: "warning" | "danger";
};

export type NegotiationAlertInput = {
  status: CrmNegotiationStatus;
  nextTaskAt?: string;
  lastContactAt?: string;
  lastInteractionAt?: string;
  createdAt: string;
};

function parseTime(iso: string | undefined): number | null {
  if (!iso?.trim()) {
    return null;
  }
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function isNegotiationUnassigned(assigneeId: string | null | undefined): boolean {
  return !assigneeId?.trim();
}

export function hasFutureTask(nextTaskAt: string | undefined, nowMs = Date.now()): boolean {
  const t = parseTime(nextTaskAt);
  return t != null && t > nowMs;
}

export function daysSinceLastTouch(input: NegotiationAlertInput, nowMs = Date.now()): number {
  const touch =
    parseTime(input.lastInteractionAt) ??
    parseTime(input.lastContactAt) ??
    parseTime(input.createdAt) ??
    nowMs;
  return Math.floor((nowMs - touch) / MS_PER_DAY);
}

export function getNegotiationAlerts(
  input: NegotiationAlertInput,
  nowMs = Date.now(),
  staleThresholdDays = DEFAULT_STALE_NEGOTIATION_DAYS,
): NegotiationAlert[] {
  if (!ALERTABLE_STATUSES.includes(input.status)) {
    return [];
  }

  const alerts: NegotiationAlert[] = [];

  if (!hasFutureTask(input.nextTaskAt, nowMs)) {
    alerts.push({
      kind: "no_future_task",
      label: "Sem tarefa futura",
      severity: "danger",
    });
  }

  const threshold = normalizeStaleNegotiationDays(staleThresholdDays);
  const staleDays = daysSinceLastTouch(input, nowMs);
  if (staleDays >= threshold) {
    alerts.push({
      kind: "stale",
      label: staleDays === 1 ? "Parado há 1 dia" : `Parado há ${staleDays} dias`,
      severity: "warning",
    });
  }

  return alerts;
}

export function hasNegotiationAlerts(
  input: NegotiationAlertInput,
  nowMs = Date.now(),
  staleThresholdDays = DEFAULT_STALE_NEGOTIATION_DAYS,
): boolean {
  return getNegotiationAlerts(input, nowMs, staleThresholdDays).length > 0;
}

export function negotiationMatchesAlertsFilter(
  input: NegotiationAlertInput,
  mode: CrmAlertsFilterMode,
  nowMs = Date.now(),
  staleThresholdDays = DEFAULT_STALE_NEGOTIATION_DAYS,
): boolean {
  if (mode === "off") {
    return true;
  }
  const alerts = getNegotiationAlerts(input, nowMs, staleThresholdDays);
  if (mode === "any") {
    return alerts.length > 0;
  }
  return alerts.some((a) => a.kind === mode);
}
