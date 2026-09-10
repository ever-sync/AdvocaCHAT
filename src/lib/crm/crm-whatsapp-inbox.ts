import { ensureWhatsappChatByPhone } from "@/lib/api/whatsapp";
import { normalizePhone } from "@/lib/phone";
import type { NavigateFunction } from "react-router-dom";
import type { CrmNegotiation, Customer, InboxChat } from "@/types/domain";

export type CrmWhatsappPhoneOption = {
  key: "telefone" | "celular";
  label: string;
  display: string;
  value: string;
};

function normalizeDigits(value?: string | null): string {
  return value?.replace(/\D/g, "") ?? "";
}

export function digitsMatchPhone(left?: string | null, right?: string | null): boolean {
  const a = normalizeDigits(left);
  const b = normalizeDigits(right);
  if (!a || !b) {
    return false;
  }
  return (
    a === b ||
    a === b.replace(/^55/, "") ||
    b === a.replace(/^55/, "") ||
    a.endsWith(b) ||
    b.endsWith(a)
  );
}

export function customerPhoneOptions(customer: Customer): CrmWhatsappPhoneOption[] {
  const options: CrmWhatsappPhoneOption[] = [];
  const seen = new Set<string>();

  const add = (key: CrmWhatsappPhoneOption["key"], raw: string | undefined, label: string) => {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) {
      return;
    }
    const normalized = normalizePhone(trimmed);
    const dedupeKey = normalized.digits || trimmed;
    if (!dedupeKey || seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    options.push({
      key,
      label,
      display: normalized.e164 ?? trimmed,
      value: normalized.e164 ?? trimmed,
    });
  };

  add("telefone", customer.telefone ?? customer.phoneE164 ?? undefined, "Telefone");
  add("celular", customer.celular, "Celular");

  return options;
}

export function resolveCustomerForNegotiation(
  card: CrmNegotiation,
  customers: Customer[],
): Customer | null {
  if (card.customerId) {
    const byId = customers.find((c) => c.id === card.customerId);
    if (byId) {
      return byId;
    }
  }
  const title = card.title.trim().toLowerCase();
  if (!title) {
    return null;
  }
  return customers.find((c) => c.nome.trim().toLowerCase() === title) ?? null;
}

export function findInboxChatByPhone(
  chats: InboxChat[] | undefined,
  phone: string,
  customerId?: string | null,
): InboxChat | null {
  if (!chats?.length) {
    return null;
  }

  const normalized = normalizePhone(phone);

  if (customerId) {
    const linked = chats.filter((c) => c.customerId === customerId);
    const match = linked.find(
      (c) =>
        c.remoteJid === normalized.jid ||
        digitsMatchPhone(c.remotePhoneDigits, normalized.digits) ||
        digitsMatchPhone(c.remotePhoneE164, normalized.e164),
    );
    if (match) {
      return match;
    }
  }

  return (
    chats.find((c) => c.remoteJid === normalized.jid) ??
    chats.find((c) => digitsMatchPhone(c.remotePhoneDigits, normalized.digits)) ??
    chats.find((c) => digitsMatchPhone(c.remotePhoneE164, normalized.e164)) ??
    null
  );
}

export function buildInboxUrlForWhatsapp(params: {
  phone?: string;
  chatId?: string | null;
  customerId?: string | null;
}): string {
  const search = new URLSearchParams();
  if (params.chatId) {
    search.set("chatId", params.chatId);
  }
  if (params.customerId) {
    search.set("customerId", params.customerId);
  }
  if (params.phone) {
    const hint = normalizePhone(params.phone).e164 ?? normalizePhone(params.phone).digits;
    if (hint) {
      search.set("search", hint);
    }
  }
  const qs = search.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}

export type CrmWhatsappOpenAction =
  | { kind: "open"; phone: string }
  | { kind: "pick"; options: CrmWhatsappPhoneOption[] }
  | { kind: "open_chat"; chatId: string }
  | { kind: "error"; message: string };

export function resolveCrmWhatsappOpenAction(params: {
  card: CrmNegotiation;
  customer: Customer | null;
}): CrmWhatsappOpenAction {
  if (params.card.sourceChatId?.trim()) {
    return { kind: "open_chat", chatId: params.card.sourceChatId.trim() };
  }

  const phones = params.customer ? customerPhoneOptions(params.customer) : [];

  if (phones.length >= 2) {
    return { kind: "pick", options: phones };
  }
  if (phones.length === 1) {
    return { kind: "open", phone: phones[0].value };
  }
  return {
    kind: "error",
    message: "Cadastre um telefone no cliente para abrir o WhatsApp.",
  };
}

export async function openCrmWhatsappInbox(params: {
  navigate: NavigateFunction;
  chats: InboxChat[] | undefined;
  card: CrmNegotiation;
  customer: Customer | null;
  phone: string;
}): Promise<void> {
  const linkedChatId = params.card.sourceChatId?.trim() || null;
  const chat =
    (linkedChatId ? params.chats?.find((c) => c.id === linkedChatId) : null) ??
    findInboxChatByPhone(params.chats, params.phone, params.customer?.id);

  let chatId = chat?.id ?? linkedChatId;
  if (!chatId) {
    chatId = await ensureWhatsappChatByPhone({
      phone: params.phone,
      displayName: params.customer?.nome ?? params.card.title,
    });
  }

  params.navigate(
    buildInboxUrlForWhatsapp({
      chatId,
      customerId: params.customer?.id ?? params.card.customerId ?? null,
      phone: params.phone,
    }),
  );
}
