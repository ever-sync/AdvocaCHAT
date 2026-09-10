import type { InboxChat, WhatsappMessage } from "@/types/domain";
import { CHAT_RESOLUTION_LABELS } from "@/lib/inbox-chat-rules";
import { getInboxMessagePreviewText } from "@/lib/inboxMessageBody";

export type ConversationSummaryFact = {
  label: string;
  value: string;
};

export type InboxConversationSummary = {
  headline: string;
  supportingText: string;
  latestAtLabel: string;
  facts: ConversationSummaryFact[];
  lastCustomerMessage: string | null;
  lastTeamMessage: string | null;
};

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipSnippet(text: string, max = 96): string {
  const normalized = normalizeSnippet(text);
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function pickLatestTimestamp(messages: WhatsappMessage[]): string | null {
  let latest = 0;
  let label: string | null = null;

  for (const message of messages) {
    const candidate = message.createdAt ?? message.sentAt ?? message.receivedAt ?? null;
    if (!candidate) {
      continue;
    }

    const time = Date.parse(candidate);
    if (!Number.isFinite(time) || time < latest) {
      continue;
    }

    latest = time;
    label = candidate;
  }

  return label;
}

function pickLastMessage(messages: WhatsappMessage[], direction: "inbound" | "outbound") {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction === direction) {
      return message;
    }
  }
  return null;
}

function countMessages(messages: WhatsappMessage[], direction: "inbound" | "outbound"): number {
  return messages.reduce((total, message) => total + (message.direction === direction ? 1 : 0), 0);
}

function resolveConversationHeadline(
  chat: InboxChat,
  messages: WhatsappMessage[],
  lastInbound: WhatsappMessage | null,
  lastOutbound: WhatsappMessage | null,
) {
  if (messages.length === 0) {
    return "Ainda não há mensagens nesta conversa.";
  }

  if (lastInbound && lastOutbound) {
    const inboundTs = Date.parse(lastInbound.createdAt ?? lastInbound.sentAt ?? "");
    const outboundTs = Date.parse(lastOutbound.createdAt ?? lastOutbound.sentAt ?? "");
    if (Number.isFinite(inboundTs) && Number.isFinite(outboundTs)) {
      if (inboundTs >= outboundTs) {
        return "O cliente falou por último. Vale acompanhar a última resposta enviada.";
      }
      return "A equipe falou por último. O cliente ainda não respondeu desde a última mensagem.";
    }
  }

  if (lastInbound) {
    return "O cliente falou por último. Ainda não houve resposta da equipe.";
  }

  if (lastOutbound) {
    return "A equipe falou por último. A conversa está aguardando retorno do cliente.";
  }

  return chat.lastMessagePreview?.trim()
    ? clipSnippet(chat.lastMessagePreview, 100)
    : "A conversa está sem um resumo legível no momento.";
}

export function buildInboxConversationSummary(
  chat: InboxChat,
  messages: WhatsappMessage[],
): InboxConversationSummary {
  const lastInbound = pickLastMessage(messages, "inbound");
  const lastOutbound = pickLastMessage(messages, "outbound");
  const latestAt = pickLatestTimestamp(messages);
  const inboundCount = countMessages(messages, "inbound");
  const outboundCount = countMessages(messages, "outbound");

  const lastCustomerMessage = lastInbound ? clipSnippet(getInboxMessagePreviewText(lastInbound)) : null;
  const lastTeamMessage = lastOutbound ? clipSnippet(getInboxMessagePreviewText(lastOutbound)) : null;
  const latestAtLabel = latestAt ? formatTimestamp(latestAt) : "Sem mensagens";

  const facts: ConversationSummaryFact[] = [
    { label: "Mensagens", value: String(messages.length) },
    { label: "Cliente", value: String(inboundCount) },
    { label: "Equipe", value: String(outboundCount) },
    { label: "Última atividade", value: latestAtLabel },
    { label: "Status", value: CHAT_RESOLUTION_LABELS[chat.resolution ?? "open"] ?? (chat.resolution ?? "open") },
  ];

  if (chat.aiMode && chat.aiMode !== "off") {
    const aiLabel =
      chat.aiMode === "qualifying"
        ? "Qualificação"
        : chat.aiMode === "full"
          ? "Completa"
          : "Handoff";
    facts.splice(4, 0, { label: "IA", value: aiLabel });
  }

  return {
    headline: resolveConversationHeadline(chat, messages, lastInbound, lastOutbound),
    supportingText: chat.lastMessagePreview?.trim()
      ? clipSnippet(chat.lastMessagePreview, 120)
      : "Sem prévia de mensagem recente no chat.",
    latestAtLabel,
    facts,
    lastCustomerMessage,
    lastTeamMessage,
  };
}
