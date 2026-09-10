import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type AdPlatform = "google_ads" | "meta_ads";

export interface MarketingAdConfig {
  id: string;
  tenantId: string;
  platform: AdPlatform;
  isActive: boolean;
  credentials: Record<string, unknown>;
  settings: Record<string, unknown>;
}

const SELECT = "id, tenant_id, platform, is_active, credentials, settings";
const QUERY_KEY = "marketing-ad-configs";

function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function mapConfig(row: Record<string, unknown>): MarketingAdConfig {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    platform: String(row.platform) as AdPlatform,
    isActive: row.is_active === true,
    credentials: (row.credentials as Record<string, unknown>) ?? {},
    settings: (row.settings as Record<string, unknown>) ?? {},
  };
}

export async function listMarketingAdConfigs(): Promise<MarketingAdConfig[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_ad_platform_configs")
    .select(SELECT)
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapConfig(asRow(row)));
}

export type UpsertAdConfigInput = {
  platform: AdPlatform;
  isActive: boolean;
  credentials: Record<string, unknown>;
  settings?: Record<string, unknown>;
};

export async function upsertMarketingAdConfig(input: UpsertAdConfigInput): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase.from("marketing_ad_platform_configs").upsert(
    {
      tenant_id: tenantId,
      platform: input.platform,
      is_active: input.isActive,
      credentials: input.credentials,
      settings: input.settings ?? {},
    },
    { onConflict: "tenant_id,platform" },
  );
  if (error) throw new Error(error.message);
}

export function useMarketingAdConfigs(
  options?: Omit<UseQueryOptions<MarketingAdConfig[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY],
    queryFn: listMarketingAdConfigs,
    enabled: (enabledOption ?? true) && isSupabaseConfigured,
    staleTime: 60_000,
  });
}

export function useUpsertMarketingAdConfig(options?: UseMutationOptions<void, Error, UpsertAdConfigInput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertMarketingAdConfig,
    ...options,
    onSuccess: (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(d, v, c);
    },
  });
}
