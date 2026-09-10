import type { InboxChat } from "@/types/domain";

/** Negociação pool vinculada ao chat pool (ver `crm-e2e-fixtures`). */
export const E2E_POOL_NEGOTIATION_ID = "00000000-0000-4000-8000-000000000001";

/** Atendente A nos testes E2E (perfil mock logado). */
export const E2E_MOCK_PROFILE_ID = "00000000-0000-4000-8000-000000000099";

/** Atendente B no mesmo tenant. */
export const E2E_MOCK_ATTENDANT_B_ID = "00000000-0000-4000-8000-0000000000b1";

const ts = "2026-06-01T12:00:00.000Z";

/** Conversa no pool (sem responsável). */
export const E2E_CHAT_POOL: InboxChat = {
  id: "00000000-0000-4000-8000-0000000000c1",
  instanceId: "e2e-instance",
  instanceName: "E2E WhatsApp",
  displayName: "E2E Pool Chat",
  remoteJid: "5511999990001@s.whatsapp.net",
  remotePhoneDigits: "5511999990001",
  lastMessagePreview: "Mensagem pool",
  lastMessageAt: ts,
  unreadCount: 0,
  status: "open",
  resolution: "open",
  assigneeId: null,
  assigneeName: null,
  primaryNegotiationId: E2E_POOL_NEGOTIATION_ID,
};

/** Conversa do atendente A (perfil mock E2E). */
export const E2E_CHAT_A: InboxChat = {
  id: "00000000-0000-4000-8000-0000000000c2",
  instanceId: "e2e-instance",
  instanceName: "E2E WhatsApp",
  displayName: "E2E Chat Atendente A",
  remoteJid: "5511999990002@s.whatsapp.net",
  remotePhoneDigits: "5511999990002",
  lastMessagePreview: "Mensagem A",
  lastMessageAt: ts,
  unreadCount: 1,
  status: "open",
  resolution: "open",
  assigneeId: E2E_MOCK_PROFILE_ID,
  assigneeName: "E2E Atendente A",
};

/** Conversa do atendente B. */
export const E2E_CHAT_B: InboxChat = {
  id: "00000000-0000-4000-8000-0000000000c3",
  instanceId: "e2e-instance",
  instanceName: "E2E WhatsApp",
  displayName: "E2E Chat Atendente B",
  remoteJid: "5511999990003@s.whatsapp.net",
  remotePhoneDigits: "5511999990003",
  lastMessagePreview: "Mensagem B",
  lastMessageAt: ts,
  unreadCount: 0,
  status: "open",
  resolution: "open",
  assigneeId: E2E_MOCK_ATTENDANT_B_ID,
  assigneeName: "E2E Atendente B",
};

export const E2E_INBOX_CHATS: InboxChat[] = [E2E_CHAT_POOL, E2E_CHAT_A, E2E_CHAT_B];
