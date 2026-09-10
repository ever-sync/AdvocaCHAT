import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { UserRole } from "@/types/domain";

export type CustomerAssigneeLink = {
  customerId: string;
  assigneeId: string | null;
};

/** Contatos da busca: pool ou já do atendente; oculta leads de outros. */
export function resolveContactListAssigneeFilterId(
  role: UserRole | undefined,
  profileId: string | null | undefined,
  pickedAssigneeId: string | null | undefined,
): string | null {
  if (role === "atendimento") {
    return profileId?.trim() || null;
  }
  if (role === "admin" && pickedAssigneeId?.trim()) {
    return pickedAssigneeId.trim();
  }
  return null;
}

/** Pool (sem responsável) ou já do viewer → visível; bloqueia só vínculo exclusivo com outro. */
export function isCustomerEligibleForContactPicker(
  customerId: string,
  viewerAssigneeId: string,
  negotiations: CustomerAssigneeLink[],
  chats: CustomerAssigneeLink[],
): boolean {
  const viewerId = viewerAssigneeId.trim();
  if (!viewerId) {
    return true;
  }

  const links = [...negotiations, ...chats].filter((row) => row.customerId === customerId);
  const hasOtherExclusive = links.some((row) => {
    const assigneeId = row.assigneeId?.trim();
    return Boolean(assigneeId && assigneeId !== viewerId);
  });
  if (!hasOtherExclusive) {
    return true;
  }

  return links.some((row) => {
    const assigneeId = row.assigneeId?.trim();
    return !assigneeId || assigneeId === viewerId;
  });
}

export function isCustomerBlockedByOtherAssignee(
  customerId: string,
  viewerAssigneeId: string,
  negotiations: CustomerAssigneeLink[],
  chats: CustomerAssigneeLink[],
): boolean {
  return !isCustomerEligibleForContactPicker(
    customerId,
    viewerAssigneeId,
    negotiations,
    chats,
  );
}

export function filterCustomersForContactPicker<T extends { id: string }>(
  customers: T[],
  viewerAssigneeId: string,
  negotiations: CustomerAssigneeLink[],
  chats: CustomerAssigneeLink[],
): T[] {
  return customers.filter((c) =>
    isCustomerEligibleForContactPicker(c.id, viewerAssigneeId, negotiations, chats),
  );
}

export function filterCustomersByBlockedIds<T extends { id: string }>(
  customers: T[],
  blockedIds: ReadonlySet<string>,
): T[] {
  if (blockedIds.size === 0) {
    return customers;
  }
  return customers.filter((c) => !blockedIds.has(c.id));
}

/** RPC com SECURITY DEFINER — enxerga assignee real (RLS não oculta). */
export async function fetchBlockedCustomerIdsForContactPicker(
  customerIds: string[],
  viewerAssigneeId: string,
): Promise<Set<string>> {
  if (!customerIds.length || !isSupabaseConfigured) {
    return new Set();
  }

  const viewerId = viewerAssigneeId.trim();
  if (!viewerId) {
    return new Set();
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("customer_ids_blocked_for_contact_picker", {
    p_customer_ids: customerIds,
    p_viewer_id: viewerId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = Array.isArray(data) ? data : [];
  return new Set(rows.map((id) => String(id)));
}

export async function fetchCustomerContactPickerEligibility(
  customerIds: string[],
  viewerAssigneeId: string,
): Promise<Set<string>> {
  return fetchBlockedCustomerIdsForContactPicker(customerIds, viewerAssigneeId);
}

export function useCustomerContactPickerEligibility(
  customerIds: string[],
  viewerAssigneeId: string | null | undefined,
  options?: Omit<UseQueryOptions<Set<string>>, "queryKey" | "queryFn">,
) {
  const filterId = viewerAssigneeId?.trim() ?? "";
  const sortedIds = [...customerIds].sort().join(",");
  const { enabled: enabledOption, ...rest } = options ?? {};

  return useQuery({
    ...rest,
    queryKey: ["customer-contact-picker-eligibility", filterId, sortedIds],
    queryFn: () => fetchCustomerContactPickerEligibility(customerIds, filterId),
    enabled: (enabledOption ?? true) && Boolean(filterId) && customerIds.length > 0,
  });
}
