const POOL_SKIP_PREFIX = "crm-skip-pool:";
const POOL_SKIP_TTL_MS = 10_000;

export function markCrmPoolNotificationSuppressed(negotiationId: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${POOL_SKIP_PREFIX}${negotiationId}`, String(Date.now()));
  } catch {
    // ignore
  }
}

export function isCrmPoolNotificationSuppressed(negotiationId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(`${POOL_SKIP_PREFIX}${negotiationId}`);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || Date.now() - ts > POOL_SKIP_TTL_MS) {
      sessionStorage.removeItem(`${POOL_SKIP_PREFIX}${negotiationId}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const STALE_NOTIFIED_PREFIX = "crm-stale-days:";

export function getStaleNotificationLastDays(negotiationId: string): number | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${STALE_NOTIFIED_PREFIX}${negotiationId}`);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setStaleNotificationLastDays(negotiationId: string, days: number) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${STALE_NOTIFIED_PREFIX}${negotiationId}`, String(days));
  } catch {
    // ignore
  }
}

const STALE_BASELINE_PREFIX = "crm-stale-baseline:";

export function hasStaleBaselineForSession(profileId: string): boolean {
  if (typeof sessionStorage === "undefined") return true;
  try {
    return sessionStorage.getItem(`${STALE_BASELINE_PREFIX}${profileId}`) === "1";
  } catch {
    return true;
  }
}

export function markStaleBaselineForSession(profileId: string) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${STALE_BASELINE_PREFIX}${profileId}`, "1");
  } catch {
    // ignore
  }
}
