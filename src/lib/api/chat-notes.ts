import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { ChatNote } from "@/types/domain";

type NoteAuthor = { nome: string | null };
type NoteRow = {
  id: string;
  tenant_id: string;
  chat_id: string;
  author_id: string;
  body_text: string;
  edited_at: string | null;
  created_at: string;
  author?: NoteAuthor | NoteAuthor[] | null;
};

function pickAuthorName(author: NoteRow["author"]): string | null {
  if (!author) return null;
  if (Array.isArray(author)) return author[0]?.nome ?? null;
  return author.nome ?? null;
}

function mapNote(row: NoteRow, fallbackName?: string): ChatNote {
  return {
    _noteKind: true,
    id: row.id,
    tenantId: row.tenant_id,
    chatId: row.chat_id,
    authorId: row.author_id,
    authorName: pickAuthorName(row.author)?.trim() || fallbackName || "Atendente",
    bodyText: row.body_text,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

const SELECT_NOTE = "id, tenant_id, chat_id, author_id, body_text, edited_at, created_at, author:profiles!chat_notes_author_id_fkey(nome)";

export async function listChatNotes(chatId: string): Promise<ChatNote[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("chat_notes")
    .select(SELECT_NOTE)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapNote(row as NoteRow));
}

export async function createChatNote(input: {
  chatId: string;
  bodyText: string;
}): Promise<ChatNote> {
  const supabase = requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tenant_id, nome")
    .eq("id", userId)
    .single();

  if (!profileRow?.tenant_id) throw new Error("Tenant não encontrado");

  const { data, error } = await supabase
    .from("chat_notes")
    .insert({
      tenant_id: profileRow.tenant_id,
      chat_id: input.chatId,
      author_id: userId,
      body_text: input.bodyText,
    })
    .select(SELECT_NOTE)
    .single();
  if (error) throw new Error(error.message);
  return mapNote(data as NoteRow, profileRow.nome ?? undefined);
}

export async function updateChatNote(id: string, bodyText: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("chat_notes")
    .update({ body_text: bodyText, edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteChatNote(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("chat_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const chatNotesQueryKey = (chatId: string | undefined) =>
  ["chat-notes", chatId] as const;

export function useChatNotes(chatId: string | undefined) {
  return useQuery({
    queryKey: chatNotesQueryKey(chatId),
    queryFn: () => listChatNotes(chatId as string),
    enabled: Boolean(chatId),
    staleTime: 60_000,
  });
}

export function useCreateChatNote(
  options?: UseMutationOptions<ChatNote, Error, { chatId: string; bodyText: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createChatNote,
    ...options,
    onSuccess: async (data, variables, context) => {
      queryClient.setQueryData<ChatNote[]>(chatNotesQueryKey(variables.chatId), (current) => {
        if (!current) return [data];
        if (current.some((n) => n.id === data.id)) return current;
        return [...current, data];
      });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateChatNote(
  options?: UseMutationOptions<void, Error, { id: string; chatId: string; bodyText: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, bodyText }) => updateChatNote(id, bodyText),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: chatNotesQueryKey(variables.chatId) });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteChatNote(
  options?: UseMutationOptions<void, Error, { id: string; chatId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => deleteChatNote(id),
    ...options,
    onSuccess: async (data, variables, context) => {
      queryClient.setQueryData<ChatNote[]>(chatNotesQueryKey(variables.chatId), (current) =>
        current ? current.filter((n) => n.id !== variables.id) : current,
      );
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/**
 * Realtime: nota inserida/editada/removida por outro atendente entra no thread
 * sem refetch. Para o autor, o setQueryData otimista já fez o trabalho.
 */
export function useChatNotesRealtime(chatId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId || !isSupabaseConfigured) {
      return;
    }
    const supabase = requireSupabase();
    const channel = supabase
      .channel(`chat-notes:${chatId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_notes", filter: `chat_id=eq.${chatId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatNotesQueryKey(chatId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);
}
