import { assertEquals } from "jsr:@std/assert@1";
import { extractRemoteJid } from "./domain.ts";

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
