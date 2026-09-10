import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getE2eChatNegotiation } from "@/data/crm-e2e-fixtures";
import { isE2eMockAuth } from "@/lib/e2e";
import { requireSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { ChatResolution, CrmNegotiationRecord } from "@/types/domain";
import { mapCrmNegotiationDbRow } from "@/lib/crm/negotiation-model";

export async function ensureLeadFromChat(
  chatId: string,
  options?: { autoAssign?: boolean; forceNew?: boolean },
): Promise<string | null> {
  if (!isSupabaseConfigured || !chatId) {
    return null;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("ensure_lead_from_chat", {
    p_chat_id: chatId,
    p_auto_assign: options?.autoAssign ?? false,
    p_force_new: options?.forceNew ?? false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string | null;
}

export async function linkChatNegotiation(chatId: string, negotiationId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("link_chat_negotiation", {
    p_chat_id: chatId,
    p_negotiation_id: negotiationId,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function setChatResolution(chatId: string, resolution: ChatResolution): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_chat_resolution", {
    p_chat_id: chatId,
    p_resolution: resolution,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchChatNegotiation(chatId: string): Promise<CrmNegotiationRecord | null> {
  if (!isSupabaseConfigured || !chatId) {
    return null;
  }

  const supabase = requireSupabase();
  const { data: chat, error: chatError } = await supabase
    .from("whatsapp_chats")
    .select("primary_negotiation_id")
    .eq("id", chatId)
    .maybeSingle();

  if (chatError || !chat?.primary_negotiation_id) {
    return null;
  }

  const { data: neg, error } = await supabase
    .from("crm_negotiations")
    .select(
      "id, tenant_id, title, funnel_id, stage_id, status, assignee_id, customer_id, star_count, qualification, total_value, next_task_at, closing_forecast, last_contact_at, last_interaction_at, created_at, updated_at, source_chat_id",
    )
    .eq("id", chat.primary_negotiation_id)
    .maybeSingle();

  if (error || !neg) {
    return null;
  }

  return mapCrmNegotiationDbRow(neg as Record<string, unknown>);
}

export function useEnsureLeadFromChat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      chatId,
      autoAssign,
      forceNew,
    }: {
      chatId: string;
      autoAssign?: boolean;
      forceNew?: boolean;
    }) => ensureLeadFromChat(chatId, { autoAssign, forceNew }),
    onSuccess: (_id, { chatId }) => {
      void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-negotiation", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
    },
  });
}

export function useChatNegotiation(chatId: string | null) {
  return useQuery({
    queryKey: ["chat-negotiation", chatId],
    queryFn: () => {
      if (!chatId) {
        return Promise.resolve(null);
      }
      if (isE2eMockAuth) {
        return Promise.resolve(getE2eChatNegotiation(chatId));
      }
      return fetchChatNegotiation(chatId);
    },
    enabled: Boolean(chatId) && (isSupabaseConfigured || isE2eMockAuth),
  });
}

export function useLinkChatNegotiation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, negotiationId }: { chatId: string; negotiationId: string }) =>
      linkChatNegotiation(chatId, negotiationId),
    onSuccess: (_data, { chatId }) => {
      void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-negotiation", chatId] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
    },
  });
}

export function useSetChatResolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, resolution }: { chatId: string; resolution: ChatResolution }) =>
      setChatResolution(chatId, resolution),
    onSuccess: (_data, { chatId }) => {
      void queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-negotiation", chatId] });
    },
  });
}
