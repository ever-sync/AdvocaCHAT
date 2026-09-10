import { describe, expect, it } from "vitest";
import {
  isBareMediaFilename,
  isMetaCdnLikelyToBlockInlineEmbed,
} from "@/lib/restricted-media-hosts";

describe("isMetaCdnLikelyToBlockInlineEmbed", () => {
  it("detecta CDN do WhatsApp/Meta", () => {
    expect(
      isMetaCdnLikelyToBlockInlineEmbed(
        "https://pps.whatsapp.net/v/t61.24694-24/306469471_605864137918683_2200323229137782967_n.jpg",
      ),
    ).toBe(true);
    expect(isMetaCdnLikelyToBlockInlineEmbed("https://mmg.whatsapp.net/d/f/abc.enc")).toBe(true);
    expect(isMetaCdnLikelyToBlockInlineEmbed("https://scontent.xx.fbcdn.net/v/abc.jpg")).toBe(true);
  });

  it("permite Supabase Storage e data URLs", () => {
    expect(
      isMetaCdnLikelyToBlockInlineEmbed(
        "https://oaqeabqfgbeprrgqdmsk.supabase.co/storage/v1/object/public/whatsapp-media/t/x.jpg",
      ),
    ).toBe(false);
    expect(isMetaCdnLikelyToBlockInlineEmbed("data:image/png;base64,abc")).toBe(false);
  });
});

describe("isBareMediaFilename", () => {
  it("rejeita nome de arquivo sem caminho", () => {
    expect(isBareMediaFilename("549882941_707333488792507_4239322882866302707_n.jpg")).toBe(true);
  });

  it("aceita URLs e paths de storage", () => {
    expect(isBareMediaFilename("https://example.com/a.jpg")).toBe(false);
    expect(isBareMediaFilename("tenant-id/chat/file.jpg")).toBe(false);
    expect(isBareMediaFilename("/storage/v1/object/public/whatsapp-media/x.jpg")).toBe(false);
  });
});
