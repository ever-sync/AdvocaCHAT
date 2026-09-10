import { useQuery } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type AuditLogChange = { from: unknown; to: unknown };

export type AuditLog = {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  changes: Record<string, AuditLogChange>;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogFilters = {
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  limit?: number;
};

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseChanges(value: unknown): Record<string, AuditLogChange> {
  const raw = asRecord(value);
  const out: Record<string, AuditLogChange> = {};
  for (const [key, entry] of Object.entries(raw)) {
    const rec = asRecord(entry);
    out[key] = { from: rec.from ?? null, to: rec.to ?? null };
  }
  return out;
}

function mapRow(row: Record<string, unknown>): AuditLog {
  return {
    id: String(row.id),
    actorId: asString(row.actor_id),
    actorName: asString(row.actor_name) ?? "Sistema",
    actorRole: asString(row.actor_role),
    action: asString(row.action) ?? "update",
    entityType: asString(row.entity_type) ?? "—",
    entityId: asString(row.entity_id),
    summary: asString(row.summary),
    changes: parseChanges(row.changes),
    metadata: asRecord(row.metadata),
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
  };
}

const AUDIT_COLUMNS =
  "id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, changes, metadata, created_at";

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLog[]> {
  if (!isSupabaseConfigured) return [];
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();

  let query = supabase
    .from("audit_logs")
    .select(AUDIT_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.action) query = query.eq("action", filters.action);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
}

export function useAuditLogs(filters: AuditLogFilters = {}, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [
      "audit-logs",
      filters.entityType ?? null,
      filters.entityId ?? null,
      filters.action ?? null,
      filters.limit ?? 200,
    ],
    queryFn: () => fetchAuditLogs(filters),
    enabled: (options?.enabled ?? true) && isSupabaseConfigured,
    staleTime: 15_000,
  });
}

export type RecordAuditEventInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

/** Registra um evento de auditoria de aplicação (login, exportação, etc.). */
export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("record_audit_event", {
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_summary: input.summary ?? null,
    p_changes: input.changes ?? {},
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

/** Best-effort: nunca lança (não pode quebrar o fluxo que a chamou, ex.: login). */
export function recordAuditEventSafe(input: RecordAuditEventInput): void {
  void recordAuditEvent(input).catch(() => {});
}
