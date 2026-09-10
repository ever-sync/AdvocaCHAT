import type { MessageType } from "@/types/domain";

export const MESSAGE_TYPE_LABELS: Array<{ value: Exclude<MessageType, "system">; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "media", label: "Midia" },
  { value: "menu", label: "Menu" },
  { value: "poll", label: "Enquete" },
  { value: "location", label: "Localizacao" },
  { value: "contact", label: "Contato" },
  { value: "audio", label: "Audio" },
  { value: "document", label: "Documento" },
];

export const QUICK_EMOJIS = ["😀", "👍", "🙏", "✅", "🚚", "📦", "💬", "😉"];
