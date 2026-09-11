// Shared by public widgets and Edge Functions so client metadata is never trusted.
export const PUBLIC_ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "msclkid", "gbraid", "wbraid",
] as const;

const URL_KEYS = ["referrer", "url", "page_url", "landing_page", "landing_page_url"] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function shortText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, 500) || undefined;
}

/** Paths, arbitrary query parameters, fragments and userinfo can contain client data or tokens. */
export function sanitizePublicReferralUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const source = new URL(value);
    if (source.protocol !== "https:" && source.protocol !== "http:") return undefined;
    const safe = new URL(source.origin);
    for (const key of PUBLIC_ATTRIBUTION_KEYS) {
      const text = shortText(source.searchParams.get(key));
      if (text) safe.searchParams.set(key, text);
    }
    return safe.toString();
  } catch {
    return undefined;
  }
}

function sanitizeAttribution(value: unknown, includeTouches = true): Record<string, unknown> {
  const input = asRecord(value);
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_ATTRIBUTION_KEYS) {
    const text = shortText(input[key]);
    if (text) out[key] = text;
  }
  for (const key of URL_KEYS) {
    const url = sanitizePublicReferralUrl(input[key]);
    if (url) out[key] = url;
  }
  if (includeTouches) {
    for (const key of ["first_touch", "last_touch"]) {
      const touch = sanitizeAttribution(input[key], false);
      if (Object.keys(touch).length) out[key] = touch;
    }
  }
  return out;
}

export function sanitizePublicFormMetadata(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  const out = sanitizeAttribution(input, false);
  const variant = shortText(input.variant_id);
  if (variant && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variant)) {
    out.variant_id = variant;
  }
  const seconds = Number(input.time_to_complete_seconds);
  if (Number.isFinite(seconds) && seconds >= 0) out.time_to_complete_seconds = Math.min(seconds, 604800);
  const attribution = sanitizeAttribution(input.attribution);
  if (Object.keys(attribution).length) out.attribution = attribution;
  return out;
}

export function collectPublicFormMetadata(search: string, referrer: string): Record<string, unknown> {
  const params = new URLSearchParams(search);
  return sanitizePublicFormMetadata({
    ...Object.fromEntries(PUBLIC_ATTRIBUTION_KEYS.map((key) => [key, params.get(key)])),
    variant_id: params.get("variant_id") ?? params.get("_variant_id"),
    referrer,
  });
}

export function sanitizePublicFormEventMetadata(value: unknown): Record<string, unknown> {
  const input = asRecord(value);
  const out = sanitizePublicFormMetadata(input);
  for (const key of ["total_fields", "total_steps", "step_index"]) {
    const number = input[key];
    if (typeof number === "number" && Number.isFinite(number) && number >= 0) out[key] = number;
  }
  for (const key of ["step_title", "last_field"]) {
    const text = shortText(input[key]);
    if (text) out[key] = text;
  }
  if (typeof input.multi_step === "boolean") out.multi_step = input.multi_step;
  return out;
}
