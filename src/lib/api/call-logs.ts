import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CallLog } from "@/types/domain";

type Row = {
  id: string;
  tenant_id: string;
  provider: string;
  provider_call_sid: string | null;
  direction: CallLog["direction"];
  from_number: string | null;
  to_number: string | null;
  attendant_id: string | null;
  customer_id: string | null;
  chat_id: string | null;
  negotiation_id: string | null;
  status: CallLog["status"];
  duration_seconds: number | null;
  recording_url: string | null;
  error: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  "id, tenant_id, provider, provider_call_sid, direction, from_number, to_number, attendant_id, customer_id, chat_id, negotiation_id, status, duration_seconds, recording_url, error, started_at, answered_at, ended_at, created_at, updated_at";

function mapRow(row: Row): CallLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    providerCallSid: row.provider_call_sid,
    direction: row.direction,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    attendantId: row.attendant_id,
    customerId: row.customer_id,
    chatId: row.chat_id,
    negotiationId: row.negotiation_id,
    status: row.status,
    durationSeconds: row.duration_seconds,
    recordingUrl: row.recording_url,
    error: row.error,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type CallLogScope = {
  customerId?: string | null;
  negotiationId?: string | null;
  chatId?: string | null;
};

function scopeKey(scope: CallLogScope) {
  return [scope.customerId ?? null, scope.negotiationId ?? null, scope.chatId ?? null];
}

function scopeHasTarget(scope: CallLogScope) {
  return Boolean(scope.customerId || scope.negotiationId || scope.chatId);
}

export async function listCallLogs(scope: CallLogScope): Promise<CallLog[]> {
  if (!isSupabaseConfigured || !scopeHasTarget(scope)) {
    return [];
  }
  const supabase = requireSupabase();
  const filters = [
    scope.customerId ? `customer_id.eq.${scope.customerId}` : null,
    scope.negotiationId ? `negotiation_id.eq.${scope.negotiationId}` : null,
    scope.chatId ? `chat_id.eq.${scope.chatId}` : null,
  ].filter(Boolean) as string[];

  const { data, error } = await supabase
    .from("call_logs")
    .select(SELECT)
    .or(filters.join(","))
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Row));
}

export type StartCallInput = {
  toNumber: string;
  customerId?: string | null;
  chatId?: string | null;
  negotiationId?: string | null;
};

export async function startCall(input: StartCallInput): Promise<{ callLogId: string; callSid: string }> {
  return invokeAuthedFunction<{ callLogId: string; callSid: string }>("twilio-call", input);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const callLogsQueryKey = (scope: CallLogScope) => ["call-logs", ...scopeKey(scope)] as const;

export function useCallLogs(scope: CallLogScope) {
  return useQuery({
    queryKey: callLogsQueryKey(scope),
    queryFn: () => listCallLogs(scope),
    enabled: isSupabaseConfigured && scopeHasTarget(scope),
    staleTime: 30_000,
  });
}

export function useStartCall(
  options?: UseMutationOptions<{ callLogId: string; callSid: string }, Error, StartCallInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startCall,
    ...options,
    onSuccess: async (data, variables, context) => {
      void queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/** Realtime: status da ligação muda no banco (via webhook) e a timeline atualiza. */
export function useCallLogsRealtime(scope: CallLogScope) {
  const queryClient = useQueryClient();
  const target = scopeHasTarget(scope);
  const key = JSON.stringify(scopeKey(scope));
  useEffect(() => {
    if (!isSupabaseConfigured || !target) return;
    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;
        channel = supabase
          .channel(`call-logs:${tenantId}:${key}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "call_logs",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              void queryClient.invalidateQueries({ queryKey: ["call-logs"] });
            },
          )
          .subscribe();
      })
      .catch(() => {
        // Sem tenant/sessão: ignora.
      });

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [key, target, queryClient]);
}
