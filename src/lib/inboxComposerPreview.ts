import type { MessageType } from "@/types/domain";

export type ComposerAttachmentPreviewKind = "image" | "video" | "audio" | "document";

/**
 * Decide o tipo de preview no composer (anexo) a partir do tipo de mensagem, MIME e URL.
 */
export function resolveComposerAttachmentPreview(
  messageType: Exclude<MessageType, "system">,
  mediaUrl: string,
  mimeType: string | null,
): ComposerAttachmentPreviewKind | null {
  const u = mediaUrl.trim();
  if (!u) {
    return null;
  }

  const m = mimeType?.trim() ?? "";
  if (m.startsWith("image/")) {
    return "image";
  }
  if (m.startsWith("video/")) {
    return "video";
  }
  if (m.startsWith("audio/")) {
    return "audio";
  }

  if (messageType === "audio") {
    return "audio";
  }
  if (messageType === "document") {
    return "document";
  }

  if (u.startsWith("data:image/")) {
    return "image";
  }
  if (u.startsWith("data:video/")) {
    return "video";
  }
  if (u.startsWith("data:audio/")) {
    return "audio";
  }

  const path = u.split("?")[0].toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/.test(path)) {
    return "image";
  }
  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/.test(path)) {
    return "video";
  }
  if (/\.(mp3|wav|m4a|aac|opus)(\?|$)/.test(path)) {
    return "audio";
  }
  if (/\.(pdf|doc|docx|xls|xlsx|csv|zip|rar|ppt|pptx|txt)(\?|$)/.test(path)) {
    return "document";
  }

  if (messageType === "media") {
    return "document";
  }

  return null;
}
