import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type QueueDistributionStrategy = "least_open_chats" | "round_robin";

export type ChatQueueSettings = {
  tenantId: string;
  autoAssignOnLead: boolean;
  syncAssigneeChatCrm: boolean;
  maxOpenChatsPerAttendant: number | null;
  strategy: QueueDistributionStrategy;
};

export type ChatQueueAttendantRow = {
  profileId: string;
  name: string;
  email: string;
  openChats: number;
  inQueue: boolean;
  queueEnabled: boolean;
  maxOpenChats: number | null;
};

export type ChatQueueAttendantInput = {
  profileId: string;
  enabled: boolean;
  maxOpenChats: number | null;
};

function parseMaxOpenChats(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n);
}

export async function fetchChatQueueSettings(): Promise<ChatQueueSettings | null> {
  if (!isSupabaseConfigured) {
    return null;
  }
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select(
      "tenant_id, auto_assign_on_lead, sync_assignee_chat_crm, queue_max_open_chats_per_attendant, queue_distribution_strategy",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      tenantId,
      autoAssignOnLead: false,
      syncAssigneeChatCrm: true,
      maxOpenChatsPerAttendant: null,
      strategy: "least_open_chats",
    };
  }

  const row = data as Record<string, unknown>;
  const strategy = row.queue_distribution_strategy;
  return {
    tenantId,
    autoAssignOnLead: Boolean(row.auto_assign_on_lead),
    syncAssigneeChatCrm: row.sync_assignee_chat_crm !== false,
    maxOpenChatsPerAttendant: parseMaxOpenChats(row.queue_max_open_chats_per_attendant),
    strategy: strategy === "round_robin" ? "round_robin" : "least_open_chats",
  };
}

export async function fetchChatQueueWorkload(): Promise<ChatQueueAttendantRow[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_chat_queue_workload");
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    profileId: String(row.profile_id ?? ""),
    name: String(row.nome ?? ""),
    email: String(row.email ?? ""),
    openChats: Number(row.open_chats ?? 0),
    inQueue: Boolean(row.in_queue),
    queueEnabled: Boolean(row.queue_enabled),
    maxOpenChats: parseMaxOpenChats(row.max_open_chats),
  }));
}

export async function saveChatQueueDistribution(input: {
  settings: Pick<
    ChatQueueSettings,
    "autoAssignOnLead" | "syncAssigneeChatCrm" | "maxOpenChatsPerAttendant" | "strategy"
  >;
  attendants: ChatQueueAttendantInput[];
}): Promise<void> {
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();

  const { error: settingsError } = await supabase.from("tenant_settings").upsert(
    {
      tenant_id: tenantId,
      auto_assign_on_lead: input.settings.autoAssignOnLead,
      sync_assignee_chat_crm: input.settings.syncAssigneeChatCrm,
      queue_max_open_chats_per_attendant: input.settings.maxOpenChatsPerAttendant,
      queue_distribution_strategy: input.settings.strategy,
    },
    { onConflict: "tenant_id" },
  );

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const enabled = input.attendants.filter((a) => a.enabled);
  const { error: deleteError } = await supabase
    .from("chat_queue_attendants")
    .delete()
    .eq("tenant_id", tenantId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (enabled.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("chat_queue_attendants").insert(
    enabled.map((a) => ({
      tenant_id: tenantId,
      profile_id: a.profileId,
      enabled: true,
      max_open_chats: a.maxOpenChats,
    })),
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

export function useChatQueueSettings() {
  return useQuery({
    queryKey: ["chat-queue-settings"],
    queryFn: fetchChatQueueSettings,
    enabled: isSupabaseConfigured,
  });
}

export function useChatQueueWorkload() {
  return useQuery({
    queryKey: ["chat-queue-workload"],
    queryFn: fetchChatQueueWorkload,
    enabled: isSupabaseConfigured,
  });
}

export function useSaveChatQueueDistribution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveChatQueueDistribution,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["chat-queue-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["chat-queue-workload"] }),
        queryClient.invalidateQueries({ queryKey: ["tenant-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["atendimento-users"] }),
      ]);
    },
  });
}
