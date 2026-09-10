import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Config do agente (tenant_ai_config)
// ---------------------------------------------------------------------------

export type AiProvider = "off" | "n8n" | "native";
export type LlmProvider = "anthropic" | "openai";

export type TenantAiConfig = {
  provider: AiProvider;
  llmProvider: LlmProvider;
  model: string;
  systemPrompt: string;
  debounceSeconds: number;
  maxOutputTokens: number;
  monthlyTokenLimit: number | null;
  disclosureEnabled: boolean;
  disclosureMessage: string;
  enableModelRouting: boolean;
  enableThinking: boolean;
};

export const DEFAULT_AI_CONFIG: TenantAiConfig = {
  provider: "off",
  llmProvider: "openai",
  model: "gpt-4o-mini",
  systemPrompt: "",
  debounceSeconds: 8,
  maxOutputTokens: 1024,
  monthlyTokenLimit: null,
  disclosureEnabled: true,
  disclosureMessage: "",
  enableModelRouting: false,
  enableThinking: true,
};

const CONFIG_KEY = ["tenant-ai-config"] as const;
const USAGE_KEY = ["ai-usage-month"] as const;
const KNOWLEDGE_KEY = ["ai-knowledge-sources"] as const;
const TURNS_KEY = ["ai-turns"] as const;
const CHANNELS_KEY = ["ai-channels"] as const;

export async function fetchTenantAiConfig(): Promise<TenantAiConfig> {
  if (!isSupabaseConfigured) return DEFAULT_AI_CONFIG;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("tenant_ai_config")
    .select(
      "provider, llm_provider, model, system_prompt, debounce_seconds, max_output_tokens, monthly_token_limit, ai_disclosure_enabled, ai_disclosure_message, enable_model_routing, enable_thinking",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_AI_CONFIG;
  return {
    provider: (data.provider as AiProvider) ?? "off",
    llmProvider: data.llm_provider === "openai" ? "openai" : "anthropic",
    model: data.model ?? DEFAULT_AI_CONFIG.model,
    systemPrompt: data.system_prompt ?? "",
    debounceSeconds: data.debounce_seconds ?? DEFAULT_AI_CONFIG.debounceSeconds,
    maxOutputTokens: data.max_output_tokens ?? DEFAULT_AI_CONFIG.maxOutputTokens,
    monthlyTokenLimit: data.monthly_token_limit ?? null,
    disclosureEnabled: data.ai_disclosure_enabled ?? true,
    disclosureMessage: data.ai_disclosure_message ?? "",
    enableModelRouting: data.enable_model_routing ?? true,
    enableThinking: data.enable_thinking ?? true,
  };
}

export async function upsertTenantAiConfig(input: TenantAiConfig): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("tenant_ai_config").upsert(
    {
      tenant_id: tenantId,
      provider: input.provider,
      llm_provider: input.llmProvider,
      model: input.model.trim() || DEFAULT_AI_CONFIG.model,
      system_prompt: input.systemPrompt.trim() || null,
      debounce_seconds: input.debounceSeconds,
      max_output_tokens: input.maxOutputTokens,
      monthly_token_limit: input.monthlyTokenLimit,
      ai_disclosure_enabled: input.disclosureEnabled,
      ai_disclosure_message: input.disclosureMessage.trim() || null,
      enable_model_routing: input.enableModelRouting,
      enable_thinking: input.enableThinking,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw new Error(error.message);
}

export function useTenantAiConfig(
  options?: Omit<UseQueryOptions<TenantAiConfig, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({ queryKey: CONFIG_KEY, queryFn: fetchTenantAiConfig, staleTime: 60_000, ...options });
}

export function useUpsertTenantAiConfig(options?: UseMutationOptions<void, Error, TenantAiConfig>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTenantAiConfig,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

// ---------------------------------------------------------------------------
// Base de conhecimento (edge function ai-knowledge)
// ---------------------------------------------------------------------------

export type KnowledgeSource = {
  id: string;
  title: string;
  kind: string;
  created_at: string;
};

export async function listKnowledgeSources(): Promise<KnowledgeSource[]> {
  const res = await invokeAuthedFunction<{ sources: KnowledgeSource[] }>("ai-knowledge", undefined, "GET");
  return res.sources ?? [];
}

export async function addKnowledgeSource(input: { title: string; content: string }): Promise<void> {
  await invokeAuthedFunction("ai-knowledge", input, "POST");
}

export async function importKnowledgeUrl(url: string): Promise<void> {
  await invokeAuthedFunction("ai-knowledge", { url }, "POST");
}

export async function deleteKnowledgeSource(id: string): Promise<void> {
  await invokeAuthedFunction(`ai-knowledge?source_id=${encodeURIComponent(id)}`, undefined, "DELETE");
}

export function useKnowledgeSources(
  options?: Omit<UseQueryOptions<KnowledgeSource[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({ queryKey: KNOWLEDGE_KEY, queryFn: listKnowledgeSources, staleTime: 30_000, ...options });
}

export function useAddKnowledgeSource(
  options?: UseMutationOptions<void, Error, { title: string; content: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addKnowledgeSource,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useImportKnowledgeUrl(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importKnowledgeUrl,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteKnowledgeSource(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteKnowledgeSource,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

// ---------------------------------------------------------------------------
// Atividade / consumo (ai_usage)
// ---------------------------------------------------------------------------

export type AiUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  messages: number;
  costUsd: number;
};

// Preço em US$ por 1M de tokens (estimativas — ajuste conforme o provedor/modelo).
type ModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };
const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0 },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, cacheWrite: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0 },
};
const DEFAULT_PRICE: ModelPrice = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export async function fetchAiUsageThisMonth(): Promise<AiUsageSummary> {
  const empty: AiUsageSummary = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, messages: 0, costUsd: 0 };
  if (!isSupabaseConfigured) return empty;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage")
    .select("model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw new Error(error.message);

  const summary: AiUsageSummary = { ...empty };
  for (const r of data ?? []) {
    const inp = r.input_tokens ?? 0;
    const out = r.output_tokens ?? 0;
    const cr = r.cache_read_tokens ?? 0;
    const cw = r.cache_creation_tokens ?? 0;
    summary.inputTokens += inp;
    summary.outputTokens += out;
    summary.cacheReadTokens += cr;
    summary.messages += 1;
    const p = MODEL_PRICING[r.model] ?? DEFAULT_PRICE;
    summary.costUsd += (inp * p.input + out * p.output + cr * p.cacheRead + cw * p.cacheWrite) / 1_000_000;
  }
  return summary;
}

export function useAiUsageThisMonth(
  options?: Omit<UseQueryOptions<AiUsageSummary, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({ queryKey: USAGE_KEY, queryFn: fetchAiUsageThisMonth, staleTime: 60_000, ...options });
}

export type AiUsageByModelRow = {
  model: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  /** Quanto teria custado a parte cacheada se fosse cobrada como input normal. */
  cacheSavingsUsd: number;
};

const USAGE_BY_MODEL_KEY = ["ai-usage-by-model"] as const;

export async function fetchAiUsageByModelThisMonth(): Promise<AiUsageByModelRow[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("ai_usage")
    .select("model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart.toISOString());
  if (error) throw new Error(error.message);

  const byModel = new Map<string, AiUsageByModelRow>();
  for (const r of data ?? []) {
    const model = r.model ?? "desconhecido";
    const inp = r.input_tokens ?? 0;
    const out = r.output_tokens ?? 0;
    const cr = r.cache_read_tokens ?? 0;
    const cw = r.cache_creation_tokens ?? 0;
    const p = MODEL_PRICING[model] ?? DEFAULT_PRICE;
    const cost = (inp * p.input + out * p.output + cr * p.cacheRead + cw * p.cacheWrite) / 1_000_000;
    // Savings: o que cache_read teria custado como input normal menos o que custou de fato.
    const savings = (cr * (p.input - p.cacheRead)) / 1_000_000;

    const row = byModel.get(model) ?? {
      model,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      cacheSavingsUsd: 0,
    };
    row.turns += 1;
    row.inputTokens += inp;
    row.outputTokens += out;
    row.cacheReadTokens += cr;
    row.cacheCreationTokens += cw;
    row.costUsd += cost;
    row.cacheSavingsUsd += savings;
    byModel.set(model, row);
  }
  return [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export function useAiUsageByModelThisMonth(
  options?: Omit<UseQueryOptions<AiUsageByModelRow[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: USAGE_BY_MODEL_KEY,
    queryFn: fetchAiUsageByModelThisMonth,
    staleTime: 60_000,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Observabilidade — turnos da IA (ai_turns)
// ---------------------------------------------------------------------------

export type AiTurnRetrieved = { content: string; similarity: number };

export type AiTurnCritiqueFlag = {
  blocked: boolean;
  text: string;
  issues: string[];
  error?: string;
};

export type AiTurnOutcome =
  | "delivered"
  | "blocked_critique"
  | "no_reply"
  | "tool_error"
  | "circuit_tripped";

export type AiTurn = {
  id: string;
  created_at: string;
  model: string | null;
  user_message: string | null;
  reply: string | null;
  retrieved: AiTurnRetrieved[];
  tools: Array<{ name?: string; is_error?: boolean }>;
  stop_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  critique_flags: AiTurnCritiqueFlag[];
  outcome: AiTurnOutcome | null;
  thinking_budget: number | null;
};

export async function fetchAiTurns(): Promise<AiTurn[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("ai_turns")
    .select("id, created_at, model, user_message, reply, retrieved, tools, stop_reason, input_tokens, output_tokens, critique_flags, outcome, thinking_budget")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as AiTurn[];
}

export function useAiTurns(options?: Omit<UseQueryOptions<AiTurn[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: TURNS_KEY, queryFn: fetchAiTurns, staleTime: 15_000, ...options });
}

// Falhas atuais (jobs em erro) — útil para depurar atendimentos que não responderam.
export type AiError = { chat_id: string | null; last_error: string | null; updated_at: string };

export async function fetchAiErrors(): Promise<AiError[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("chat_id, last_error, updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "error")
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as AiError[];
}

export function useAiErrors(options?: Omit<UseQueryOptions<AiError[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: ["ai-errors"], queryFn: fetchAiErrors, staleTime: 30_000, ...options });
}

// Add-on de IA (controlado pela plataforma): status + cota mensal. Somente leitura.
export type AiSubscription = {
  active: boolean;
  monthlyTokenQuota: number;
  overageAllowed: boolean;
  trialEndsAt: string | null;
};

export async function fetchAiSubscription(): Promise<AiSubscription | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("tenant_ai_subscription")
    .select("active, monthly_token_quota, overage_allowed, trial_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    active: Boolean(data.active),
    monthlyTokenQuota: data.monthly_token_quota ?? 0,
    overageAllowed: Boolean(data.overage_allowed),
    trialEndsAt: (data.trial_ends_at as string | null) ?? null,
  };
}

export function useAiSubscription(options?: Omit<UseQueryOptions<AiSubscription | null, Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: ["ai-subscription"], queryFn: fetchAiSubscription, staleTime: 60_000, ...options });
}

// ---------------------------------------------------------------------------
// Canais (IA por instância de WhatsApp)
// ---------------------------------------------------------------------------

export type AiDefaultMode = "qualifying" | "full";

export type AiChannel = {
  id: string;
  display_name: string;
  phone_number: string | null;
  status: string;
  ai_enabled: boolean;
  ai_default_mode: AiDefaultMode;
  ai_persona: string | null;
};

export type AiChannelPatch = {
  ai_enabled?: boolean;
  ai_default_mode?: AiDefaultMode;
  ai_persona?: string | null;
};

export async function listAiChannels(): Promise<AiChannel[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("id, display_name, phone_number, status, ai_enabled, ai_default_mode, ai_persona")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AiChannel[];
}

export async function updateAiChannel(id: string, patch: AiChannelPatch): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("whatsapp_instances").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
}

export function useAiChannels(options?: Omit<UseQueryOptions<AiChannel[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: CHANNELS_KEY, queryFn: listAiChannels, staleTime: 30_000, ...options });
}

export function useUpdateAiChannel(
  options?: UseMutationOptions<void, Error, { id: string; patch: AiChannelPatch }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AiChannelPatch }) => updateAiChannel(id, patch),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

// ---------------------------------------------------------------------------
// Painel super-admin — provisionamento do add-on por tenant (edge ai-admin)
// ---------------------------------------------------------------------------

export type AiTenantRow = {
  tenant_id: string;
  nome: string;
  active: boolean;
  monthly_token_quota: number;
  overage_allowed: boolean;
  trial_ends_at: string | null;
  has_subscription: boolean;
  tokens_used: number;
};

export type AiTenantSubscriptionInput = {
  tenantId: string;
  active: boolean;
  monthlyTokenQuota: number;
  overageAllowed: boolean;
  trialEndsAt?: string | null;
};

export type AiAddonCatalog = {
  id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  active: boolean;
};

export async function listAiTenants(): Promise<AiTenantRow[]> {
  const res = await invokeAuthedFunction<{ tenants: AiTenantRow[] }>("ai-admin", undefined, "GET");
  return res.tenants ?? [];
}

export async function getAiAddonCatalog(): Promise<AiAddonCatalog | null> {
  const res = await invokeAuthedFunction<{ addon: AiAddonCatalog | null }>("ai-admin", undefined, "GET");
  return res.addon ?? null;
}

export async function updateAiAddonCatalog(input: { amountCents: number; active: boolean }): Promise<void> {
  await invokeAuthedFunction("ai-admin", {
    intent: "update_catalog",
    amount_cents: input.amountCents,
    active: input.active,
  }, "POST");
}

export async function setAiTenantSubscription(input: AiTenantSubscriptionInput): Promise<void> {
  await invokeAuthedFunction(
    "ai-admin",
    {
      tenant_id: input.tenantId,
      active: input.active,
      monthly_token_quota: input.monthlyTokenQuota,
      overage_allowed: input.overageAllowed,
      trial_ends_at: input.trialEndsAt ?? null,
    },
    "POST",
  );
}

export function useAiTenants(options?: Omit<UseQueryOptions<AiTenantRow[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: ["ai-admin-tenants"], queryFn: listAiTenants, staleTime: 30_000, retry: false, ...options });
}

export function useSetAiTenantSubscription(
  options?: UseMutationOptions<void, Error, AiTenantSubscriptionInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setAiTenantSubscription,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["ai-admin-tenants"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useAiAddonCatalog() {
  return useQuery({ queryKey: ["ai-admin-addon"], queryFn: getAiAddonCatalog, staleTime: 30_000, retry: false });
}

export function useUpdateAiAddonCatalog(options?: UseMutationOptions<void, Error, { amountCents: number; active: boolean }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateAiAddonCatalog,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["ai-admin-addon"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

// ---------------------------------------------------------------------------
// Playground — testar a IA na tela (edge ai-playground; sem WhatsApp/cota)
// ---------------------------------------------------------------------------

export type PlaygroundMessage = { role: "user" | "assistant"; text: string };
export type PlaygroundReply = { reply: string; knowledge_count: number };

export async function runPlayground(messages: PlaygroundMessage[]): Promise<PlaygroundReply> {
  return await invokeAuthedFunction<PlaygroundReply>("ai-playground", { messages }, "POST");
}

export function useRunPlayground(options?: UseMutationOptions<PlaygroundReply, Error, PlaygroundMessage[]>) {
  return useMutation({ mutationFn: runPlayground, ...options });
}
