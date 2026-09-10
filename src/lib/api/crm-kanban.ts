import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

const LOCAL_STORAGE_KEY = "wchat-crm-negotiation-stages";

export type CrmNegotiationStageRow = {
  negotiation_id: string;
  funnel_id: string;
  stage_id: string;
};

type LocalStore = Record<string, { funnel_id: string; stage_id: string }>;

function readLocalStore(): LocalStore {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as LocalStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalStore(data: LocalStore) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
}

/** Mapa negotiation_id -> { funnel_id, stage_id } */
export async function fetchCrmNegotiationStageOverrides(): Promise<LocalStore> {
  if (!isSupabaseConfigured) {
    return readLocalStore();
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiation_stages")
    .select("negotiation_id, funnel_id, stage_id")
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(error.message);
  }

  const map: LocalStore = {};
  for (const row of data ?? []) {
    const id = row.negotiation_id as string;
    map[id] = { funnel_id: row.funnel_id as string, stage_id: row.stage_id as string };
  }
  return map;
}

export async function upsertCrmNegotiationStageOverride(input: {
  negotiationId: string;
  funnelId: string;
  stageId: string;
}): Promise<void> {
  if (!isSupabaseConfigured) {
    const store = readLocalStore();
    store[input.negotiationId] = { funnel_id: input.funnelId, stage_id: input.stageId };
    writeLocalStore(store);
    return;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("crm_negotiation_stages").upsert(
    {
      tenant_id: tenantId,
      negotiation_id: input.negotiationId,
      funnel_id: input.funnelId,
      stage_id: input.stageId,
    },
    { onConflict: "tenant_id,negotiation_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export function useCrmNegotiationStageOverrides() {
  return useQuery({
    queryKey: ["crm-negotiation-stages"],
    queryFn: fetchCrmNegotiationStageOverrides,
    staleTime: 30_000,
  });
}

export function useUpsertCrmNegotiationStageOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: upsertCrmNegotiationStageOverride,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["crm-negotiation-stages"] });
      const previous = queryClient.getQueryData<LocalStore>(["crm-negotiation-stages"]);
      queryClient.setQueryData<LocalStore>(["crm-negotiation-stages"], (prev) => ({
        ...(prev ?? {}),
        [input.negotiationId]: {
          funnel_id: input.funnelId,
          stage_id: input.stageId,
        },
      }));
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(["crm-negotiation-stages"], ctx.previous);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-negotiation-stages"] });
    },
  });
}
