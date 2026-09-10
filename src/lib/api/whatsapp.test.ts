import { describe, expect, it } from "vitest";
import type { WhatsappMessage } from "@/types/domain";
import {
  dedupeInboxMessagesById,
  findOutboundCacheTarget,
  inboxSearchTermsForPostgrest,
  reconcileOptimisticInboxMessage,
  type InboxMessagesPageResult,
} from "@/lib/api/whatsapp";

function makeMessage(id: string, bodyText: string): WhatsappMessage {
  return {
    id,
    chatId: "chat-1",
    instanceId: "instance-1",
    direction: "outbound",
    messageType: "text",
    status: "sent",
    bodyText,
    mediaUrl: null,
    payloadJson: {},
    quotedMessageId: null,
    sentAt: "2026-05-10T10:21:00.000Z",
    createdAt: "2026-05-10T10:21:00.000Z",
    receivedAt: null,
  };
}

describe("dedupeInboxMessagesById", () => {
  it("keeps one copy per message id and preserves the latest instance", () => {
    const first = makeMessage("msg-1", "primeiro");
    const duplicate = { ...first, bodyText: "atualizado" };
    const second = makeMessage("msg-2", "segundo");

    const result = dedupeInboxMessagesById([first, second, duplicate]);

    expect(result).toEqual([second, duplicate]);
  });

  it("returns the same array when there is nothing to dedupe", () => {
    const first = makeMessage("msg-1", "primeiro");
    const second = makeMessage("msg-2", "segundo");

    const result = dedupeInboxMessagesById([first, second]);

    expect(result).toEqual([first, second]);
  });

  it("dedupes persisted duplicates that share the same provider message id", () => {
    const first = {
      ...makeMessage("msg-1", "oi"),
      uazapiMessageId: "3EB012345678",
      status: "sent" as const,
    };
    const duplicate = {
      ...makeMessage("msg-2", "oi"),
      uazapiMessageId: "5511999999999@s.whatsapp.net:3EB012345678",
      status: "delivered" as const,
    };

    const result = dedupeInboxMessagesById([first, duplicate]);

    expect(result).toEqual([duplicate]);
  });

  it("drops optimistic temp when a persisted outbound twin exists without shared provider id", () => {
    const now = new Date().toISOString();
    const optimistic = {
      ...makeMessage("temp-550e8400-e29b-41d4-a716-446655440000", "bom dia"),
      createdAt: now,
      sentAt: now,
    };
    const persisted = {
      ...makeMessage("msg-real", "bom dia"),
      createdAt: now,
      sentAt: now,
      uazapiMessageId: "3EB0STATUSUPDATE",
      status: "delivered" as const,
    };

    const result = dedupeInboxMessagesById([optimistic, persisted]);

    expect(result).toEqual([persisted]);
  });

  it("collapses two persisted outbound rows that share body and minute but only one has provider id", () => {
    const now = new Date().toISOString();
    const ghost = {
      ...makeMessage("ghost-id", "kkkk"),
      uazapiMessageId: null,
      status: "sent" as const,
      createdAt: now,
      sentAt: now,
    };
    const real = {
      ...makeMessage("real-id", "kkkk"),
      uazapiMessageId: "3EB0ABC",
      status: "delivered" as const,
      createdAt: now,
      sentAt: now,
    };

    const result = dedupeInboxMessagesById([ghost, real]);

    expect(result).toEqual([real]);
  });

  it("collapses ghost + real when timestamps fall in different clock minutes (same send)", () => {
    const tClient = new Date("2026-05-10T12:00:58.000Z").toISOString();
    const tServer = new Date("2026-05-10T12:01:02.000Z").toISOString();
    const ghost = {
      ...makeMessage("ghost-id", "oi"),
      uazapiMessageId: null,
      status: "sent" as const,
      createdAt: tClient,
      sentAt: tClient,
    };
    const real = {
      ...makeMessage("real-id", "oi"),
      uazapiMessageId: "3EB0MIN",
      status: "sent" as const,
      createdAt: tServer,
      sentAt: tServer,
    };

    const result = dedupeInboxMessagesById([ghost, real]);

    expect(result).toEqual([real]);
  });

  it("collapses placeholder uuid provider id with real whatsapp id for same body", () => {
    const now = new Date().toISOString();
    const placeholder = {
      ...makeMessage("m-placeholder", "ola"),
      uazapiMessageId: "550e8400-e29b-41d4-a716-446655440000",
      status: "sent" as const,
      createdAt: now,
      sentAt: now,
    };
    const real = {
      ...makeMessage("m-real", "ola"),
      uazapiMessageId: "3EB0REAL",
      status: "delivered" as const,
      createdAt: now,
      sentAt: now,
    };

    const result = dedupeInboxMessagesById([placeholder, real]);

    expect(result).toEqual([real]);
  });

  it("does not collapse two outbound sends in the same minute with different provider ids", () => {
    const firstTime = "2026-05-10T10:21:00.000Z";
    const secondTime = "2026-05-10T10:21:30.000Z";
    const first = {
      ...makeMessage("m-a", "x"),
      uazapiMessageId: "3EB0AAA",
      createdAt: firstTime,
      sentAt: firstTime,
    };
    const second = {
      ...makeMessage("m-b", "x"),
      uazapiMessageId: "3EB0BBB",
      createdAt: secondTime,
      sentAt: secondTime,
    };

    const result = dedupeInboxMessagesById([first, second]);

    expect(result).toEqual([first, second]);
  });

  it("collapses rapid duplicate outbound sends even when provider ids differ", () => {
    const firstTime = "2026-05-10T10:21:00.000Z";
    const secondTime = "2026-05-10T10:21:02.000Z";
    const first = {
      ...makeMessage("m-a", "ola"),
      uazapiMessageId: "3EB0AAA",
      createdAt: firstTime,
      sentAt: firstTime,
    };
    const second = {
      ...makeMessage("m-b", "ola"),
      uazapiMessageId: "3EB0BBB",
      status: "delivered" as const,
      createdAt: secondTime,
      sentAt: secondTime,
    };

    const result = dedupeInboxMessagesById([first, second]);

    expect(result).toEqual([second]);
  });

  it("collapses four cache entries (two texts x temp+delivered) like rapid send + status update", () => {
    const now = new Date().toISOString();
    const messages = [
      { ...makeMessage("temp-a", "teste"), status: "queued" as const, createdAt: now, sentAt: now },
      { ...makeMessage("temp-b", "kkkkk"), status: "queued" as const, createdAt: now, sentAt: now },
      {
        ...makeMessage("real-a", "teste"),
        status: "sent" as const,
        createdAt: now,
        sentAt: now,
        uazapiMessageId: "3EB0A",
      },
      {
        ...makeMessage("real-b", "kkkkk"),
        status: "sent" as const,
        createdAt: now,
        sentAt: now,
        uazapiMessageId: "3EB0B",
      },
      {
        ...makeMessage("real-a", "teste"),
        status: "delivered" as const,
        createdAt: now,
        sentAt: now,
        uazapiMessageId: "3EB0A",
      },
      {
        ...makeMessage("real-b", "kkkkk"),
        status: "delivered" as const,
        createdAt: now,
        sentAt: now,
        uazapiMessageId: "3EB0B",
      },
    ];

    const result = dedupeInboxMessagesById(messages);

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.bodyText).sort()).toEqual(["kkkkk", "teste"]);
    expect(result.every((m) => m.status === "delivered")).toBe(true);
  });

  it("collapses two persisted rows without provider id when status diverges (sent vs delivered)", () => {
    const now = new Date().toISOString();
    const staleSent = {
      ...makeMessage("ghost", "teste"),
      uazapiMessageId: null,
      status: "sent" as const,
      createdAt: now,
      sentAt: now,
    };
    const delivered = {
      ...makeMessage("real", "teste"),
      uazapiMessageId: null,
      status: "delivered" as const,
      createdAt: now,
      sentAt: now,
    };

    const result = dedupeInboxMessagesById([staleSent, delivered]);

    expect(result).toEqual([delivered]);
  });
});

describe("findOutboundCacheTarget", () => {
  it("finds persisted twin by content when status diverges (sent vs delivered)", () => {
    const now = new Date().toISOString();
    const stale = {
      ...makeMessage("ghost", "ola"),
      status: "sent" as const,
      createdAt: now,
      sentAt: now,
    };
    const delivered = {
      ...makeMessage("real", "ola"),
      status: "delivered" as const,
      createdAt: now,
      sentAt: now,
      uazapiMessageId: "3EB0X",
    };

    expect(findOutboundCacheTarget([stale], delivered)?.id).toBe("ghost");
    expect(findOutboundCacheTarget([stale, delivered], delivered)?.id).toBe("real");
  });

  it("finds optimistic temp before persisted row exists", () => {
    const now = new Date().toISOString();
    const temp = {
      ...makeMessage("temp-1", "vc esta bem"),
      status: "queued" as const,
      createdAt: now,
      sentAt: now,
    };
    const sent = {
      ...makeMessage("msg-1", "vc esta bem"),
      status: "sent" as const,
      createdAt: now,
      sentAt: now,
    };

    expect(findOutboundCacheTarget([temp], sent)?.id).toBe("temp-1");
  });
});

describe("reconcileOptimisticInboxMessage", () => {
  it("replaces the optimistic temp message when the real message arrives", () => {
    const optimistic = makeMessage("temp-1", "oi");
    const incoming = { ...makeMessage("msg-1", "oi"), status: "sent" as const };
    const pages: InboxMessagesPageResult[] = [{ messages: [optimistic], hasMore: false }];

    const result = reconcileOptimisticInboxMessage(pages, incoming, optimistic.id);

    expect(result.matched).toBe(true);
    expect(result.pages[0]?.messages).toEqual([incoming]);
  });

  it("removes the optimistic temp message when the real copy is already present", () => {
    const optimistic = makeMessage("temp-1", "oi");
    const incoming = { ...makeMessage("msg-1", "oi"), status: "sent" as const };
    const pages: InboxMessagesPageResult[] = [{ messages: [optimistic, incoming], hasMore: false }];

    const result = reconcileOptimisticInboxMessage(pages, incoming, optimistic.id);

    expect(result.matched).toBe(true);
    expect(result.pages[0]?.messages).toEqual([incoming]);
  });

  it("treats provider ids with and without jid prefix as the same message", () => {
    const optimistic = {
      ...makeMessage("temp-1", "seja"),
      uazapiMessageId: "3EB012345678",
    };
    const delivered = {
      ...makeMessage("msg-1", "seja"),
      uazapiMessageId: "5511999999999@s.whatsapp.net:3EB012345678",
      status: "delivered" as const,
    };
    const pages: InboxMessagesPageResult[] = [{ messages: [optimistic, delivered], hasMore: false }];

    const result = reconcileOptimisticInboxMessage(pages, delivered, optimistic.id);

    expect(result.matched).toBe(true);
    expect(result.pages[0]?.messages).toEqual([delivered]);
  });

  it("pairs temp via content match when temp id is unknown but body normalizes equal", () => {
    const optimistic = {
      ...makeMessage("temp-xyz", "bom dia\n"),
      createdAt: new Date().toISOString(),
    };
    const incoming = { ...makeMessage("msg-real", "bom dia"), status: "sent" as const };
    const pages: InboxMessagesPageResult[] = [{ messages: [optimistic], hasMore: false }];

    const result = reconcileOptimisticInboxMessage(pages, incoming, undefined);

    expect(result.matched).toBe(true);
    expect(result.pages[0]?.messages).toEqual([incoming]);
  });

  it("matches when realtime already replaced temp with the server row (tempId stale)", () => {
    const serverLine = { ...makeMessage("msg-srv", "lll"), status: "delivered" as const };
    const pages: InboxMessagesPageResult[] = [{ messages: [serverLine], hasMore: false }];

    const result = reconcileOptimisticInboxMessage(pages, serverLine, "temp-removed-by-realtime");

    expect(result.matched).toBe(true);
    expect(result.pages[0]?.messages).toEqual([serverLine]);
  });
});

describe("inboxSearchTermsForPostgrest", () => {
  it("strips formatting from phone search", () => {
    expect(inboxSearchTermsForPostgrest("+556799466929")).toEqual({
      text: "+556799466929",
      digits: "556799466929",
    });
  });
});
