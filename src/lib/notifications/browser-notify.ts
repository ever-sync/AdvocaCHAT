/** Beep curto e notificação nativa do navegador (compartilhado inbox + CRM). */

const PING_THROTTLE_MS = 2_000;
let lastPingAt = 0;

let cachedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedAudioCtx) return cachedAudioCtx;
  const Ctor =
    (window.AudioContext as typeof AudioContext | undefined) ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedAudioCtx = new Ctor();
  } catch {
    cachedAudioCtx = null;
  }
  return cachedAudioCtx;
}

export function playNotificationPing() {
  const now = Date.now();
  if (now - lastPingAt < PING_THROTTLE_MS) return;
  lastPingAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  try {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {
    // ignore
  }
}

export type BrowserNotificationOptions = {
  title: string;
  body: string;
  tag: string;
  onClick?: () => void;
};

export function postBrowserNotification(options: BrowserNotificationOptions) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const isVisible = document.visibilityState === "visible";
  if (isVisible) return;

  try {
    const n = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      silent: true,
    });
    if (options.onClick) {
      n.onclick = () => {
        options.onClick?.();
        window.focus();
        n.close();
      };
    }
  } catch {
    // ignore
  }
}
