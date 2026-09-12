import { createServer } from 'node:http';
const base = process.env.FUNCTIONS_URL?.replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!base || !secret) throw new Error('FUNCTIONS_URL and CRON_SECRET are required');
const tasks = ['ai-orchestrator', 'ai-sales-operations-dispatch', 'marketing-flow-worker', 'webhook-dispatcher', 'marketing-email-dispatch', 'welcome-email-dispatch', 'scheduling-reminder-dispatch', 'billing-usage-alerts', 'legal-communication-dispatch', 'legal-payment-dispatch', 'legal-judicial-dispatch', 'legal-assistance-dispatch'];
let stopped = false;
let lastTick = 0;
let results = {};
async function post(name, body = {}) {
  const response = await fetch(`${base}/${name}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000),
  });
  await response.arrayBuffer();
  return response.status;
}
async function tick() {
  for (const name of tasks) {
    if (stopped) break;
    const started = Date.now();
    let status = 0;
    try { status = await post(name, name === 'legal-judicial-dispatch' ? { action: 'dispatch', provider: 'escavador' } : name === 'legal-assistance-dispatch' ? { action: 'dispatch' } : {}); } catch { /* recorded below, never log provider data */ }
    results[name] = status;
    console.log(JSON.stringify({ worker: name, status, duration_ms: Date.now() - started }));
    try {
      await post('worker-heartbeat', { worker_key: name, worker_label: name, schedule: 'every 60s after cycle', started_at: new Date(started).toISOString(), finished_at: new Date().toISOString(), http_status: status, ok: status >= 200 && status < 300, duration_ms: Date.now() - started });
    } catch { console.error('Unable to persist worker heartbeat'); }
  }
  lastTick = Date.now();
  if (!stopped) setTimeout(tick, 60000);
}
const server = createServer((req, res) => {
  if (req.url !== '/health') { res.writeHead(404).end(); return; }
  const ok = Date.now() - (lastTick || startedAt) < 15 * 60 * 1000;
  res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok, lastTick, results }));
});
const startedAt = Date.now();
server.listen(Number(process.env.PORT || 8080), '::');
void tick();
process.on('SIGTERM', () => { stopped = true; server.close(); setTimeout(() => process.exit(0), 5000).unref(); });
