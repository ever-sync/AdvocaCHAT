import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CrmTaskTemplate } from "@/types/domain";

type Row = {
  id: string;
  tenant_id: string;
  title: string;
  notes: string | null;
  default_due_days: number | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  "id, tenant_id, title, notes, default_due_days, sort_order, created_by, created_at, updated_at";

function mapRow(row: Row): CrmTaskTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    notes: row.notes ?? "",
    defaultDueDays: row.default_due_days,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCrmTaskTemplates(): Promise<CrmTaskTemplate[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_task_templates")
    .select(SELECT)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Row));
}

export type CrmTaskTemplateInput = {
  title: string;
  notes?: string;
  defaultDueDays?: number | null;
};

export async function createCrmTaskTemplate(input: CrmTaskTemplateInput): Promise<CrmTaskTemplate> {
  const supabase = requireSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .single();

  const title = input.title.trim();
  if (!title) throw new Error("Informe um título para o modelo.");

  const { data, error } = await supabase
    .from("crm_task_templates")
    .insert({
      tenant_id: profileRow?.tenant_id,
      title,
      notes: input.notes?.trim() ?? "",
      default_due_days: normalizeDueDays(input.defaultDueDays),
      created_by: userId,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Row);
}

export async function updateCrmTaskTemplate(
  id: string,
  input: { title?: string; notes?: string; defaultDueDays?: number | null },
): Promise<void> {
  const supabase = requireSupabase();
  const update: Record<string, unknown> = {};
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.notes !== undefined) update.notes = input.notes.trim();
  if ("defaultDueDays" in input) update.default_due_days = normalizeDueDays(input.defaultDueDays);
  const { error } = await supabase.from("crm_task_templates").update(update).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCrmTaskTemplate(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("crm_task_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

function normalizeDueDays(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const n = Math.trunc(value);
  return n > 0 ? n : null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export const crmTaskTemplatesQueryKey = ["crm-task-templates"] as const;

export function useCrmTaskTemplates() {
  return useQuery({
    queryKey: crmTaskTemplatesQueryKey,
    queryFn: listCrmTaskTemplates,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useCreateCrmTaskTemplate(
  options?: UseMutationOptions<CrmTaskTemplate, Error, CrmTaskTemplateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCrmTaskTemplate,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: crmTaskTemplatesQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateCrmTaskTemplate(
  options?: UseMutationOptions<
    void,
    Error,
    { id: string; title?: string; notes?: string; defaultDueDays?: number | null }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }) => updateCrmTaskTemplate(id, rest),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: crmTaskTemplatesQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCrmTaskTemplate(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCrmTaskTemplate,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: crmTaskTemplatesQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/** Realtime: o catálogo de modelos muda e as telas que usam (config/CRM) atualizam. */
export function useCrmTaskTemplatesRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;
        channel = supabase
          .channel(`crm-task-templates:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "crm_task_templates",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              void queryClient.invalidateQueries({ queryKey: crmTaskTemplatesQueryKey });
            },
          )
          .subscribe();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}
