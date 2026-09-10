import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export const WEBHOOK_EVENTS = [
  { id: "contact.created", label: "Contato criado" },
  { id: "deal.created", label: "Negociação criada" },
  { id: "deal.stage_changed", label: "Negociação mudou de etapa" },
  { id: "deal.assignee_changed", label: "Responsável da negociação mudou" },
  { id: "deal.value_changed", label: "Valor da negociação mudou" },
  { id: "deal.qualification_changed", label: "Qualificação (estrelas) mudou" },
  { id: "deal.won", label: "Negociação ganha" },
  { id: "deal.lost", label: "Negociação perdida" },
  { id: "deal.task_created", label: "Tarefa criada na negociação" },
  { id: "deal.task_completed", label: "Tarefa concluída na negociação" },
  { id: "deal.comment_added", label: "Comentário adicionado à negociação" },
  { id: "deal.mention", label: "Menção (@) em comentário" },
  { id: "message.received", label: "Mensagem recebida" },
  { id: "message.sent", label: "Mensagem enviada" },
  { id: "ai.turn_completed", label: "IA: turno concluído" },
  { id: "ai.handoff", label: "IA: handoff humano" },
  { id: "ai.fact_remembered", label: "IA: fato salvo na memória" },
  { id: "ai.critique_blocked", label: "IA: auditoria bloqueou envio" },
  { id: "ai.circuit_tripped", label: "IA: circuit breaker disparou" },
  { id: "marketing_flow.failed", label: "Automação: fluxo falhou (lead parou)" },
] as const;

export type WebhookEventId = (typeof WEBHOOK_EVENTS)[number]["id"];

export type Webhook = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDelivery = {
  id: string;
  webhookId: string;
  event: string;
  status: "pending" | "success" | "error";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  responseStatus: number | null;
  createdAt: string;
  deliveredAt: string | null;
  payload: unknown;
};

function mapWebhook(row: Record<string, unknown>): Webhook {
  return {
    id: String(row.id),
    url: String(row.url ?? ""),
    secret: String(row.secret ?? ""),
    events: Array.isArray(row.events) ? row.events.map((e) => String(e)) : [],
    active: Boolean(row.active),
    description: row.description != null ? String(row.description) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapDelivery(row: Record<string, unknown>): WebhookDelivery {
  return {
    id: String(row.id),
    webhookId: String(row.webhook_id ?? ""),
    event: String(row.event ?? ""),
    status: (String(row.status ?? "pending") as WebhookDelivery["status"]),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    lastError: row.last_error != null ? String(row.last_error) : null,
    responseStatus: row.response_status != null ? Number(row.response_status) : null,
    createdAt: String(row.created_at ?? ""),
    deliveredAt: row.delivered_at != null ? String(row.delivered_at) : null,
    payload: row.payload ?? null,
  };
}

/** Segredo aleatório p/ assinar entregas (HMAC). */
export function generateWebhookSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `whsec_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function fetchWebhooks(): Promise<Webhook[]> {
  if (!isSupabaseConfigured) return [];
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("webhooks")
    .select("id, url, secret, events, active, description, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapWebhook);
}

export type WebhookInput = {
  url: string;
  events: string[];
  active?: boolean;
  description?: string | null;
  secret?: string;
};

export async function createWebhook(input: WebhookInput): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { error } = await supabase.from("webhooks").insert({
    tenant_id: tenantId,
    url: input.url.trim(),
    secret: input.secret?.trim() || generateWebhookSecret(),
    events: input.events,
    active: input.active ?? true,
    description: input.description ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateWebhook(id: string, patch: Partial<WebhookInput>): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.url !== undefined) row.url = patch.url.trim();
  if (patch.events !== undefined) row.events = patch.events;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.secret !== undefined && patch.secret) row.secret = patch.secret.trim();
  const { error } = await supabase.from("webhooks").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteWebhook(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchWebhookDeliveries(webhookId?: string, limit = 50): Promise<WebhookDelivery[]> {
  if (!isSupabaseConfigured) return [];
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  let query = supabase
    .from("webhook_deliveries")
    .select("id, webhook_id, event, status, attempts, max_attempts, last_error, response_status, created_at, delivered_at, payload")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (webhookId) query = query.eq("webhook_id", webhookId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapDelivery);
}

export async function testWebhook(webhookId: string): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  return invokeAuthedFunction<{ ok: boolean; status: number | null; error: string | null }>(
    "webhook-dispatcher",
    { webhook_id: webhookId },
  );
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: fetchWebhooks,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useWebhookDeliveries(webhookId?: string) {
  return useQuery({
    queryKey: ["webhook-deliveries", webhookId ?? "all"],
    queryFn: () => fetchWebhookDeliveries(webhookId),
    enabled: isSupabaseConfigured,
    staleTime: 15_000,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WebhookInput> }) => updateWebhook(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}
