import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebhookOutbox } from "./webhook-outbox.js";

test("failed delivery survives restart and keeps a stable event id", async () => {
  const root = await mkdtemp(join(tmpdir(), "onefix-outbox-"));
  try {
    let now = 1000;
    const calls = [];
    const first = new WebhookOutbox(root, { now: () => now, deliver: async (_, req) => {
      calls.push(JSON.parse(req.body)); throw new Error("network unavailable");
    } });
    await first.enqueue({ event: "messages.upsert", messages: [{ key: { id: "m1" } }] });
    await first.flush("https://receiver.invalid");
    assert.equal((await first.pending()).length, 1);
    now += 60000;
    const restarted = new WebhookOutbox(root, { now: () => now, deliver: async (_, req) => {
      calls.push(JSON.parse(req.body)); return Response.json({ success: true });
    } });
    await Promise.all([restarted.flush("https://receiver.invalid"), restarted.flush("https://receiver.invalid")]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].eventId, calls[1].eventId);
    assert.equal((await restarted.pending()).length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("events wait for webhook configuration and an application acknowledgement", async () => {
  const root = await mkdtemp(join(tmpdir(), "onefix-outbox-"));
  try {
    const queue = new WebhookOutbox(root, { deliver: async () => Response.json({ error: "not processed" }) });
    await queue.enqueue({ event: "connection.update", status: "open" });
    await queue.flush(null);
    assert.equal((await queue.pending()).length, 1);
    await queue.flush("https://receiver.invalid");
    assert.equal((await queue.pending()).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
