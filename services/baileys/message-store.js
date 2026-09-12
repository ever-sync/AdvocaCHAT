import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { BufferJSON } from "@whiskeysockets/baileys";

const DAY_MS = 24 * 60 * 60 * 1000;

function fileName(id) {
  return `${createHash("sha256").update(String(id)).digest("hex")}.json`;
}

export class DurableMessageStore {
  constructor(root, { maxMessages = 2_000, retentionMs = 7 * DAY_MS, pruneEvery = 50, now = Date.now } = {}) {
    this.root = root;
    this.maxMessages = maxMessages;
    this.retentionMs = retentionMs;
    this.pruneEvery = pruneEvery;
    this.now = now;
    this.writesSincePrune = 0;
  }

  async save(path, value) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, BufferJSON.replacer));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  }

  async put(message) {
    const id = message?.key?.id;
    if (!id || !message?.message) return;
    await this.save(join(this.root, fileName(id)), {
      id,
      storedAt: this.now(),
      message: message.message,
    });
    this.writesSincePrune += 1;
    if (this.writesSincePrune >= this.pruneEvery) {
      this.writesSincePrune = 0;
      await this.prune();
    }
  }

  async get(id) {
    if (!id) return undefined;
    try {
      const stored = JSON.parse(
        await readFile(join(this.root, fileName(id)), "utf8"),
        BufferJSON.reviver,
      );
      if (this.now() - Number(stored.storedAt || 0) > this.retentionMs) return undefined;
      return stored.message;
    } catch {
      return undefined;
    }
  }

  async prune() {
    const names = (await readdir(this.root)).filter((name) => name.endsWith(".json"));
    const files = await Promise.all(names.map(async (name) => {
      const path = join(this.root, name);
      return { path, modifiedAt: (await stat(path)).mtimeMs };
    }));
    files.sort((a, b) => b.modifiedAt - a.modifiedAt);
    await Promise.all(files.map(async (file, index) => {
      if (index >= this.maxMessages || this.now() - file.modifiedAt > this.retentionMs) {
        await unlink(file.path).catch(() => {});
      }
    }));
  }
}
