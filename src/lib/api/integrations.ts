import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { DEFAULT_STALE_NEGOTIATION_DAYS, normalizeStaleNegotiationDays } from "@/lib/crm/negotiation-alerts";
import {
  DEFAULT_BUSINESS_HOURS,
  normalizeBusinessHours,
  normalizeSlaMinutes,
  type BusinessHours,
} from "@/lib/business-hours";
import { requireSupabase, isSupabaseConfigured } from "@/lib/supabase";

export type TenantIntegrations = {
  tenantId: string;
  n8nWebhookUrl: string | null;
  n8nSecret: string | null;
  n8nEnabled: boolean;
  n8nRateLimitPerMinute: number;
};

export type TenantSettings = {
  tenantId: string;
  syncAssigneeChatCrm: boolean;
  autoAssignOnLead: boolean;
  /**
   * Auto-atribuição de novas negociações via trigger BEFORE INSERT em
   * crm_negotiations — round-robin por menor carga + disponibilidade.
   */
  autoAssignNewDeals: boolean;
  defaultAiMode: "off" | "qualifying" | "full" | "handoff";
  /** Dias sem interação para alerta "Parado" no Kanban (1–90). */
  staleNegotiationDays: number;
  /** Minutos-alvo para a 1ª resposta (SLA), 1–1440. */
  slaFirstResponseMinutes: number;
  /** Horário de atendimento; quando ativo, pausa o SLA fora do expediente. */
  businessHours: BusinessHours;
  onboardingState: TenantOnboardingState;
};

export type TenantOnboardingObjective = "atendimento" | "vendas" | "suporte" | "recuperacao";

export type TenantOnboardingState = {
  objective: TenantOnboardingObjective;
  completedAt: string | null;
  completedStepKeys: string[];
};

function mapIntegrations(row: Record<string, unknown>): TenantIntegrations {
  return {
    tenantId: String(row.tenant_id ?? ""),
    n8nWebhookUrl: row.n8n_webhook_url != null ? String(row.n8n_webhook_url) : null,
    n8nSecret: row.n8n_secret != null ? String(row.n8n_secret) : null,
    n8nEnabled: Boolean(row.n8n_enabled),
    n8nRateLimitPerMinute: Number(row.n8n_rate_limit_per_minute ?? 30),
  };
}

function mapSettings(row: Record<string, unknown>): TenantSettings {
  return {
    tenantId: String(row.tenant_id ?? ""),
    syncAssigneeChatCrm: row.sync_assignee_chat_crm !== false,
    autoAssignOnLead: Boolean(row.auto_assign_on_lead),
    autoAssignNewDeals: Boolean(row.auto_assign_new_deals),
    defaultAiMode: (row.default_ai_mode as TenantSettings["defaultAiMode"]) ?? "off",
    staleNegotiationDays: normalizeStaleNegotiationDays(row.stale_negotiation_days),
    slaFirstResponseMinutes: normalizeSlaMinutes(row.sla_first_response_minutes),
    businessHours: normalizeBusinessHours(row.business_hours),
    onboardingState: normalizeOnboardingState(row.onboarding_state),
  };
}

function normalizeOnboardingState(value: unknown): TenantOnboardingState {
  const raw = value as Partial<TenantOnboardingState> | null | undefined;
  return {
    objective:
      raw?.objective === "vendas" ||
      raw?.objective === "suporte" ||
      raw?.objective === "recuperacao"
        ? raw.objective
        : "atendimento",
    completedAt:
      typeof raw?.completedAt === "string" && raw.completedAt.trim()
        ? raw.completedAt
        : null,
    completedStepKeys: Array.isArray(raw?.completedStepKeys)
      ? raw.completedStepKeys.map((step) => String(step)).filter(Boolean)
      : [],
  };
}

export async function fetchTenantIntegrations(): Promise<TenantIntegrations | null> {
  if (!isSupabaseConfigured) return null;
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      tenantId,
      n8nWebhookUrl: null,
      n8nSecret: null,
      n8nEnabled: false,
      n8nRateLimitPerMinute: 30,
    };
  }
  return mapIntegrations(data as Record<string, unknown>);
}

export async function upsertTenantIntegrations(
  patch: Partial<Pick<TenantIntegrations, "n8nWebhookUrl" | "n8nSecret" | "n8nEnabled" | "n8nRateLimitPerMinute">>,
): Promise<TenantIntegrations> {
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const row: Record<string, unknown> = { tenant_id: tenantId };
  if (patch.n8nWebhookUrl !== undefined) row.n8n_webhook_url = patch.n8nWebhookUrl;
  if (patch.n8nSecret !== undefined) row.n8n_secret = patch.n8nSecret;
  if (patch.n8nEnabled !== undefined) row.n8n_enabled = patch.n8nEnabled;
  if (patch.n8nRateLimitPerMinute !== undefined) {
    row.n8n_rate_limit_per_minute = patch.n8nRateLimitPerMinute;
  }

  const { data, error } = await supabase
    .from("tenant_integrations")
    .upsert(row, { onConflict: "tenant_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapIntegrations(data as Record<string, unknown>);
}

export async function fetchTenantSettings(): Promise<TenantSettings | null> {
  if (!isSupabaseConfigured) return null;
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return {
      tenantId,
      syncAssigneeChatCrm: true,
      autoAssignOnLead: false,
      autoAssignNewDeals: false,
      defaultAiMode: "off",
      staleNegotiationDays: DEFAULT_STALE_NEGOTIATION_DAYS,
      slaFirstResponseMinutes: 15,
      businessHours: { ...DEFAULT_BUSINESS_HOURS, intervals: DEFAULT_BUSINESS_HOURS.intervals.map((i) => ({ ...i })) },
      onboardingState: {
        objective: "atendimento",
        completedAt: null,
        completedStepKeys: [],
      },
    };
  }
  return mapSettings(data as Record<string, unknown>);
}

export async function upsertTenantSettings(
  patch: Partial<
    Pick<
      TenantSettings,
      | "syncAssigneeChatCrm"
      | "autoAssignOnLead"
      | "autoAssignNewDeals"
      | "defaultAiMode"
      | "staleNegotiationDays"
      | "slaFirstResponseMinutes"
      | "businessHours"
      | "onboardingState"
    >
  >,
): Promise<TenantSettings> {
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const row: Record<string, unknown> = { tenant_id: tenantId };
  if (patch.syncAssigneeChatCrm !== undefined) row.sync_assignee_chat_crm = patch.syncAssigneeChatCrm;
  if (patch.autoAssignOnLead !== undefined) row.auto_assign_on_lead = patch.autoAssignOnLead;
  if (patch.autoAssignNewDeals !== undefined) row.auto_assign_new_deals = patch.autoAssignNewDeals;
  if (patch.defaultAiMode !== undefined) row.default_ai_mode = patch.defaultAiMode;
  if (patch.staleNegotiationDays !== undefined) {
    row.stale_negotiation_days = normalizeStaleNegotiationDays(patch.staleNegotiationDays);
  }
  if (patch.slaFirstResponseMinutes !== undefined) {
    row.sla_first_response_minutes = normalizeSlaMinutes(patch.slaFirstResponseMinutes);
  }
  if (patch.businessHours !== undefined) {
    row.business_hours = normalizeBusinessHours(patch.businessHours);
  }
  if (patch.onboardingState !== undefined) {
    row.onboarding_state = {
      objective: patch.onboardingState.objective,
      completedAt: patch.onboardingState.completedAt,
      completedStepKeys: patch.onboardingState.completedStepKeys,
    };
  }

  const { data, error } = await supabase
    .from("tenant_settings")
    .upsert(row, { onConflict: "tenant_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapSettings(data as Record<string, unknown>);
}

export function useTenantIntegrations() {
  const { profile, isAuthenticated, isLoading: authLoading } = useAuth();
  const userKey = profile?.id ?? "anonymous";
  return useQuery({
    queryKey: ["tenant-integrations", userKey],
    queryFn: fetchTenantIntegrations,
    enabled: isSupabaseConfigured && isAuthenticated && !authLoading && Boolean(profile?.id),
  });
}

export function useTenantSettings(
  options?: Omit<UseQueryOptions<TenantSettings | null, Error>, "queryKey" | "queryFn">,
) {
  const { profile, isAuthenticated, isLoading: authLoading } = useAuth();
  const userKey = profile?.id ?? "anonymous";
  return useQuery({
    queryKey: ["tenant-settings", userKey],
    queryFn: fetchTenantSettings,
    enabled: (options?.enabled ?? true) && isSupabaseConfigured && isAuthenticated && !authLoading && Boolean(profile?.id),
    ...options,
  });
}

export function useUpsertTenantIntegrations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTenantIntegrations,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-integrations"] });
    },
  });
}

export function useUpsertTenantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTenantSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
    },
  });
}
