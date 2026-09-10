import { normalizePhone } from "@/lib/phone";
import type { CustomerUpsertInput, InboxChat } from "@/types/domain";

/** Pré-preenche o formulário de novo contato (mesma lógica da query `telefone` / `nome` em Clientes). */
export function leadPrefillFromInboxChat(chat: InboxChat): Partial<CustomerUpsertInput> {
  const n = normalizePhone(chat.remotePhoneE164 || chat.remotePhoneDigits || chat.remoteJid || "");
  const tel = n.e164 ?? (n.digits && n.digits.length >= 2 ? n.digits : "");
  const nome = (chat.displayName || chat.customerName || "").trim();
  return {
    ...(tel ? { telefone: tel } : {}),
    ...(nome ? { nome } : {}),
  };
}

/** Texto inicial para vincular conversa a um cadastro (busca em Clientes). */
export function linkSearchHintFromInboxChat(chat: InboxChat): string {
  const e164 = chat.remotePhoneE164?.trim();
  if (e164 && e164.length >= 2) {
    return e164;
  }
  const digitsOnly = chat.remotePhoneDigits?.replace(/\D/g, "") ?? "";
  if (digitsOnly.length >= 2) {
    return digitsOnly;
  }
  const n = normalizePhone(chat.remoteJid ?? "");
  if (n.digits && n.digits.length >= 2) {
    return n.digits;
  }
  return n.e164?.trim() ?? "";
}

/**
 * Rota com query para abrir o fluxo "novo contato" vindo da inbox
 * (`Clientes` interpreta `novo`, `inboxChatId`, `returnTo`, `telefone`, `nome`).
 */
export function buildClientesNovoContatoUrlFromInboxChat(chat: InboxChat): string {
  const params = new URLSearchParams({ novo: "1" });
  params.set("inboxChatId", chat.id);
  params.set("returnTo", "inbox");
  const prefill = leadPrefillFromInboxChat(chat);
  if (prefill.telefone) {
    params.set("telefone", prefill.telefone);
  }
  if (prefill.nome) {
    params.set("nome", prefill.nome);
  }
  return `/clientes?${params.toString()}`;
}
