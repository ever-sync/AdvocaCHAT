import { describe, expect, it } from "vitest";
import { getInboxMessagePreviewText } from "./inboxMessageBody";
import type { WhatsappMessage } from "@/types/domain";

function baseMessage(over: Partial<WhatsappMessage>): WhatsappMessage {
  return {
    id: "1",
    chatId: "c",
    instanceId: "i",
    direction: "inbound",
    messageType: "text",
    status: "delivered",
    bodyText: null,
    mediaUrl: null,
    payloadJson: {},
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("getInboxMessagePreviewText", () => {
  it("usa bodyText legivel", () => {
    const m = baseMessage({ bodyText: "Ola, tudo bem?" });
    expect(getInboxMessagePreviewText(m)).toBe("Ola, tudo bem?");
  });

  it("nao despeja JSON longo como texto normal", () => {
    const huge = JSON.stringify({ event: "nested", data: { items: Array.from({ length: 12 }, (_, i) => ({ i })) } });
    const m = baseMessage({ bodyText: huge });
    expect(getInboxMessagePreviewText(m)).toContain("Conteudo tecnico");
  });

  it("sem body com payload sugere tipo", () => {
    const m = baseMessage({
      messageType: "document",
      bodyText: null,
      payloadJson: { fileName: "x.pdf" },
    });
    expect(getInboxMessagePreviewText(m)).toContain("Documento");
  });
});
