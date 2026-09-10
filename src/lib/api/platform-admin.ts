import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured } from "@/lib/supabase";

export type PlatformAdminAccess = {
  isPlatformAdmin: boolean;
};

const PLATFORM_ADMIN_ACCESS_KEY = ["platform-admin-access"] as const;

export async function fetchPlatformAdminAccess(): Promise<PlatformAdminAccess> {
  try {
    await invokeAuthedFunction<{ ok?: boolean }>("operation-admin?view=access", undefined, "GET");
    return { isPlatformAdmin: true };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("restrito")) {
      return { isPlatformAdmin: false };
    }
    throw error;
  }
}

export function usePlatformAdminAccess(
  options?: Omit<UseQueryOptions<PlatformAdminAccess, Error>, "queryKey" | "queryFn">,
) {
  const { profile, isAuthenticated, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: [...PLATFORM_ADMIN_ACCESS_KEY, profile?.id ?? "anonymous"],
    queryFn: fetchPlatformAdminAccess,
    enabled: (options?.enabled ?? true) && isSupabaseConfigured && isAuthenticated && !authLoading && Boolean(profile?.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
    ...options,
  });
}
