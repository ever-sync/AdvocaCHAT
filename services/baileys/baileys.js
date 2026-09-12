import crypto from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { WebhookOutbox } from "./webhook-outbox.js";

const sessionsRoot = process.env.BAILEYS_SESSIONS_PATH || join(process.cwd(), ".baileys-sessions");
const adminToken = process.env.BAILEYS_ADMIN_TOKEN || "";
const sessions = new Map();

function safeName(value) {
  const name = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/i.test(name)) throw new Error("Nome de instancia invalido.");
  return name;
}

function sessionDir(name) {
  return join(sessionsRoot, safeName(name));
}

async function readMeta(name) {
  return JSON.parse(await readFile(join(sessionDir(name), "advocachat.json"), "utf8"));
}

async function writeMeta(name, meta) {
  await mkdir(sessionDir(name), { recursive: true });
  await writeFile(join(sessionDir(name), "advocachat.json"), JSON.stringify(meta, null, 2), { mode: 0o600 });
}

async function findByToken(token) {
  if (!token) return null;
  await mkdir(sessionsRoot, { recursive: true });
  for (const entry of await readdir(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const meta = await readMeta(entry.name);
      if (meta.token === token) return { name: entry.name, meta };
    } catch { /* incomplete directory */ }
  }
  return null;
}

async function emitWebhook(runtime, payload) {
  if (runtime.deleted) return;
  await runtime.outbox.enqueue(payload);
  void runtime.outbox.flush(runtime.meta.webhookUrl).catch(() => console.error("[baileys] outbox unavailable"));
}

async function startSession(name) {
  const existing = sessions.get(name);
  if (existing?.socket && existing.status !== "closed") return existing;

  const meta = await readMeta(name);
  const runtime = existing || { name, meta, socket: null, status: "connecting", qr: null, phone: null, reconnecting: false };
  runtime.meta = meta;
  runtime.stopping = false;
  runtime.outbox ||= new WebhookOutbox(join(sessionDir(name), "outbox"));
  runtime.status = "connecting";
  sessions.set(name, runtime);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(name));
  const { version } = await fetchLatestBaileysVersion();
  runtime.logger = runtime.logger || {
    child: () => runtime.logger,
    trace() {}, debug() {}, info() {}, warn: console.warn, error: console.error, fatal: console.error,
  };
  const socket = makeWASocket({
    auth: state,
    version,
    browser: Browsers.macOS("AdvocaCHAT"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    logger: runtime.logger,
  });
  runtime.socket = socket;

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      runtime.qr = await QRCode.toDataURL(qr, { margin: 1, width: 420 });
      runtime.status = "connecting";
      await emitWebhook(runtime, { event: "qrcode.updated", qrcode: runtime.qr });
    }
    if (connection === "open") {
      runtime.status = "open";
      runtime.qr = null;
      runtime.phone = socket.user?.id?.split(":")[0] || socket.user?.id?.split("@")[0] || null;
      await emitWebhook(runtime, { event: "connection.update", status: "open", number: runtime.phone });
    }
    if (connection === "close") {
      runtime.status = "closed";
      runtime.socket = null;
      const code = lastDisconnect?.error?.output?.statusCode;
      await emitWebhook(runtime, { event: "connection.update", status: "disconnected" });
      if (!runtime.stopping && code !== DisconnectReason.loggedOut && !runtime.reconnecting) {
        runtime.reconnecting = true;
        setTimeout(() => {
          runtime.reconnecting = false;
          if (!runtime.stopping) startSession(name).catch(() => console.error("[baileys] reconnect failed"));
        }, 3000);
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages }) => {
    const enriched = await Promise.all(messages.map(async (message) => {
      if (message.key?.fromMe) return message;
      const sender = message.key?.senderPn || message.key?.remoteJidAlt || message.key?.remoteJid;
      const imagePreview = sender ? await profilePictureUrl(runtime, sender) : null;
      return imagePreview ? { ...message, imagePreview } : message;
    }));
    await emitWebhook(runtime, { event: "messages.upsert", messages: enriched });
  });
  socket.ev.on("messages.update", async (updates) => {
    for (const item of updates) {
      const receipt = item.update?.status;
      await emitWebhook(runtime, {
        event: "messages.update",
        state: receipt === 4 ? "read" : receipt === 3 ? "delivered" : "sent",
        MessageIDs: item.key?.id ? [item.key.id] : [],
      });
    }
  });
  return runtime;
}

function statePayload(runtime) {
  const connected = runtime?.status === "open";
  return {
    name: runtime?.name,
    status: { connected, loggedIn: connected, jid: runtime?.socket?.user?.id || null },
    instance: { name: runtime?.name, status: runtime?.status || "disconnected", owner: runtime?.phone, qrcode: runtime?.qr },
    qrcode: runtime?.qr,
  };
}

async function requireSession(req, res) {
  const found = await findByToken(String(req.get("token") || ""));
  if (!found) {
    res.status(401).json({ error: "Token da instancia invalido." });
    return null;
  }
  return startSession(found.name);
}

function jid(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) throw new Error("Numero de WhatsApp invalido.");
  return `${digits}@s.whatsapp.net`;
}

async function profilePictureUrl(runtime, number) {
  try {
    return await runtime.socket.profilePictureUrl(jid(number), "image");
  } catch {
    return null;
  }
}

async function outgoingContent(body) {
  const type = body.type || "document";
  if (type === "image") return { image: { url: body.file }, caption: body.text || "", mimetype: body.mimeType };
  if (type === "video") return { video: { url: body.file }, caption: body.text || "", mimetype: body.mimeType };
  if (type === "audio") return { audio: { url: body.file }, mimetype: body.mimeType || "audio/ogg; codecs=opus", ptt: Boolean(body.ptt) };
  return { document: { url: body.file }, caption: body.text || "", fileName: body.fileName || "arquivo", mimetype: body.mimeType || "application/octet-stream" };
}

export async function installBaileysRoutes(app) {
  await mkdir(sessionsRoot, { recursive: true });
  app.get("/baileys/health", (_req, res) => res.json({ ok: true, provider: "baileys", sessions: sessions.size }));
  const deliveryTimer = setInterval(() => {
    for (const runtime of sessions.values()) {
      void runtime.outbox?.flush(runtime.meta.webhookUrl).catch(() => console.error("[baileys] outbox unavailable"));
    }
  }, 5000);
  deliveryTimer.unref();

  app.post("/baileys/instance/init", async (req, res) => {
    if (!adminToken || req.get("admintoken") !== adminToken) return res.status(401).json({ error: "BAILEYS_ADMIN_TOKEN invalido." });
    try {
      const name = safeName(req.body?.Name || req.body?.instanceName);
      const token = crypto.randomBytes(32).toString("hex");
      await writeMeta(name, { token, webhookUrl: null, createdAt: new Date().toISOString() });
      const runtime = await startSession(name);
      res.json({ name, token, ...statePayload(runtime) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });

  app.all("/baileys/instance/status", async (req, res) => {
    const runtime = await requireSession(req, res); if (runtime) res.json(statePayload(runtime));
  });
  app.post("/baileys/instance/connect", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    for (let i = 0; i < 20 && !runtime.qr && runtime.status !== "open"; i += 1) await delay(250);
    res.json(statePayload(runtime));
  });
  app.post("/baileys/webhook", async (req, res) => {
    const found = await findByToken(String(req.get("token") || ""));
    if (!found) return res.status(401).json({ error: "Token da instancia invalido." });
    found.meta.webhookUrl = String(req.body?.url || "");
    await writeMeta(found.name, found.meta);
    const runtime = sessions.get(found.name);
    if (runtime) {
      runtime.meta = found.meta;
      void runtime.outbox.flush(found.meta.webhookUrl).catch(() => console.error("[baileys] outbox unavailable"));
    }
    res.json({ enabled: Boolean(found.meta.webhookUrl), url: found.meta.webhookUrl });
  });
  app.get("/baileys/webhook", async (req, res) => {
    const found = await findByToken(String(req.get("token") || ""));
    if (!found) return res.status(401).json({ error: "Token da instancia invalido." });
    res.json({ enabled: Boolean(found.meta.webhookUrl), url: found.meta.webhookUrl });
  });

  app.post("/baileys/chat/onWhatsapp", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    const numbers = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
    const result = await Promise.all(numbers.map(async (number) => ({ number, exists: Boolean((await runtime.socket.onWhatsApp(String(number)))[0]?.exists) })));
    res.json(result);
  });
  app.post("/baileys/chat/profile-picture", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    res.json({ url: await profilePictureUrl(runtime, req.body?.number) });
  });
  app.post("/baileys/send/text", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    try {
      if (req.body?.delay) { await runtime.socket.sendPresenceUpdate("composing", jid(req.body.number)); await delay(Math.min(Number(req.body.delay), 10000)); }
      const sent = await runtime.socket.sendMessage(jid(req.body.number), { text: String(req.body?.text || "") });
      res.json(sent);
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post("/baileys/send/media", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    try { res.json(await runtime.socket.sendMessage(jid(req.body.number), await outgoingContent(req.body))); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post("/baileys/send/location", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    try { res.json(await runtime.socket.sendMessage(jid(req.body.number), { location: { degreesLatitude: Number(req.body.latitude), degreesLongitude: Number(req.body.longitude), name: req.body.name, address: req.body.address } })); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post("/baileys/send/contact", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    try { res.json(await runtime.socket.sendMessage(jid(req.body.number), { contacts: { displayName: req.body.displayName || "Contato", contacts: req.body.contacts || [] } })); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post("/baileys/send/menu", async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    try { res.json(await runtime.socket.sendMessage(jid(req.body.number), { text: String(req.body.text || "") })); }
    catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post("/baileys/chat/find", async (req, res) => { const runtime = await requireSession(req, res); if (runtime) res.json({ data: [] }); });
  app.post("/baileys/message/find", async (req, res) => { const runtime = await requireSession(req, res); if (runtime) res.json({ data: [] }); });
  app.all(["/baileys/instance/logout", "/baileys/instance/disconnect"], async (req, res) => {
    const runtime = await requireSession(req, res); if (!runtime) return;
    runtime.stopping = true;
    try { runtime.socket?.end(undefined); } catch { /* already closed */ }
    runtime.status = "closed"; runtime.socket = null; res.json({ success: true });
  });
  app.all("/baileys/instance/delete", async (req, res) => {
    const found = await findByToken(String(req.get("token") || ""));
    if (!found) return res.status(401).json({ error: "Token da instancia invalido." });
    const runtime = sessions.get(found.name);
    if (runtime) { runtime.stopping = true; runtime.deleted = true; }
    try { await runtime?.socket?.logout(); } catch { /* best effort */ }
    sessions.delete(found.name);
    await rm(sessionDir(found.name), { recursive: true, force: true });
    res.json({ success: true });
  });

  for (const entry of await readdir(sessionsRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) startSession(entry.name).catch((error) => console.error(`[baileys] restore ${entry.name} failed`, error));
  }
}
