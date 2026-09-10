import { describe, expect, it } from "vitest";
import type { InboxChat, WhatsappMessage } from "@/types/domain";
import { buildInboxConversationSummary } from "@/lib/inboxConversationSummary";

function makeChat(overrides: Partial<InboxChat> = {}): InboxChat {
  return {
    id: "chat-1",
    instanceId: "instance-1",
    instanceName: "Instância",
    displayName: "Cliente Teste",
    remoteJid: "5511999999999@s.whatsapp.net",
    remotePhoneDigits: "5511999999999",
    lastMessagePreview: "Última prévia",
    lastMessageAt: "2026-05-10T12:00:00.000Z",
    unreadCount: 0,
    status: "open",
    resolution: "open",
    assigneeId: null,
    assigneeName: null,
    aiMode: "off",
    primaryNegotiationId: null,
    tags: [],
    ...overrides,
  };
}

function makeMessage(
  id: string,
  direction: "inbound" | "outbound",
  bodyText: string,
  overrides: Partial<WhatsappMessage> = {},
): WhatsappMessage {
  return {
    id,
    chatId: "chat-1",
    instanceId: "instance-1",
    direction,
    messageType: "text",
    status: "sent",
    bodyText,
    mediaUrl: null,
    payloadJson: {},
    quotedMessageId: null,
    sentAt: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    receivedAt: null,
    ...overrides,
  };
}

describe("buildInboxConversationSummary", () => {
  it("summarizes last inbound and outbound messages", () => {
    const chat = makeChat();
    const messages = [
      makeMessage("m-1", "inbound", "Bom dia, vocês entregam hoje?"),
      makeMessage("m-2", "outbound", "Entregamos sim, até o fim da tarde."),
      makeMessage("m-3", "inbound", "Perfeito, obrigado!"),
    ];

    const summary = buildInboxConversationSummary(chat, messages);

    expect(summary.headline).toContain("cliente falou por último");
    expect(summary.lastCustomerMessage).toBe("Perfeito, obrigado!");
    expect(summary.lastTeamMessage).toBe("Entregamos sim, até o fim da tarde.");
    expect(summary.facts.find((fact) => fact.label === "Mensagens")?.value).toBe("3");
  });

  it("includes ai mode when enabled", () => {
    const chat = makeChat({ aiMode: "qualifying" });
    const summary = buildInboxConversationSummary(chat, []);

    expect(summary.facts.some((fact) => fact.label === "IA" && fact.value === "Qualificação")).toBe(true);
  });

  it("falls back gracefully when there are no messages", () => {
    const chat = makeChat();
    const summary = buildInboxConversationSummary(chat, []);

    expect(summary.headline).toContain("Ainda não há mensagens");
    expect(summary.latestAtLabel).toBe("Sem mensagens");
  });
});
