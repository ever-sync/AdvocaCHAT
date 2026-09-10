import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type {
  ProviderSettings,
  SchedulingException,
  SchedulingExceptionKind,
  WorkingHour,
} from "@/types/domain";

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

// --------------------------------------------------------------------------
// Provider settings (1 por prestador)
// --------------------------------------------------------------------------

const SETTINGS_SELECT = [
  "id",
  "tenant_id",
  "provider_id",
  "timezone",
  "slot_granularity_min",
  "min_lead_time_min",
  "max_advance_days",
  "accepts_online_booking",
  "created_at",
  "updated_at",
].join(", ");

function mapSettings(row: Record<string, unknown>): ProviderSettings {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    providerId: String(row.provider_id),
    timezone: String(row.timezone ?? "America/Sao_Paulo"),
    slotGranularityMin: Number(row.slot_granularity_min ?? 15),
    minLeadTimeMin: Number(row.min_lead_time_min ?? 60),
    maxAdvanceDays: Number(row.max_advance_days ?? 60),
    acceptsOnlineBooking: Boolean(row.accepts_online_booking),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export type ProviderSettingsInput = {
  providerId: string;
  timezone?: string;
  slotGranularityMin?: number;
  minLeadTimeMin?: number;
  maxAdvanceDays?: number;
  acceptsOnlineBooking?: boolean;
};

export async function listProviderSettings(): Promise<ProviderSettings[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_provider_settings")
    .select(SETTINGS_SELECT)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapSettings(asDbRow(r)));
}

export async function upsertProviderSettings(
  input: ProviderSettingsInput,
): Promise<ProviderSettings> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    provider_id: input.providerId,
  };
  if (input.timezone !== undefined) row.timezone = input.timezone;
  if (input.slotGranularityMin !== undefined) row.slot_granularity_min = input.slotGranularityMin;
  if (input.minLeadTimeMin !== undefined) row.min_lead_time_min = input.minLeadTimeMin;
  if (input.maxAdvanceDays !== undefined) row.max_advance_days = input.maxAdvanceDays;
  if (input.acceptsOnlineBooking !== undefined) row.accepts_online_booking = input.acceptsOnlineBooking;
  const { data, error } = await supabase
    .from("scheduling_provider_settings")
    .upsert(row, { onConflict: "tenant_id,provider_id" })
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapSettings(asDbRow(data));
}

// --------------------------------------------------------------------------
// Working hours (expediente recorrente)
// --------------------------------------------------------------------------

const WH_SELECT = [
  "id",
  "tenant_id",
  "provider_id",
  "weekday",
  "start_time",
  "end_time",
  "created_at",
  "updated_at",
].join(", ");

function mapWorkingHour(row: Record<string, unknown>): WorkingHour {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    providerId: String(row.provider_id),
    weekday: Number(row.weekday),
    // Postgres `time` vem como "HH:MM:SS"; normaliza pra "HH:MM".
    startTime: String(row.start_time ?? "").slice(0, 5),
    endTime: String(row.end_time ?? "").slice(0, 5),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Todos os expedientes do tenant (para sombrear a grade com vários prestadores). */
export async function listAllWorkingHours(): Promise<WorkingHour[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_working_hours")
    .select(WH_SELECT)
    .eq("tenant_id", tenantId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapWorkingHour(asDbRow(r)));
}

export async function listWorkingHours(providerId: string): Promise<WorkingHour[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_working_hours")
    .select(WH_SELECT)
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapWorkingHour(asDbRow(r)));
}

export async function createWorkingHour(input: {
  providerId: string;
  weekday: number;
  startTime: string;
  endTime: string;
}): Promise<WorkingHour> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_working_hours")
    .insert({
      tenant_id: tenantId,
      provider_id: input.providerId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
    })
    .select(WH_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapWorkingHour(asDbRow(data));
}

export async function deleteWorkingHour(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("scheduling_working_hours")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// --------------------------------------------------------------------------
// Exceptions (folgas / bloqueios / aberturas extras)
// --------------------------------------------------------------------------

const EXC_SELECT = [
  "id",
  "tenant_id",
  "provider_id",
  "kind",
  "starts_at",
  "ends_at",
  "reason",
  "source",
  "google_event_id",
  "created_at",
  "updated_at",
].join(", ");

function mapException(row: Record<string, unknown>): SchedulingException {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    providerId: String(row.provider_id),
    kind: (row.kind as SchedulingExceptionKind) ?? "block",
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    reason: row.reason != null ? String(row.reason) : null,
    source: (row.source as SchedulingException["source"]) ?? "manual",
    googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Exceções de todos os prestadores no intervalo (sombreamento da grade). */
export async function listAllExceptions(filters: {
  from: Date;
  to: Date;
}): Promise<SchedulingException[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_exceptions")
    .select(EXC_SELECT)
    .eq("tenant_id", tenantId)
    .gte("ends_at", filters.from.toISOString())
    .lte("starts_at", filters.to.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapException(asDbRow(r)));
}

export async function listExceptions(filters: {
  providerId: string;
  from?: Date;
  to?: Date;
}): Promise<SchedulingException[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase
    .from("scheduling_exceptions")
    .select(EXC_SELECT)
    .eq("tenant_id", tenantId)
    .eq("provider_id", filters.providerId);
  if (filters.from) q = q.gte("ends_at", filters.from.toISOString());
  if (filters.to) q = q.lte("starts_at", filters.to.toISOString());
  const { data, error } = await q.order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapException(asDbRow(r)));
}

export async function createException(input: {
  providerId: string;
  kind: SchedulingExceptionKind;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
}): Promise<SchedulingException> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_exceptions")
    .insert({
      tenant_id: tenantId,
      provider_id: input.providerId,
      kind: input.kind,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      reason: input.reason ?? null,
      source: "manual",
    })
    .select(EXC_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapException(asDbRow(data));
}

export async function deleteException(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("scheduling_exceptions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// --------------------------------------------------------------------------
// Hooks
// --------------------------------------------------------------------------

const SETTINGS_KEY = ["scheduling-provider-settings"] as const;
const WH_KEY = ["scheduling-working-hours"] as const;
const EXC_KEY = ["scheduling-exceptions"] as const;

export function useProviderSettings(
  options?: Omit<UseQueryOptions<ProviderSettings[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: SETTINGS_KEY,
    queryFn: listProviderSettings,
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 60_000,
  });
}

export function useUpsertProviderSettings(
  options?: UseMutationOptions<ProviderSettings, Error, ProviderSettingsInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertProviderSettings,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useAllWorkingHours(
  options?: Omit<UseQueryOptions<WorkingHour[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...WH_KEY, "all"],
    queryFn: listAllWorkingHours,
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 60_000,
  });
}

export function useAllExceptions(
  from: Date,
  to: Date,
  options?: Omit<UseQueryOptions<SchedulingException[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...EXC_KEY, "all", from.toISOString(), to.toISOString()],
    queryFn: () => listAllExceptions({ from, to }),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export function useWorkingHours(
  providerId: string | undefined,
  options?: Omit<UseQueryOptions<WorkingHour[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...WH_KEY, providerId],
    queryFn: () => listWorkingHours(providerId!),
    enabled: Boolean(providerId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 60_000,
  });
}

export function useCreateWorkingHour(
  options?: UseMutationOptions<
    WorkingHour,
    Error,
    { providerId: string; weekday: number; startTime: string; endTime: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkingHour,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: WH_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteWorkingHour(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkingHour,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: WH_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useExceptions(
  filters: { providerId: string | undefined; from?: Date; to?: Date },
  options?: Omit<UseQueryOptions<SchedulingException[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...EXC_KEY, filters.providerId, filters.from?.toISOString(), filters.to?.toISOString()],
    queryFn: () => listExceptions({ providerId: filters.providerId!, from: filters.from, to: filters.to }),
    enabled: Boolean(filters.providerId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export function useCreateException(
  options?: UseMutationOptions<
    SchedulingException,
    Error,
    { providerId: string; kind: SchedulingExceptionKind; startsAt: string; endsAt: string; reason?: string | null }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createException,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: EXC_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteException(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteException,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: EXC_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}
