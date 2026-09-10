// Limites de envio por canal (Fase 5). Le/grava marketing_flow_channel_limits
// direto (a RLS ja exige marketing.view/edit). Ausencia de linha = sem limite.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { getCurrentTenantId } from "@/lib/api/tenant";

export const FLOW_CHANNELS = ["whatsapp", "email", "sms", "smart"] as const;
export type FlowChannel = (typeof FLOW_CHANNELS)[number];

export const FLOW_CHANNEL_LABELS: Record<FlowChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  smart: "Mensagem inteligente",
};

export type ChannelLimit = {
  channel: FlowChannel;
  maxPerHour: number | null;
  enforceBusinessHours: boolean;
};

const QUERY_KEY = ["marketing-flow-channel-limits"];

export async function getChannelLimits(): Promise<Record<FlowChannel, ChannelLimit>> {
  // Default: todos os canais sem limite (linha ausente).
  const base = Object.fromEntries(
    FLOW_CHANNELS.map((c) => [c, { channel: c, maxPerHour: null, enforceBusinessHours: false }]),
  ) as Record<FlowChannel, ChannelLimit>;
  if (!isSupabaseConfigured) return base;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_flow_channel_limits")
    .select("channel, max_per_hour, enforce_business_hours");
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const channel = String(row.channel ?? "") as FlowChannel;
    if (!FLOW_CHANNELS.includes(channel)) continue;
    base[channel] = {
      channel,
      maxPerHour:
        row.max_per_hour == null || Number.isNaN(Number(row.max_per_hour))
          ? null
          : Number(row.max_per_hour),
      enforceBusinessHours: row.enforce_business_hours === true,
    };
  }
  return base;
}

export function useChannelLimits() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: getChannelLimits,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export async function upsertChannelLimit(limit: ChannelLimit): Promise<void> {
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  if (!tenantId) throw new Error("Tenant não identificado.");

  // maxPerHour null e enforce false => sem enforcement; remove a linha pra
  // manter a tabela enxuta (ausencia = sem limite).
  if (limit.maxPerHour == null && !limit.enforceBusinessHours) {
    const { error } = await supabase
      .from("marketing_flow_channel_limits")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("channel", limit.channel);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("marketing_flow_channel_limits").upsert(
    {
      tenant_id: tenantId,
      channel: limit.channel,
      max_per_hour: limit.maxPerHour,
      enforce_business_hours: limit.enforceBusinessHours,
    },
    { onConflict: "tenant_id,channel" },
  );
  if (error) throw new Error(error.message);
}

export function useUpsertChannelLimit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertChannelLimit,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
