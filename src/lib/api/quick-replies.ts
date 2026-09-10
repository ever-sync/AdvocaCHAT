import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import type { QuickReply, QuickReplyScope } from "@/types/domain";

type QRRow = {
  id: string;
  tenant_id: string;
  title: string;
  shortcut: string | null;
  body_text: string;
  scope: QuickReplyScope;
  created_by: string;
  sort_order: number;
  created_at: string;
};

function mapQR(row: QRRow): QuickReply {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    shortcut: row.shortcut,
    bodyText: row.body_text,
    scope: row.scope,
    createdBy: row.created_by,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export async function listQuickReplies(): Promise<QuickReply[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("quick_replies")
    .select("id, tenant_id, title, shortcut, body_text, scope, created_by, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapQR(row as QRRow));
}

export async function createQuickReply(input: {
  title: string;
  shortcut: string | null;
  bodyText: string;
  scope: QuickReplyScope;
}): Promise<QuickReply> {
  const supabase = requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();

  const { data, error } = await supabase
    .from("quick_replies")
    .insert({
      tenant_id: profileRow?.tenant_id,
      title: input.title.trim(),
      shortcut: input.shortcut?.trim() || null,
      body_text: input.bodyText,
      scope: input.scope,
      created_by: userId,
    })
    .select("id, tenant_id, title, shortcut, body_text, scope, created_by, sort_order, created_at")
    .single();
  if (error) throw new Error(error.message);
  return mapQR(data as QRRow);
}

export async function updateQuickReply(
  id: string,
  input: { title?: string; shortcut?: string | null; bodyText?: string },
): Promise<void> {
  const supabase = requireSupabase();
  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title.trim();
  if ("shortcut" in input) update.shortcut = input.shortcut?.trim() || null;
  if (input.bodyText !== undefined) update.body_text = input.bodyText;
  const { error } = await supabase.from("quick_replies").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteQuickReply(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("quick_replies").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useQuickReplies() {
  return useQuery({
    queryKey: ["quick-replies"],
    queryFn: listQuickReplies,
    staleTime: 60_000,
  });
}

export function useCreateQuickReply(
  options?: UseMutationOptions<
    QuickReply,
    Error,
    { title: string; shortcut: string | null; bodyText: string; scope: QuickReplyScope }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createQuickReply,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateQuickReply(
  options?: UseMutationOptions<
    void,
    Error,
    { id: string; title?: string; shortcut?: string | null; bodyText?: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }) => updateQuickReply(id, rest),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteQuickReply(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteQuickReply,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
