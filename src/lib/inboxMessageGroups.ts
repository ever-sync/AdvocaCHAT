import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ChatNote, WhatsappMessage } from "@/types/domain";

export type ThreadEntry = WhatsappMessage | ChatNote;
export type MessageDayGroup = { label: string; items: ThreadEntry[] };

/** Posicao no cluster de bolhas consecutivas do mesmo remetente (estilo WhatsApp). */
export type BubbleGroupPosition = "single" | "first" | "middle" | "last";

export type ThreadFlattenItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "msg"; key: string; message: WhatsappMessage; groupPosition: BubbleGroupPosition }
  | { kind: "note"; key: string; note: ChatNote };

const BUBBLE_GROUP_GAP_MS = 2 * 60_000;

function messageTimestampMs(message: WhatsappMessage): number {
  const t = Date.parse(message.createdAt ?? message.sentAt ?? message.receivedAt ?? "");
  return Number.isFinite(t) ? t : 0;
}

function canGroupConsecutiveMessages(left: WhatsappMessage, right: WhatsappMessage): boolean {
  if (left.direction !== right.direction) {
    return false;
  }
  const leftMs = messageTimestampMs(left);
  const rightMs = messageTimestampMs(right);
  if (leftMs <= 0 || rightMs <= 0) {
    return true;
  }
  return Math.abs(rightMs - leftMs) <= BUBBLE_GROUP_GAP_MS;
}

export function resolveBubbleGroupPositions(messages: WhatsappMessage[]): Map<string, BubbleGroupPosition> {
  const positions = new Map<string, BubbleGroupPosition>();
  let index = 0;

  while (index < messages.length) {
    let end = index;
    while (
      end + 1 < messages.length &&
      canGroupConsecutiveMessages(messages[end], messages[end + 1])
    ) {
      end += 1;
    }

    const count = end - index + 1;
    for (let cursor = index; cursor <= end; cursor += 1) {
      const id = messages[cursor].id;
      if (count === 1) {
        positions.set(id, "single");
      } else if (cursor === index) {
        positions.set(id, "first");
      } else if (cursor === end) {
        positions.set(id, "last");
      } else {
        positions.set(id, "middle");
      }
    }

    index = end + 1;
  }

  return positions;
}

function formatMessageDay(value?: string | null) {
  if (!value) {
    return "Hoje";
  }

  const date = new Date(value);
  if (isToday(date)) {
    return "Hoje";
  }

  if (isYesterday(date)) {
    return "Ontem";
  }

  return format(date, "EEE, dd 'de' MMM", { locale: ptBR });
}

function getEntryTimestamp(entry: ThreadEntry): string | null | undefined {
  if ("_noteKind" in entry) {
    return entry.createdAt;
  }
  return entry.createdAt ?? entry.sentAt ?? entry.receivedAt ?? null;
}

/** Backward-compat wrapper used by callers that pass only messages. */
export function groupMessagesByDay(messages: WhatsappMessage[]): MessageDayGroup[] {
  return groupThreadItemsByDay(messages);
}

export function groupThreadItemsByDay(items: ThreadEntry[]): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];

  for (const entry of items) {
    const key = formatMessageDay(getEntryTimestamp(entry));
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.label === key) {
      lastGroup.items.push(entry);
      continue;
    }

    groups.push({ label: key, items: [entry] });
  }

  return groups;
}

export function flattenMessageGroups(groups: MessageDayGroup[]): ThreadFlattenItem[] {
  const out: ThreadFlattenItem[] = [];

  for (const g of groups) {
    out.push({ kind: "day", key: `day-${g.label}`, label: g.label });

    let messageRun: WhatsappMessage[] = [];

    const flushMessageRun = () => {
      if (messageRun.length === 0) {
        return;
      }
      const positions = resolveBubbleGroupPositions(messageRun);
      for (const message of messageRun) {
        out.push({
          kind: "msg",
          key: message.id,
          message,
          groupPosition: positions.get(message.id) ?? "single",
        });
      }
      messageRun = [];
    };

    for (const item of g.items) {
      if ("_noteKind" in item) {
        flushMessageRun();
        out.push({ kind: "note", key: item.id, note: item });
        continue;
      }
      messageRun.push(item);
    }

    flushMessageRun();
  }

  return out;
}

export function bubbleGroupSpacingClass(position: BubbleGroupPosition): string {
  switch (position) {
    case "first":
    case "middle":
      return "pb-[1px]";
    case "last":
    case "single":
    default:
      return "pb-2";
  }
}
