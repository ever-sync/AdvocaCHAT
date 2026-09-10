import type { WhatsappMessage } from "@/types/domain";

const FAILURE_REASON_KEYS = [
  "errorMessage",
  "error_message",
  "statusMessage",
  "status_message",
  "reason",
  "cause",
  "details",
  "description",
  "message",
] as const;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipReason(value: string): string {
  const normalized = normalizeText(value);
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    return normalized ? normalized : null;
  }

  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  ) {
    const normalized = normalizeText(String((value as Record<string, unknown>).message));
    return normalized ? normalized : null;
  }

  return null;
}

function searchFailureReason(value: unknown, depth = 0): string | null {
  if (depth > 3 || value == null) {
    return null;
  }

  const direct = readStringCandidate(value);
  if (direct) {
    return clipReason(direct);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = searchFailureReason(entry, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  for (const key of FAILURE_REASON_KEYS) {
    const candidate = searchFailureReason(value[key], depth + 1);
    if (candidate) {
      return candidate;
    }
  }

  for (const key of Object.keys(value)) {
    const nested = searchFailureReason(value[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function getInboxMessageFailureReason(message: WhatsappMessage): string | null {
  const candidates = [message.rawEvent, message.payloadJson];
  for (const candidate of candidates) {
    const found = searchFailureReason(candidate);
    if (found) {
      return found;
    }
  }

  return message.status === "failed" ? "Falha no envio desta mensagem." : null;
}
