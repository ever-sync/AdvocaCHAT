import { useLocation } from "react-router-dom";
import { useInboxNotificationSettings } from "@/hooks/useInboxInboundNotifications";
import { useCrmNegotiationNotifications } from "@/hooks/useCrmNegotiationNotifications";
import { useCrmMentionNotifications } from "@/hooks/useCrmMentionNotifications";
import { useCrmRealtimeSync } from "@/hooks/useCrmRealtimeSync";

/** Montado no layout autenticado; sem UI. */
export function CrmNotificationListener() {
  const { enabled } = useInboxNotificationSettings();
  const { pathname } = useLocation();
  // Sync pesado das tabelas de CRM só nas telas de CRM; fora delas (ex.: Inbox)
  // não monta as 7 subscriptions. crm_negotiations segue sempre ativo no hook.
  const isCrmRoute = pathname.startsWith("/crm");
  const { onNegotiationRealtimeEvent } = useCrmNegotiationNotifications(enabled);
  useCrmMentionNotifications(enabled);
  // Reusa a subscription (sempre ativa) de crm_negotiations para as
  // notificações de pool, em vez de abrir um segundo canal por sessão.
  useCrmRealtimeSync({ enabled: isCrmRoute, onNegotiationEvent: onNegotiationRealtimeEvent });
  return null;
}
