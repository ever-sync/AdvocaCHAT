import { assertEquals } from "jsr:@std/assert@1";
import { extractRemoteJid, extractRemoteJidCandidates } from "./domain.ts";

Deno.test("extractRemoteJid prefers senderPn over a LID destination", () => {
  assertEquals(
    extractRemoteJid({
      key: {
        remoteJid: "272842293833954@lid",
        senderPn: "5512981092776@s.whatsapp.net",
      },
    }),
    "5512981092776@s.whatsapp.net",
  );
});

Deno.test("extractRemoteJid also reads senderPn from nested Baileys payloads", () => {
  assertEquals(
    extractRemoteJid({
      data: {
        key: {
          remoteJid: "272842293833954@lid",
          senderPn: "5512981092776@s.whatsapp.net",
        },
      },
    }),
    "5512981092776@s.whatsapp.net",
  );
});

Deno.test("extractRemoteJidCandidates preserves both phone and LID identities", () => {
  assertEquals(
    extractRemoteJidCandidates({
      key: {
        remoteJid: "272842293833954@lid",
        senderPn: "5512981092776@s.whatsapp.net",
      },
    }),
    ["272842293833954@lid", "5512981092776@s.whatsapp.net"],
  );
});

Deno.test("extractRemoteJidCandidates ignores groups and duplicates", () => {
  assertEquals(
    extractRemoteJidCandidates({
      key: { remoteJid: "5512981092776@s.whatsapp.net" },
      remoteJid: "5512981092776@s.whatsapp.net",
      sender: "120363000000@g.us",
    }),
    ["5512981092776@s.whatsapp.net"],
  );
});
