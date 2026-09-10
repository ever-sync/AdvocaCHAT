import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type WaitlistStatus = "aguardando" | "agendado" | "cancelado";

export type WaitlistEntry = {
  id: string;
  tenantId: string;
  customerId: string | null;
  serviceId: string | null;
  providerId: string | null;
  customerNome: string;
  customerTelefone: string | null;
  preferencia: string | null;
  status: WaitlistStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT =
  "id, tenant_id, customer_id, service_id, provider_id, customer_nome, customer_telefone, preferencia, status, notes, created_at, updated_at";

function mapRow(row: Record<string, unknown>): WaitlistEntry {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    serviceId: row.service_id != null ? String(row.service_id) : null,
    providerId: row.provider_id != null ? String(row.provider_id) : null,
    customerNome: String(row.customer_nome),
    customerTelefone: row.customer_telefone != null ? String(row.customer_telefone) : null,
    preferencia: row.preferencia != null ? String(row.preferencia) : null,
    status: (row.status as WaitlistStatus) ?? "aguardando",
    notes: String(row.notes ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type WaitlistInput = {
  customerNome: string;
  customerTelefone?: string | null;
  customerId?: string | null;
  serviceId?: string | null;
  providerId?: string | null;
  preferencia?: string | null;
  notes?: string;
};

export async function listWaitlist(filters?: {
  serviceId?: string;
  providerId?: string;
}): Promise<WaitlistEntry[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase
    .from("scheduling_waitlist")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("status", "aguardando");
  if (filters?.serviceId) q = q.eq("service_id", filters.serviceId);
  if (filters?.providerId) q = q.eq("provider_id", filters.providerId);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(asDbRow(r)));
}

export async function createWaitlistEntry(input: WaitlistInput): Promise<WaitlistEntry> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_waitlist")
    .insert({
      tenant_id: tenantId,
      customer_nome: input.customerNome.trim(),
      customer_telefone: input.customerTelefone ?? null,
      customer_id: input.customerId ?? null,
      service_id: input.serviceId ?? null,
      provider_id: input.providerId ?? null,
      preferencia: input.preferencia ?? null,
      notes: input.notes?.trim() ?? "",
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(asDbRow(data));
}

export async function setWaitlistStatus(id: string, status: WaitlistStatus): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("scheduling_waitlist")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

const KEY = ["scheduling-waitlist"] as const;

export function useWaitlist(
  filters?: { serviceId?: string; providerId?: string },
  options?: Omit<UseQueryOptions<WaitlistEntry[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...KEY, filters?.serviceId ?? "all", filters?.providerId ?? "all"],
    queryFn: () => listWaitlist(filters),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export function useCreateWaitlistEntry(options?: UseMutationOptions<WaitlistEntry, Error, WaitlistInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWaitlistEntry,
    ...options,
    onSuccess: async (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(d, v, c);
    },
  });
}

export function useSetWaitlistStatus(
  options?: UseMutationOptions<void, Error, { id: string; status: WaitlistStatus }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }) => setWaitlistStatus(id, status),
    ...options,
    onSuccess: async (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(d, v, c);
    },
  });
}
