import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type AtendimentoUser = {
  id: string;
  nome: string;
  email: string;
};

/** Atendentes (role 'atendimento', ativos) do tenant — para o seletor da instância. */
export async function listAtendimentoUsers(): Promise<AtendimentoUser[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_atendimento_users");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    nome: String(row.nome ?? ""),
    email: String(row.email ?? ""),
  }));
}

/** IDs dos atendentes responsáveis por uma instância. */
export async function fetchInstanceAttendantIds(instanceId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("whatsapp_instance_attendants")
    .select("profile_id")
    .eq("instance_id", instanceId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String((row as { profile_id: string }).profile_id));
}

/** Contagem de atendentes por instância (todas do tenant) → { instanceId: n }. */
export async function fetchInstanceAttendantCounts(): Promise<Record<string, number>> {
  if (!isSupabaseConfigured) return {};
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("whatsapp_instance_attendants")
    .select("instance_id");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = String((row as { instance_id: string }).instance_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Substitui a seleção de atendentes da instância. */
export async function setInstanceAttendants(
  instanceId: string,
  profileIds: string[],
): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_instance_attendants", {
    p_instance_id: instanceId,
    p_profile_ids: profileIds,
  });
  if (error) throw new Error(error.message);
}

export function useAtendimentoUsers(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["atendimento-users"],
    queryFn: listAtendimentoUsers,
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function instanceAttendantsQueryKey(instanceId: string) {
  return ["instance-attendants", instanceId] as const;
}

export const instanceAttendantCountsQueryKey = ["instance-attendant-counts"] as const;

export function useInstanceAttendantCounts(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: instanceAttendantCountsQueryKey,
    queryFn: fetchInstanceAttendantCounts,
    enabled: isSupabaseConfigured && (opts?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useInstanceAttendantIds(instanceId: string | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: instanceAttendantsQueryKey(instanceId ?? ""),
    queryFn: () => fetchInstanceAttendantIds(instanceId as string),
    enabled: isSupabaseConfigured && !!instanceId && (opts?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useSetInstanceAttendants(
  options?: UseMutationOptions<void, Error, { instanceId: string; profileIds: string[] }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ instanceId, profileIds }) => setInstanceAttendants(instanceId, profileIds),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: instanceAttendantsQueryKey(variables.instanceId) });
      await queryClient.invalidateQueries({ queryKey: instanceAttendantCountsQueryKey });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
