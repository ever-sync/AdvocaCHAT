import { describe, expect, it } from "vitest";
import type { WhatsappMessage } from "@/types/domain";
import {
  bubbleGroupSpacingClass,
  flattenMessageGroups,
  groupThreadItemsByDay,
  resolveBubbleGroupPositions,
} from "@/lib/inboxMessageGroups";

function makeMessage(id: string, direction: "inbound" | "outbound", createdAt: string): WhatsappMessage {
  return {
    id,
    chatId: "chat-1",
    instanceId: "instance-1",
    direction,
    messageType: "text",
    status: "sent",
    bodyText: id,
    mediaUrl: null,
    payloadJson: {},
    quotedMessageId: null,
    sentAt: createdAt,
    createdAt,
    receivedAt: null,
  };
}

describe("resolveBubbleGroupPositions", () => {
  it("groups consecutive messages from the same sender and marks the block edges", () => {
    const messages = [
      makeMessage("a", "outbound", "2026-05-10T10:00:00.000Z"),
      makeMessage("b", "outbound", "2026-05-10T10:01:00.000Z"),
      makeMessage("c", "outbound", "2026-05-10T10:03:00.000Z"),
      makeMessage("d", "inbound", "2026-05-10T10:04:00.000Z"),
    ];

    const positions = resolveBubbleGroupPositions(messages);

    expect(positions.get("a")).toBe("first");
    expect(positions.get("b")).toBe("middle");
    expect(positions.get("c")).toBe("last");
    expect(positions.get("d")).toBe("single");
  });
});

describe("flattenMessageGroups", () => {
  it("preserves bubble positions while flattening the day groups", () => {
    const messages = [
      makeMessage("a", "outbound", "2026-05-10T10:00:00.000Z"),
      makeMessage("b", "outbound", "2026-05-10T10:01:00.000Z"),
      makeMessage("c", "inbound", "2026-05-10T10:05:00.000Z"),
    ];

    const flat = flattenMessageGroups(groupThreadItemsByDay(messages));

    expect(flat.filter((item) => item.kind === "msg").map((item) => item.groupPosition)).toEqual([
      "first",
      "last",
      "single",
    ]);
  });
});

describe("bubbleGroupSpacingClass", () => {
  it("tightens spacing for grouped bubbles", () => {
    expect(bubbleGroupSpacingClass("first")).toBe("pb-[1px]");
    expect(bubbleGroupSpacingClass("middle")).toBe("pb-[1px]");
    expect(bubbleGroupSpacingClass("last")).toBe("pb-2");
  });
});
