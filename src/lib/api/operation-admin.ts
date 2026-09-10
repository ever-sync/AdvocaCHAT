import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";

export type OperationSeverity = "ok" | "warning" | "critical";

export type OperationUsage = {
  metric: string;
  used: number;
  limit_value: number | null;
  exceeded: boolean;
};

export type OperationTenant = {
  tenant_id: string;
  nome: string;
  created_at: string | null;
  severity: OperationSeverity;
  issues: string[];
  billing: {
    plan_id: string | null;
    status: string | null;
    billing_period: string | null;
    current_period_end: string | null;
  };
  channels: {
    total: number;
    connected: number;
    connecting: number;
    disconnected: number;
    error: number;
    stale_sync: number;
  };
  ai: {
    pending: number;
    processing: number;
    stale_processing: number;
    errors_24h: number;
  };
  automations: {
    queued_due: number;
    running: number;
    stale_running: number;
    failed_24h: number;
    dead_24h: number;
  };
  webhooks: {
    pending_due: number;
    errors_24h: number;
    success_24h: number;
  };
  usage: OperationUsage[];
};

export type OperationSummary = {
  tenants: number;
  critical: number;
  warning: number;
  billing_blocked: number;
  channels_total: number;
  channels_connected: number;
  ai_pending: number;
  ai_errors_24h: number;
  automations_due: number;
  automations_failed_24h: number;
  webhook_errors_24h: number;
  workers_critical: number;
  workers_warning: number;
  workers_alerts_24h: number;
};

export type OperationWorker = {
  id: string;
  label: string;
  schedule: string;
  severity: OperationSeverity;
  status: string;
  last_seen: string | null;
  pending: number;
  running: number;
  errors_24h: number;
  details: string[];
};

export type OperationAdminSnapshot = {
  generated_at: string;
  summary: OperationSummary;
  workers: OperationWorker[];
  workerRuns: OperationWorkerRun[];
  workerAlerts: OperationWorkerAlert[];
  tenants: OperationTenant[];
};

export const operationAdminQueryKey = ["operation-admin"] as const;
export const operationAdminAuditQueryKey = ["operation-admin", "audit"] as const;

export type OperationAdminAction =
  | "refresh_usage"
  | "retry_webhooks"
  | "unlock_ai_jobs"
  | "unlock_automation_jobs"
  | "recheck_workers";

export type OperationAdminActionInput = {
  tenantId?: string;
  action: OperationAdminAction;
};

export type OperationAdminActionResult = {
  ok: boolean;
  action: OperationAdminAction;
  affected: number;
  message?: string | null;
  details?: Record<string, unknown>;
};

export type OperationAdminAuditEntry = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  changes: Record<string, unknown>;
  metadata: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type OperationAdminAuditFilters = {
  tenantId?: string | null;
  entityType?: string | null;
  limit?: number;
};

export type OperationAdminAuditSnapshot = {
  generated_at: string;
  entries: OperationAdminAuditEntry[];
};

export type OperationWorkerAlert = {
  id: string;
  worker_key: string;
  worker_label: string | null;
  alert_type: "failure" | "stale";
  severity: "warning" | "critical";
  period: string;
  last_http_status: number | null;
  consecutive_failures: number;
  summary: string;
  sent_at: string | null;
  created_at: string;
};

export type OperationWorkerRun = {
  id: string;
  worker_key: string;
  worker_label: string | null;
  schedule: string | null;
  started_at: string;
  finished_at: string;
  http_status: number | null;
  ok: boolean;
  duration_ms: number | null;
  response_excerpt: string | null;
  error_excerpt: string | null;
  created_at: string;
};

export async function getOperationAdminSnapshot(): Promise<OperationAdminSnapshot> {
  return invokeAuthedFunction<OperationAdminSnapshot>("operation-admin", undefined, "GET");
}

export function useOperationAdminSnapshot(
  options?: Omit<UseQueryOptions<OperationAdminSnapshot, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: operationAdminQueryKey,
    queryFn: getOperationAdminSnapshot,
    staleTime: 20_000,
    retry: false,
    refetchInterval: 60_000,
    ...options,
  });
}

export async function getOperationAdminAuditLogs(
  filters: OperationAdminAuditFilters = {},
): Promise<OperationAdminAuditSnapshot> {
  const params = new URLSearchParams({ view: "audit", limit: String(filters.limit ?? 80) });
  if (filters.tenantId) params.set("tenant_id", filters.tenantId);
  if (filters.entityType) params.set("entity_type", filters.entityType);
  return invokeAuthedFunction<OperationAdminAuditSnapshot>(
    `operation-admin?${params.toString()}`,
    undefined,
    "GET",
  );
}

export function useOperationAdminAuditLogs(
  filters: OperationAdminAuditFilters = {},
  options?: Omit<UseQueryOptions<OperationAdminAuditSnapshot, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: [
      ...operationAdminAuditQueryKey,
      filters.tenantId ?? null,
      filters.entityType ?? null,
      filters.limit ?? 80,
    ],
    queryFn: () => getOperationAdminAuditLogs(filters),
    staleTime: 20_000,
    retry: false,
    ...options,
  });
}

export async function runOperationAdminAction(
  input: OperationAdminActionInput,
): Promise<OperationAdminActionResult> {
  return invokeAuthedFunction<OperationAdminActionResult>(
    "operation-admin",
    {
      action: input.action,
      ...(input.tenantId ? { tenant_id: input.tenantId } : {}),
    },
    "POST",
  );
}

export async function runOperationAdminWorkerRecheck(): Promise<OperationAdminActionResult> {
  return invokeAuthedFunction<OperationAdminActionResult>(
    "operation-admin",
    {
      action: "recheck_workers",
    },
    "POST",
  );
}

export function useOperationAdminWorkerRecheck(
  options?: UseMutationOptions<OperationAdminActionResult, Error, void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => runOperationAdminWorkerRecheck(),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: operationAdminQueryKey });
      await queryClient.invalidateQueries({ queryKey: operationAdminAuditQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useOperationAdminAction(
  options?: UseMutationOptions<OperationAdminActionResult, Error, OperationAdminActionInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runOperationAdminAction,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: operationAdminQueryKey });
      await queryClient.invalidateQueries({ queryKey: operationAdminAuditQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
