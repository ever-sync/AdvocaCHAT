import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CrmNegotiationComment = {
  id: string;
  tenantId: string;
  negotiationId: string;
  createdBy: string;
  body: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
};

type CommentRow = {
  id: string;
  tenant_id: string;
  negotiation_id: string;
  created_by: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CommentRow): CrmNegotiationComment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    negotiationId: row.negotiation_id,
    createdBy: row.created_by,
    body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = "id, tenant_id, negotiation_id, created_by, body, mentions, created_at, updated_at";

export async function listCrmNegotiationComments(
  negotiationId: string,
): Promise<CrmNegotiationComment[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_negotiation_comments")
    .select(SELECT)
    .eq("negotiation_id", negotiationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as CommentRow));
}

export async function createCrmNegotiationComment(input: {
  negotiationId: string;
  body: string;
  mentions?: string[];
}): Promise<CrmNegotiationComment> {
  const body = input.body.trim();
  if (!body) throw new Error("Comentário vazio.");

  const supabase = requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();
  if (profileError) throw new Error(profileError.message);

  const mentions = Array.from(new Set(input.mentions ?? [])).filter(Boolean);

  const { data, error } = await supabase
    .from("crm_negotiation_comments")
    .insert({
      tenant_id: profileRow?.tenant_id,
      negotiation_id: input.negotiationId,
      created_by: userId,
      body,
      mentions,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as CommentRow);
}

export async function updateCrmNegotiationComment(
  id: string,
  input: { body?: string; mentions?: string[] },
): Promise<void> {
  const supabase = requireSupabase();
  const patch: Record<string, unknown> = {};
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new Error("Comentário vazio.");
    patch.body = body;
  }
  if (input.mentions !== undefined) {
    patch.mentions = Array.from(new Set(input.mentions)).filter(Boolean);
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .from("crm_negotiation_comments")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCrmNegotiationComment(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("crm_negotiation_comments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCrmNegotiationComments(negotiationId: string | undefined) {
  return useQuery({
    queryKey: ["crm-negotiation-comments", negotiationId ?? ""],
    queryFn: () => listCrmNegotiationComments(negotiationId as string),
    enabled: Boolean(negotiationId) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useCreateCrmNegotiationComment(
  options?: UseMutationOptions<
    CrmNegotiationComment,
    Error,
    { negotiationId: string; body: string; mentions?: string[] }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCrmNegotiationComment,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({
        queryKey: ["crm-negotiation-comments", data.negotiationId],
      });
      // A atividade-mirror também aparece na timeline existente.
      await queryClient.invalidateQueries({ queryKey: ["crm-activities"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCrmNegotiationComment(
  options?: UseMutationOptions<void, Error, { id: string; negotiationId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => deleteCrmNegotiationComment(id),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({
        queryKey: ["crm-negotiation-comments", variables.negotiationId],
      });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/** Realtime para a thread aberta: invalida cache quando há novos comentários. */
export function useCrmNegotiationCommentsRealtime(negotiationId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!negotiationId || !isSupabaseConfigured) return;
    const supabase = requireSupabase();
    const channel = supabase
      .channel(`crm-comments:${negotiationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_negotiation_comments",
          filter: `negotiation_id=eq.${negotiationId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["crm-negotiation-comments", negotiationId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [negotiationId, queryClient]);
}
