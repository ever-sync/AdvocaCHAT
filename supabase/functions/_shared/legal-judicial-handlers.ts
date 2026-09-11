import { type PortalAdmin, PortalError, portalFailure, portalFields, portalId, portalMethod, portalReply, portalRpc, portalUser, portalUuid } from "./legal-portal.ts";
import { type JudicialBinding, type JudicialConfig, type JudicialEnvelope, type JudicialEnvironment, type JudicialJob, type JudicialRecord, type JudicialRequest, judicialBinding, judicialBytes, judicialCallbackEnvelope, judicialCnj, judicialConfig, judicialCursor, judicialFetch, judicialIdentifier, judicialJson, judicialNextPage, judicialObject, judicialPageEnvelope, judicialRequest, validJudicialCallback, validJudicialSecret } from "./legal-judicial.ts";

type FinishStatus = "succeeded" | "retryable_error" | "rate_limited" | "quota_exhausted" | "permanent_error" | "unknown";
type Attempt = { allowed: boolean; max_response_bytes: number; reason?: string };
type JudicialRuntime = { fetcher?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number; now?: () => number; deadline?: number };
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function bounded<T>(work: () => Promise<T>, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw new PortalError(503, "Tempo de execução esgotado.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PortalError(503, "Resultado da operação ainda não confirmado.")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}

async function ingest(admin: PortalAdmin, binding: JudicialBinding, envelope: JudicialEnvelope) {
  await portalRpc(admin, "legal_judicial_service_ingest", {
    p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_provider: binding.provider,
    p_event_id: envelope.eventId, p_raw_original: envelope.raw, p_payload: envelope.payload,
  });
}
function monitorIdentity(job: JudicialJob, value: JudicialRecord): string | null {
  const row = value.monitoramento ? judicialObject(value.monitoramento) : value;
  const id = judicialIdentifier(row.id); if (!id || !/^\d+$/.test(id)) return null;
  if (job.operation === "monitor_process" && judicialCnj(row.numero) !== judicialCnj(job.query.cnj)) return null;
  if (job.operation === "monitor_diary" && (row.termo !== job.query.term || String(row.tipo).toLowerCase() !== "termo")) return null;
  if (job.operation === "reconcile_monitor" && id !== String(job.query.provider_monitor_id)) return null;
  return id;
}
export async function runJudicialJob(admin: PortalAdmin, config: JudicialConfig, job: JudicialJob, runtime: JudicialRuntime = {}): Promise<string> {
  if (!portalUuid.test(job.id) || !portalUuid.test(job.lease_token) || job.connection?.provider !== config.provider || job.connection.account_id !== config.accountId) throw new PortalError(503, "Vínculo da fila indisponível.");
  const now = runtime.now ?? (() => performance.now());
  const deadline = runtime.deadline ?? now() + 30000;
  const remainingTime = () => deadline - now();
  const finish = async (status: FinishStatus, payload: JudicialRecord = {}) => {
    await bounded(() => portalRpc(admin, "legal_judicial_service_finish", { p_job_id: job.id, p_lease_token: job.lease_token, p_status: status, p_payload: payload }), Math.min(3000, remainingTime()));
    return status;
  };
  // There is no documented sandbox transport here. Test doubles only exist in injected unit tests.
  if (job.connection.environment !== "production") return await finish("permanent_error", { error_code: "unsupported_environment" });
  if (!Number.isSafeInteger(job.max_requests) || job.max_requests < 1 || job.max_requests > 5 || !Number.isSafeInteger(job.request_count) || job.request_count < 0 || job.request_count >= job.max_requests) return await finish("quota_exhausted", { error_code: "request_budget_exhausted" });
  let request: JudicialRequest;
  try { request = judicialRequest(job); } catch { return await finish("permanent_error", { error_code: "invalid_operation_query" }); }
  const initial = new URL(request.url); const seen = new Set<string>();
  const remaining = job.max_requests - job.request_count;
  let calls = 0; let retries = 0; let items = 0;
  const stopForTime = () => finish(request.method === "POST" ? "unknown" : items ? "succeeded" : "retryable_error", { error_code: "execution_budget", items_count: items, ...(request.method === "GET" && ["read_updates", "discover_oab"].includes(job.operation) ? { next_cursor: judicialCursor(request.url) } : {}) });
  for (;;) {
    if (remainingTime() <= 6000) return await stopForTime();
    const allowed = await bounded(() => portalRpc<Attempt>(admin, "legal_judicial_service_authorize_attempt", { p_job_id: job.id, p_lease_token: job.lease_token, p_expected_tenant_id: config.tenantId, p_account_id: config.accountId }), Math.min(3000, remainingTime() - 3000));
    // The SQL gate persists the denial. It may revoke the lease; never overwrite that result.
    if (allowed?.allowed !== true || allowed.max_response_bytes !== 1048576) return "authorization_denied";
    if (remainingTime() <= 6000) return await stopForTime();
    calls++;
    const response = await judicialFetch(config, request, runtime.fetcher ?? fetch, Math.min(runtime.timeoutMs ?? 5000, 5000, remainingTime() - 5000));
    if (!response.ok) {
      if (response.retryable && retries < 1 && calls < remaining) { retries++; await (runtime.sleep ?? defaultSleep)(500); continue; }
      const status: FinishStatus = response.ambiguous ? "unknown" : response.error === "rate_limited" ? "rate_limited" : response.error === "quota_exhausted" ? "quota_exhausted" : response.retryable ? "retryable_error" : "permanent_error";
      const cursor = judicialCursor(request.url);
      return await finish(status, { error_code: response.error, items_count: items, ...(Object.keys(cursor).length ? { next_cursor: cursor } : {}) });
    }
    if (remainingTime() <= 4000) return await stopForTime();
    await bounded(async () => await ingest(admin, config, await judicialPageEnvelope(response.raw, response.value, job, request.url)), Math.min(3000, remainingTime() - 2000));
    if (request.method === "POST" || job.operation === "reconcile_monitor") {
      let id: string | null;
      try { id = monitorIdentity(job, response.value); } catch { id = null; }
      if (!id) return await finish(request.method === "POST" ? "unknown" : "permanent_error", { error_code: "monitor_response_mismatch" });
      return await finish("succeeded", { provider_monitor_id: id, monitor_kind: job.operation === "monitor_diary" ? "diary" : job.operation === "reconcile_monitor" ? job.query.monitor_kind : "process", items_count: 1 });
    }
    if (job.operation === "consult_cnj") {
      if (judicialCnj(response.value.numero_cnj) !== judicialCnj(job.query.cnj)) return await finish("permanent_error", { error_code: "process_response_mismatch" });
      return await finish("succeeded", { items_count: 1 });
    }
    if (!Array.isArray(response.value.items) || response.value.items.length > 100) return await finish("permanent_error", { error_code: "invalid_page_shape" });
    items += response.value.items.length;
    let next: URL | null;
    try { next = judicialNextPage(response.value, request.url, initial); } catch { return await finish("permanent_error", { error_code: "unsafe_pagination", items_count: items }); }
    seen.add(request.url.href);
    if (!next) return await finish("succeeded", { items_count: items });
    if (seen.has(next.href)) return await finish("permanent_error", { error_code: "pagination_cycle", items_count: items });
    if (calls >= remaining) return await finish("succeeded", { items_count: items, next_cursor: judicialCursor(next) });
    request = { ...request, url: next }; retries = 0;
  }
}

function provider(value: unknown): "escavador" | "datajud" {
  if (value !== "escavador" && value !== "datajud") throw new PortalError(400, "Fonte inválida.");
  return value;
}
function limits(value: unknown) {
  const v = judicialObject(value); portalFields(v, ["environment", "requests_per_minute", "requests_per_day"]);
  if (v.environment !== "production" || !Number.isSafeInteger(v.requests_per_minute) || Number(v.requests_per_minute) < 1 || Number(v.requests_per_minute) > 120 || !Number.isSafeInteger(v.requests_per_day) || Number(v.requests_per_day) < 1 || Number(v.requests_per_day) > 10000) throw new PortalError(400, "Limites ou ambiente inválidos.");
  return v;
}
export function createLegalJudicialDispatchHandler(createAdmin: () => PortalAdmin, env: JudicialEnvironment, runtime: JudicialRuntime = {}) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    try {
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PortalError(415, "Envie uma solicitação JSON.");
      let body: JudicialRecord;
      try { body = judicialJson(await judicialBytes(request.body, 4096, 4000)).value; } catch { throw new PortalError(400, "Requisição inválida ou muito grande."); }
      const selected = provider(body.provider);
      const binding = judicialBinding(env, selected);
      if (body.action === "configure") {
        portalFields(body, ["action", "provider", "source_version_id", "enabled", "limits"]);
        const admin = createAdmin(); const user = await portalUser(admin, request, "staff");
        if (!binding) throw new PortalError(409, "A conta da fonte ainda não está vinculada no servidor.");
        if (typeof body.enabled !== "boolean") throw new PortalError(400, "Configuração inválida.");
        const sourceId = portalId(body.source_version_id);
        const source = await admin.from("legal_judicial_source_versions").select("provider,tenant_id").eq("id", sourceId).maybeSingle();
        if (source.error || source.data?.provider !== binding.provider || source.data?.tenant_id !== binding.tenantId) throw new PortalError(403, "Fonte indisponível para esta conta.");
        const connection = await portalRpc(admin, "legal_judicial_service_configure", { p_actor_id: user.id, p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_source_version_id: sourceId, p_enabled: body.enabled, p_limits: limits(body.limits) });
        return portalReply({ connection });
      }
      if (!validJudicialSecret(request.headers.get("x-cron-secret"), env("CRON_SECRET"))) throw new PortalError(401, "Acesso não autorizado.");
      portalFields(body, ["action", "provider"]);
      if (body.action !== "dispatch") throw new PortalError(400, "Ação inválida.");
      if (!binding) return portalReply({ configured: false, status: selected === "datajud" ? "permission_required" : "not_configured", processed: 0 });
      const config = judicialConfig(env, binding); const admin = createAdmin();
      const now = runtime.now ?? (() => performance.now()); const deadline = now() + 30000;
      const jobs = await bounded(() => portalRpc<JudicialJob[]>(admin, "legal_judicial_service_claim", { p_expected_tenant_id: binding.tenantId, p_account_id: binding.accountId, p_provider: selected, p_configured: !!config, p_limit: 1 }), 3000);
      if (!config) return portalReply({ configured: false, status: selected === "datajud" ? "permission_required" : "not_configured", processed: 0 });
      if (!Array.isArray(jobs) || jobs.length > 1) throw new PortalError(503, "Fila indisponível.");
      const results: Record<string, number> = {};
      for (const job of jobs) { const result = await runJudicialJob(admin, config, job, { ...runtime, now, deadline }); results[result] = (results[result] ?? 0) + 1; }
      return portalReply({ configured: true, processed: jobs.length, results });
    } catch (error) { return portalFailure(error); }
  };
}

export function createLegalJudicialWebhookHandler(createAdmin: () => PortalAdmin, env: JudicialEnvironment) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return portalReply({ error: "Método não permitido." }, 405);
    try {
      const binding = judicialBinding(env, "escavador");
      if (!binding || !validJudicialCallback(request, env)) throw new PortalError(401, "Acesso não autorizado.");
      if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PortalError(415, "Evento JSON necessário.");
      let parsed: { raw: string; value: JudicialRecord };
      try { parsed = judicialJson(await judicialBytes(request.body)); } catch { throw new PortalError(400, "Evento inválido ou muito grande."); }
      await bounded(async () => await ingest(createAdmin(), binding, await judicialCallbackEnvelope(parsed.raw, parsed.value)), 5000);
      return portalReply({ received: true });
    } catch (error) { return portalFailure(error); }
  };
}
