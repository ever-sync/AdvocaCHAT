import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import {
  DEFAULT_ROLE_PERMISSIONS,
  mergeRolePermissionsConfig,
  normalizePermissionMatrix,
  serializeRolePermissionsConfig,
  type RolePermissionMatrix,
  type TenantRolePermissionsConfig,
} from "@/lib/permissions/role-permissions";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { UserRole } from "@/types/domain";

export async function fetchTenantRolePermissions(): Promise<TenantRolePermissionsConfig> {
  if (!isSupabaseConfigured) {
    return { ...DEFAULT_ROLE_PERMISSIONS };
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("role_permissions")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mergeRolePermissionsConfig(data?.role_permissions);
}

export async function saveTenantRolePermissions(
  role: UserRole,
  matrix: RolePermissionMatrix,
): Promise<TenantRolePermissionsConfig> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de salvar permissoes.");
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const current = await fetchTenantRolePermissions();
  const normalized = normalizePermissionMatrix(matrix);
  const next: TenantRolePermissionsConfig = {
    ...current,
    [role]: normalized,
  };

  const { error } = await supabase.from("tenant_settings").upsert(
    {
      tenant_id: tenantId,
      role_permissions: serializeRolePermissionsConfig(next),
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  return next;
}

export function useTenantRolePermissions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["tenant-role-permissions"],
    queryFn: fetchTenantRolePermissions,
    enabled: (options?.enabled ?? true) && isSupabaseConfigured,
    // Permissões mudam raramente (config de admin). useSaveTenantRolePermissions
    // já invalida em onSuccess, então não há ganho em refetchar a cada focus.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useSaveTenantRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ role, matrix }: { role: UserRole; matrix: RolePermissionMatrix }) =>
      saveTenantRolePermissions(role, matrix),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-role-permissions"] });
    },
  });
}
