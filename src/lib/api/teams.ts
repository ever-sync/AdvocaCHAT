import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type TeamMember = {
  id: string;
  nome: string;
  role: string;
  teamId: string | null;
};

export type Team = {
  id: string;
  name: string;
  managerId: string | null;
  managerName: string | null;
  memberCount: number;
  createdAt: string;
};

export type TeamsData = {
  teams: Team[];
  members: TeamMember[];
};

export async function fetchTeamsData(): Promise<TeamsData> {
  if (!isSupabaseConfigured) return { teams: [], members: [] };
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();

  const [{ data: teamRows, error: teamErr }, { data: memberRows, error: memberErr }] = await Promise.all([
    supabase.from("teams").select("id, name, manager_id, created_at").eq("tenant_id", tenantId).order("name"),
    supabase.from("profiles").select("id, nome, role, team_id").eq("tenant_id", tenantId).order("nome"),
  ]);
  if (teamErr) throw new Error(teamErr.message);
  if (memberErr) throw new Error(memberErr.message);

  const members: TeamMember[] = ((memberRows ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    nome: String(row.nome ?? "—"),
    role: String(row.role ?? "atendimento"),
    teamId: row.team_id != null ? String(row.team_id) : null,
  }));
  const nameById = new Map(members.map((m) => [m.id, m.nome]));
  const countByTeam = new Map<string, number>();
  for (const m of members) {
    if (m.teamId) countByTeam.set(m.teamId, (countByTeam.get(m.teamId) ?? 0) + 1);
  }

  const teams: Team[] = ((teamRows ?? []) as Record<string, unknown>[]).map((row) => {
    const id = String(row.id);
    const managerId = row.manager_id != null ? String(row.manager_id) : null;
    return {
      id,
      name: String(row.name ?? ""),
      managerId,
      managerName: managerId ? nameById.get(managerId) ?? null : null,
      memberCount: countByTeam.get(id) ?? 0,
      createdAt: String(row.created_at ?? ""),
    };
  });

  return { teams, members };
}

export async function createTeam(name: string, managerId: string | null): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { error } = await supabase.from("teams").insert({
    tenant_id: tenantId,
    name: name.trim(),
    manager_id: managerId,
  });
  if (error) throw new Error(error.message);
}

export async function updateTeam(id: string, patch: { name?: string; managerId?: string | null }): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.managerId !== undefined) row.manager_id = patch.managerId;
  const { error } = await supabase.from("teams").update(row).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTeam(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.from("teams").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setUserTeam(userId: string, teamId: string | null): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.from("profiles").update({ team_id: teamId }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export function useTeamsData(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeamsData,
    enabled: (options?.enabled ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, managerId }: { name: string; managerId: string | null }) => createTeam(name, managerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; managerId?: string | null } }) =>
      updateTeam(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteTeam,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useSetUserTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, teamId }: { userId: string; teamId: string | null }) => setUserTeam(userId, teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}
