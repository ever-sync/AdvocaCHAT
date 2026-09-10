import { describe, expect, it } from "vitest";
import { resolveInboxAttachmentPresentation } from "./inboxMessageMedia";
import type { WhatsappMessage } from "@/types/domain";

function baseMessage(overrides: Partial<WhatsappMessage>): WhatsappMessage {
  return {
    id: "1",
    chatId: "c1",
    instanceId: "i1",
    direction: "inbound",
    messageType: "text",
    status: "received",
    bodyText: null,
    ...overrides,
  } as WhatsappMessage;
}

describe("resolveInboxAttachmentPresentation", () => {
  it("ignora nome de arquivo solto (evita 403 no dominio do app)", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: "549882941_707333488792507_4239322882866302707_n.jpg",
    });
    expect(resolveInboxAttachmentPresentation(message)).toBeNull();
  });

  it("mantém URL do CDN do WhatsApp para tentativa de preview (fallback no balão)", () => {
    const waUrl =
      "https://pps.whatsapp.net/v/t61.24694-24/306469471_605864137918683_2200323229137782967_n.jpg";
    const message = baseMessage({
      messageType: "media",
      mediaUrl: waUrl,
    });
    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: waUrl,
    });
  });

  it("returns image for media type with jpg url", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: "https://cdn.example.com/photo.jpg",
    });
    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: "https://cdn.example.com/photo.jpg",
    });
  });

  it("returns document for media type with unknown extension", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: "https://cdn.example.com/file.xyz",
    });
    const result = resolveInboxAttachmentPresentation(message);
    expect(result?.kind).toBe("document");
  });

  it("returns audio for audio message type", () => {
    const message = baseMessage({
      messageType: "audio",
      mediaUrl: "https://cdn.example.com/a.m4a",
    });
    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "audio",
      url: "https://cdn.example.com/a.m4a",
    });
  });

  it("falls back to rawEvent for audio url when mediaUrl is missing", () => {
    const message = baseMessage({
      messageType: "audio",
      mediaUrl: null,
      rawEvent: {
        message: {
          audioMessage: {
            url: "https://cdn.example.com/voice-note.ogg",
            mimetype: "audio/ogg",
          },
        },
      },
    });

    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "audio",
      url: "https://cdn.example.com/voice-note.ogg",
    });
  });

  it("uses payload fileName for document label", () => {
    const message = baseMessage({
      messageType: "document",
      mediaUrl: "https://cdn.example.com/x",
      payloadJson: { fileName: "Contrato.pdf" },
    });
    const result = resolveInboxAttachmentPresentation(message);
    expect(result?.kind).toBe("document");
    if (result?.kind === "document") {
      expect(result.label).toBe("Contrato.pdf");
    }
  });

  it("returns null without media url", () => {
    expect(resolveInboxAttachmentPresentation(baseMessage({ messageType: "media" }))).toBeNull();
  });

  it("renders image even when message type is text but media url exists", () => {
    const message = baseMessage({
      messageType: "text",
      mediaUrl: "https://cdn.example.com/arquivo-sem-tipo.png",
    });

    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: "https://cdn.example.com/arquivo-sem-tipo.png",
    });
  });

  it("never hides attachment when media url exists without hint", () => {
    const message = baseMessage({
      messageType: "text",
      mediaUrl: "https://cdn.example.com/blob-sem-extensao",
    });

    const result = resolveInboxAttachmentPresentation(message);
    expect(result?.kind).toBe("document");
  });

  it("usa o campo `content` (formato uazapi v2) quando media_url ausente", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: null,
      rawEvent: {
        message: {
          messageType: "image",
          content: "https://uazapi.example.com/files/abc.jpg",
          mimetype: "image/jpeg",
        },
      },
    });

    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: "https://uazapi.example.com/files/abc.jpg",
    });
  });

  it("usa `fileURL` (uazapi v2) e infere tipo a partir de mediaType", () => {
    const message = baseMessage({
      messageType: "audio",
      mediaUrl: null,
      rawEvent: {
        message: {
          mediaType: "audio",
          fileURL: "https://uazapi.example.com/files/voice.opus",
        },
      },
    });

    const result = resolveInboxAttachmentPresentation(message);
    expect(result?.kind).toBe("audio");
    expect(result?.url).toBe("https://uazapi.example.com/files/voice.opus");
  });

  it("usa `imageMessage` como pista mesmo sem extensao na URL", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: null,
      rawEvent: {
        message: {
          imageMessage: {
            url: "https://uazapi.example.com/files/abc123",
            mimetype: "image/jpeg",
          },
        },
      },
    });

    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: "https://uazapi.example.com/files/abc123",
    });
  });

  it("usa urls achatadas do payload, como imageUrl", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: null,
      payloadJson: {
        imageUrl: "https://cdn.example.com/sem-extensao",
        mimeType: "image/png",
      },
    });

    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: "https://cdn.example.com/sem-extensao",
    });
  });

  it("prefere mirroredMediaUrl do payload quando media_url ainda aponta ao CDN", () => {
    const mirrored =
      "https://projeto.supabase.co/storage/v1/object/public/whatsapp-media/tenant-1/abc_photo.jpg";
    const message = baseMessage({
      messageType: "media",
      mediaUrl: "https://pps.whatsapp.net/v/t61.24694-24/old.jpg",
      payloadJson: { mirroredMediaUrl: mirrored },
    });
    expect(resolveInboxAttachmentPresentation(message)).toEqual({
      kind: "image",
      url: mirrored,
    });
  });

  it("normalizes /storage relative URL to supabase host", () => {
    const message = baseMessage({
      messageType: "media",
      mediaUrl: "/storage/v1/object/public/whatsapp-media/tenant/arquivo.jpg",
    });

    const result = resolveInboxAttachmentPresentation(message);
    expect(result?.kind).toBe("image");
    expect(result?.url).toContain("/storage/v1/object/public/whatsapp-media/tenant/arquivo.jpg");
  });
});
