import { assertEquals } from "jsr:@std/assert@1";
import { normalizeWebhookEvent } from "./domain.ts";

Deno.test("normalizes Baileys receipts as message status updates", () => {
  assertEquals(
    normalizeWebhookEvent({ event: "message-receipt.update" }),
    "MESSAGES_UPDATE",
  );
});

Deno.test("normalizes native LID mappings", () => {
  assertEquals(
    normalizeWebhookEvent({ event: "lid-mapping.update" }),
    "LID_MAPPING_UPDATE",
  );
});
