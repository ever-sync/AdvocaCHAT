import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { requireSupabase } from "@/lib/supabase";

export type PlatformTenantOption = {
  tenant_id: string;
  nome: string;
  cnpj: string | null;
  created_at: string | null;
};

export type PlatformTenantContext = {
  current_tenant_id: string | null;
  default_tenant_id: string | null;
  selected_tenant_id: string | null;
  is_platform_admin: boolean;
};

export async function listPlatformTenants(): Promise<PlatformTenantOption[]> {
  const response = await invokeAuthedFunction<{ generated_at?: string; tenants?: PlatformTenantOption[] }>(
    "operation-admin?view=tenants",
    undefined,
    "GET",
  );
  return response.tenants ?? [];
}

export function usePlatformTenants(
  options?: Omit<UseQueryOptions<PlatformTenantOption[], Error>, "queryKey" | "queryFn">,
) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["platform-admin-tenants", profile?.id ?? "anonymous"],
    queryFn: listPlatformTenants,
    staleTime: 30_000,
    retry: false,
    ...options,
  });
}

export async function fetchPlatformTenantContext(): Promise<PlatformTenantContext> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("get_platform_tenant_context");

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Não foi possível identificar o tenant ativo.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new Error("Não foi possível identificar o tenant ativo.");
  }

  const context = row as Record<string, unknown>;
  return {
    current_tenant_id: typeof context.current_tenant_id === "string" ? context.current_tenant_id : null,
    default_tenant_id: typeof context.default_tenant_id === "string" ? context.default_tenant_id : null,
    selected_tenant_id: typeof context.selected_tenant_id === "string" ? context.selected_tenant_id : null,
    is_platform_admin: Boolean(context.is_platform_admin),
  };
}

export function usePlatformTenantContext(
  options?: Omit<UseQueryOptions<PlatformTenantContext, Error>, "queryKey" | "queryFn">,
) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["platform-tenant-context", profile?.id ?? "anonymous"],
    queryFn: fetchPlatformTenantContext,
    staleTime: 15_000,
    retry: false,
    ...options,
  });
}

export async function setPlatformTenantContext(tenantId: string | null): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_platform_tenant_context", {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export function useSetPlatformTenantContext(
  options?: UseMutationOptions<void, Error, string | null>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: setPlatformTenantContext,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries();
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
