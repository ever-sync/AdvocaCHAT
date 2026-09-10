import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type SchedulingRoom = {
  id: string;
  tenantId: string;
  nome: string;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT = "id, tenant_id, nome, ativo, created_at, updated_at";

function mapRow(row: Record<string, unknown>): SchedulingRoom {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    nome: String(row.nome),
    ativo: Boolean(row.ativo),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listRooms(activeOnly = false): Promise<SchedulingRoom[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase.from("scheduling_rooms").select(SELECT).eq("tenant_id", tenantId);
  if (activeOnly) q = q.eq("ativo", true);
  const { data, error } = await q.order("nome", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(asDbRow(r)));
}

export async function createRoom(nome: string): Promise<SchedulingRoom> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_rooms")
    .insert({ tenant_id: tenantId, nome: nome.trim() })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(asDbRow(data));
}

export async function deleteRoom(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("scheduling_rooms").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
}

const KEY = ["scheduling-rooms"] as const;

export function useRooms(
  activeOnly = false,
  options?: Omit<UseQueryOptions<SchedulingRoom[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...KEY, activeOnly],
    queryFn: () => listRooms(activeOnly),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 60_000,
  });
}

export function useCreateRoom(options?: UseMutationOptions<SchedulingRoom, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRoom,
    ...options,
    onSuccess: async (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(d, v, c);
    },
  });
}

export function useDeleteRoom(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRoom,
    ...options,
    onSuccess: async (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(d, v, c);
    },
  });
}
