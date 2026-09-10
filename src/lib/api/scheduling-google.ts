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

export type GoogleConnection = {
  providerId: string;
  email: string | null;
  status: "connected" | "error" | "revoked";
  calendarId: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

export async function listGoogleConnections(): Promise<GoogleConnection[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_google_connections")
    .select("provider_id, google_account_email, status, calendar_id, last_sync_at, last_error")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = asDbRow(r);
    return {
      providerId: String(row.provider_id),
      email: row.google_account_email != null ? String(row.google_account_email) : null,
      status: (row.status as GoogleConnection["status"]) ?? "connected",
      calendarId: String(row.calendar_id ?? "primary"),
      lastSyncAt: row.last_sync_at != null ? String(row.last_sync_at) : null,
      lastError: row.last_error != null ? String(row.last_error) : null,
    };
  });
}

export async function getGoogleConnectUrl(providerId: string): Promise<string> {
  const res = await invokeAuthedFunction<{ authorizeUrl: string }>(
    "scheduling-google-connect",
    { providerId },
    "POST",
  );
  return res.authorizeUrl;
}

export async function disconnectGoogle(providerId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("scheduling_google_connections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId);
  if (error) throw new Error(error.message);
}

const KEY = ["scheduling-google-connections"] as const;

export function useGoogleConnections(
  options?: Omit<UseQueryOptions<GoogleConnection[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: KEY,
    queryFn: listGoogleConnections,
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 30_000,
  });
}

export function useDisconnectGoogle(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectGoogle,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}
