import { useQuery } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type PlatformLogSource = "crm" | "whatsapp" | "campaign";
export type PlatformLogSeverity = "info" | "warning" | "error";

export type PlatformLogEntry = {
  id: string;
  source: PlatformLogSource;
  title: string;
  body: string | null;
  createdAt: string;
  actorName: string;
  severity: PlatformLogSeverity;
  entityId: string | null;
  entityType: string | null;
  metadata: Record<string, unknown>;
};

function humanize(text: string) {
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function truncate(text: string, max = 220) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function stringifyDetails(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? truncate(trimmed) : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => stringifyDetails(item))
      .filter((item): item is string => Boolean(item));
    return parts.length > 0 ? truncate(parts.join(" • ")) : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = [
      "body",
      "body_text",
      "message",
      "title",
      "event",
      "status",
      "state",
      "error",
      "reason",
      "description",
      "details",
    ];
    for (const key of keys) {
      const candidate = stringifyDetails(obj[key]);
      if (candidate) return candidate;
    }
    const preferred = ["name", "chat_id", "customer_id", "campaign_id", "instance_id"];
    const parts = preferred
      .map((key) => {
        const raw = asString(obj[key]);
        return raw ? `${humanize(key)}: ${raw}` : null;
      })
      .filter((item): item is string => Boolean(item));
    if (parts.length > 0) {
      return truncate(parts.join(" • "));
    }
    try {
      return truncate(JSON.stringify(obj));
    } catch {
      return null;
    }
  }
  return null;
}

function mapCrmActivity(row: Record<string, unknown>): PlatformLogEntry {
  const activityType = asString(row.activity_type) ?? "activity";
  const creator = (row.created_by_profile as Record<string, unknown> | null | undefined) ?? null;
  return {
    id: `crm-${String(row.id ?? crypto.randomUUID())}`,
    source: "crm",
    title: asString(row.title) ?? humanize(activityType),
    body: asString(row.body) ?? stringifyDetails(row.metadata) ?? null,
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
    actorName: asString(creator?.nome) ?? "Sistema",
    severity: activityType.includes("error") || activityType.includes("failed") ? "error" : "info",
    entityId:
      asString(row.negotiation_id) ??
      asString(row.chat_id) ??
      asString(row.customer_id),
    entityType: "crm",
    metadata: {
      activityType,
      ...((row.metadata as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function mapWebhookEvent(row: Record<string, unknown>): PlatformLogEntry {
  const eventName = asString(row.event_name) ?? "UNKNOWN";
  const payload = (row.payload as Record<string, unknown> | undefined) ?? {};
  const severity =
    eventName.includes("ERROR") || eventName.includes("FAILED") ? "error"
      : eventName.includes("DISCONNECT") || eventName.includes("INVALID")
        ? "warning"
        : "info";

  return {
    id: `whatsapp-${String(row.id ?? crypto.randomUUID())}`,
    source: "whatsapp",
    title: humanize(eventName.toLowerCase()),
    body: stringifyDetails(payload) ?? null,
    createdAt: asString(row.received_at) ?? new Date().toISOString(),
    actorName: "Sistema",
    severity,
    entityId: asString(row.instance_id),
    entityType: "whatsapp_webhook",
    metadata: {
      eventName,
      ...payload,
    },
  };
}

function mapCampaignEvent(row: Record<string, unknown>): PlatformLogEntry {
  const eventType = asString(row.event_type) ?? "event";
  const details = (row.details as Record<string, unknown> | undefined) ?? {};
  const severity =
    eventType.includes("failed") || eventType.includes("error") ? "error"
      : eventType.includes("paused") ? "warning"
        : "info";

  return {
    id: `campaign-${String(row.id ?? crypto.randomUUID())}`,
    source: "campaign",
    title: humanize(eventType),
    body: stringifyDetails(details) ?? null,
    createdAt: asString(row.created_at) ?? new Date().toISOString(),
    actorName: "Sistema",
    severity,
    entityId: asString(row.campaign_id),
    entityType: "campaign",
    metadata: {
      eventType,
      ...details,
    },
  };
}

async function fetchTenantLogs(
  table: string,
  columns: string,
  tenantId: string,
  orderColumn: string,
  limit = 40,
) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("tenant_id", tenantId)
    .order(orderColumn, { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export async function listPlatformLogs(limit = 120): Promise<PlatformLogEntry[]> {
  if (!isSupabaseConfigured) return [];
  const tenantId = await getCurrentTenantId();

  const [crmActivities, webhookEvents, campaignEvents] = await Promise.all([
    fetchTenantLogs(
      "crm_activities",
      "id, activity_type, title, body, metadata, created_at, customer_id, negotiation_id, chat_id, created_by, created_by_profile:profiles!crm_activities_created_by_fkey(nome)",
      tenantId,
      "created_at",
      50,
    ),
    fetchTenantLogs(
      "whatsapp_webhook_events",
      "id, event_name, payload, received_at, instance_id",
      tenantId,
      "received_at",
      40,
    ),
    fetchTenantLogs(
      "campaign_events",
      "id, campaign_id, event_type, details, created_at",
      tenantId,
      "created_at",
      40,
    ),
  ]);

  const entries = [
    ...crmActivities.map(mapCrmActivity),
    ...webhookEvents.map(mapWebhookEvent),
    ...campaignEvents.map(mapCampaignEvent),
  ];

  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries.slice(0, limit);
}

export function usePlatformLogs(limit = 120) {
  return useQuery({
    queryKey: ["platform-logs", limit],
    queryFn: () => listPlatformLogs(limit),
    enabled: isSupabaseConfigured,
    staleTime: 15_000,
  });
}
