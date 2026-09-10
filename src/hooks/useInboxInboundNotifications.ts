import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { playNotificationPing, postBrowserNotification } from "@/lib/notifications/browser-notify";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

type MessageRow = {
  id?: string;
  chat_id?: string;
  direction?: string;
  body_text?: string | null;
  message_type?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
};

const STORAGE_KEY = "inbox.notifications.enabled";

function isNotificationsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

/**
 * Pede permissao apenas se for chamado a partir de uma intera\u00e7ao do usu\u00e1rio
 * (clique). N\u00e3o e mais chamado na montagem do hook para evitar pop-up
 * surpresa.
 */
export function requestInboxNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return Promise.resolve("denied" as NotificationPermission);
  }
  if (Notification.permission !== "default") {
    return Promise.resolve(Notification.permission);
  }
  return Notification.requestPermission().catch(() => "denied" as NotificationPermission);
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function shortPreviewFromRow(row: MessageRow): string {
  const t = (row.message_type ?? "text").toLowerCase();
  if (t === "audio") return "🎤 Audio";
  if (t === "media") return "🖼️ Imagem ou video";
  if (t === "document") return "📄 Documento";
  if (t === "location") return "📍 Localizacao";
  if (t === "contact") return "👤 Contato";
  const body = (row.body_text ?? "").trim();
  if (!body) return "Nova mensagem";
  return body.length > 140 ? `${body.slice(0, 137)}...` : body;
}

/**
 * Notifica o usuario quando chega uma mensagem inbound em chat NAO ativo,
 * ou em qualquer chat se a aba nao esta visivel.
 *
 * - Pede permissao do navegador na primeira montagem (se default).
 * - Toca um beep sintetizado (Web Audio API, sem assets externos).
 * - Posta uma `Notification` quando granted.
 * - Throttle de PING_THROTTLE_MS para nao virar barulho em rajadas.
 * - Opt-out via `localStorage["inbox.notifications.enabled"]` = "0".
 */
export function useInboxInboundNotifications(
  activeChatId: string | null | undefined,
  enabled: boolean = isNotificationsEnabled(),
) {
  const activeChatRef = useRef(activeChatId);

  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!enabled) return;

    // Nao pede permissao automaticamente: a UI dispara por clique do usuario
    // (ver `requestInboxNotificationPermission`). Sem permissao, ainda tocamos
    // o beep e sinalizamos via title (item 4).

    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;

        channel = supabase
          .channel(`inbox-inbound:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "whatsapp_messages",
              filter: `tenant_id=eq.${tenantId}`,
            },
            (payload) => {
              const row = payload.new as MessageRow | undefined;
              if (!row || row.direction !== "inbound") return;

              const isVisible =
                typeof document !== "undefined" &&
                document.visibilityState === "visible";
              const isActiveChat =
                Boolean(row.chat_id) && row.chat_id === activeChatRef.current;

              // Aba visivel + chat ativo: a UI ja exibe a mensagem; sem ping.
              if (isVisible && isActiveChat) return;

              playNotificationPing();

              postBrowserNotification({
                title: "Nova mensagem",
                body: shortPreviewFromRow(row),
                tag: `inbox-${row.chat_id ?? "all"}`,
              });
            },
          )
          .subscribe();
      })
      .catch(() => {
        // Sem sessao/tenant: rota provavelmente protegida; ignorar.
      });

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled]);
}

/**
 * Hook de UI para controlar a preferencia de notificacoes do inbox.
 * Observa `storage` events para refletir mudancas de outras abas.
 */
export function useInboxNotificationSettings() {
  const [enabled, setEnabledState] = useState<boolean>(() => isNotificationsEnabled());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    getNotificationPermissionState(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) {
        setEnabledState(isNotificationsEnabled());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    setInboxNotificationsEnabled(next);
    setEnabledState(next);
    if (next) {
      const granted = await requestInboxNotificationPermission();
      setPermission(granted);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await requestInboxNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  return { enabled, setEnabled, permission, requestPermission };
}

/** Helpers usados pela UI e pelo hook acima. */
export function setInboxNotificationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export function getInboxNotificationsEnabled() {
  return isNotificationsEnabled();
}
