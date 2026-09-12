import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableMessageStore } from "./message-store.js";

test("sent content survives store recreation for Signal retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "advocachat-message-store-"));
  try {
    const first = new DurableMessageStore(root);
    const bytes = Buffer.from("cipher material");
    await first.put({ key: { id: "message-1" }, message: { imageMessage: { mediaKey: bytes } } });
    const restarted = new DurableMessageStore(root);
    const restored = await restarted.get("message-1");
    assert.deepEqual(Buffer.from(restored.imageMessage.mediaKey), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("expired and excess messages are removed", async () => {
  const root = await mkdtemp(join(tmpdir(), "advocachat-message-store-"));
  try {
    let now = 1_000;
    const store = new DurableMessageStore(root, { maxMessages: 1, retentionMs: 100, pruneEvery: 1, now: () => now });
    await store.put({ key: { id: "old" }, message: { conversation: "old" } });
    now += 10;
    await store.put({ key: { id: "new" }, message: { conversation: "new" } });
    assert.equal(await store.get("old"), undefined);
    assert.equal((await store.get("new")).conversation, "new");
    now += 101;
    assert.equal(await store.get("new"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
