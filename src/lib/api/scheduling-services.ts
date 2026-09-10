import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { SchedulingService } from "@/types/domain";

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT = [
  "id",
  "tenant_id",
  "product_id",
  "provider_id",
  "duracao_min",
  "preco",
  "buffer_antes_min",
  "buffer_depois_min",
  "ativo",
  "created_at",
  "updated_at",
].join(", ");

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function mapRow(row: Record<string, unknown>): SchedulingService {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    productId: String(row.product_id),
    providerId: String(row.provider_id),
    duracaoMin: Number(row.duracao_min ?? 30),
    preco: numberOrNull(row.preco),
    bufferAntesMin: Number(row.buffer_antes_min ?? 0),
    bufferDepoisMin: Number(row.buffer_depois_min ?? 0),
    ativo: Boolean(row.ativo),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type SchedulingServiceInput = {
  productId: string;
  providerId: string;
  duracaoMin: number;
  preco?: number | null;
  bufferAntesMin?: number;
  bufferDepoisMin?: number;
  ativo?: boolean;
};

export async function listSchedulingServices(filters?: {
  productId?: string;
  providerId?: string;
  activeOnly?: boolean;
}): Promise<SchedulingService[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase.from("scheduling_services").select(SELECT).eq("tenant_id", tenantId);
  if (filters?.productId) q = q.eq("product_id", filters.productId);
  if (filters?.providerId) q = q.eq("provider_id", filters.providerId);
  if (filters?.activeOnly) q = q.eq("ativo", true);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapRow(asDbRow(r)));
}

export async function upsertSchedulingService(
  input: SchedulingServiceInput,
): Promise<SchedulingService> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_services")
    .upsert(
      {
        tenant_id: tenantId,
        product_id: input.productId,
        provider_id: input.providerId,
        duracao_min: input.duracaoMin,
        preco: input.preco ?? null,
        buffer_antes_min: input.bufferAntesMin ?? 0,
        buffer_depois_min: input.bufferDepoisMin ?? 0,
        ativo: input.ativo ?? true,
      },
      { onConflict: "tenant_id,product_id,provider_id" },
    )
    .select(SELECT)
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapRow(asDbRow(data));
}

export async function deleteSchedulingService(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("scheduling_services")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

const KEY = ["scheduling-services"] as const;

export function useSchedulingServices(
  filters?: { productId?: string; providerId?: string; activeOnly?: boolean },
  options?: Omit<UseQueryOptions<SchedulingService[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...KEY, filters?.productId ?? "all", filters?.providerId ?? "all", filters?.activeOnly ?? false],
    queryFn: () => listSchedulingServices(filters),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export function useUpsertSchedulingService(
  options?: UseMutationOptions<SchedulingService, Error, SchedulingServiceInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertSchedulingService,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteSchedulingService(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSchedulingService,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}
