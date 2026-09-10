import { toast } from "@/hooks/use-toast";
import { playNotificationPing, postBrowserNotification } from "@/lib/notifications/browser-notify";
import { useAppStore } from "@/store/useAppStore";

export type CrmAlertNotifyKind = "pool" | "stale" | "mention";

export function notifyCrmAlert(payload: {
  kind: CrmAlertNotifyKind;
  titulo: string;
  descricao: string;
  negotiationId: string;
  playSound?: boolean;
  browserNotification?: boolean;
  onNavigate?: () => void;
}) {
  const { kind, titulo, descricao, negotiationId, playSound = true, browserNotification = true, onNavigate } =
    payload;

  toast({
    title: titulo,
    description: descricao,
  });

  useAppStore.getState().addNotification({
    tipo: kind === "stale" ? "aviso" : "info",
    titulo,
    descricao,
  });

  if (playSound) {
    playNotificationPing();
  }

  if (browserNotification) {
    postBrowserNotification({
      title: titulo,
      body: descricao,
      tag: `crm-${kind}-${negotiationId}`,
      onClick: onNavigate,
    });
  }
}
