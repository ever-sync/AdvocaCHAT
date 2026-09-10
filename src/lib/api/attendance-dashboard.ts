import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { getCurrentTenantId } from "@/lib/api/tenant";

export type AttendanceDashboardAttendant = {
  id: string;
  name: string;
  availability: "available" | "busy" | "offline";
  openChats: number;
};

export type AttendanceDashboard = {
  generatedAt: string;
  businessHoursEnabled: boolean;
  withinBusinessHours: boolean;
  timezone: string;
  pool: { waiting: number; oldestWaitMinutes: number };
  sla: { awaitingFirstResponse: number; atRisk: number; breached: number };
  today: {
    chatsOpened: number;
    firstResponses: number;
    avgFirstResponseMinutes: number | null;
    messagesInbound: number;
    messagesOutbound: number;
  };
  attendants: AttendanceDashboardAttendant[];
};

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapDashboard(raw: Record<string, unknown>): AttendanceDashboard {
  const pool = (raw.pool ?? {}) as Record<string, unknown>;
  const sla = (raw.sla ?? {}) as Record<string, unknown>;
  const today = (raw.today ?? {}) as Record<string, unknown>;
  const attendants = Array.isArray(raw.attendants) ? raw.attendants : [];
  return {
    generatedAt: String(raw.generated_at ?? new Date().toISOString()),
    businessHoursEnabled: Boolean(raw.business_hours_enabled),
    withinBusinessHours: Boolean(raw.within_business_hours),
    timezone: String(raw.timezone ?? "America/Sao_Paulo"),
    pool: {
      waiting: num(pool.waiting),
      oldestWaitMinutes: num(pool.oldest_wait_minutes),
    },
    sla: {
      awaitingFirstResponse: num(sla.awaiting_first_response),
      atRisk: num(sla.at_risk),
      breached: num(sla.breached),
    },
    today: {
      chatsOpened: num(today.chats_opened),
      firstResponses: num(today.first_responses),
      avgFirstResponseMinutes:
        today.avg_first_response_minutes == null ? null : num(today.avg_first_response_minutes),
      messagesInbound: num(today.messages_inbound),
      messagesOutbound: num(today.messages_outbound),
    },
    attendants: attendants.map((item) => {
      const a = (item ?? {}) as Record<string, unknown>;
      const availability = String(a.availability ?? "available");
      return {
        id: String(a.id ?? ""),
        name: String(a.name ?? "—"),
        availability:
          availability === "busy" || availability === "offline" ? availability : "available",
        openChats: num(a.open_chats),
      };
    }),
  };
}

export async function fetchAttendanceDashboard(): Promise<AttendanceDashboard | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("live_attendance_dashboard");
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapDashboard(data as Record<string, unknown>);
}

export const attendanceDashboardQueryKey = ["attendance-dashboard"] as const;

export function useAttendanceDashboard() {
  return useQuery({
    queryKey: attendanceDashboardQueryKey,
    queryFn: fetchAttendanceDashboard,
    enabled: isSupabaseConfigured,
    // Métricas dependem do tempo (SLA, espera no pool) → revalida em 60s.
    // Realtime cobre mudanças por evento; window focus seria redundante.
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Realtime: chats e disponibilidade dos atendentes alteram o painel. */
export function useAttendanceDashboardRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: attendanceDashboardQueryKey });

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;
        const filter = `tenant_id=eq.${tenantId}`;
        channel = supabase
          .channel(`attendance-dashboard:${tenantId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "whatsapp_chats", filter },
            invalidate,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles", filter },
            invalidate,
          )
          .subscribe();
      })
      .catch(() => {
        // Sem tenant/sessão (ex.: rota não autenticada): ignora.
      });

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}
