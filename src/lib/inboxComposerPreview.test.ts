import { describe, expect, it } from "vitest";
import { resolveComposerAttachmentPreview } from "./inboxComposerPreview";

describe("resolveComposerAttachmentPreview", () => {
  it("prefere MIME image sobre extensao", () => {
    expect(
      resolveComposerAttachmentPreview("media", "https://x.com/a.mp4", "image/png"),
    ).toBe("image");
  });

  it("usa audio pelo tipo de mensagem", () => {
    expect(resolveComposerAttachmentPreview("audio", "", "")).toBeNull();
    expect(resolveComposerAttachmentPreview("audio", "https://cdn/x.bin", "")).toBe("audio");
  });

  it("infere imagem pela extensao em URL https", () => {
    expect(
      resolveComposerAttachmentPreview("media", "https://storage/x/photo.jpg", null),
    ).toBe("image");
  });
});
