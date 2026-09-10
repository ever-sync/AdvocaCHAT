import { describe, expect, it } from "vitest";
import { buildClientesNovoContatoUrlFromInboxChat, linkSearchHintFromInboxChat } from "@/lib/inbox-clientes-deeplink";
import type { InboxChat } from "@/types/domain";

function baseChat(overrides: Partial<InboxChat>): InboxChat {
  return {
    id: "chat-uuid-1",
    instanceId: "inst-1",
    instanceName: "Test",
    remoteJid: "5511999999999@s.whatsapp.net",
    displayName: "Loja Teste",
    unreadCount: 0,
    status: "open",
    ...overrides,
  };
}

describe("linkSearchHintFromInboxChat", () => {
  it("prefers remotePhoneE164", () => {
    const chat = baseChat({
      remotePhoneE164: "+5511888887777",
      remotePhoneDigits: "11999999999",
    });
    expect(linkSearchHintFromInboxChat(chat)).toBe("+5511888887777");
  });

  it("uses digits when no e164", () => {
    const chat = baseChat({
      remotePhoneE164: null,
      remotePhoneDigits: "11987654321",
    });
    expect(linkSearchHintFromInboxChat(chat)).toBe("11987654321");
  });

  it("derives from remoteJid when phone fields empty", () => {
    const chat = baseChat({
      remotePhoneE164: null,
      remotePhoneDigits: null,
      remoteJid: "5541999887766@s.whatsapp.net",
    });
    const hint = linkSearchHintFromInboxChat(chat);
    expect(hint.replace(/\D/g, "")).toContain("41999887766");
  });
});

describe("buildClientesNovoContatoUrlFromInboxChat", () => {
  it("includes novo, inboxChatId, returnTo and encodes telefone/nome", () => {
    const chat = baseChat({
      id: "c-id-99",
      remotePhoneE164: "+5511999112233",
      displayName: "Maria & Cia",
    });
    const url = buildClientesNovoContatoUrlFromInboxChat(chat);
    expect(url.startsWith("/clientes?")).toBe(true);
    const q = new URLSearchParams(url.slice("/clientes?".length));
    expect(q.get("novo")).toBe("1");
    expect(q.get("inboxChatId")).toBe("c-id-99");
    expect(q.get("returnTo")).toBe("inbox");
    expect(q.get("telefone")).toBeTruthy();
    expect(q.get("nome")).toBe("Maria & Cia");
  });
});
