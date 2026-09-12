import { mkdir, readFile, readdir, rename, unlink, open } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Pending events live on the same persistent volume as WhatsApp credentials.
// A transport error never removes an event. The receiver deduplicates eventId.
export class WebhookOutbox {
  constructor(root, { deliver = fetch, now = Date.now, timeoutMs = 15000 } = {}) {
    this.root = root;
    this.deliver = deliver;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.running = false;
    this.lastError = null;
  }

  async save(file, value) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, file);
  }

  async enqueue(payload) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const eventId = randomUUID();
    const item = { payload: { ...payload, eventId }, attempts: 0, nextAttemptAt: 0, createdAt: this.now() };
    await this.save(join(this.root, `${this.now()}-${eventId}.json`), item);
    return eventId;
  }

  async pending() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    return (await readdir(this.root)).filter((name) => name.endsWith(".json")).sort();
  }

  async flush(url) {
    if (!url || this.running) return;
    this.running = true;
    try {
      // Preserve event ordering. Bound each pass so health checks remain responsive.
      for (const name of (await this.pending()).slice(0, 50)) {
        const file = join(this.root, name);
        const item = JSON.parse(await readFile(file, "utf8"));
        if (item.nextAttemptAt > this.now()) break;
        try {
          const response = await this.deliver(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(item.payload),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
          const result = await response.json();
          if (!response.ok || result?.success !== true) throw new Error(`Webhook HTTP ${response.status}`);
          await unlink(file);
          this.lastError = null;
        } catch {
          item.attempts += 1;
          item.nextAttemptAt = this.now() + Math.min(60000, 1000 * 2 ** Math.min(item.attempts, 6));
          await this.save(file, item);
          this.lastError = "Entrega pendente; nova tentativa automatica agendada.";
          break;
        }
      }
    } finally { this.running = false; }
  }
}
