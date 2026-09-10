import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

/**
 * Realtime da grade de agendamentos: invalida `scheduling-appointments` quando a
 * página pública, o pull do Google ou outro atendente cria/move/cancela um
 * agendamento. Canal leve e dedicado — a barra do CRM (`useCrmRealtimeSync`) só
 * monta em rotas de CRM, e a Agenda fica fora dela.
 */
export function useSchedulingRealtime(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;

    const sb = requireSupabase();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled || !tenantId) return;
        channel = sb
          .channel(`scheduling-appointments:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "scheduling_appointments",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              void queryClient.invalidateQueries({ queryKey: ["scheduling-appointments"] });
            },
          )
          .subscribe();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (channel) {
        void sb.removeChannel(channel);
      }
    };
  }, [queryClient, enabled]);
}
