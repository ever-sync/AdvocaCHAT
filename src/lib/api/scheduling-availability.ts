import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { AvailabilityDay } from "@/types/domain";

export type AvailabilityRequest = {
  providerId: string;
  serviceId?: string | null;
  serviceIds?: string[] | null;
  roomId?: string | null;
  /** Datas (YYYY-MM-DD) inclusivas, na timezone do prestador. */
  from: string;
  to: string;
};

type AvailabilityResponse = {
  timezone: string;
  days: AvailabilityDay[];
};

export async function fetchAvailability(req: AvailabilityRequest): Promise<AvailabilityResponse> {
  return invokeAuthedFunction<AvailabilityResponse>("scheduling-availability", req, "POST");
}

export function useAvailability(
  req: AvailabilityRequest | null,
  options?: Omit<UseQueryOptions<AvailabilityResponse>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [
      "scheduling-availability",
      req?.providerId ?? "",
      req?.serviceId ?? "",
      req?.serviceIds?.join(",") ?? "none",
      req?.roomId ?? "",
      req?.from ?? "",
      req?.to ?? "",
    ],
    queryFn: () => fetchAvailability(req!),
    enabled: Boolean(req?.providerId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 10_000,
  });
}
