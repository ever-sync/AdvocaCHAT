import type { WhatsappMessage } from "@/types/domain";

const typeLabels: Partial<Record<string, string>> = {
  image: "Imagem",
  video: "Video",
  media: "Midia",
  document: "Documento",
  audio: "Audio",
  location: "Localizacao",
  contact: "Contato",
  poll: "Enquete",
  menu: "Menu",
  text: "Texto",
};

/** Evita exibir JSON bruto ou payloads enormes como se fossem texto de chat. */
function looksLikeStructuredDump(text: string): boolean {
  const t = text.trim();
  if (t.length < 60) {
    return false;
  }
  if (t.startsWith("{") && t.includes('"') && (t.includes('":') || t.includes("': "))) {
    return true;
  }
  if (t.startsWith("[") && t.includes("{")) {
    return true;
  }
  return false;
}

/**
 * Texto exibido no balao da thread. Preferir corpo legivel; tipos sem texto recebem rotulo amigavel.
 */
export function getInboxMessagePreviewText(message: WhatsappMessage): string {
  const body = message.bodyText?.trim();
  if (body) {
    if (looksLikeStructuredDump(body)) {
      return "[Conteudo tecnico — use os metadados ou o suporte se precisar do detalhe.]";
    }
    return body;
  }

  const rawType = message.messageType;
  const label = (rawType && typeLabels[rawType]) || rawType || "Mensagem";

  const payload = message.payloadJson;
  const hasPayload =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload as Record<string, unknown>).length > 0;

  if (!hasPayload) {
    return `[${label} — sem texto]`;
  }

  return `[${label} — visualizacao resumida]`;
}
