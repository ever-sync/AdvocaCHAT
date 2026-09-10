import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type CustomerAiFact = {
  id: string;
  customer_id: string;
  fact: string;
  source: "ai" | "human";
  chat_id: string | null;
  created_at: string;
};

const KEY = (customerId: string | undefined) => ["customer-ai-facts", customerId ?? null] as const;

export async function listCustomerAiFacts(customerId: string): Promise<CustomerAiFact[]> {
  if (!isSupabaseConfigured || !customerId) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("customer_ai_facts")
    .select("id, customer_id, fact, source, chat_id, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerAiFact[];
}

export function useCustomerAiFacts(
  customerId: string | undefined,
  options?: Omit<UseQueryOptions<CustomerAiFact[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: KEY(customerId),
    queryFn: () => listCustomerAiFacts(customerId ?? ""),
    enabled: Boolean(customerId) && isSupabaseConfigured,
    staleTime: 60_000,
    ...options,
  });
}

export async function deleteCustomerAiFact(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.from("customer_ai_facts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function useDeleteCustomerAiFact(
  customerId: string | undefined,
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomerAiFact,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: KEY(customerId) });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
