import type { CrmNegotiationRecord } from "@/types/domain";
import {
  daysSinceLastTouch,
  getNegotiationAlerts,
  isNegotiationUnassigned,
  normalizeStaleNegotiationDays,
  type NegotiationAlertInput,
} from "@/lib/crm/negotiation-alerts";

export type CrmNegotiationDbRow = {
  id?: string;
  title?: string;
  status?: string;
  assignee_id?: string | null;
};

export function isNegotiationEnteredPool(
  previous: CrmNegotiationDbRow | null | undefined,
  next: CrmNegotiationDbRow | null | undefined,
): boolean {
  if (!next?.id) return false;
  if (next.status !== "em_andamento") return false;
  const wasAssigned = Boolean(previous?.assignee_id?.trim());
  const nowPool = isNegotiationUnassigned(next.assignee_id);
  return wasAssigned && nowPool;
}

export function shouldNotifyUserForNegotiation(
  record: Pick<CrmNegotiationRecord, "assigneeId">,
  profileId: string | undefined,
): boolean {
  if (!profileId?.trim()) return false;
  if (isNegotiationUnassigned(record.assigneeId)) return true;
  return record.assigneeId === profileId;
}

export function shouldEmitStaleNotificationForRecord(
  record: CrmNegotiationRecord,
  profileId: string | undefined,
  staleThresholdDays: number,
  lastNotifiedStaleDays: number | null,
  nowMs = Date.now(),
): { notify: boolean; staleDays: number } {
  if (!shouldNotifyUserForNegotiation(record, profileId)) {
    return { notify: false, staleDays: 0 };
  }

  const input: NegotiationAlertInput = {
    status: record.status,
    nextTaskAt: record.nextTaskAt ?? undefined,
    lastContactAt: record.lastContactAt ?? undefined,
    lastInteractionAt: record.lastInteractionAt ?? undefined,
    createdAt: record.createdAt,
  };

  const threshold = normalizeStaleNegotiationDays(staleThresholdDays);
  const staleDays = daysSinceLastTouch(input, nowMs);
  if (staleDays < threshold) {
    return { notify: false, staleDays };
  }

  const hasStale = getNegotiationAlerts(input, nowMs, threshold).some((a) => a.kind === "stale");
  if (!hasStale) {
    return { notify: false, staleDays };
  }

  if (lastNotifiedStaleDays != null && staleDays <= lastNotifiedStaleDays) {
    return { notify: false, staleDays };
  }

  return { notify: true, staleDays };
}

export function poolNotificationCopy(title: string): { titulo: string; descricao: string } {
  const safe = title.trim() || "Negócio";
  return {
    titulo: "Negócio no pool",
    descricao: `"${safe}" está sem responsável e pode ser assumido.`,
  };
}

export function staleNotificationCopy(title: string, staleDays: number, threshold: number): {
  titulo: string;
  descricao: string;
} {
  const safe = title.trim() || "Negócio";
  const dias = staleDays === 1 ? "1 dia" : `${staleDays} dias`;
  return {
    titulo: "Negócio parado",
    descricao: `"${safe}" está sem interação há ${dias} (limite: ${threshold}d).`,
  };
}
