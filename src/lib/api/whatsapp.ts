import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryOptions,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { invokeAuthedFunction } from "@/lib/api/functions";
import { isE2eMockAuth } from "@/lib/e2e";
import { getE2eInboxChatById, listE2eInboxChats } from "@/lib/inbox-e2e";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type {
  ChatResolution,
  InboxChat,
  InboxChatFilters,
  InboxListScope,
  SendWhatsappMessageInput,
  WhatsappChannelCreateInput,
  WhatsappInstance,
  WhatsappInstanceConnectInput,
  WhatsappMessage,
} from "@/types/domain";
import { getCurrentTenantId, getCurrentUserId } from "@/lib/api/tenant";
import { sanitizeCustomerSearchForPostgrestOrIlike } from "@/lib/customer-search-sanitize";
import { safeParseMs } from "@/lib/utils";


const CHAT_RESOLUTION_VALUES = new Set<ChatResolution>([
  "open",
  "pending",
  "resolved",
  "waiting_customer",
  "lost",
]);

const DEFAULT_INBOX_CHATS_LIMIT = 500;

/** Select compartilhado entre listagem e fetch por id (deep link CRM → Inbox). */
const INBOX_CHAT_SELECT = `
  id,
  instance_id,
  customer_id,
  channel_type,
  remote_jid,
  remote_phone_digits,
  remote_phone_e164,
  display_name,
  avatar_url,
  last_message_preview,
  last_message_at,
  unread_count,
  status,
  resolution,
  ai_mode,
  primary_negotiation_id,
  updated_at,
  assignee_id,
  first_inbound_at,
  first_response_at,
  sla_first_response_due_at,
  snooze_until,
  whatsapp_instances(display_name, archived_at),
  customers(nome),
  assignee:profiles!whatsapp_chats_assignee_id_fkey(nome),
  whatsapp_chat_tags(tag_id, tagged_by, tagged_at, chat_tags(name, color, scope))
`;

/** Normaliza termo de busca para casar telefone com ou sem + / máscara. */
export function inboxSearchTermsForPostgrest(raw: string): {
  text: string;
  digits: string;
} {
  const text = sanitizeCustomerSearchForPostgrestOrIlike(raw);
  const digits = text.replace(/\D/g, "");
  return { text, digits };
}

export function inboxChatFiltersFromListScope(
  scope: InboxListScope,
): Pick<InboxChatFilters, "status" | "resolution" | "hideLost"> {
  switch (scope) {
    case "all":
      return { status: "all", hideLost: true };
    case "open":
      return { status: "open", hideLost: true };
    case "closed":
      return { status: "closed", hideLost: true };
    case "resolved":
      return { status: "all", resolution: "resolved" };
    case "lost":
      return { status: "all", resolution: "lost" };
  }
}

type InstanceRow = {
  id: string;
  display_name: string;
  uazapi_instance_name: string;
  uazapi_base_url: string;
  provider?: WhatsappInstance["provider"];
  meta_page_id?: string | null;
  meta_ig_user_id?: string | null;
  phone_number: string | null;
  status: WhatsappInstance["status"];
  is_default: boolean;
  last_qr: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  archived_at?: string | null;
  created_at: string;
  ai_enabled?: boolean | null;
};

type ChatTagJunctionRow = {
  tag_id: string;
  tagged_by: string;
  tagged_at: string;
  chat_tags: {
    name: string;
    color: string;
    scope: "global" | "private";
  } | null;
};

type ChatRow = {
  id: string;
  instance_id: string;
  customer_id: string | null;
  channel_type?: InboxChat["channelType"];
  remote_jid: string;
  remote_phone_digits: string | null;
  remote_phone_e164: string | null;
  display_name: string;
  avatar_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  status: InboxChat["status"];
  resolution?: InboxChat["resolution"];
  ai_mode?: InboxChat["aiMode"];
  primary_negotiation_id?: string | null;
  updated_at?: string | null;
  assignee_id?: string | null;
  first_inbound_at?: string | null;
  first_response_at?: string | null;
  sla_first_response_due_at?: string | null;
  snooze_until?: string | null;
  whatsapp_instances?: { display_name: string; archived_at?: string | null } | null;
  customers?: { nome: string } | null;
  assignee?: { nome: string } | null;
  whatsapp_chat_tags?: ChatTagJunctionRow[] | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  instance_id: string;
  uazapi_message_id: string | null;
  campaign_id: string | null;
  campaign_recipient_id: string | null;
  channel_type?: WhatsappMessage["channelType"];
  direction: WhatsappMessage["direction"];
  message_type: WhatsappMessage["messageType"];
  status: WhatsappMessage["status"];
  body_text: string | null;
  media_url: string | null;
  payload_json: Record<string, unknown> | null;
  raw_event: Record<string, unknown> | null;
  quoted_message_id: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  actor_type?: WhatsappMessage["actorType"];
};

function mapInstance(row: InstanceRow): WhatsappInstance {
  return {
    id: row.id,
    displayName: row.display_name,
    uazapiInstanceName: row.uazapi_instance_name,
    uazapiBaseUrl: row.uazapi_base_url,
    provider: row.provider ?? "uazapi",
    metaPageId: row.meta_page_id ?? null,
    metaIgUserId: row.meta_ig_user_id ?? null,
    phoneNumber: row.phone_number,
    status: row.status,
    isDefault: row.is_default,
    lastQr: row.last_qr,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    aiEnabled: row.ai_enabled ?? false,
  };
}

/** Pins por usuário — falha silenciosa se a migration ainda não foi aplicada. */
async function fetchPinnedChatIdsForCurrentUser(
  supabase: ReturnType<typeof requireSupabase>,
  tenantId: string,
  profileId?: string | null,
): Promise<Set<string>> {
  const uid = profileId?.trim();
  if (!uid) {
    return new Set();
  }

  try {
    const { data, error } = await supabase
      .from("whatsapp_chat_pins")
      .select("chat_id")
      .eq("tenant_id", tenantId)
      .eq("profile_id", uid);

    if (error) {
      return new Set();
    }

    return new Set((data ?? []).map((row) => String(row.chat_id)));
  } catch {
    return new Set();
  }
}

function mapChat(row: ChatRow, pinnedChatIds?: Set<string>): InboxChat {
  const rawDisplayName = row.display_name?.trim() ?? "";
  const digits = row.remote_phone_digits?.replace(/\D/g, "") ?? "";
  const fallbackPhone = row.remote_phone_e164 ??
    (digits ? `+${digits.startsWith("55") ? digits : `55${digits}`}` : row.remote_jid);
  const looksLikePhone =
    !rawDisplayName ||
    /^\+?\d[\d\s()-]*$/.test(rawDisplayName) ||
    rawDisplayName.includes("@s.whatsapp.net");
  const displayName = row.customers?.nome?.trim() ||
    (!looksLikePhone ? rawDisplayName : "") ||
    fallbackPhone;

  const tags = (row.whatsapp_chat_tags ?? [])
    .filter((t) => t.chat_tags)
    .map((t) => ({
      tagId: t.tag_id,
      name: t.chat_tags!.name,
      color: t.chat_tags!.color,
      scope: t.chat_tags!.scope,
      taggedBy: t.tagged_by,
      taggedAt: t.tagged_at,
    }));

  return {
    id: row.id,
    instanceId: row.instance_id,
    instanceName: row.whatsapp_instances?.display_name ?? "Instância",
    customerId: row.customer_id,
    customerName: row.customers?.nome ?? null,
    channelType: row.channel_type ?? "whatsapp",
    remoteJid: row.remote_jid,
    remotePhoneDigits: row.remote_phone_digits,
    remotePhoneE164: row.remote_phone_e164,
    displayName,
    avatarUrl: row.avatar_url,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    status: row.status,
    resolution: CHAT_RESOLUTION_VALUES.has(row.resolution as ChatResolution)
      ? (row.resolution as ChatResolution)
      : "open",
    aiMode: row.ai_mode ?? "off",
    primaryNegotiationId: row.primary_negotiation_id ?? null,
    assigneeId: row.assignee_id ?? null,
    assigneeName: row.assignee?.nome ?? null,
    firstInboundAt: row.first_inbound_at ?? null,
    firstResponseAt: row.first_response_at ?? null,
    slaFirstResponseDueAt: row.sla_first_response_due_at ?? null,
    snoozeUntil: row.snooze_until ?? null,
    isPinned: pinnedChatIds?.has(row.id) ?? false,
    tags,
  };
}

function mapMessage(row: MessageRow): WhatsappMessage {
  return {
    id: row.id,
    chatId: row.chat_id,
    instanceId: row.instance_id,
    uazapiMessageId: row.uazapi_message_id,
    campaignId: row.campaign_id,
    campaignRecipientId: row.campaign_recipient_id,
    channelType: row.channel_type ?? "whatsapp",
    direction: row.direction,
    messageType: row.message_type,
    status: row.status,
    bodyText: row.body_text,
    mediaUrl: row.media_url,
    payloadJson: row.payload_json ?? {},
    rawEvent: row.raw_event ?? null,
    quotedMessageId: row.quoted_message_id,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    actorType: row.actor_type ?? null,
  };
}

export async function listWhatsappInstances() {
  if (!isSupabaseConfigured) {
    return [] as WhatsappInstance[];
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("id, display_name, uazapi_instance_name, uazapi_base_url, provider, meta_page_id, meta_ig_user_id, phone_number, status, is_default, last_qr, last_sync_at, last_error, archived_at, created_at, ai_enabled")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("display_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapInstance(row as InstanceRow));
}

export async function connectWhatsappInstance(input: WhatsappInstanceConnectInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de conectar uma instância WhatsApp.");
  }

  const data = await invokeAuthedFunction<{ instance: InstanceRow }>("uazapi-instance-connect", input);
  return mapInstance(data.instance as InstanceRow);
}

export async function createWhatsappChannel(input: WhatsappChannelCreateInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de criar um canal.");
  }

  const data = await invokeAuthedFunction<{ instance: InstanceRow }>("uazapi-instance-create", input);
  return mapInstance(data.instance as InstanceRow);
}

export async function syncWhatsappInstances(instanceId?: string) {
  if (!isSupabaseConfigured) {
    return { success: true };
  }

  return invokeAuthedFunction<{ success: boolean }>("uazapi-instance-sync", { instanceId });
}

export async function deleteWhatsappInstance(id: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de remover uma instância.");
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const { data: current, error: currentError } = await supabase
    .from("whatsapp_instances")
    .select("id, is_default")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (currentError) {
    throw new Error(currentError.message);
  }

  if (!current) {
    throw new Error("InstÃ¢ncia nÃ£o encontrada.");
  }

  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("whatsapp_instances")
    .update({
      archived_at: archivedAt,
      is_default: false,
      status: "disconnected",
      last_error: "Canal arquivado manualmente.",
      last_sync_at: archivedAt,
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  const { error: chatsError } = await supabase
    .from("whatsapp_chats")
    .update({
      status: "closed",
      unread_count: 0,
    })
    .eq("tenant_id", tenantId)
    .eq("instance_id", id);

  if (chatsError) {
    throw new Error(chatsError.message);
  }

  if (current.is_default) {
    const { data: replacement, error: replacementError } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .neq("id", id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (replacementError) {
      throw new Error(replacementError.message);
    }

    const nextDefault = replacement?.[0];
    if (nextDefault?.id) {
      const { error: defaultError } = await supabase
        .from("whatsapp_instances")
        .update({ is_default: true })
        .eq("tenant_id", tenantId)
        .eq("id", nextDefault.id);

      if (defaultError) {
        throw new Error(defaultError.message);
      }
    }
  }
}

export type WhatsappInstanceUpdateInput = {
  displayName?: string;
  uazapiBaseUrl?: string;
  isDefault?: boolean;
};

export async function updateWhatsappInstance(id: string, input: WhatsappInstanceUpdateInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de editar uma instância.");
  }
  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();

  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName.trim();
  if (input.uazapiBaseUrl !== undefined) patch.uazapi_base_url = input.uazapiBaseUrl.trim();
  if (input.isDefault !== undefined) patch.is_default = input.isDefault;

  // Só pode haver uma instância padrão por tenant.
  if (input.isDefault === true) {
    const { error: clearError } = await supabase
      .from("whatsapp_instances")
      .update({ is_default: false })
      .eq("tenant_id", tenantId)
      .neq("id", id);
    if (clearError) throw new Error(clearError.message);
  }

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id, display_name, uazapi_instance_name, uazapi_base_url, provider, meta_page_id, meta_ig_user_id, phone_number, status, is_default, last_qr, last_sync_at, last_error, archived_at, created_at, ai_enabled")
    .single();

  if (error) throw new Error(error.message);
  return mapInstance(data as InstanceRow);
}

export async function listInboxChats(filters: InboxChatFilters = {}) {
  if (isE2eMockAuth) {
    return listE2eInboxChats(filters);
  }

  if (!isSupabaseConfigured) {
    return [] as InboxChat[];
  }

  const supabase = requireSupabase();
  const [tenantId, profileId] = await Promise.all([
    getCurrentTenantId(),
    getCurrentUserId().catch(() => null),
  ]);
  let query = supabase
    .from("whatsapp_chats")
    .select(INBOX_CHAT_SELECT)
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(filters.limit ?? DEFAULT_INBOX_CHATS_LIMIT);

  if (filters.instanceIds && filters.instanceIds.length > 0) {
    query = query.in("instance_id", filters.instanceIds);
  } else if (filters.instanceId) {
    query = query.eq("instance_id", filters.instanceId);
  }

  if (filters.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters.unreadOnly) {
    query = query.gt("unread_count", 0);
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.resolution) {
    query = query.eq("resolution", filters.resolution);
  }

  if (filters.search?.trim()) {
    const { text: search, digits } = inboxSearchTermsForPostgrest(filters.search);
    if (search.length > 0 || digits.length > 0) {
      // O PostgREST não permite referenciar uma tabela aninhada (customers.nome)
      // dentro de um or() no nível do whatsapp_chats — isso retorna 400. Então
      // buscamos primeiro os ids dos clientes que casam pelo nome e filtramos por
      // customer_id (coluna do próprio chat), que é aceito no or().
      const { data: matchedCustomers } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("nome", `%${search}%`)
        .limit(1000);
      const customerIds = (matchedCustomers ?? []).map((c) => c.id as string);

      const orParts: string[] = [];
      if (search.length > 0) {
        orParts.push(`display_name.ilike.%${search}%`);
      }
      const phoneNeedle = digits.length >= 4 ? digits : search.replace(/\D/g, "");
      if (phoneNeedle.length >= 4) {
        orParts.push(`remote_phone_digits.ilike.%${phoneNeedle}%`);
        orParts.push(`remote_phone_e164.ilike.%${phoneNeedle}%`);
      } else if (search.length > 0) {
        orParts.push(`remote_phone_digits.ilike.%${search}%`);
        orParts.push(`remote_phone_e164.ilike.%${search}%`);
      }
      if (customerIds.length > 0) {
        orParts.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      if (orParts.length > 0) {
        query = query.or(orParts.join(","));
      }
    }
  }

  if (filters.assigneeId) {
    if (filters.assigneeId === "unassigned") {
      query = query.is("assignee_id", null);
    } else if (filters.assigneeId === "mine") {
      const mineId = filters.currentUserId?.trim();
      if (mineId) {
        query = query.eq("assignee_id", mineId);
      }
    } else {
      query = query.eq("assignee_id", filters.assigneeId);
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const pinnedChatIds = await fetchPinnedChatIdsForCurrentUser(supabase, tenantId, profileId);

  let rows = (data ?? []) as unknown as ChatRow[];

  if (filters.tagIds?.length) {
    const tagSet = new Set(filters.tagIds);
    rows = rows.filter((row) =>
      row.whatsapp_chat_tags?.some((t) => tagSet.has(t.tag_id)),
    );
  }

  if (filters.hideLost) {
    rows = rows.filter((row) => (row.resolution ?? "open") !== "lost");
  }

  const now = Date.now();

  if (filters.snoozedOnly) {
    rows = rows.filter((row) => row.snooze_until && new Date(row.snooze_until).getTime() > now);
  } else if (filters.hideSnoozed) {
    rows = rows.filter((row) => !row.snooze_until || new Date(row.snooze_until).getTime() <= now);
  }

  return rows
    .filter((row) => !row.whatsapp_instances?.archived_at)
    .map((row) => mapChat(row, pinnedChatIds))
    .sort((left, right) => {
      // Fixadas sempre no topo, independente de snoozed.
      if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
        return left.isPinned ? -1 : 1;
      }

      const leftSnoozed = left.snoozeUntil && new Date(left.snoozeUntil).getTime() > now;
      const rightSnoozed = right.snoozeUntil && new Date(right.snoozeUntil).getTime() > now;
      if (leftSnoozed !== rightSnoozed) {
        return leftSnoozed ? 1 : -1;
      }

      const rightTime = new Date(right.lastMessageAt ?? 0).getTime();
      const leftTime = new Date(left.lastMessageAt ?? 0).getTime();
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      if (right.unreadCount !== left.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      return left.displayName.localeCompare(right.displayName, "pt-BR");
    });
}

export async function linkWhatsappChatToCustomer(chatId: string, customerId: string | null): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado. Não é possível vincular o chat.");
  }
  if (!chatId) {
    throw new Error("Chat inválido.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .update({ customer_id: customerId })
    .eq("tenant_id", tenantId)
    .eq("id", chatId)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.length) {
    throw new Error(
      "Conversa não encontrada neste workspace. O chat pode ter sido removido ou o identificador não é mais válido; vincule manualmente na inbox.",
    );
  }

  if (customerId) {
    try {
      await supabase.rpc("ensure_lead_from_chat", {
        p_chat_id: chatId,
        p_auto_assign: false,
      });
    } catch {
      // CRM link is best-effort after customer bind
    }
  }
}

export function useLinkWhatsappChatCustomer(
  options?: UseMutationOptions<void, Error, { chatId: string; customerId: string | null }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, customerId }) => linkWhatsappChatToCustomer(chatId, customerId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      if (variables.customerId) {
        await queryClient.invalidateQueries({ queryKey: ["customers", variables.customerId] });
      }
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export async function deleteWhatsappChat(chatId: string): Promise<void> {
  if (!isSupabaseConfigured || !chatId) {
    return;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  // RLS (admin-only DELETE policy) é a fonte da verdade; o filtro por tenant
  // só evita race entre sessões com tenants diferentes.
  const { error } = await supabase
    .from("whatsapp_chats")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", chatId);

  if (error) {
    throw new Error(error.message);
  }
}

export function useDeleteWhatsappChat(
  options?: UseMutationOptions<void, Error, { chatId: string }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId }) => deleteWhatsappChat(chatId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export async function deleteWhatsappChats(chatIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !chatIds.length) {
    return;
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("whatsapp_chats")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", chatIds);

  if (error) {
    throw new Error(error.message);
  }
}

export function useDeleteWhatsappChats(
  options?: UseMutationOptions<void, Error, { chatIds: string[] }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatIds }) => deleteWhatsappChats(chatIds),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export const INBOX_MESSAGES_PAGE_SIZE = 50;

export type InboxMessagesPageCursor = {
  beforeCreatedAt: string;
  beforeId: string;
};

export type InboxMessagesPageResult = {
  messages: WhatsappMessage[];
  hasMore: boolean;
};

/**
 * One page of messages: ascending time within the window (oldest index 0).
 * `cursor` = load rows strictly older than this (exclusive). `null` = newest window.
 */
export async function fetchInboxMessagesPage(
  chatId: string,
  cursor: InboxMessagesPageCursor | null,
): Promise<InboxMessagesPageResult> {
  if (!isSupabaseConfigured || !chatId) {
    return { messages: [], hasMore: false };
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("whatsapp_messages_page", {
    p_chat_id: chatId,
    p_before_created_at: cursor?.beforeCreatedAt ?? null,
    p_before_id: cursor?.beforeId ?? null,
    p_limit: INBOX_MESSAGES_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as MessageRow[];
  const hasMore = rows.length > INBOX_MESSAGES_PAGE_SIZE;
  const trimmed = rows.slice(0, INBOX_MESSAGES_PAGE_SIZE).map((row) => mapMessage(row));
  const ascendingChunk = [...trimmed].reverse();

  return { messages: ascendingChunk, hasMore };
}

export function getNextInboxMessagesPageParam(
  lastPage: InboxMessagesPageResult,
): InboxMessagesPageCursor | undefined {
  if (!lastPage.hasMore) {
    return undefined;
  }

  const oldest = lastPage.messages[0];
  if (!oldest?.createdAt) {
    return undefined;
  }

  return { beforeCreatedAt: oldest.createdAt, beforeId: oldest.id };
}

function flattenInboxMessagePages(
  data: InfiniteData<InboxMessagesPageResult> | undefined,
): WhatsappMessage[] {
  if (!data?.pages?.length) {
    return [];
  }

  return dedupeInboxMessagesById([...data.pages].reverse().flatMap((page) => page.messages));
}

/**
 * Mantem apenas uma instancia por `id`, preservando a ordem do item mais
 * recente no array. Isso protege a UI contra duplicacao quando o mesmo envio
 * chega por mais de um caminho de cache (ex.: otimista + Realtime + refetch).
 */
export function dedupeInboxMessagesById(messages: WhatsappMessage[]): WhatsappMessage[] {
  if (messages.length < 2) {
    return messages;
  }

  const seenIds = new Set<string>();
  const seenProviderIds = new Set<string>();
  const deduped: WhatsappMessage[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const providerMessageId = normalizeWhatsappProviderMessageId(message.uazapiMessageId);
    if (seenIds.has(message.id)) {
      continue;
    }
    if (providerMessageId && seenProviderIds.has(providerMessageId)) {
      continue;
    }
    seenIds.add(message.id);
    if (providerMessageId) {
      seenProviderIds.add(providerMessageId);
    }
    deduped.push(message);
  }

  return collapseOutboundNearDuplicateGroups(stripRedundantOutboundTemps(deduped.reverse()));
}

const OUTBOUND_DEDUPE_STATUS_RANK: Record<WhatsappMessage["status"], number> = {
  failed: 0,
  queued: 1,
  sent: 2,
  received: 2,
  delivered: 3,
  read: 4,
};

function outboundDedupeStatusRank(status: WhatsappMessage["status"]): number {
  return OUTBOUND_DEDUPE_STATUS_RANK[status] ?? 0;
}

/** Só conteúdo (sem tempo): o minuto do `sent_at` do servidor costuma divergir do cliente e quebrava o dedupe. */
function outboundContentDedupeKey(m: WhatsappMessage): string | null {
  if (m.direction !== "outbound") {
    return null;
  }
  const type = m.messageType ?? "text";
  const media = (m.mediaUrl ?? "").trim();
  const body = normalizeOutboundBodyForMatch(m.bodyText);
  return `${type}\0${media}\0${body}`;
}

const OUTBOUND_DEDUPE_TIME_SPREAD_MS = 600_000;
const OUTBOUND_RAPID_DUPLICATE_SPREAD_MS = 5_000;

function outboundMessageTimeMs(m: WhatsappMessage): number {
  return safeParseMs(m.sentAt ?? m.createdAt);
}

function preferOutboundDedupeWinner(a: WhatsappMessage, b: WhatsappMessage): WhatsappMessage {
  const aTemp = a.id.startsWith("temp-");
  const bTemp = b.id.startsWith("temp-");
  if (aTemp !== bTemp) {
    return aTemp ? b : a;
  }

  const pa = normalizeWhatsappProviderMessageId(a.uazapiMessageId);
  const pb = normalizeWhatsappProviderMessageId(b.uazapiMessageId);
  if (Boolean(pa) !== Boolean(pb)) {
    return pa ? a : b;
  }

  const ra = outboundDedupeStatusRank(a.status);
  const rb = outboundDedupeStatusRank(b.status);
  if (ra !== rb) {
    return ra > rb ? a : b;
  }

  const ta = safeParseMs(a.createdAt ?? a.sentAt);
  const tb = safeParseMs(b.createdAt ?? b.sentAt);
  if (ta !== tb) {
    return ta > tb ? a : b;
  }

  return a.id > b.id ? a : b;
}

function shouldCollapseOutboundGroup(arr: WhatsappMessage[]): boolean {
  if (arr.length < 2) {
    return false;
  }
  if (!arr.every((m) => m.direction === "outbound")) {
    return false;
  }
  if (arr.some((m) => m.id.startsWith("temp-"))) {
    return true;
  }

  const contentKeys = arr
    .map((m) => outboundContentDedupeKey(m))
    .filter((k): k is string => Boolean(k));
  if (contentKeys.length !== arr.length || new Set(contentKeys).size !== 1) {
    return false;
  }

  const times = arr.map(outboundMessageTimeMs);
  if (times.every((t) => t > 0)) {
    const spread = Math.max(...times) - Math.min(...times);
    if (spread > OUTBOUND_DEDUPE_TIME_SPREAD_MS) {
      return false;
    }
  }

  const providerIds = arr
    .map((m) => normalizeWhatsappProviderMessageId(m.uazapiMessageId))
    .filter(Boolean);
  const uniqueProviders = new Set(providerIds);

  if (uniqueProviders.size > 1) {
    const ids = arr
      .map((m) => normalizeWhatsappProviderMessageId(m.uazapiMessageId))
      .filter(Boolean);
    const hasSynthetic = ids.some(isSyntheticOutboundProviderId);
    const hasReal = ids.some((id) => !isSyntheticOutboundProviderId(id));
    /** Eco do webhook + envio com UUID placeholder no mesmo texto. */
    if (hasSynthetic && hasReal) {
      return true;
    }
    if (times.every((t) => t > 0)) {
      const spread = Math.max(...times) - Math.min(...times);
      if (spread <= OUTBOUND_RAPID_DUPLICATE_SPREAD_MS) {
        return true;
      }
    }
    if (arr.every((m) => normalizeWhatsappProviderMessageId(m.uazapiMessageId))) {
      return false;
    }
  }

  return true;
}

/** UUID usado como fallback quando a API nao devolve id do WhatsApp. */
function isSyntheticOutboundProviderId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Apos aplicar UPDATE outbound, remove outras bolhas no cache que sao a mesma
 * mensagem (conteudo + janela de tempo), mantendo o payload do evento.
 */
function stripOutboundDuplicatesOfIncoming(
  pages: InboxMessagesPageResult[],
  incoming: WhatsappMessage,
): InboxMessagesPageResult[] {
  if (incoming.direction !== "outbound" || !incoming.id || incoming.id.startsWith("temp-")) {
    return pages;
  }

  const kIn = outboundContentDedupeKey(incoming);
  if (!kIn) {
    return pages;
  }

  const tIn = outboundMessageTimeMs(incoming);

  return pages.map((page) => ({
    ...page,
    messages: page.messages.filter((m) => {
      if (m.id === incoming.id) {
        return true;
      }
      if (m.direction !== "outbound") {
        return true;
      }
      if (outboundContentDedupeKey(m) !== kIn) {
        return true;
      }
      const tm = outboundMessageTimeMs(m);
      if (tIn > 0 && tm > 0 && Math.abs(tm - tIn) > OUTBOUND_DEDUPE_TIME_SPREAD_MS) {
        return true;
      }
      return !shouldCollapseOutboundGroup([m, incoming]);
    }),
  }));
}

function collapseOutboundNearDuplicateGroups(messages: WhatsappMessage[]): WhatsappMessage[] {
  const byContent = new Map<string, WhatsappMessage[]>();
  for (const m of messages) {
    const k = outboundContentDedupeKey(m);
    if (!k) {
      continue;
    }
    const list = byContent.get(k) ?? [];
    list.push(m);
    byContent.set(k, list);
  }

  const dropIds = new Set<string>();
  for (const arr of byContent.values()) {
    if (arr.length < 2) {
      continue;
    }

    const times = arr.map((m) => outboundMessageTimeMs(m));
    const allHaveTime = times.every((t) => t > 0);
    if (allHaveTime) {
      const spread = Math.max(...times) - Math.min(...times);
      if (spread > OUTBOUND_DEDUPE_TIME_SPREAD_MS) {
        continue;
      }
    }

    if (!shouldCollapseOutboundGroup(arr)) {
      continue;
    }

    const winner = arr.reduce((best, m) => preferOutboundDedupeWinner(best, m));
    for (const m of arr) {
      if (m.id !== winner.id) {
        dropIds.add(m.id);
      }
    }
  }

  if (dropIds.size === 0) {
    return messages;
  }
  return messages.filter((m) => !dropIds.has(m.id));
}

/** Ids de bolhas `temp-*` que tem gemea persistida (mesma regra que o envio otimista). */
function redundantOutboundTempIds(messages: WhatsappMessage[]): Set<string> {
  const remove = new Set<string>();
  if (messages.length < 2) {
    return remove;
  }

  for (const m of messages) {
    if (!m.id.startsWith("temp-") || m.direction !== "outbound") {
      continue;
    }

    const hasPersistedTwin = messages.some(
      (n) =>
        n !== m &&
        !n.id.startsWith("temp-") &&
        n.direction === "outbound" &&
        findOptimisticTempMatch([m], n) === m,
    );

    if (hasPersistedTwin) {
      remove.add(m.id);
    }
  }

  return remove;
}

/**
 * Remove bolhas `temp-*` que ainda estao no cache ao lado da linha persistida
 * (mesmo texto/tempo), tipico quando `uazapi_message_id` so existe no servidor
 * e o dedupe por provider id nao as une — ao chegar UPDATE de status, a real
 * atualiza e a otimista parece um segundo envio.
 */
function stripRedundantOutboundTemps(messages: WhatsappMessage[]): WhatsappMessage[] {
  const remove = redundantOutboundTempIds(messages);
  if (remove.size === 0) {
    return messages;
  }
  return messages.filter((m) => !remove.has(m.id));
}

function stripRedundantOutboundTempsFromPages(pages: InboxMessagesPageResult[]): InboxMessagesPageResult[] {
  const flat = pages.flatMap((p) => p.messages);
  const remove = redundantOutboundTempIds(flat);
  if (remove.size === 0) {
    return pages;
  }
  return pages.map((page) => ({
    ...page,
    messages: page.messages.filter((m) => !remove.has(m.id)),
  }));
}

/**
 * Aplica a mesma deduplicacao de `flattenInboxMessagePages` no cache do React Query
 * (otimista + INSERT/UPDATE Realtime). Evita duas bolhas ao mudar status sent→delivered.
 */
function hasDuplicateOutboundContentKeys(messages: WhatsappMessage[]): boolean {
  const seen = new Set<string>();
  for (const m of messages) {
    const k = outboundContentDedupeKey(m);
    if (!k) {
      continue;
    }
    if (seen.has(k)) {
      return true;
    }
    seen.add(k);
  }
  return false;
}

function sanitizeInboxMessagePages(pages: InboxMessagesPageResult[]): InboxMessagesPageResult[] {
  const flat = pages.flatMap((p) => p.messages);
  if (flat.length < 2) {
    return pages;
  }

  const deduped = dedupeInboxMessagesById(flat);
  const keepIds = new Set(deduped.map((m) => m.id));
  const latestById = new Map(deduped.map((m) => [m.id, m]));

  const unchanged =
    keepIds.size === flat.length &&
    !hasDuplicateOutboundContentKeys(flat) &&
    flat.every((m, i) => m.id === deduped[i]?.id && m.status === deduped[i]?.status);

  if (unchanged) {
    return pages;
  }

  return pages.map((page) => ({
    ...page,
    messages: page.messages
      .filter((m) => keepIds.has(m.id))
      .map((m) => latestById.get(m.id) ?? m),
  }));
}

function patchInboxMessagesCache(
  queryClient: QueryClient,
  chatId: string,
  updater: (current: InfiniteData<InboxMessagesPageResult> | undefined) => InfiniteData<InboxMessagesPageResult> | undefined,
) {
  const queryKey = ["inbox-messages", chatId] as const;
  queryClient.setQueryData<InfiniteData<InboxMessagesPageResult>>(queryKey, (current) => {
    const next = updater(current);
    if (!next?.pages?.length) {
      return next;
    }
    const pages = sanitizeInboxMessagePages(next.pages);
    return pages === next.pages ? next : { ...next, pages };
  });
}

/**
 * Loads all pages sequentially (use sparingly, e.g. analytics on ClientePerfil).
 */
export async function fetchAllInboxMessages(chatId: string): Promise<WhatsappMessage[]> {
  const batches: WhatsappMessage[][] = [];
  let cursor: InboxMessagesPageCursor | null = null;

  for (;;) {
    const { messages, hasMore } = await fetchInboxMessagesPage(chatId, cursor);
    if (messages.length === 0) {
      break;
    }

    batches.push(messages);
    if (!hasMore) {
      break;
    }

    const oldest = messages[0];
    if (!oldest?.createdAt) {
      break;
    }

    cursor = { beforeCreatedAt: oldest.createdAt, beforeId: oldest.id };
  }

  return dedupeInboxMessagesById(batches.reverse().flatMap((batch) => batch));
}

export async function markChatAsRead(chatId: string) {
  if (!isSupabaseConfigured) {
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase
    .from("whatsapp_chats")
    .update({ unread_count: 0 })
    .eq("id", chatId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function sendWhatsappMessage(input: SendWhatsappMessageInput) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase antes de enviar mensagens.");
  }

  const data = await invokeAuthedFunction<{ message: MessageRow }>("uazapi-send-message", input);
  return mapMessage(data.message as MessageRow);
}

export function useWhatsappInstances(
  options?: Omit<UseQueryOptions<WhatsappInstance[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: listWhatsappInstances,
    ...options,
  });
}

export function useConnectWhatsappInstance(
  options?: UseMutationOptions<WhatsappInstance, Error, WhatsappInstanceConnectInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: connectWhatsappInstance,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useCreateWhatsappChannel(
  options?: UseMutationOptions<WhatsappInstance, Error, WhatsappChannelCreateInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createWhatsappChannel,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

/**
 * Inicia a conexão de uma conta Instagram (OAuth da Meta): a edge function
 * devolve a URL do dialog de autorização; o callback cria a instância e
 * redireciona de volta para /configuracoes?secao=canais&meta=ok|erro.
 */
async function startMetaOauth(): Promise<string> {
  const data = await invokeAuthedFunction<{ authorizeUrl: string }>("meta-oauth", {});
  return data.authorizeUrl;
}

export function useStartMetaOauth(options?: UseMutationOptions<string, Error, void>) {
  return useMutation({ mutationFn: startMetaOauth, ...options });
}

export function useSyncWhatsappInstances(
  options?: UseMutationOptions<{ success: boolean }, Error, { instanceId?: string } | undefined>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables) => syncWhatsappInstances(variables?.instanceId),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteWhatsappInstance(
  options?: UseMutationOptions<void, Error, string>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWhatsappInstance,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateWhatsappInstance(
  options?: UseMutationOptions<WhatsappInstance, Error, { id: string; input: WhatsappInstanceUpdateInput }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => updateWhatsappInstance(id, input),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-instances"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export async function fetchInboxChatById(chatId: string): Promise<InboxChat | null> {
  const id = chatId?.trim();
  if (!id) {
    return null;
  }

  if (isE2eMockAuth) {
    return getE2eInboxChatById(id);
  }

  if (!isSupabaseConfigured) {
    return null;
  }

  const supabase = requireSupabase();
  const [tenantId, profileId] = await Promise.all([
    getCurrentTenantId(),
    getCurrentUserId().catch(() => null),
  ]);
  const { data, error } = await supabase
    .from("whatsapp_chats")
    .select(INBOX_CHAT_SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as ChatRow;
  if (row.whatsapp_instances?.archived_at) {
    return null;
  }

  const pinnedChatIds = await fetchPinnedChatIdsForCurrentUser(supabase, tenantId, profileId);
  return mapChat(row, pinnedChatIds);
}

export function useInboxChats(
  filters: InboxChatFilters,
  options?: Omit<UseQueryOptions<InboxChat[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["inbox-chats", filters],
    queryFn: () => listInboxChats(filters),
    staleTime: 15_000,
    ...options,
  });
}

export function useInboxChatById(
  chatId: string | null | undefined,
  options?: Omit<UseQueryOptions<InboxChat | null, Error>, "queryKey" | "queryFn">,
) {
  const id = chatId?.trim() ?? "";
  return useQuery({
    queryKey: ["inbox-chat", id],
    queryFn: () => fetchInboxChatById(id),
    enabled: id.length > 0,
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Atualiza `lastMessagePreview` e `lastMessageAt` do chat correspondente em
 * todas as variantes cacheadas de `["inbox-chats", filters]`, reordenando
 * conforme o sort do backend (lastMessageAt desc, unread desc, nome asc).
 *
 * Substitui a invalidacao agressiva que disparava um GET em todos os filtros
 * ativos (busca, instancia, status, somente nao lidas).
 */
function sortInboxChatsSidebar(chats: InboxChat[]): InboxChat[] {
  return [...chats].sort((left, right) => {
    if (Boolean(left.isPinned) !== Boolean(right.isPinned)) {
      return left.isPinned ? -1 : 1;
    }
    const rightTime = new Date(right.lastMessageAt ?? 0).getTime();
    const leftTime = new Date(left.lastMessageAt ?? 0).getTime();
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    if (right.unreadCount !== left.unreadCount) {
      return right.unreadCount - left.unreadCount;
    }
    return left.displayName.localeCompare(right.displayName, "pt-BR");
  });
}

function patchInboxChatsLastMessage(
  queryClient: QueryClient,
  chatId: string,
  preview: string,
  lastMessageAt: string,
  /** Ajuste local do contador (ex.: +1 mensagem inbound via Realtime). */
  unreadDelta = 0,
) {
  queryClient.setQueriesData<InboxChat[]>(
    { queryKey: ["inbox-chats"] },
    (current) => {
      if (!current) return current;
      const index = current.findIndex((chat) => chat.id === chatId);
      if (index === -1) return current;

      const target = current[index];
      const nextUnread = Math.max(0, target.unreadCount + unreadDelta);
      if (
        target.lastMessagePreview === preview &&
        target.lastMessageAt === lastMessageAt &&
        nextUnread === target.unreadCount
      ) {
        return current;
      }

      const updated: InboxChat = {
        ...target,
        lastMessagePreview: preview,
        lastMessageAt,
        unreadCount: nextUnread,
      };

      const others = current.filter((_, i) => i !== index);
      return sortInboxChatsSidebar([updated, ...others]);
    },
  );
}

/** Zera `unreadCount` no cache da lista lateral apos `markChatAsRead` no servidor. */
function patchInboxChatsMarkRead(queryClient: QueryClient, chatId: string) {
  queryClient.setQueriesData<InboxChat[]>(
    { queryKey: ["inbox-chats"] },
    (current) => {
      if (!current) return current;
      const index = current.findIndex((chat) => chat.id === chatId);
      if (index === -1) return current;

      const target = current[index];
      if (target.unreadCount === 0) {
        return current;
      }

      const updated: InboxChat = { ...target, unreadCount: 0 };
      const others = current.filter((_, i) => i !== index);
      return sortInboxChatsSidebar([updated, ...others]);
    },
  );
}

function chatMatchesInboxFilters(chat: InboxChat, filters: InboxChatFilters | undefined): boolean {
  const f = filters ?? {};
  if (f.customerId && chat.customerId !== f.customerId) {
    return false;
  }
  if (f.instanceId && chat.instanceId !== f.instanceId) {
    return false;
  }
  if (f.unreadOnly && chat.unreadCount <= 0) {
    return false;
  }
  if (f.status && f.status !== "all" && chat.status !== f.status) {
    return false;
  }
  if (f.resolution && chat.resolution !== f.resolution) {
    return false;
  }
  if (f.hideLost && (chat.resolution ?? "open") === "lost") {
    return false;
  }
  if (f.assigneeId === "unassigned") {
    if (chat.assigneeId != null) {
      return false;
    }
  } else if (f.assigneeId === "mine") {
    const uid = f.currentUserId?.trim();
    if (!uid || chat.assigneeId !== uid) {
      return false;
    }
  } else if (f.assigneeId && chat.assigneeId !== f.assigneeId) {
    return false;
  }
  const search = sanitizeCustomerSearchForPostgrestOrIlike(f.search ?? "").toLowerCase();
  if (search) {
    const name = (chat.displayName ?? "").toLowerCase();
    const cust = (chat.customerName ?? "").toLowerCase();
    const digits = (chat.remotePhoneDigits ?? "").replace(/\D/g, "");
    const searchDigits = search.replace(/\D/g, "");
    const textMatch = name.includes(search) || cust.includes(search);
    const phoneMatch = Boolean(searchDigits && digits.includes(searchDigits));
    if (!textMatch && !phoneMatch) {
      return false;
    }
  }
  if (f.tagIds?.length) {
    const tagSet = new Set(f.tagIds);
    if (!chat.tags?.some((tag) => tagSet.has(tag.tagId))) {
      return false;
    }
  }
  const now = Date.now();
  if (f.snoozedOnly) {
    if (!chat.snoozeUntil || new Date(chat.snoozeUntil).getTime() <= now) {
      return false;
    }
  } else if (f.hideSnoozed && chat.snoozeUntil && new Date(chat.snoozeUntil).getTime() > now) {
    return false;
  }
  return true;
}

function mergeInboxChatFromRealtimeRow(existing: InboxChat, row: ChatRow): InboxChat {
  const nextResolution =
    row.resolution != null && CHAT_RESOLUTION_VALUES.has(row.resolution as ChatResolution)
      ? (row.resolution as ChatResolution)
      : (existing.resolution ?? "open");

  const merged: InboxChat = {
    ...existing,
    instanceId: row.instance_id,
    customerId: row.customer_id,
    remoteJid: row.remote_jid,
    remotePhoneDigits: row.remote_phone_digits,
    remotePhoneE164: row.remote_phone_e164,
    avatarUrl: row.avatar_url,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    status: row.status,
    resolution: nextResolution,
  };

  const synthetic: ChatRow = {
    id: row.id,
    instance_id: merged.instanceId,
    customer_id: merged.customerId ?? null,
    remote_jid: merged.remoteJid,
    remote_phone_digits: merged.remotePhoneDigits ?? null,
    remote_phone_e164: merged.remotePhoneE164 ?? null,
    display_name: row.display_name,
    avatar_url: merged.avatarUrl ?? null,
    last_message_preview: merged.lastMessagePreview ?? null,
    last_message_at: merged.lastMessageAt ?? null,
    unread_count: merged.unreadCount,
    status: merged.status,
    whatsapp_instances: { display_name: existing.instanceName },
    customers: existing.customerName ? { nome: existing.customerName } : null,
  };

  merged.displayName = mapChat(synthetic).displayName;
  return merged;
}

function removeChatFromInboxCaches(queryClient: QueryClient, chatId: string) {
  const entries = queryClient.getQueriesData<InboxChat[]>({ queryKey: ["inbox-chats"] });
  for (const [key, data] of entries) {
    if (!data?.some((c) => c.id === chatId)) continue;
    queryClient.setQueryData(key, sortInboxChatsSidebar(data.filter((c) => c.id !== chatId)));
  }
}

function applyChatRowUpdateToInboxCaches(queryClient: QueryClient, row: ChatRow) {
  const entries = queryClient.getQueriesData<InboxChat[]>({ queryKey: ["inbox-chats"] });
  for (const [key, data] of entries) {
    if (!data) continue;
    const filters = (key as readonly unknown[])[1] as InboxChatFilters | undefined;
    const idx = data.findIndex((c) => c.id === row.id);

    if (idx === -1) {
      const chat = mapChat(row);
      if (!chatMatchesInboxFilters(chat, filters)) continue;
      if (data.some((c) => c.id === chat.id)) continue;
      queryClient.setQueryData(key, sortInboxChatsSidebar([chat, ...data]));
      continue;
    }

    const merged = mergeInboxChatFromRealtimeRow(data[idx], row);
    if (!chatMatchesInboxFilters(merged, filters)) {
      queryClient.setQueryData(
        key,
        sortInboxChatsSidebar(data.filter((c) => c.id !== row.id)),
      );
      continue;
    }

    const others = data.filter((_, i) => i !== idx);
    queryClient.setQueryData(key, sortInboxChatsSidebar([merged, ...others]));
  }
}

/** Novo chat na base: refetch (instancia arquivada, joins de nome de cliente). */
function scheduleInboxChatsRefetchAfterInsert(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["inbox-chats"] });
}

type InboxChatsSnapshot = Array<readonly [readonly unknown[], InboxChat[] | undefined]>;

function snapshotInboxChats(queryClient: QueryClient): InboxChatsSnapshot {
  return queryClient
    .getQueriesData<InboxChat[]>({ queryKey: ["inbox-chats"] })
    .map(([key, data]) => [key, data ? [...data] : undefined] as const);
}

function restoreInboxChatsSnapshots(
  queryClient: QueryClient,
  snapshots: InboxChatsSnapshot,
) {
  for (const [key, data] of snapshots) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Reproduz o calculo de preview que o backend grava em `whatsapp_chats.last_message_preview`
 * (ver `supabase/functions/uazapi-send-message/index.ts`): texto trimado quando houver,
 * caso contrario o tipo da mensagem.
 */
function buildSentMessagePreview(input: {
  bodyText?: string | null;
  messageType: string;
}): string {
  const trimmed = (input.bodyText ?? "").trim();
  return trimmed || input.messageType;
}

function normalizeWhatsappProviderMessageId(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const separatorIndex = trimmed.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return trimmed;
  }

  const prefix = trimmed.slice(0, separatorIndex);
  const suffix = trimmed.slice(separatorIndex + 1).trim();
  return prefix.includes("@") && suffix ? suffix : trimmed;
}

function hasSameProviderMessageId(left: WhatsappMessage, right: WhatsappMessage): boolean {
  const leftId = normalizeWhatsappProviderMessageId(left.uazapiMessageId);
  const rightId = normalizeWhatsappProviderMessageId(right.uazapiMessageId);
  return Boolean(leftId) && leftId === rightId;
}

/** Normaliza texto para parear bolha otimista com a linha do servidor (espacos, quebras). */
function normalizeOutboundBodyForMatch(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Localiza a bolha outbound existente no cache que representa o mesmo envio
 * (id, provider id, temp otimista ou mesmo conteudo na janela de tempo).
 */
export function findOutboundCacheTarget(
  messages: WhatsappMessage[],
  incoming: WhatsappMessage,
): WhatsappMessage | undefined {
  if (incoming.direction !== "outbound") {
    return undefined;
  }

  const byId = messages.find((m) => m.id === incoming.id);
  if (byId) {
    return byId;
  }

  const incomingProviderId = normalizeWhatsappProviderMessageId(incoming.uazapiMessageId);
  if (incomingProviderId) {
    const byProvider = messages.find(
      (m) => normalizeWhatsappProviderMessageId(m.uazapiMessageId) === incomingProviderId,
    );
    if (byProvider) {
      return byProvider;
    }
  }

  const temp = findOptimisticTempMatch(messages, incoming);
  if (temp) {
    return temp;
  }

  const contentKey = outboundContentDedupeKey(incoming);
  if (!contentKey) {
    return undefined;
  }

  return messages.find(
    (m) =>
      m.direction === "outbound" &&
      outboundContentDedupeKey(m) === contentKey &&
      shouldCollapseOutboundGroup([m, incoming]),
  );
}

function replaceMessageIdInPages(
  pages: InboxMessagesPageResult[],
  replaceId: string,
  incoming: WhatsappMessage,
): InboxMessagesPageResult[] {
  return pages.map((page) => ({
    ...page,
    messages: page.messages
      .map((m) => (m.id === replaceId ? incoming : m))
      .filter((m, idx, arr) => {
        if (m.id !== incoming.id) {
          return true;
        }
        return arr.findIndex((x) => x.id === incoming.id) === idx;
      }),
  }));
}

/** Upsert outbound: nunca acrescenta segunda bolha para o mesmo envio. */
function upsertOutboundInboxMessagePages(
  pages: InboxMessagesPageResult[],
  incoming: WhatsappMessage,
): InboxMessagesPageResult[] {
  const flat = pages.flatMap((p) => p.messages);
  const target = findOutboundCacheTarget(flat, incoming);
  if (target) {
    const merged = preferOutboundDedupeWinner(target, incoming);
    let next = replaceMessageIdInPages(pages, target.id, merged);
    next = stripOutboundDuplicatesOfIncoming(next, merged);
    return stripRedundantOutboundTempsFromPages(next);
  }

  if (pages.length === 0) {
    return [{ messages: [incoming], hasMore: false }];
  }

  const next = pages.map((page, index) => {
    if (index !== 0) {
      return page;
    }
    return { ...page, messages: [...page.messages, incoming] };
  });
  return stripRedundantOutboundTempsFromPages(next);
}

/**
 * Tenta substituir uma mensagem otimista (id `temp-...`) recente que ainda nao
 * recebeu o INSERT real. Util quando o evento realtime chega antes do
 * `onSuccess` de `useSendWhatsappMessage`.
 */
function findOptimisticTempMatch(
  messages: WhatsappMessage[],
  incoming: WhatsappMessage,
): WhatsappMessage | undefined {
  if (incoming.direction !== "outbound") {
    return undefined;
  }

  const incomingBodyStrict = (incoming.bodyText ?? "").trim();
  const incomingBodyLoose = normalizeOutboundBodyForMatch(incoming.bodyText);
  const incomingMedia = (incoming.mediaUrl ?? "").trim();
  const incomingType = incoming.messageType ?? "text";
  const incomingMs = safeParseMs(incoming.createdAt ?? incoming.sentAt);
  const windowMs = 600_000;

  return messages.find((candidate) => {
    if (!candidate.id.startsWith("temp-")) return false;
    if (candidate.direction !== incoming.direction) return false;
    if (hasSameProviderMessageId(candidate, incoming)) return true;
    if ((candidate.messageType ?? "text") !== incomingType) return false;
    if ((candidate.mediaUrl ?? "").trim() !== incomingMedia) return false;

    const candStrict = (candidate.bodyText ?? "").trim();
    const candLoose = normalizeOutboundBodyForMatch(candidate.bodyText);
    const bodyOk = candStrict === incomingBodyStrict || candLoose === incomingBodyLoose;
    if (!bodyOk) return false;

    const candMs = safeParseMs(candidate.createdAt ?? candidate.sentAt);
    const pairClose =
      incomingMs > 0 &&
      candMs > 0 &&
      Math.abs(incomingMs - candMs) <= windowMs;
    const candRecent = candMs > 0 && candMs >= Date.now() - windowMs;
    return pairClose || candRecent;
  });
}

export function reconcileOptimisticInboxMessage(
  pages: InboxMessagesPageResult[],
  incoming: WhatsappMessage,
  optimisticMessageId?: string,
): { pages: InboxMessagesPageResult[]; matched: boolean } {
  const allMessages = pages.flatMap((page) => page.messages);
  const optimisticMatch =
    (optimisticMessageId ? allMessages.find((candidate) => candidate.id === optimisticMessageId) : undefined) ??
    findOptimisticTempMatch(allMessages, incoming);

  if (!optimisticMatch) {
    const alreadyApplied = allMessages.some(
      (candidate) => candidate.id === incoming.id || hasSameProviderMessageId(candidate, incoming),
    );
    if (!alreadyApplied) {
      return { pages, matched: false };
    }

    /**
     * INSERT via Realtime ja trocou `temp-*` -> id do servidor no cache; o tempId
     * do contexto da mutation nao existe mais. Sem este ramo, `onSuccess` caia em
     * `invalidateQueries` e a UI podia mostrar duas bolhas (otimista + refetch).
     */
    const cleanedPages = pages.map((page) => ({
      ...page,
      messages: page.messages
        .filter(
          (m) => !(m.id.startsWith("temp-") && findOptimisticTempMatch([m], incoming) === m),
        )
        .map((m) => (m.id === incoming.id ? incoming : m)),
    }));

    return {
      pages: stripRedundantOutboundTempsFromPages(cleanedPages),
      matched: true,
    };
  }

  const incomingAlreadyPresent = allMessages.some((candidate) =>
    candidate.id === incoming.id || hasSameProviderMessageId(candidate, incoming),
  );
  const pagesWithReconciliation = pages.map((page) => {
    const hasOptimisticMessage = page.messages.some((candidate) => candidate.id === optimisticMatch.id);
    if (!hasOptimisticMessage) {
      return page;
    }

    return {
      ...page,
      messages: incomingAlreadyPresent
        ? page.messages.filter((candidate) => candidate.id !== optimisticMatch.id)
        : page.messages.map((candidate) =>
            candidate.id === optimisticMatch.id ? incoming : candidate,
          ),
    };
  });

  return { pages: pagesWithReconciliation, matched: true };
}

function applyRealtimeMessageInsert(
  queryClient: QueryClient,
  chatId: string,
  message: WhatsappMessage,
) {
  patchInboxMessagesCache(queryClient, chatId, (current) => {
    if (!current?.pages?.length) {
      return {
        pageParams: [null],
        pages: [{ messages: [message], hasMore: false }],
      };
    }

    if (message.direction === "outbound") {
      return {
        ...current,
        pages: upsertOutboundInboxMessagePages(current.pages, message),
      };
    }

    const alreadyExists = current.pages.some((page) =>
      page.messages.some((existing) => existing.id === message.id),
    );
    if (alreadyExists) {
      return current;
    }

    const pages = current.pages.map((page, index) => {
      if (index !== 0) {
        return page;
      }
      return { ...page, messages: [...page.messages, message] };
    });
    return { ...current, pages };
  });
}

function applyRealtimeMessageUpdate(
  queryClient: QueryClient,
  chatId: string,
  message: WhatsappMessage,
) {
  patchInboxMessagesCache(queryClient, chatId, (current) => {
    if (!current?.pages?.length) {
      return current;
    }

    if (message.direction === "outbound") {
      return {
        ...current,
        pages: upsertOutboundInboxMessagePages(current.pages, message),
      };
    }

    const hasId = current.pages.some((page) =>
      page.messages.some((existing) => existing.id === message.id),
    );
    if (!hasId) {
      return current;
    }

    const pages = current.pages.map((page) => ({
      ...page,
      messages: page.messages.map((existing) =>
        existing.id === message.id ? message : existing,
      ),
    }));
    return { ...current, pages };
  });
}

/**
 * Assina mudancas em `whatsapp_messages` para o chat ativo e empurra os
 * eventos diretamente no cache do React Query, eliminando o delay percebido
 * do polling do composer.
 */
export function useInboxRealtime(chatId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!chatId || !isSupabaseConfigured) {
      return;
    }

    const supabase = requireSupabase();
    const channel = supabase
      .channel(`inbox-messages:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow | undefined;
          if (!row) return;
          const message = mapMessage(row);
          applyRealtimeMessageInsert(queryClient, chatId, message);
          patchInboxChatsLastMessage(
            queryClient,
            chatId,
            buildSentMessagePreview({ bodyText: message.bodyText, messageType: message.messageType }),
            message.sentAt ?? message.createdAt ?? new Date().toISOString(),
            message.direction === "inbound" ? 1 : 0,
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow | undefined;
          if (!row) return;
          applyRealtimeMessageUpdate(queryClient, chatId, mapMessage(row));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, queryClient]);
}

/**
 * Lista lateral: UPDATE/DELETE em `whatsapp_chats` entram no cache por filtro.
 * INSERT invalida a query (mapChat sem joins perde regras de instancia arquivada).
 */
export function useInboxChatsRealtime(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured) {
      return;
    }

    const supabase = requireSupabase();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void getCurrentTenantId()
      .then((tenantId) => {
        if (cancelled) return;

        channel = supabase
          .channel(`inbox-chats-tenant:${tenantId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "whatsapp_chats",
              filter: `tenant_id=eq.${tenantId}`,
            },
            (payload) => {
              if (payload.eventType === "INSERT") {
                scheduleInboxChatsRefetchAfterInsert(queryClient);
                return;
              }
              if (payload.eventType === "DELETE") {
                const oldRow = payload.old as { id?: string } | undefined;
                if (oldRow?.id) {
                  removeChatFromInboxCaches(queryClient, oldRow.id);
                }
                return;
              }
              if (payload.eventType === "UPDATE") {
                const row = payload.new as ChatRow | undefined;
                if (!row?.id) return;
                applyChatRowUpdateToInboxCaches(queryClient, row);
              }
            },
          )
          .subscribe();
      })
      .catch(() => {
        // Sem tenant/sessao: rota protegida em geral; ignora.
      });

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, queryClient]);
}

export function useInboxMessages(
  chatId: string | undefined,
  options?: Omit<
    UseInfiniteQueryOptions<
      InboxMessagesPageResult,
      Error,
      InfiniteData<InboxMessagesPageResult>,
      readonly unknown[],
      InboxMessagesPageCursor | null
    >,
    "queryKey" | "queryFn" | "initialPageParam" | "getNextPageParam" | "select"
  >,
) {
  const { refetchInterval: userRefetchInterval, ...infiniteRest } = options ?? {};
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    ...infiniteRest,
    queryKey: ["inbox-messages", chatId],
    initialPageParam: null as InboxMessagesPageCursor | null,
    queryFn: async ({ pageParam }) => {
      const result = await fetchInboxMessagesPage(chatId as string, pageParam);
      if (pageParam === null && chatId) {
        const currentData = queryClient.getQueryData<InfiniteData<InboxMessagesPageResult>>([
          "inbox-messages",
          chatId,
        ]);
        if (currentData?.pages) {
          const temps = currentData.pages
            .flatMap((p) => p.messages)
            .filter((m) => m.id.startsWith("temp-"));
          if (temps.length > 0) {
            const remainingTemps = temps.filter((temp) => {
              const hasRealTwin = result.messages.some(
                (n) =>
                  !n.id.startsWith("temp-") &&
                  n.direction === "outbound" &&
                  findOptimisticTempMatch([temp], n) === temp,
              );
              return !hasRealTwin;
            });
            if (remainingTemps.length > 0) {
              result.messages = [...result.messages, ...remainingTemps];
            }
          }
        }
      }
      return result;
    },
    getNextPageParam: (lastPage) => getNextInboxMessagesPageParam(lastPage),
    enabled: Boolean(chatId),
    // staleTime longo: o Realtime mantem o cache fresco via INSERT/UPDATE.
    // Antes era 6s, o que disparava refetches em qualquer re-render do Inbox.
    staleTime: 60_000,
    refetchInterval: (q) => {
      // Mesmo com varias paginas (scroll carregou historico), manter o polling
      // quando o Realtime falha — antes `pages > 1` desligava o fallback e o chat
      // ficava congelado sem novas mensagens.
      return typeof userRefetchInterval === "function"
        ? userRefetchInterval(q)
        : (userRefetchInterval ?? false);
    },
  });

  useInboxRealtime(chatId);

  const messages = useMemo(() => flattenInboxMessagePages(query.data), [query.data]);

  return {
    data: messages,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export function useSendWhatsappMessage(
  options?: UseMutationOptions<WhatsappMessage, Error, SendWhatsappMessageInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendWhatsappMessage,
    ...options,
    onMutate: async (variables) => {
      const previousChats = snapshotInboxChats(queryClient);
      const previewTimestamp = new Date().toISOString();

      patchInboxChatsLastMessage(
        queryClient,
        variables.chatId,
        buildSentMessagePreview({ bodyText: variables.bodyText, messageType: variables.messageType }),
        previewTimestamp,
      );

      // Bolha otimista: a mensagem aparece na conversa na hora (status "queued" =
      // relógio) e é reconciliada com a real no onSuccess/Realtime (dedupe por
      // conteúdo) ou marcada "failed" no onError (com Reenviar/Descartar).
      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const optimisticMessage: WhatsappMessage = {
        id: tempId,
        chatId: variables.chatId,
        instanceId: variables.instanceId,
        direction: "outbound",
        messageType: variables.messageType,
        status: "queued",
        bodyText: variables.bodyText ?? null,
        mediaUrl: variables.mediaUrl ?? null,
        payloadJson: variables.payload as Record<string, unknown> | undefined,
        quotedMessageId: variables.quotedMessageId ?? null,
        createdAt: previewTimestamp,
        sentAt: previewTimestamp,
      };
      patchInboxMessagesCache(queryClient, variables.chatId, (old) => {
        if (!old?.pages?.length) {
          return { pageParams: [null], pages: [{ messages: [optimisticMessage], hasMore: false }] };
        }
        return { ...old, pages: upsertOutboundInboxMessagePages(old.pages, optimisticMessage) };
      });

      return { previousChats, tempId };
    },
    onError: (error, variables, context) => {
      if (context?.previousChats) {
        restoreInboxChatsSnapshots(queryClient, context.previousChats);
      }
      // Mantém a bolha, marcada como "failed" → mostra Reenviar/Descartar.
      if (context?.tempId) {
        patchInboxMessagesCache(queryClient, variables.chatId, (old) => {
          if (!old?.pages?.length) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m) =>
                m.id === context.tempId ? { ...m, status: "failed" as const } : m,
              ),
            })),
          };
        });
      }
      void options?.onError?.(error, variables, context);
    },
    onSuccess: (data, variables) => {
      patchInboxMessagesCache(queryClient, variables.chatId, (old) => {
        if (!old?.pages?.length) {
          return {
            pageParams: [null],
            pages: [{ messages: [data], hasMore: false }],
          };
        }

        return {
          ...old,
          pages: sanitizeInboxMessagePages(upsertOutboundInboxMessagePages(old.pages, data)),
        };
      });

      // Patch local da lista lateral em vez de invalidar `inbox-chats`. Evita um
      // GET com todos os filtros ativos (search, instancia, status, unreadOnly)
      // a cada envio. O backend ja grava o mesmo preview em `whatsapp_chats`
      // (`uazapi-send-message`), entao apenas refletimos a verdade do servidor.
      patchInboxChatsLastMessage(
        queryClient,
        variables.chatId,
        buildSentMessagePreview({ bodyText: data.bodyText, messageType: data.messageType }),
        data.sentAt ?? data.createdAt ?? new Date().toISOString(),
      );

      void options?.onSuccess?.(data, variables, undefined);
    },
  });
}

export function useMarkChatAsRead(
  options?: UseMutationOptions<void, Error, string, { previousChats?: InboxChatsSnapshot }>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string, { previousChats?: InboxChatsSnapshot }>({
    mutationFn: markChatAsRead,
    ...options,
    onMutate: async (chatId) => {
      // Zera `unreadCount` localmente antes do round-trip. Quebra o ciclo do
      // useEffect na pagina Inbox: como o cache ja reflete unread = 0, o efeito
      // nao re-dispara enquanto a mutation viaja, evitando flood de PATCH em
      // chats com mensagens chegando em sequencia.
      const previousChats = snapshotInboxChats(queryClient);
      patchInboxChatsMarkRead(queryClient, chatId);
      const baseContext = await options?.onMutate?.(chatId);
      return { ...(baseContext ?? {}), previousChats };
    },
    onError: (error, variables, context) => {
      if (context?.previousChats) {
        restoreInboxChatsSnapshots(queryClient, context.previousChats);
      }
      void options?.onError?.(error, variables, context);
    },
    onSuccess: async (data, variables, context) => {
      // Reaplica o patch (no-op se ja estava zerado) e segue.
      patchInboxChatsMarkRead(queryClient, variables);
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export async function ensureWhatsappChatByPhone(input: {
  phone: string;
  displayName?: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured) {
    return null;
  }
  const phone = input.phone?.trim();
  if (!phone) {
    return null;
  }
  const data = await invokeAuthedFunction<{ chat_id?: string; ok?: boolean }>(
    "uazapi-ensure-chat",
    {
      phone,
      display_name: input.displayName?.trim() || "Cliente",
    },
  );
  const chatId = data?.chat_id?.trim();
  return chatId || null;
}
