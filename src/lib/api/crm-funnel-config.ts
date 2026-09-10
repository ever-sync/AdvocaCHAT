import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { DEFAULT_CRM_FUNNELS, type CrmFunnel, parseTenantCrmFunnelsJson } from "@/data/crm-funnels";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

const QUERY_KEY = ["tenant-crm-funnel-config"] as const;

/** `null` = usar funis padrão do app. */
export async function fetchTenantCrmFunnelConfig(): Promise<CrmFunnel[] | null> {
  if (!isSupabaseConfigured) {
    return null;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("tenant_crm_funnel_config")
    .select("funnels")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.funnels) {
    return null;
  }
  return parseTenantCrmFunnelsJson(data.funnels);
}

export async function upsertTenantCrmFunnelConfig(funnels: CrmFunnel[]): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  if (funnels.length === 0) {
    throw new Error("Informe ao menos um funil.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("tenant_crm_funnel_config").upsert(
    {
      tenant_id: tenantId,
      funnels,
    },
    { onConflict: "tenant_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteTenantCrmFunnelConfig(): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("tenant_crm_funnel_config").delete().eq("tenant_id", tenantId);
  if (error) {
    throw new Error(error.message);
  }
}

export function useTenantCrmFunnelConfig(
  options?: Omit<UseQueryOptions<CrmFunnel[] | null, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchTenantCrmFunnelConfig,
    staleTime: 60_000,
    ...options,
  });
}

/** Funis do tenant ou padrão do app (`null` da API vira lista padrão). */
export function useEffectiveCrmFunnels(
  options?: Omit<UseQueryOptions<CrmFunnel[] | null, Error>, "queryKey" | "queryFn">,
) {
  const query = useTenantCrmFunnelConfig(options);
  return {
    ...query,
    data: query.data ?? DEFAULT_CRM_FUNNELS,
  };
}

/** Lista efetiva para o CRM: salva no tenant ou padrão. */
export function useUpsertTenantCrmFunnelConfig(
  options?: UseMutationOptions<void, Error, CrmFunnel[]>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTenantCrmFunnelConfig,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteTenantCrmFunnelConfig(options?: UseMutationOptions<void, Error, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTenantCrmFunnelConfig,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
