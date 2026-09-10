import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { Appointment, AppointmentStatus } from "@/types/domain";

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT = [
  "id",
  "tenant_id",
  "provider_id",
  "service_id",
  "customer_id",
  "room_id",
  "series_id",
  "convenio",
  "starts_at",
  "ends_at",
  "status",
  "origin",
  "google_event_id",
  "google_calendar_id",
  "google_sync_status",
  "google_synced_at",
  "google_sync_error",
  "customer_nome",
  "customer_telefone",
  "service_nome",
  "preco",
  "notes",
  "checked_in_at",
  "cancel_reason",
  "created_by",
  "created_at",
  "updated_at",
  "stacked_services",
  "clinical_notes",
].join(", ");

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function mapAppointmentRow(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    providerId: String(row.provider_id),
    serviceId: row.service_id != null ? String(row.service_id) : null,
    customerId: row.customer_id != null ? String(row.customer_id) : null,
    roomId: row.room_id != null ? String(row.room_id) : null,
    seriesId: row.series_id != null ? String(row.series_id) : null,
    convenio: row.convenio != null ? String(row.convenio) : null,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    status: (row.status as AppointmentStatus) ?? "agendado",
    origin: (row.origin as Appointment["origin"]) ?? "interno",
    googleEventId: row.google_event_id != null ? String(row.google_event_id) : null,
    googleCalendarId: row.google_calendar_id != null ? String(row.google_calendar_id) : null,
    googleSyncStatus: (row.google_sync_status as Appointment["googleSyncStatus"]) ?? "pending",
    googleSyncedAt: row.google_synced_at != null ? String(row.google_synced_at) : null,
    googleSyncError: row.google_sync_error != null ? String(row.google_sync_error) : null,
    customerNome: row.customer_nome != null ? String(row.customer_nome) : null,
    customerTelefone: row.customer_telefone != null ? String(row.customer_telefone) : null,
    serviceNome: row.service_nome != null ? String(row.service_nome) : null,
    preco: numberOrNull(row.preco),
    notes: String(row.notes ?? ""),
    checkedInAt: row.checked_in_at != null ? String(row.checked_in_at) : null,
    cancelReason: row.cancel_reason != null ? String(row.cancel_reason) : null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    stackedServices:
      row.stacked_services != null
        ? (row.stacked_services as Appointment["stackedServices"])
        : null,
    clinicalNotes: row.clinical_notes != null ? String(row.clinical_notes) : null,
  };
}

export type AppointmentCreateInput = {
  providerId: string;
  startsAt: string;
  endsAt: string;
  serviceId?: string | null;
  customerId?: string | null;
  roomId?: string | null;
  seriesId?: string | null;
  convenio?: string | null;
  status?: AppointmentStatus;
  customerNome?: string | null;
  customerTelefone?: string | null;
  serviceNome?: string | null;
  preco?: number | null;
  notes?: string;
  stackedServices?: { id: string; nome: string; duracaoMin: number; preco: number | null }[] | null;
  clinicalNotes?: string | null;
};

export type AppointmentPatch = Partial<{
  providerId: string;
  serviceId: string | null;
  customerId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  customerNome: string | null;
  customerTelefone: string | null;
  serviceNome: string | null;
  preco: number | null;
  notes: string;
  checkedInAt: string | null;
  cancelReason: string | null;
  roomId: string | null;
  convenio: string | null;
  stackedServices: { id: string; nome: string; duracaoMin: number; preco: number | null }[] | null;
  clinicalNotes: string | null;
}>;

function patchToRow(p: AppointmentPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.providerId !== undefined) row.provider_id = p.providerId;
  if (p.serviceId !== undefined) row.service_id = p.serviceId;
  if (p.customerId !== undefined) row.customer_id = p.customerId;
  if (p.startsAt !== undefined) row.starts_at = p.startsAt;
  if (p.endsAt !== undefined) row.ends_at = p.endsAt;
  if (p.status !== undefined) row.status = p.status;
  if (p.customerNome !== undefined) row.customer_nome = p.customerNome;
  if (p.customerTelefone !== undefined) row.customer_telefone = p.customerTelefone;
  if (p.serviceNome !== undefined) row.service_nome = p.serviceNome;
  if (p.preco !== undefined) row.preco = p.preco;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.checkedInAt !== undefined) row.checked_in_at = p.checkedInAt;
  if (p.cancelReason !== undefined) row.cancel_reason = p.cancelReason;
  if (p.roomId !== undefined) row.room_id = p.roomId;
  if (p.convenio !== undefined) row.convenio = p.convenio;
  if (p.stackedServices !== undefined) row.stacked_services = p.stackedServices;
  if (p.clinicalNotes !== undefined) row.clinical_notes = p.clinicalNotes;
  // Reagendamento/alteração de status reenfileira o sync com o Google.
  if (p.startsAt !== undefined || p.endsAt !== undefined || p.status !== undefined) {
    row.google_sync_status = "pending";
  }
  return row;
}

/** Erro de sobreposição (constraint btree_gist) — caller deve mostrar "horário ocupado". */
export class AppointmentOverlapError extends Error {
  constructor(message = "Já existe um agendamento neste horário para este prestador.") {
    super(message);
    this.name = "AppointmentOverlapError";
  }
}

function isOverlapError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "23P01" ||
    /scheduling_appointments_no_overlap|exclusion constraint/i.test(error.message ?? "")
  );
}

export async function listAppointmentsByRange(filters: {
  from: Date;
  to: Date;
  providerId?: string;
}): Promise<Appointment[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  let q = supabase
    .from("scheduling_appointments")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .gte("starts_at", filters.from.toISOString())
    .lte("starts_at", filters.to.toISOString());
  if (filters.providerId) {
    q = q.eq("provider_id", filters.providerId);
  }
  const { data, error } = await q.order("starts_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapAppointmentRow(asDbRow(r)));
}

export async function createAppointment(input: AppointmentCreateInput): Promise<Appointment> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_appointments")
    .insert({
      tenant_id: tenantId,
      provider_id: input.providerId,
      service_id: input.serviceId ?? null,
      customer_id: input.customerId ?? null,
      room_id: input.roomId ?? null,
      series_id: input.seriesId ?? null,
      convenio: input.convenio ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      status: input.status ?? "agendado",
      origin: "interno",
      customer_nome: input.customerNome ?? null,
      customer_telefone: input.customerTelefone ?? null,
      service_nome: input.serviceNome ?? null,
      preco: input.preco ?? null,
      notes: input.notes?.trim() ?? "",
      stacked_services: input.stackedServices ?? null,
      clinical_notes: input.clinicalNotes ?? null,
    })
    .select(SELECT)
    .single();
  if (error) {
    if (isOverlapError(error)) {
      throw new AppointmentOverlapError();
    }
    throw new Error(error.message);
  }
  return mapAppointmentRow(asDbRow(data));
}

export async function updateAppointment(id: string, patch: AppointmentPatch): Promise<Appointment> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const row = patchToRow(patch);
  const { data, error } = await supabase
    .from("scheduling_appointments")
    .update(row)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) {
    if (isOverlapError(error)) {
      throw new AppointmentOverlapError();
    }
    throw new Error(error.message);
  }
  return mapAppointmentRow(asDbRow(data));
}

export async function cancelAppointment(id: string): Promise<Appointment> {
  return updateAppointment(id, { status: "cancelado" });
}

const APPOINTMENTS_KEY = ["scheduling-appointments"] as const;

export function useAppointmentsRange(
  from: Date,
  to: Date,
  providerId?: string,
  options?: Omit<UseQueryOptions<Appointment[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...APPOINTMENTS_KEY, "range", from.toISOString(), to.toISOString(), providerId ?? "all"],
    queryFn: () => listAppointmentsByRange({ from, to, providerId }),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 15_000,
  });
}

export function useCreateAppointment(
  options?: UseMutationOptions<Appointment, Error, AppointmentCreateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAppointment,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useUpdateAppointment(
  options?: UseMutationOptions<Appointment, Error, { id: string; patch: AppointmentPatch }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }) => updateAppointment(id, patch),
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useCancelAppointment(
  options?: UseMutationOptions<Appointment, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelAppointment,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export async function updateAppointmentSeries(
  seriesId: string,
  patch: AppointmentPatch,
  mode: "all" | "following",
  currentStartsAt?: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const row = patchToRow(patch);

  // As datas de início e término, status, check-in, cancelamento e notas clínicas não devem ser unificados em lote para a série inteira
  delete row.starts_at;
  delete row.ends_at;
  delete row.status;
  delete row.checked_in_at;
  delete row.cancel_reason;
  delete row.clinical_notes;

  let query = supabase
    .from("scheduling_appointments")
    .update(row)
    .eq("tenant_id", tenantId)
    .eq("series_id", seriesId);

  if (mode === "following" && currentStartsAt) {
    query = query.gte("starts_at", currentStartsAt);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

export async function cancelAppointmentSeries(
  seriesId: string,
  mode: "all" | "following",
  currentStartsAt?: string,
  cancelReason?: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();

  let query = supabase
    .from("scheduling_appointments")
    .update({
      status: "cancelado",
      cancel_reason: cancelReason || null,
      google_sync_status: "pending",
    })
    .eq("tenant_id", tenantId)
    .eq("series_id", seriesId);

  if (mode === "following" && currentStartsAt) {
    query = query.gte("starts_at", currentStartsAt);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

export function useUpdateAppointmentSeries(
  options?: UseMutationOptions<void, Error, { seriesId: string; patch: AppointmentPatch; mode: "all" | "following"; currentStartsAt?: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, patch, mode, currentStartsAt }) =>
      updateAppointmentSeries(seriesId, patch, mode, currentStartsAt),
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useCancelAppointmentSeries(
  options?: UseMutationOptions<void, Error, { seriesId: string; mode: "all" | "following"; currentStartsAt?: string; cancelReason?: string | null }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seriesId, mode, currentStartsAt, cancelReason }) =>
      cancelAppointmentSeries(seriesId, mode, currentStartsAt, cancelReason),
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export async function listAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_appointments")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("starts_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapAppointmentRow(asDbRow(r)));
}

export function useCustomerAppointments(
  customerId: string | null,
  options?: Omit<UseQueryOptions<Appointment[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...APPOINTMENTS_KEY, "customer", customerId ?? "none"],
    queryFn: () => listAppointmentsByCustomer(customerId!),
    enabled: isSupabaseConfigured && Boolean(customerId) && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

async function fetchUpcomingAppointment(
  customerId: string | null,
  phone: string | null,
): Promise<Appointment | null> {
  if (!isSupabaseConfigured) return null;
  if (!customerId && !phone) return null;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();

  let q = supabase
    .from("scheduling_appointments")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .gte("starts_at", new Date().toISOString())
    .in("status", ["agendado", "confirmado"]);

  if (customerId) {
    q = q.eq("customer_id", customerId);
  } else {
    q = q.eq("customer_telefone", phone);
  }

  const { data, error } = await q
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? mapAppointmentRow(asDbRow(data)) : null;
}

export function useUpcomingAppointment(
  customerId: string | null,
  phone: string | null,
  options?: Omit<UseQueryOptions<Appointment | null>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [...APPOINTMENTS_KEY, "upcoming", customerId ?? "none", phone ?? "none"],
    queryFn: () => fetchUpcomingAppointment(customerId, phone),
    enabled: isSupabaseConfigured && Boolean(customerId || phone) && (enabledOption ?? true),
    staleTime: 30_000,
  });
}
