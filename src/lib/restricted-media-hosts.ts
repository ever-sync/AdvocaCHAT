/**
 * CDNs da Meta (WhatsApp/Facebook/Instagram) frequentemente respondem 403 a
 * <img>/<video> no nosso dominio (cookies, referrer, TTL curto). Evita o
 * primeiro request que so polui o console e cai no mesmo fallback.
 */
export function isMetaCdnLikelyToBlockInlineEmbed(url: string | null | undefined): boolean {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw || raw.startsWith("data:") || raw.startsWith("/")) {
    return false;
  }

  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host.includes("whatsapp.net") ||
      host.includes("whatsapp.com") ||
      host.includes("fbcdn.net") ||
      host.includes("facebook.com") ||
      host.includes("fbsbx.com") ||
      host.includes("instagram.com") ||
      host.includes("cdninstagram.com")
    );
  } catch {
    return false;
  }
}

/** Nome de arquivo solto (sem URL/path) vira request relativo ao app e gera 403. */
export function isBareMediaFilename(url: string | null | undefined): boolean {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return false;
  }
  if (raw.startsWith("/") || raw.startsWith("storage/v1/") || raw.includes("/")) {
    return false;
  }
  return /\.(jpe?g|png|gif|webp|bmp|svg|mp4|webm|mp3|m4a|pdf|ogg|opus|oga)$/i.test(raw);
}

export function isInlineMediaUrlAllowed(url: string | null | undefined): boolean {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) {
    return false;
  }
  if (isMetaCdnLikelyToBlockInlineEmbed(raw) || isBareMediaFilename(raw)) {
    return false;
  }
  return true;
}
