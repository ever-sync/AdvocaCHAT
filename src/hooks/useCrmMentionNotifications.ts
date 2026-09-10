import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getInboxNotificationsEnabled } from "@/hooks/useInboxInboundNotifications";
import { notifyCrmAlert } from "@/lib/crm/notify-crm-alert";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

type CommentRow = {
  id: string;
  tenant_id: string;
  negotiation_id: string;
  created_by: string;
  body: string;
  mentions: string[] | null;
};

/**
 * Realtime: novo comentário em `crm_negotiation_comments` que contém o usuário
 * logado em `mentions[]` → emite toast/push (mesma infra dos demais alertas).
 * Filtro de tenant no servidor (escala: evita receber INSERTs de todos os
 * tenants); a checagem do array `mentions[]` fica no cliente porque o
 * postgres_changes não suporta operadores em arrays.
 */
export function useCrmMentionNotifications(
  enabled: boolean = getInboxNotificationsEnabled(),
) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const profileId = profile?.id;
  const profileNameRef = useRef(profile?.nome ?? "");
  profileNameRef.current = profile?.nome ?? profileNameRef.current;

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled || !profileId) return;
    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;
        channel = supabase
          .channel(`crm-mentions:${profileId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "crm_negotiation_comments",
              filter: `tenant_id=eq.${tenantId}`,
            },
            (payload) => {
              const row = payload.new as CommentRow | undefined;
              if (!row) return;
              if (row.created_by === profileId) return; // não notifica autor
              if (!Array.isArray(row.mentions) || !row.mentions.includes(profileId)) return;
              const negId = row.negotiation_id;
              notifyCrmAlert({
                kind: "mention",
                titulo: "Você foi mencionado",
                descricao: row.body.slice(0, 160),
                negotiationId: negId,
                onNavigate: () => navigate(`/crm/negociacao/${negId}`),
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
  }, [enabled, navigate, profileId]);
}
