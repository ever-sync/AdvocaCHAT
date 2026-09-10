import { E2E_INBOX_CHATS } from "@/data/inbox-e2e-fixtures";
import { E2E_MOCK_PROFILE_ID, getE2eMockRole } from "@/lib/e2e";
import { sanitizeCustomerSearchForPostgrestOrIlike } from "@/lib/customer-search-sanitize";
import type { InboxChat, InboxChatFilters } from "@/types/domain";

const E2E_PINNED_CHATS_KEY = "e2e-inbox-pinned-chats";

export function getE2ePinnedChatIds(): Set<string> {
  if (typeof sessionStorage === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(E2E_PINNED_CHATS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed.filter((id) => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function setE2ePinnedChat(chatId: string, isPinned: boolean): void {
  const next = getE2ePinnedChatIds();
  if (isPinned) {
    next.add(chatId);
  } else {
    next.delete(chatId);
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(E2E_PINNED_CHATS_KEY, JSON.stringify([...next]));
  }
}

function withE2ePins(chats: InboxChat[]): InboxChat[] {
  const pinned = getE2ePinnedChatIds();
  return chats.map((chat) => ({
    ...chat,
    isPinned: pinned.has(chat.id),
  }));
}

/** Espelha RLS de `whatsapp_chats_same_tenant_select` no modo E2E. */
export function filterE2eInboxChatsByRole(chats: InboxChat[]): InboxChat[] {
  const role = getE2eMockRole();
  if (role === "atendimento") {
    return chats.filter(
      (c) => !c.assigneeId || c.assigneeId === E2E_MOCK_PROFILE_ID,
    );
  }
  return chats;
}

export function getE2eInboxChatById(chatId: string): InboxChat | null {
  const id = chatId?.trim();
  if (!id) {
    return null;
  }
  const chat = E2E_INBOX_CHATS.find((c) => c.id === id);
  if (!chat) {
    return null;
  }
  const visible = filterE2eInboxChatsByRole([chat])[0];
  if (!visible) {
    return null;
  }
  return withE2ePins([visible])[0] ?? null;
}

export function listE2eInboxChats(filters: InboxChatFilters = {}): InboxChat[] {
  let rows = filterE2eInboxChatsByRole(E2E_INBOX_CHATS);

  if (filters.assigneeId === "mine") {
    rows = rows.filter((c) => c.assigneeId === (filters.currentUserId ?? E2E_MOCK_PROFILE_ID));
  } else if (filters.assigneeId === "unassigned") {
    rows = rows.filter((c) => !c.assigneeId);
  } else if (filters.assigneeId && filters.assigneeId !== "all") {
    rows = rows.filter((c) => c.assigneeId === filters.assigneeId);
  }

  if (filters.unreadOnly) {
    rows = rows.filter((c) => c.unreadCount > 0);
  }

  if (filters.search?.trim()) {
    const q = sanitizeCustomerSearchForPostgrestOrIlike(filters.search).toLowerCase();
    if (q.length > 0) {
      rows = rows.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          (c.remotePhoneDigits?.includes(q) ?? false),
      );
    }
  }

  const withPins = withE2ePins(rows);
  return withPins.sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const bt = new Date(b.lastMessageAt ?? 0).getTime();
    const at = new Date(a.lastMessageAt ?? 0).getTime();
    return bt - at;
  });
}
