import { describe, expect, it } from "vitest";
import type { WhatsappMessage } from "@/types/domain";
import { getInboxMessageFailureReason } from "@/lib/inboxMessageFailure";

function makeFailedMessage(extra: Partial<WhatsappMessage> = {}): WhatsappMessage {
  return {
    id: "msg-1",
    chatId: "chat-1",
    instanceId: "instance-1",
    direction: "outbound",
    messageType: "text",
    status: "failed",
    bodyText: "oi",
    mediaUrl: null,
    payloadJson: {},
    quotedMessageId: null,
    sentAt: "2026-05-10T10:21:00.000Z",
    createdAt: "2026-05-10T10:21:00.000Z",
    receivedAt: null,
    ...extra,
  };
}

describe("getInboxMessageFailureReason", () => {
  it("prefers explicit webhook error fields", () => {
    const message = makeFailedMessage({
      rawEvent: {
        error: {
          message: "Falha ao entregar para o provedor.",
        },
      },
    });

    expect(getInboxMessageFailureReason(message)).toBe("Falha ao entregar para o provedor.");
  });

  it("falls back to payload details when raw event is empty", () => {
    const message = makeFailedMessage({
      payloadJson: {
        statusMessage: "Número inválido",
      },
    });

    expect(getInboxMessageFailureReason(message)).toBe("Número inválido");
  });

  it("returns a concise fallback when no reason is present", () => {
    const message = makeFailedMessage();

    expect(getInboxMessageFailureReason(message)).toBe("Falha no envio desta mensagem.");
  });
});
