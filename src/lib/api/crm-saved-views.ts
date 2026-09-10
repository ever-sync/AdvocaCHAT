import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { getCurrentTenantId } from "@/lib/api/tenant";

export type CrmSavedViewScope = "private" | "shared";

/**
 * Filtros serializados de uma vista do CRM. Espelha as keys de search params
 * (Pacote 1). Valores não-default — o front normaliza ao salvar/aplicar.
 */
export type CrmSavedViewFilters = Partial<{
  funnel: string;
  q: string;
  owner: "all" | "mine" | "pool" | "custom";
  owners: string[];
  status: string;
  alerts: string;
  score: string;
  /** Filtro avançado serializado (mesmo formato do search param `?adv=`). */
  adv: string;
  from: string;
  to: string;
  sort: string;
  view: "board" | "list";
}>;

export type CrmSavedView = {
  id: string;
  tenantId: string;
  createdBy: string;
  name: string;
  scope: CrmSavedViewScope;
  filters: CrmSavedViewFilters;
  createdAt: string;
  updatedAt: string;
};

type CrmSavedViewRow = {
  id: string;
  tenant_id: string;
  created_by: string;
  name: string;
  scope: CrmSavedViewScope;
  filters: unknown;
  created_at: string;
  updated_at: string;
};

function mapRow(row: CrmSavedViewRow): CrmSavedView {
  const f = (row.filters && typeof row.filters === "object" ? row.filters : {}) as CrmSavedViewFilters;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    name: row.name,
    scope: row.scope,
    filters: f,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLS = "id, tenant_id, created_by, name, scope, filters, created_at, updated_at";

export async function listCrmSavedViews(): Promise<CrmSavedView[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_saved_views")
    .select(SELECT_COLS)
    .order("scope", { ascending: false }) // shared antes de private (estética)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as CrmSavedViewRow));
}

export async function createCrmSavedView(input: {
  name: string;
  scope: CrmSavedViewScope;
  filters: CrmSavedViewFilters;
}): Promise<CrmSavedView> {
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

  const { data, error } = await supabase
    .from("crm_saved_views")
    .insert({
      tenant_id: profileRow?.tenant_id,
      created_by: userId,
      name: input.name.trim(),
      scope: input.scope,
      filters: input.filters,
    })
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as CrmSavedViewRow);
}

export async function updateCrmSavedView(
  id: string,
  input: { name?: string; scope?: CrmSavedViewScope; filters?: CrmSavedViewFilters },
): Promise<void> {
  const supabase = requireSupabase();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.scope !== undefined) patch.scope = input.scope;
  if (input.filters !== undefined) patch.filters = input.filters;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("crm_saved_views").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCrmSavedView(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("crm_saved_views").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCrmSavedViews() {
  return useQuery({
    queryKey: ["crm-saved-views"],
    queryFn: listCrmSavedViews,
    enabled: isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useCreateCrmSavedView(
  options?: UseMutationOptions<
    CrmSavedView,
    Error,
    { name: string; scope: CrmSavedViewScope; filters: CrmSavedViewFilters }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCrmSavedView,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-saved-views"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateCrmSavedView(
  options?: UseMutationOptions<
    void,
    Error,
    { id: string; name?: string; scope?: CrmSavedViewScope; filters?: CrmSavedViewFilters }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...rest }) => updateCrmSavedView(id, rest),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-saved-views"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCrmSavedView(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCrmSavedView,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-saved-views"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/** Realtime: invalida cache quando novas vistas chegam ou são editadas/excluídas. */
export function useCrmSavedViewsRealtime() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Filtro por tenant no servidor: sem ele o Realtime avalia cada mudança de
    // crm_saved_views de todos os tenants contra cada assinante (não escala).
    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;
        channel = supabase
          .channel(`crm-saved-views:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "crm_saved_views",
              filter: `tenant_id=eq.${tenantId}`,
            },
            () => {
              void queryClient.invalidateQueries({ queryKey: ["crm-saved-views"] });
            },
          )
          .subscribe();
      })
      .catch(() => {
        // Sem sessao/tenant: rota provavelmente protegida; ignorar.
      });

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queryClient]);
}
