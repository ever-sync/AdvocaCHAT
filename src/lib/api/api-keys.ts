import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured } from "@/lib/supabase";
import { supabaseUrl } from "@/lib/supabase";

export type TenantApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreateTenantApiKeyResult = {
  key: TenantApiKeyRecord;
  secret: string;
  warning: string;
};

function mapKey(row: Record<string, unknown>): TenantApiKeyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix ?? row.keyPrefix ?? ""),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : ["read", "write"],
    enabled: Boolean(row.enabled),
    lastUsedAt: row.last_used_at != null ? String(row.last_used_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

export function getWchatApiBaseUrl(): string {
  if (!supabaseUrl?.trim()) {
    return "";
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/wchat-api`;
}

export async function fetchTenantApiKeys(): Promise<TenantApiKeyRecord[]> {
  const data = await invokeAuthedFunction<{ data: Record<string, unknown>[] }>(
    "wchat-api-keys",
    undefined,
    "GET",
  );
  return (data.data ?? []).map(mapKey);
}

export async function createTenantApiKey(input: {
  name: string;
  scopes?: string[];
}): Promise<CreateTenantApiKeyResult> {
  const data = await invokeAuthedFunction<{
    key: Record<string, unknown>;
    secret: string;
    warning: string;
  }>("wchat-api-keys", {
    action: "create",
    name: input.name.trim(),
    scopes: input.scopes ?? ["read", "write"],
  });

  return {
    key: mapKey(data.key),
    secret: data.secret,
    warning: data.warning,
  };
}

export async function revokeTenantApiKey(id: string): Promise<void> {
  await invokeAuthedFunction("wchat-api-keys", { action: "revoke", id });
}

export function useTenantApiKeys() {
  return useQuery({
    queryKey: ["tenant-api-keys"],
    queryFn: fetchTenantApiKeys,
    enabled: isSupabaseConfigured,
  });
}

export function useCreateTenantApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTenantApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-api-keys"] });
    },
  });
}

export function useRevokeTenantApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeTenantApiKey,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-api-keys"] });
    },
  });
}
