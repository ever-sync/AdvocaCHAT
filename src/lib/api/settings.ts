import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { getAppUrl, isLocalhostAppUrl } from "@/lib/app-url";
import { getCurrentTenantId, getCurrentUserId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CollaboratorInvite, ProfileSettings, UserAvailability, UserRole } from "@/types/domain";

type ProfileRow = {
  id: string;
  tenant_id: string | null;
  nome: string | null;
  email: string | null;
  empresa: string | null;
  plano: string | null;
  role: UserRole;
  status: "active" | "inactive";
  call_phone: string | null;
  cnpj: string | null;
  created_at: string;
  updated_at: string | null;
};

type InviteRow = {
  id: string;
  tenant_id: string;
  nome: string;
  email: string;
  role: UserRole;
  status: CollaboratorInvite["status"];
  invited_by: string | null;
  auth_user_id: string | null;
  created_at: string;
  accepted_at: string | null;
  updated_at: string | null;
};

export type InviteCollaboratorInput = {
  nome: string;
  email: string;
  role: UserRole;
  resend?: boolean;
};

export type InviteCollaboratorResult = {
  invite: CollaboratorInvite;
  emailSent: boolean;
  warning: string | null;
};

export type UpdateProfileInput = {
  nome: string;
  empresa: string;
  callPhone?: string | null;
};

export type UpdateCollaboratorRoleInput = {
  profileId: string;
  role: UserRole;
};

export type UpdateCollaboratorAccessInput = {
  profileId: string;
  nome: string;
  role: UserRole;
  status: "active" | "inactive";
  newPassword: string;
};

function mapProfile(row: ProfileRow): ProfileSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nome: row.nome ?? "",
    email: row.email ?? "",
    empresa: row.empresa ?? "",
    plano: row.plano ?? "starter",
    role: row.role ?? "admin",
    status: row.status ?? "active",
    cnpj: row.cnpj ?? null,
    callPhone: row.call_phone ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

function mapInvite(row: InviteRow): CollaboratorInvite {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nome: row.nome,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    authUserId: row.auth_user_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export async function getMyProfile() {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de editar o perfil.");
  }

  const supabase = requireSupabase();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, nome, email, empresa, plano, role, status, call_phone, cnpj, created_at, updated_at")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel carregar o perfil.");
  }

  return mapProfile(data as ProfileRow);
}

export async function updateMyProfile(input: UpdateProfileInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de editar o perfil.");
  }

  const supabase = requireSupabase();
  const userId = await getCurrentUserId();
  const updatePayload: Record<string, unknown> = {
    nome: input.nome.trim(),
    empresa: input.empresa.trim(),
  };
  if (input.callPhone !== undefined) {
    updatePayload.call_phone = input.callPhone?.trim() || null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select("id, tenant_id, nome, email, empresa, plano, role, status, call_phone, cnpj, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel salvar o perfil.");
  }

  return mapProfile(data as ProfileRow);
}

export async function setMyAvailability(status: UserAvailability): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de alterar status.");
  }
  const supabase = requireSupabase();
  const { error } = await supabase.rpc("set_my_availability", { p_status: status });
  if (error) throw new Error(error.message);
}

export async function listTenantCollaborators() {
  if (!isSupabaseConfigured) {
    return [] as ProfileSettings[];
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, nome, email, empresa, plano, role, status, call_phone, cnpj, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapProfile(row as ProfileRow));
}

export async function updateCollaboratorRole(input: UpdateCollaboratorRoleInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de alterar funcoes.");
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role: input.role })
    .eq("tenant_id", tenantId)
    .eq("id", input.profileId)
    .select("id, tenant_id, nome, email, empresa, plano, role, status, call_phone, cnpj, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel atualizar a funcao do colaborador.");
  }

  return mapProfile(data as ProfileRow);
}

export async function updateCollaboratorAccess(input: UpdateCollaboratorAccessInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de editar colaboradores.");
  }

  const data = await invokeAuthedFunction<{ collaborator: ProfileRow }>("collaborator-admin", input);
  if (!data?.collaborator) {
    throw new Error("Nao foi possivel atualizar o colaborador.");
  }

  return mapProfile(data.collaborator);
}

export async function listCollaboratorInvites() {
  if (!isSupabaseConfigured) {
    return [] as CollaboratorInvite[];
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("collaborator_invites")
    .select("id, tenant_id, nome, email, role, status, invited_by, auth_user_id, created_at, accepted_at, updated_at")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "revoked"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapInvite(row as InviteRow));
}

export async function inviteCollaborator(input: InviteCollaboratorInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de criar acessos.");
  }

  const appUrl = getAppUrl();
  const data = await invokeAuthedFunction<{ invite: InviteRow; emailSent?: boolean; warning?: string | null }>(
    "invite-collaborator",
    isLocalhostAppUrl(appUrl) ? input : { ...input, appUrl },
  );
  return {
    invite: mapInvite(data.invite),
    emailSent: data.emailSent ?? false,
    warning: data.warning ?? null,
  } satisfies InviteCollaboratorResult;
}

export async function deleteCollaboratorInvite(inviteId: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de excluir convites.");
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("collaborator_invites")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", inviteId);

  if (error) {
    throw new Error(error.message ?? "Nao foi possivel excluir o convite.");
  }
}

export async function revokeCollaboratorInvite(inviteId: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de revogar acessos.");
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("collaborator_invites")
    .update({ status: "revoked" })
    .eq("tenant_id", tenantId)
    .eq("id", inviteId)
    .select("id, tenant_id, nome, email, role, status, invited_by, auth_user_id, created_at, accepted_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel revogar o acesso.");
  }

  return mapInvite(data as InviteRow);
}

export function useMyProfile(
  options?: Omit<UseQueryOptions<ProfileSettings, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["settings-profile"],
    queryFn: getMyProfile,
    ...options,
  });
}

export function useUpdateMyProfile(
  options?: UseMutationOptions<ProfileSettings, Error, UpdateProfileInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateMyProfile,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-collaborators"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useSetMyAvailability(
  options?: UseMutationOptions<void, Error, UserAvailability>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setMyAvailability,
    ...options,
    onSuccess: async (data, variables, context) => {
      // useAuth tem realtime na linha do profile; ainda assim invalidamos caches dependentes.
      await queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-collaborators"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useTenantCollaborators(
  options?: Omit<UseQueryOptions<ProfileSettings[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["tenant-collaborators"],
    queryFn: listTenantCollaborators,
    ...options,
  });
}

export function useCollaboratorInvites(
  options?: Omit<UseQueryOptions<CollaboratorInvite[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["collaborator-invites"],
    queryFn: listCollaboratorInvites,
    ...options,
  });
}

export function useUpdateCollaboratorRole(
  options?: UseMutationOptions<ProfileSettings, Error, UpdateCollaboratorRoleInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCollaboratorRole,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-collaborators"] });
      await queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateCollaboratorAccess(
  options?: UseMutationOptions<ProfileSettings, Error, UpdateCollaboratorAccessInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCollaboratorAccess,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["tenant-collaborators"] });
      await queryClient.invalidateQueries({ queryKey: ["settings-profile"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useInviteCollaborator(
  options?: UseMutationOptions<InviteCollaboratorResult, Error, InviteCollaboratorInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: inviteCollaborator,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["collaborator-invites"] });
      await queryClient.invalidateQueries({ queryKey: ["tenant-collaborators"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useRevokeCollaboratorInvite(
  options?: UseMutationOptions<CollaboratorInvite, Error, string>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: revokeCollaboratorInvite,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["collaborator-invites"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCollaboratorInvite(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCollaboratorInvite,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["collaborator-invites"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
