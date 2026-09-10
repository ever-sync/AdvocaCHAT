import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isE2eMockAuth } from "@/lib/e2e";
import { setE2ePinnedChat } from "@/lib/inbox-e2e";
import { requireSupabase } from "@/lib/supabase";
import type { AtendimentoUser, ChatTag, ChatTagScope } from "@/types/domain";

type TagRow = {
  id: string;
  tenant_id: string;
  name: string;
  color: string;
  scope: ChatTagScope;
  created_by: string;
  created_at: string;
};

function mapTag(row: TagRow): ChatTag {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    color: row.color,
    scope: row.scope,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ─── Tag catalog ──────────────────────────────────────────────────────────────

export async function listChatTags(): Promise<ChatTag[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("chat_tags")
    .select("id, tenant_id, name, color, scope, created_by, created_at")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTag(row as TagRow));
}

export async function createChatTag(input: {
  name: string;
  color: string;
  scope: ChatTagScope;
}): Promise<ChatTag> {
  const supabase = requireSupabase();
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();

  const { data, error } = await supabase
    .from("chat_tags")
    .insert({
      tenant_id: profileRow?.tenant_id,
      name: input.name.trim(),
      color: input.color,
      scope: input.scope,
      created_by: userId,
    })
    .select("id, tenant_id, name, color, scope, created_by, created_at")
    .single();
  if (error) throw new Error(error.message);
  return mapTag(data as TagRow);
}

export async function updateChatTag(id: string, input: { name?: string; color?: string }): Promise<void> {
  const supabase = requireSupabase();
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.color !== undefined) update.color = input.color;
  const { error } = await supabase.from("chat_tags").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChatTag(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("chat_tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Chat ↔ tag junction ──────────────────────────────────────────────────────

export async function addTagToChat(chatId: string, tagId: string): Promise<void> {
  const supabase = requireSupabase();
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { error } = await supabase.from("whatsapp_chat_tags").insert({
    chat_id: chatId,
    tag_id: tagId,
    tagged_by: userId,
  });
  if (error && !error.message.includes("duplicate")) throw new Error(error.message);
}

export async function addTagToChats(chatIds: string[], tagId: string): Promise<void> {
  const uniqueChatIds = Array.from(new Set(chatIds.filter(Boolean)));
  if (uniqueChatIds.length === 0) return;

  const supabase = requireSupabase();
  const { data: profile } = await supabase.auth.getUser();
  const userId = profile.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { error } = await supabase.from("whatsapp_chat_tags").upsert(
    uniqueChatIds.map((chatId) => ({
      chat_id: chatId,
      tag_id: tagId,
      tagged_by: userId,
    })),
    { onConflict: "chat_id,tag_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

export async function removeTagFromChat(chatId: string, tagId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("whatsapp_chat_tags")
    .delete()
    .eq("chat_id", chatId)
    .eq("tag_id", tagId);
  if (error) throw new Error(error.message);
}

// ─── Assignee ops ─────────────────────────────────────────────────────────────

export async function listAtendimentoUsers(): Promise<AtendimentoUser[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_atendimento_users");
  if (error) throw new Error(error.message);
  return (data ?? []) as AtendimentoUser[];
}

export async function assignChat(chatId: string, assigneeId: string, reason?: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("assign_chat", {
    p_chat_id: chatId,
    p_assignee_id: assigneeId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function unassignChat(chatId: string, reason?: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("unassign_chat", {
    p_chat_id: chatId,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function autoAssignChat(chatId: string): Promise<string | null> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("auto_assign_chat", { p_chat_id: chatId });
  if (error) throw new Error(error.message);
  return data as string | null;
}

export async function claimChat(chatId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("claim_chat", { p_chat_id: chatId });
  if (error) throw new Error(error.message);
}

export async function snoozeChat(chatId: string, until: Date): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("snooze_chat", {
    p_chat_id: chatId,
    p_until: until.toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function clearChatSnooze(chatId: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("clear_chat_snooze", { p_chat_id: chatId });
  if (error) throw new Error(error.message);
}

export type ChatAiMode = "off" | "qualifying" | "full" | "handoff";

/** Liga/desliga a IA nesta conversa (RLS exige poder agir no chat). */
export async function setChatAiMode(chatId: string, aiMode: ChatAiMode): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("whatsapp_chats").update({ ai_mode: aiMode }).eq("id", chatId);
  if (error) throw new Error(error.message);
}

// ─── React Query hooks ────────────────────────────────────────────────────────

export function useChatTags() {
  return useQuery({
    queryKey: ["chat-tags"],
    queryFn: listChatTags,
  });
}

export function useAtendimentoUsers() {
  return useQuery({
    queryKey: ["atendimento-users"],
    queryFn: listAtendimentoUsers,
  });
}

export function useCreateChatTag(
  options?: UseMutationOptions<ChatTag, Error, { name: string; color: string; scope: ChatTagScope }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createChatTag,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-tags"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateChatTag(
  options?: UseMutationOptions<void, Error, { id: string; name?: string; color?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }) => updateChatTag(id, input),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteChatTag(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteChatTag,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["chat-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useSetChatAiMode(
  options?: UseMutationOptions<void, Error, { chatId: string; aiMode: ChatAiMode }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, aiMode }) => setChatAiMode(chatId, aiMode),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useAddTagToChat(
  options?: UseMutationOptions<void, Error, { chatId: string; tagId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, tagId }) => addTagToChat(chatId, tagId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useAddTagToChats(
  options?: UseMutationOptions<void, Error, { chatIds: string[]; tagId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatIds, tagId }) => addTagToChats(chatIds, tagId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useRemoveTagFromChat(
  options?: UseMutationOptions<void, Error, { chatId: string; tagId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, tagId }) => removeTagFromChat(chatId, tagId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useAssignChat(
  options?: UseMutationOptions<void, Error, { chatId: string; assigneeId: string; reason?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, assigneeId, reason }) => assignChat(chatId, assigneeId, reason),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUnassignChat(
  options?: UseMutationOptions<void, Error, { chatId: string; reason?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, reason }) => unassignChat(chatId, reason),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useAutoAssignChat(
  options?: UseMutationOptions<string | null, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: autoAssignChat,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useClaimChat(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: claimChat,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useSnoozeChat(
  options?: UseMutationOptions<void, Error, { chatId: string; until: Date }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, until }) => snoozeChat(chatId, until),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useClearChatSnooze(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearChatSnooze,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

async function setPinChat(chatId: string, isPinned: boolean): Promise<void> {
  if (isE2eMockAuth) {
    setE2ePinnedChat(chatId, isPinned);
    return;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    throw new Error(authError.message);
  }
  const profileId = authData.user?.id?.trim();
  if (!profileId) {
    throw new Error("Não autenticado.");
  }

  if (isPinned) {
    const { error } = await supabase.from("whatsapp_chat_pins").upsert(
      {
        tenant_id: tenantId,
        profile_id: profileId,
        chat_id: chatId,
        pinned_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,chat_id" },
    );
    if (error) {
      throw new Error(
        error.message.includes("whatsapp_chat_pins")
          ? "Fixar conversa indisponível: aplique a migration whatsapp_chat_pins no Supabase."
          : error.message,
      );
    }
    return;
  }

  const { error } = await supabase
    .from("whatsapp_chat_pins")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .eq("chat_id", chatId);
  if (error) {
    throw new Error(
      error.message.includes("whatsapp_chat_pins")
        ? "Desafixar conversa indisponível: aplique a migration whatsapp_chat_pins no Supabase."
        : error.message,
    );
  }
}

export function usePinChat(
  options?: UseMutationOptions<void, Error, { chatId: string; isPinned: boolean }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, isPinned }) => setPinChat(chatId, isPinned),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-chat", variables.chatId] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
