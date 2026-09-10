import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import {
  isMarketingFlowStatus,
  type MarketingFlowStatus,
} from "@/lib/marketing/flow-types";

export type { MarketingFlowStatus } from "@/lib/marketing/flow-types";

export type MarketingFlowRecord = {
  id: string;
  tenantId: string;
  name: string;
  status: MarketingFlowStatus;
  definition: Record<string, unknown>;
  criteria: Record<string, unknown>;
  trigger: Record<string, unknown>;
  publishedDefinition: Record<string, unknown> | null;
  version: number;
  publishedAt: string | null;
  publishedBy: string | null;
  leadsEntry: number;
  leadsActive: number | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT = [
  "id",
  "tenant_id",
  "name",
  "status",
  "definition",
  "criteria",
  "trigger",
  "published_definition",
  "version",
  "published_at",
  "published_by",
  "leads_entry",
  "leads_active",
  "created_at",
  "updated_at",
].join(", ");

const QUERY_KEY = "marketing-flows";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function toStatus(value: unknown): MarketingFlowStatus {
  return isMarketingFlowStatus(value) ? value : "rascunho";
}

export function mapMarketingFlowRow(row: Record<string, unknown>): MarketingFlowRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ""),
    status: toStatus(row.status),
    definition: asRecord(row.definition),
    criteria: asRecord(row.criteria),
    trigger: asRecord(row.trigger),
    publishedDefinition:
      row.published_definition == null ? null : asRecord(row.published_definition),
    version: Number(row.version ?? 1),
    publishedAt: row.published_at == null ? null : String(row.published_at),
    publishedBy: row.published_by == null ? null : String(row.published_by),
    leadsEntry: Number(row.leads_entry ?? 0),
    leadsActive: row.leads_active == null ? null : Number(row.leads_active),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type MarketingFlowCreateInput = {
  name: string;
  status?: MarketingFlowStatus;
  definition?: Record<string, unknown>;
  criteria?: Record<string, unknown>;
  trigger?: Record<string, unknown>;
};

export type MarketingFlowPatch = Partial<{
  name: string;
  status: MarketingFlowStatus;
  definition: Record<string, unknown>;
  criteria: Record<string, unknown>;
  trigger: Record<string, unknown>;
  leadsEntry: number;
  leadsActive: number | null;
}>;

function patchToRow(patch: MarketingFlowPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.definition !== undefined) row.definition = patch.definition;
  if (patch.criteria !== undefined) row.criteria = patch.criteria;
  if (patch.trigger !== undefined) row.trigger = patch.trigger;
  if (patch.leadsEntry !== undefined) row.leads_entry = patch.leadsEntry;
  if (patch.leadsActive !== undefined) row.leads_active = patch.leadsActive;
  return row;
}

export async function listMarketingFlows(): Promise<MarketingFlowRecord[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flows")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMarketingFlowRow(asRow(row)));
}

export async function getMarketingFlowById(id: string): Promise<MarketingFlowRecord | null> {
  if (!isSupabaseConfigured || !id) return null;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flows")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapMarketingFlowRow(asRow(data)) : null;
}

export async function createMarketingFlow(
  input: MarketingFlowCreateInput,
): Promise<MarketingFlowRecord> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const name = input.name.trim() || "Fluxo sem nome";
  const { data, error } = await supabase
    .from("marketing_flows")
    .insert({
      tenant_id: tenantId,
      name,
      status: input.status ?? "rascunho",
      definition: input.definition ?? { steps: [] },
      criteria: input.criteria ?? {},
      trigger: input.trigger ?? {},
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapMarketingFlowRow(asRow(data));
}

export async function updateMarketingFlow(
  id: string,
  patch: MarketingFlowPatch,
): Promise<MarketingFlowRecord> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_flows")
    .update(patchToRow(patch))
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapMarketingFlowRow(asRow(data));
}

export async function deleteMarketingFlow(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("marketing_flows")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function duplicateMarketingFlow(id: string): Promise<MarketingFlowRecord> {
  const source = await getMarketingFlowById(id);
  if (!source) throw new Error("Fluxo não encontrado.");
  return createMarketingFlow({
    name: `${source.name} (cópia)`,
    status: "rascunho",
    definition: source.definition,
    criteria: source.criteria,
  });
}

export type PublishMarketingFlowInput = {
  id: string;
  /** Snapshot a publicar (geralmente o draft atual com edicoes locais). */
  definition: Record<string, unknown>;
  criteria: Record<string, unknown>;
  trigger: Record<string, unknown>;
  /** Resultado da validacao (warnings) guardado para auditoria. */
  validationSnapshot?: Record<string, unknown>;
};

/**
 * Publica uma nova versao do fluxo:
 *  1. Insere snapshot imutavel em marketing_flow_versions (version = atual + 1).
 *  2. Atualiza marketing_flows com published_definition, published_at,
 *     published_by, version e status='ativo'.
 *
 * Sem RPC por enquanto — race condition entre o read da versao e o insert e
 * controlada pelo unique (flow_id, version) (conflito = re-tentar). Se virar
 * problema, vira RPC publish_marketing_flow() em fase posterior.
 */
export async function publishMarketingFlow(
  input: PublishMarketingFlowInput,
): Promise<MarketingFlowRecord> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  const userId = userData.user?.id ?? null;

  const { data: current, error: readError } = await supabase
    .from("marketing_flows")
    .select("version, definition, criteria, trigger")
    .eq("tenant_id", tenantId)
    .eq("id", input.id)
    .single();
  if (readError) throw new Error(readError.message);

  const nextVersion = Number(asRow(current).version ?? 1) + 1;
  const publishedAt = new Date().toISOString();

  const { error: versionError } = await supabase
    .from("marketing_flow_versions")
    .insert({
      tenant_id: tenantId,
      flow_id: input.id,
      version: nextVersion,
      definition: input.definition,
      criteria: input.criteria,
      trigger: input.trigger,
      validation_snapshot: input.validationSnapshot ?? {},
      published_by: userId,
      published_at: publishedAt,
    });
  if (versionError) throw new Error(versionError.message);

  const { data: updated, error: updateError } = await supabase
    .from("marketing_flows")
    .update({
      definition: input.definition,
      criteria: input.criteria,
      trigger: input.trigger,
      published_definition: input.definition,
      published_at: publishedAt,
      published_by: userId,
      version: nextVersion,
      status: "ativo",
    })
    .eq("tenant_id", tenantId)
    .eq("id", input.id)
    .select(SELECT)
    .single();
  if (updateError) throw new Error(updateError.message);

  return mapMarketingFlowRow(asRow(updated));
}

// ---------------------------------------------------------------- Hooks

export function useMarketingFlows(
  options?: Omit<UseQueryOptions<MarketingFlowRecord[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "list"],
    queryFn: listMarketingFlows,
    enabled: (enabledOption ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useMarketingFlow(
  id: string | null | undefined,
  options?: Omit<UseQueryOptions<MarketingFlowRecord | null>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "detail", id],
    queryFn: () => getMarketingFlowById(id ?? ""),
    enabled: (enabledOption ?? true) && isSupabaseConfigured && !!id,
  });
}

export function useCreateMarketingFlow(
  options?: UseMutationOptions<MarketingFlowRecord, Error, MarketingFlowCreateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMarketingFlow,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useUpdateMarketingFlow(
  options?: UseMutationOptions<
    MarketingFlowRecord,
    Error,
    { id: string; patch: MarketingFlowPatch }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MarketingFlowPatch }) =>
      updateMarketingFlow(id, patch),
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteMarketingFlow(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMarketingFlow,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDuplicateMarketingFlow(
  options?: UseMutationOptions<MarketingFlowRecord, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: duplicateMarketingFlow,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function usePublishMarketingFlow(
  options?: UseMutationOptions<MarketingFlowRecord, Error, PublishMarketingFlowInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishMarketingFlow,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}
