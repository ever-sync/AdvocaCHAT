import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type {
  MarketingFlowEventType,
  MarketingFlowJobStatus,
  MarketingFlowParticipantStatus,
} from "@/lib/marketing/flow-types";

export type FlowParticipant = {
  id: string;
  flowId: string;
  customerId: string | null;
  customerName: string | null;
  negotiationId: string | null;
  status: MarketingFlowParticipantStatus;
  currentStepId: string | null;
  enteredAt: string;
  nextRunAt: string | null;
  exitedAt: string | null;
  exitReason: string | null;
  context: Record<string, unknown>;
};

export type FlowEvent = {
  id: string;
  eventType: MarketingFlowEventType | string;
  stepId: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FlowJob = {
  id: string;
  stepId: string;
  status: MarketingFlowJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
  idempotencyKey: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------- Participants

export async function listFlowParticipants(
  flowId: string,
  limit = 50,
): Promise<FlowParticipant[]> {
  if (!isSupabaseConfigured || !flowId) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flow_participants")
    .select(
      "id, flow_id, customer_id, negotiation_id, status, current_step_id, entered_at, next_run_at, exited_at, exit_reason, context, customers(nome)",
    )
    .eq("tenant_id", tenantId)
    .eq("flow_id", flowId)
    .order("entered_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const rec = row as Record<string, unknown>;
    const customer = asRecord(rec.customers) as { nome?: unknown };
    return {
      id: String(rec.id),
      flowId: String(rec.flow_id),
      customerId: rec.customer_id == null ? null : String(rec.customer_id),
      customerName:
        typeof customer.nome === "string" && customer.nome.length > 0
          ? customer.nome
          : null,
      negotiationId: rec.negotiation_id == null ? null : String(rec.negotiation_id),
      status: String(rec.status) as MarketingFlowParticipantStatus,
      currentStepId: rec.current_step_id == null ? null : String(rec.current_step_id),
      enteredAt: String(rec.entered_at ?? ""),
      nextRunAt: rec.next_run_at == null ? null : String(rec.next_run_at),
      exitedAt: rec.exited_at == null ? null : String(rec.exited_at),
      exitReason: rec.exit_reason == null ? null : String(rec.exit_reason),
      context: asRecord(rec.context),
    } satisfies FlowParticipant;
  });
}

export function useFlowParticipants(flowId: string | null | undefined) {
  return useQuery({
    queryKey: ["marketing-flow-participants", flowId],
    queryFn: () => listFlowParticipants(flowId ?? ""),
    enabled: isSupabaseConfigured && !!flowId,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------- Events

export async function listParticipantEvents(
  participantId: string,
  limit = 200,
): Promise<FlowEvent[]> {
  if (!isSupabaseConfigured || !participantId) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flow_events")
    .select("id, event_type, step_id, message, metadata, created_at")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const rec = row as Record<string, unknown>;
    return {
      id: String(rec.id),
      eventType: String(rec.event_type),
      stepId: rec.step_id == null ? null : String(rec.step_id),
      message: rec.message == null ? null : String(rec.message),
      metadata: asRecord(rec.metadata),
      createdAt: String(rec.created_at ?? ""),
    } satisfies FlowEvent;
  });
}

export function useParticipantEvents(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["marketing-flow-events", participantId],
    queryFn: () => listParticipantEvents(participantId ?? ""),
    enabled: isSupabaseConfigured && !!participantId,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------- Jobs

export async function listParticipantFailedJobs(participantId: string): Promise<FlowJob[]> {
  if (!isSupabaseConfigured || !participantId) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flow_jobs")
    .select("id, step_id, status, attempts, max_attempts, last_error, run_at, idempotency_key")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .in("status", ["failed", "dead"])
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const rec = row as Record<string, unknown>;
    return {
      id: String(rec.id),
      stepId: String(rec.step_id),
      status: String(rec.status) as MarketingFlowJobStatus,
      attempts: Number(rec.attempts ?? 0),
      maxAttempts: Number(rec.max_attempts ?? 0),
      lastError: rec.last_error == null ? null : String(rec.last_error),
      runAt: String(rec.run_at ?? ""),
      idempotencyKey: String(rec.idempotency_key ?? ""),
    } satisfies FlowJob;
  });
}

export function useParticipantFailedJobs(participantId: string | null | undefined) {
  return useQuery({
    queryKey: ["marketing-flow-jobs", participantId, "failed"],
    queryFn: () => listParticipantFailedJobs(participantId ?? ""),
    enabled: isSupabaseConfigured && !!participantId,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------- Mutations

export async function reprocessFlowJob(jobId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("reprocess_marketing_flow_job", { p_job_id: jobId });
  if (error) throw new Error(error.message);
}

export async function exitFlowParticipant(
  participantId: string,
  reason: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("exit_marketing_flow_participant", {
    p_participant_id: participantId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export function useReprocessFlowJob(
  options?: UseMutationOptions<void, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reprocessFlowJob,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void qc.invalidateQueries({ queryKey: ["marketing-flow-participants"] });
      void qc.invalidateQueries({ queryKey: ["marketing-flow-jobs"] });
      void qc.invalidateQueries({ queryKey: ["marketing-flow-events"] });
      void qc.invalidateQueries({ queryKey: ["marketing-flow-stats"] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useExitFlowParticipant(
  options?: UseMutationOptions<
    void,
    Error,
    { participantId: string; reason: string | null }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ participantId, reason }) => exitFlowParticipant(participantId, reason),
    ...options,
    onSuccess: (data, vars, ctx) => {
      void qc.invalidateQueries({ queryKey: ["marketing-flow-participants"] });
      void qc.invalidateQueries({ queryKey: ["marketing-flow-events"] });
      void qc.invalidateQueries({ queryKey: ["marketing-flow-stats"] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}
