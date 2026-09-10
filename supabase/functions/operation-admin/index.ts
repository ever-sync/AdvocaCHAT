// Cockpit super-admin de operacao: saude de tenants, canais, IA, automacoes,
// webhooks e billing. Somente platform_admins.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { recordPlatformAudit } from "../_shared/platform-audit.ts";
import { createAdminClient, getFunctionsBaseUrl, requireTenantContext } from "../_shared/supabase.ts";

const METRICS = [
  "customers",
  "whatsapp_instances",
  "users",
  "ai_monthly_tokens",
  "marketing_flow_runs_monthly",
  "storage_gb",
] as const;

const BLOCKED_BILLING = new Set(["past_due", "paused", "canceled", "incomplete"]);

type Admin = ReturnType<typeof createAdminClient>;

type TenantRow = {
  id: string;
  nome: string | null;
  created_at: string | null;
};

type TenantHealth = {
  tenant_id: string;
  nome: string;
  created_at: string | null;
  severity: "ok" | "warning" | "critical";
  issues: string[];
  billing: {
    plan_id: string | null;
    status: string | null;
    billing_period: string | null;
    current_period_end: string | null;
  };
  channels: {
    total: number;
    connected: number;
    connecting: number;
    disconnected: number;
    error: number;
    stale_sync: number;
  };
  ai: {
    pending: number;
    processing: number;
    stale_processing: number;
    errors_24h: number;
  };
  automations: {
    queued_due: number;
    running: number;
    stale_running: number;
    failed_24h: number;
    dead_24h: number;
  };
  webhooks: {
    pending_due: number;
    errors_24h: number;
    success_24h: number;
  };
  usage: Array<{ metric: string; used: number; limit_value: number | null; exceeded: boolean }>;
};

type WorkerHealth = {
  id: string;
  label: string;
  schedule: string;
  severity: "ok" | "warning" | "critical";
  status: string;
  last_seen: string | null;
  pending: number;
  running: number;
  errors_24h: number;
  details: string[];
};

type WorkerAlert = {
  id: string;
  worker_key: string;
  worker_label: string | null;
  alert_type: "failure" | "stale";
  severity: "warning" | "critical";
  period: string;
  last_http_status: number | null;
  consecutive_failures: number;
  summary: string;
  sent_at: string | null;
  created_at: string;
};

type WorkerRun = {
  id: string;
  worker_key: string;
  worker_label: string | null;
  schedule: string | null;
  started_at: string;
  finished_at: string;
  http_status: number | null;
  ok: boolean;
  duration_ms: number | null;
  response_excerpt: string | null;
  error_excerpt: string | null;
  created_at: string;
};

function inc(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function key(tenantId: string, suffix: string) {
  return `${tenantId}:${suffix}`;
}

function nowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function countRows(rows: Array<Record<string, unknown>> | null | undefined, predicate: (row: Record<string, unknown>) => boolean) {
  return (rows ?? []).filter(predicate).length;
}

function latestTimestamp(rows: Array<Record<string, unknown>> | null | undefined, field: string) {
  const values = (rows ?? [])
    .map((row) => (typeof row[field] === "string" ? String(row[field]) : null))
    .filter(Boolean)
    .sort()
    .reverse();
  return values[0] ?? null;
}

function workerSeverity(input: { pending?: number; running?: number; stale?: number; errors?: number; heartbeatStale?: boolean }) {
  if ((input.stale ?? 0) > 0 || (input.errors ?? 0) > 0 || input.heartbeatStale) return "critical" as const;
  if ((input.pending ?? 0) > 0 || (input.running ?? 0) > 0) return "warning" as const;
  return "ok" as const;
}

function workerStatus(severity: WorkerHealth["severity"]) {
  if (severity === "critical") return "Precisa de atencao";
  if (severity === "warning") return "Com fila";
  return "Operando";
}

async function requirePlatformAdmin(request: Request) {
  const ctx = await requireTenantContext(request);
  const admin = createAdminClient();
  const { data: isAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!isAdmin) {
    throw new Error("Acesso restrito ao administrador da plataforma.");
  }

  return { ...ctx, admin };
}

async function usageForTenant(admin: Admin, tenantId: string) {
  return await Promise.all(
    METRICS.map(async (metric) => {
      const [{ data: used }, { data: limit }] = await Promise.all([
        admin.rpc("get_tenant_current_usage", { p_tenant_id: tenantId, p_metric: metric }),
        admin.rpc("get_tenant_plan_limit", { p_tenant_id: tenantId, p_metric: metric }),
      ]);
      const numericUsed = Number(used ?? 0);
      const numericLimit = limit === null || limit === undefined ? null : Number(limit);
      return {
        metric,
        used: numericUsed,
        limit_value: numericLimit,
        exceeded: numericLimit !== null && numericUsed > numericLimit,
      };
    }),
  );
}

function actionSummary(action: string, affected: number) {
  switch (action) {
    case "refresh_usage":
      return "Uso do plano atualizado";
    case "retry_webhooks":
      return `${affected} webhook(s) reaberto(s) para retry`;
    case "unlock_ai_jobs":
      return `${affected} job(s) de IA destravado(s)`;
    case "unlock_automation_jobs":
      return `${affected} job(s) de automacao destravado(s)`;
    case "recheck_workers":
      return `${affected} worker(s) rechecado(s)`;
    default:
      return `Acao operacional ${action}`;
  }
}

async function auditOperationAction(
  admin: Admin,
  request: Request,
  ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>,
  tenantId: string,
  action: string,
  affected: number,
  metadata: Record<string, unknown> = {},
) {
  await recordPlatformAudit(admin, {
    tenantId,
    actor: { userId: ctx.userId, role: ctx.role },
    entityType: "operation_job",
    entityId: action,
    summary: actionSummary(action, affected),
    changes: { affected: { from: null, to: affected } },
    metadata: { source: "operation-admin", action, affected, ...metadata },
    request,
  });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  let ctx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    ctx = await requirePlatformAdmin(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized.";
    return jsonResponse({ error: message }, message.includes("restrito") ? 403 : 401);
  }

  const admin = ctx.admin;
  const staleAi = nowMinus(10);
  const staleFlow = nowMinus(15);
  const nowIso = new Date().toISOString();

  if (request.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "JSON invalido." }, 400);
    }

    const action = String(body.action ?? "").trim();
    const tenantId = String(body.tenant_id ?? "").trim();
    const auditTenantId = tenantId || ctx.tenantId;

    if (action !== "recheck_workers" && !tenantId) return jsonResponse({ error: "tenant_id obrigatorio." }, 400);

    if (action === "refresh_usage") {
      const { error } = await admin.rpc("refresh_current_billing_usage", { p_tenant_id: tenantId });
      if (error) return jsonResponse({ error: error.message }, 500);
      await auditOperationAction(admin, request, ctx, tenantId, action, 1);
      return jsonResponse({ ok: true, action, affected: 1 });
    }

    if (action === "retry_webhooks") {
      const { data, error } = await admin
        .from("webhook_deliveries")
        .update({
          status: "pending",
          attempts: 0,
          response_status: null,
          last_error: null,
          next_attempt_at: nowIso,
        })
        .eq("tenant_id", tenantId)
        .eq("status", "error")
        .select("id");
      if (error) return jsonResponse({ error: error.message }, 500);
      const affected = data?.length ?? 0;
      await auditOperationAction(admin, request, ctx, tenantId, action, affected, {
        delivery_ids: (data ?? []).map((row) => row.id),
      });
      return jsonResponse({ ok: true, action, affected });
    }

    if (action === "unlock_ai_jobs") {
      const { data, error } = await admin
        .from("ai_jobs")
        .update({
          status: "pending",
          run_after: nowIso,
          updated_at: nowIso,
        })
        .eq("tenant_id", tenantId)
        .eq("status", "processing")
        .lt("updated_at", staleAi)
        .select("id");
      if (error) return jsonResponse({ error: error.message }, 500);
      const affected = data?.length ?? 0;
      await auditOperationAction(admin, request, ctx, tenantId, action, affected, {
        job_ids: (data ?? []).map((row) => row.id),
      });
      return jsonResponse({ ok: true, action, affected });
    }

    if (action === "unlock_automation_jobs") {
      const { data, error } = await admin
        .from("marketing_flow_jobs")
        .update({
          status: "queued",
          run_at: nowIso,
          locked_at: null,
          locked_by: null,
          last_error: "Destravado pelo admin de operacao",
          updated_at: nowIso,
        })
        .eq("tenant_id", tenantId)
        .eq("status", "running")
        .lt("locked_at", staleFlow)
        .select("id");
      if (error) return jsonResponse({ error: error.message }, 500);
      const affected = data?.length ?? 0;
      await auditOperationAction(admin, request, ctx, tenantId, action, affected, {
        job_ids: (data ?? []).map((row) => row.id),
      });
      return jsonResponse({ ok: true, action, affected });
    }

    if (action === "recheck_workers") {
      const cronSecret = Deno.env.get("CRON_SECRET");
      if (!cronSecret) {
        return jsonResponse({ error: "CRON_SECRET ausente." }, 500);
      }

      const response = await fetch(`${getFunctionsBaseUrl()}/worker-alerts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": cronSecret,
        },
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === "object" && payload ? String((payload as Record<string, unknown>).error ?? `HTTP ${response.status}`) : `HTTP ${response.status}`;
        return jsonResponse({ error: message }, response.status);
      }

      const evaluated = Number((payload as Record<string, unknown> | null)?.evaluated ?? 0);
      const inserted = Number((payload as Record<string, unknown> | null)?.inserted ?? 0);
      const sent = Number((payload as Record<string, unknown> | null)?.sent ?? 0);

      await auditOperationAction(admin, request, ctx, auditTenantId, action, evaluated, {
        target: "workers",
        evaluated,
        inserted,
        sent,
        response: payload,
      });

      return jsonResponse({
        ok: true,
        action,
        affected: evaluated,
        message: `Rechecagem concluida: ${evaluated} worker(s) avaliados, ${inserted} alerta(s) criado(s), ${sent} e-mail(s) enviados.`,
        details: payload ?? {},
      });
    }

    return jsonResponse({ error: "Acao invalida." }, 400);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.get("view") === "access") {
    return jsonResponse({ ok: true, isPlatformAdmin: true });
  }

  if (url.searchParams.get("view") === "tenants") {
    const { data, error } = await admin.from("tenants").select("id, nome, cnpj, created_at").order("nome", { ascending: true });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({
      generated_at: new Date().toISOString(),
      tenants: (data ?? []).map((row) => ({
        tenant_id: row.id,
        nome: row.nome,
        cnpj: row.cnpj ?? null,
        created_at: row.created_at,
      })),
    });
  }

  if (url.searchParams.get("view") === "audit") {
    const tenantId = url.searchParams.get("tenant_id")?.trim() || null;
    const entityType = url.searchParams.get("entity_type")?.trim() || null;
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 80)));

    let query = admin
      .from("audit_logs")
      .select("id, tenant_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, changes, metadata, ip, user_agent, created_at, tenants(nome)")
      .eq("action", "platform_admin_action")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (entityType) query = query.eq("entity_type", entityType);

    const { data, error } = await query;
    if (error) return jsonResponse({ error: error.message }, 500);

    const entries = (data ?? []).map((row: Record<string, unknown>) => {
      const tenant = row.tenants as Record<string, unknown> | null;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        tenant_name: typeof tenant?.nome === "string" ? tenant.nome : "Tenant",
        actor_id: row.actor_id,
        actor_name: row.actor_name,
        actor_role: row.actor_role,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        summary: row.summary,
        changes: row.changes ?? {},
        metadata: row.metadata ?? {},
        ip: row.ip,
        user_agent: row.user_agent,
        created_at: row.created_at,
      };
    });

    return jsonResponse({ generated_at: new Date().toISOString(), entries });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const staleSync = nowMinus(60);

  const [
    tenantsRes,
    billingRes,
    channelsRes,
    aiJobsRes,
    flowJobsRes,
    webhookDeliveriesRes,
    flowHeartbeatRes,
    platformWorkerHeartbeatsRes,
    platformWorkerRunsRes,
    workerAlertsRes,
    emailDispatchesRes,
    welcomeDispatchesRes,
    adDispatchesRes,
    aiAlertsRes,
  ] = await Promise.all([
    admin.from("tenants").select("id, nome, created_at").order("nome", { ascending: true }),
    admin.from("billing_subscriptions").select("tenant_id, plan_id, status, billing_period, current_period_end"),
    admin.from("whatsapp_instances").select("tenant_id, status, last_sync_at, archived_at").is("archived_at", null),
    admin
      .from("ai_jobs")
      .select("tenant_id, status, updated_at, created_at")
      .or(`status.in.(pending,processing),and(status.eq.error,updated_at.gte.${since24h})`),
    admin
      .from("marketing_flow_jobs")
      .select("tenant_id, status, run_at, updated_at, locked_at")
      .or(`status.in.(queued,running),and(status.in.(failed,dead),updated_at.gte.${since24h})`),
    admin
      .from("webhook_deliveries")
      .select("tenant_id, status, next_attempt_at, created_at, delivered_at")
      .or(`and(status.eq.pending,next_attempt_at.lte.${nowIso}),and(status.eq.error,created_at.gte.${since24h}),and(status.eq.success,created_at.gte.${since24h})`),
    admin
      .from("marketing_flow_worker_heartbeats")
      .select("worker_key, worker_id, last_seen, claimed")
      .order("last_seen", { ascending: false })
      .limit(1),
    admin
      .from("platform_worker_heartbeats")
      .select("worker_key, worker_label, schedule, last_started_at, last_finished_at, last_success_at, last_failure_at, last_http_status, last_ok, consecutive_failures, duration_ms, response_excerpt, error_excerpt, metadata"),
    admin
      .from("platform_worker_runs")
      .select("id, worker_key, worker_label, schedule, started_at, finished_at, http_status, ok, duration_ms, response_excerpt, error_excerpt, created_at")
      .order("created_at", { ascending: false })
      .limit(24),
    admin
      .from("platform_worker_alerts")
      .select("id, worker_key, worker_label, alert_type, severity, period, last_http_status, consecutive_failures, summary, sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("marketing_email_dispatches")
      .select("tenant_id, status, next_attempt_at, updated_at, created_at")
      .or(`and(status.in.(queued,retrying),next_attempt_at.lte.${nowIso}),and(status.eq.failed,updated_at.gte.${since24h})`),
    admin
      .from("welcome_email_dispatches")
      .select("tenant_id, status, next_attempt_at, updated_at, created_at")
      .or(`and(status.in.(queued,retrying),next_attempt_at.lte.${nowIso}),and(status.eq.failed,updated_at.gte.${since24h})`),
    admin
      .from("marketing_ad_conversion_dispatches")
      .select("tenant_id, status, last_attempt_at, created_at")
      .or(`status.eq.pending,and(status.eq.failed,last_attempt_at.gte.${since24h})`),
    admin
      .from("ai_alerts")
      .select("tenant_id, created_at")
      .gte("created_at", since24h),
  ]);

  for (const result of [
    tenantsRes,
    billingRes,
    channelsRes,
    aiJobsRes,
    flowJobsRes,
    webhookDeliveriesRes,
    flowHeartbeatRes,
    platformWorkerHeartbeatsRes,
    platformWorkerRunsRes,
    workerAlertsRes,
    emailDispatchesRes,
    welcomeDispatchesRes,
    adDispatchesRes,
    aiAlertsRes,
  ]) {
    if (result.error) return jsonResponse({ error: result.error.message }, 500);
  }

  const billingByTenant = new Map<string, Record<string, unknown>>();
  for (const row of billingRes.data ?? []) billingByTenant.set(String(row.tenant_id), row);

  const counts = new Map<string, number>();

  for (const row of channelsRes.data ?? []) {
    const tenantId = String(row.tenant_id);
    const status = String(row.status ?? "unknown");
    inc(counts, key(tenantId, "channels_total"));
    inc(counts, key(tenantId, `channels_${status}`));
    if (!row.last_sync_at || String(row.last_sync_at) < staleSync) {
      inc(counts, key(tenantId, "channels_stale_sync"));
    }
  }

  for (const row of aiJobsRes.data ?? []) {
    const tenantId = String(row.tenant_id);
    const status = String(row.status ?? "");
    inc(counts, key(tenantId, `ai_${status}`));
    if (status === "processing" && String(row.updated_at ?? row.created_at ?? "") < staleAi) {
      inc(counts, key(tenantId, "ai_stale_processing"));
    }
  }

  for (const row of flowJobsRes.data ?? []) {
    const tenantId = String(row.tenant_id);
    const status = String(row.status ?? "");
    if (status === "queued" && String(row.run_at ?? "") <= nowIso) inc(counts, key(tenantId, "flow_queued_due"));
    if (status === "running") {
      inc(counts, key(tenantId, "flow_running"));
      if (String(row.locked_at ?? row.updated_at ?? "") < staleFlow) inc(counts, key(tenantId, "flow_stale_running"));
    }
    if (status === "failed") inc(counts, key(tenantId, "flow_failed_24h"));
    if (status === "dead") inc(counts, key(tenantId, "flow_dead_24h"));
  }

  for (const row of webhookDeliveriesRes.data ?? []) {
    const tenantId = String(row.tenant_id);
    const status = String(row.status ?? "");
    if (status === "pending") inc(counts, key(tenantId, "webhook_pending_due"));
    if (status === "error") inc(counts, key(tenantId, "webhook_errors_24h"));
    if (status === "success") inc(counts, key(tenantId, "webhook_success_24h"));
  }

  const flowHeartbeat = (flowHeartbeatRes.data ?? [])[0] as Record<string, unknown> | undefined;
  const flowLastSeen = typeof flowHeartbeat?.last_seen === "string" ? String(flowHeartbeat.last_seen) : null;
  const flowHeartbeatStale = !flowLastSeen || flowLastSeen < nowMinus(3);
  const flowQueuedDue = countRows(flowJobsRes.data, (row) => String(row.status ?? "") === "queued" && String(row.run_at ?? "") <= nowIso);
  const flowRunning = countRows(flowJobsRes.data, (row) => String(row.status ?? "") === "running");
  const flowStaleRunning = countRows(
    flowJobsRes.data,
    (row) => String(row.status ?? "") === "running" && String(row.locked_at ?? row.updated_at ?? "") < staleFlow,
  );
  const flowErrors = countRows(flowJobsRes.data, (row) => ["failed", "dead"].includes(String(row.status ?? "")));

  const aiPending = countRows(aiJobsRes.data, (row) => String(row.status ?? "") === "pending");
  const aiProcessing = countRows(aiJobsRes.data, (row) => String(row.status ?? "") === "processing");
  const aiStaleProcessing = countRows(
    aiJobsRes.data,
    (row) => String(row.status ?? "") === "processing" && String(row.updated_at ?? row.created_at ?? "") < staleAi,
  );
  const aiErrors = countRows(aiJobsRes.data, (row) => String(row.status ?? "") === "error");

  const webhookPending = countRows(webhookDeliveriesRes.data, (row) => String(row.status ?? "") === "pending");
  const webhookErrors = countRows(webhookDeliveriesRes.data, (row) => String(row.status ?? "") === "error");
  const webhookLastSuccess = latestTimestamp(webhookDeliveriesRes.data, "delivered_at");

  const emailPending = countRows(emailDispatchesRes.data, (row) => ["queued", "retrying"].includes(String(row.status ?? "")));
  const emailErrors = countRows(emailDispatchesRes.data, (row) => String(row.status ?? "") === "failed");
  const emailLastActivity = latestTimestamp(emailDispatchesRes.data, "updated_at") ?? latestTimestamp(emailDispatchesRes.data, "created_at");

  const welcomePending = countRows(welcomeDispatchesRes.data, (row) => ["queued", "retrying"].includes(String(row.status ?? "")));
  const welcomeErrors = countRows(welcomeDispatchesRes.data, (row) => String(row.status ?? "") === "failed");
  const welcomeLastActivity = latestTimestamp(welcomeDispatchesRes.data, "updated_at") ?? latestTimestamp(welcomeDispatchesRes.data, "created_at");
  const emailCombinedPending = emailPending + welcomePending;
  const emailCombinedErrors = emailErrors + welcomeErrors;
  const emailCombinedLastActivity = [emailLastActivity, welcomeLastActivity].filter(Boolean).sort().slice(-1)[0] ?? null;

  const adPending = countRows(adDispatchesRes.data, (row) => String(row.status ?? "") === "pending");
  const adErrors = countRows(adDispatchesRes.data, (row) => String(row.status ?? "") === "failed");
  const adLastActivity = latestTimestamp(adDispatchesRes.data, "last_attempt_at") ?? latestTimestamp(adDispatchesRes.data, "created_at");

  const staleInstances = countRows(channelsRes.data, (row) => !row.last_sync_at || String(row.last_sync_at) < staleSync);
  const errorInstances = countRows(channelsRes.data, (row) => String(row.status ?? "") === "error");
  const lastInstanceSync = latestTimestamp(channelsRes.data, "last_sync_at");

  const billingAlertsLast = latestTimestamp(aiAlertsRes.data, "created_at");
  const heartbeatByWorker = new Map<string, Record<string, unknown>>();
  for (const row of platformWorkerHeartbeatsRes.data ?? []) {
    heartbeatByWorker.set(String(row.worker_key), row as Record<string, unknown>);
  }

  function hb(workerKey: string) {
    return heartbeatByWorker.get(workerKey) ?? null;
  }

  function hbLast(workerKey: string, fallback: string | null = null) {
    const row = hb(workerKey);
    return typeof row?.last_finished_at === "string" ? String(row.last_finished_at) : fallback;
  }

  function hbStale(workerKey: string, minutes: number) {
    const row = hb(workerKey);
    const last = typeof row?.last_finished_at === "string" ? String(row.last_finished_at) : null;
    return !last || last < nowMinus(minutes);
  }

  function hbFailures(workerKey: string) {
    const row = hb(workerKey);
    return Number(row?.consecutive_failures ?? 0);
  }

  function hbDetails(workerKey: string, extra: string[] = []) {
    const row = hb(workerKey);
    const details = [...extra];
    if (row) {
      details.unshift(
        `HTTP ${row.last_http_status ?? "n/a"} · ${row.duration_ms ?? 0}ms`,
        `${Number(row.consecutive_failures ?? 0)} falha(s) consecutiva(s)`,
      );
    } else {
      details.unshift("Sem heartbeat generico ainda");
    }
    return details;
  }

  const workers: WorkerHealth[] = [
    {
      id: "marketing-flow-worker",
      label: "Automacoes",
      schedule: "1 min",
      severity: workerSeverity({
        pending: flowQueuedDue,
        running: flowRunning,
        stale: flowStaleRunning,
        errors: flowErrors + hbFailures("marketing-flow-worker"),
        heartbeatStale: hbStale("marketing-flow-worker", 3) && flowHeartbeatStale,
      }),
      status: workerStatus(workerSeverity({
        pending: flowQueuedDue,
        running: flowRunning,
        stale: flowStaleRunning,
        errors: flowErrors + hbFailures("marketing-flow-worker"),
        heartbeatStale: hbStale("marketing-flow-worker", 3) && flowHeartbeatStale,
      })),
      last_seen: hbLast("marketing-flow-worker", flowLastSeen),
      pending: flowQueuedDue,
      running: flowRunning,
      errors_24h: flowErrors + hbFailures("marketing-flow-worker"),
      details: hbDetails("marketing-flow-worker", [
        flowHeartbeatStale ? "Heartbeat ausente ou acima de 3 minutos" : "Heartbeat recente",
        `${flowStaleRunning} job(s) travado(s)`,
      ]),
    },
    {
      id: "ai-orchestrator",
      label: "IA",
      schedule: "1 min",
      severity: workerSeverity({ pending: aiPending, running: aiProcessing, stale: aiStaleProcessing, errors: aiErrors + hbFailures("ai-orchestrator"), heartbeatStale: hbStale("ai-orchestrator", 3) }),
      status: workerStatus(workerSeverity({ pending: aiPending, running: aiProcessing, stale: aiStaleProcessing, errors: aiErrors + hbFailures("ai-orchestrator"), heartbeatStale: hbStale("ai-orchestrator", 3) })),
      last_seen: hbLast("ai-orchestrator", latestTimestamp(aiJobsRes.data, "updated_at") ?? latestTimestamp(aiJobsRes.data, "created_at")),
      pending: aiPending,
      running: aiProcessing,
      errors_24h: aiErrors + hbFailures("ai-orchestrator"),
      details: hbDetails("ai-orchestrator", [`${aiStaleProcessing} job(s) travado(s)`, "Cron externo a cada 1 minuto"]),
    },
    {
      id: "webhook-dispatcher",
      label: "Webhooks",
      schedule: "1 min",
      severity: workerSeverity({ pending: webhookPending, errors: webhookErrors + hbFailures("webhook-dispatcher"), heartbeatStale: hbStale("webhook-dispatcher", 3) }),
      status: workerStatus(workerSeverity({ pending: webhookPending, errors: webhookErrors + hbFailures("webhook-dispatcher"), heartbeatStale: hbStale("webhook-dispatcher", 3) })),
      last_seen: hbLast("webhook-dispatcher", webhookLastSuccess),
      pending: webhookPending,
      running: 0,
      errors_24h: webhookErrors + hbFailures("webhook-dispatcher"),
      details: hbDetails("webhook-dispatcher", ["Drena webhook_deliveries vencidos", webhookLastSuccess ? "Ultimo sucesso registrado" : "Sem sucesso recente na janela"]),
    },
    {
      id: "marketing-email-dispatch",
      label: "E-mails",
      schedule: "1 min",
      severity: workerSeverity({ pending: emailCombinedPending, errors: emailCombinedErrors + hbFailures("marketing-email-dispatch"), heartbeatStale: hbStale("marketing-email-dispatch", 3) }),
      status: workerStatus(workerSeverity({ pending: emailCombinedPending, errors: emailCombinedErrors + hbFailures("marketing-email-dispatch"), heartbeatStale: hbStale("marketing-email-dispatch", 3) })),
      last_seen: hbLast("marketing-email-dispatch", emailCombinedLastActivity),
      pending: emailCombinedPending,
      running: 0,
      errors_24h: emailCombinedErrors + hbFailures("marketing-email-dispatch"),
      details: hbDetails("marketing-email-dispatch", [
        "Drena marketing_email_dispatches + welcome_email_dispatches",
        `${emailErrors} marketing(s) e ${welcomeErrors} boas-vindas em falha recente`,
      ]),
    },
    {
      id: "marketing-ad-conversion-dispatch",
      label: "Conversoes Ads",
      schedule: "5 min",
      severity: workerSeverity({ pending: adPending, errors: adErrors + hbFailures("marketing-ad-conversion-dispatch"), heartbeatStale: hbStale("marketing-ad-conversion-dispatch", 12) }),
      status: workerStatus(workerSeverity({ pending: adPending, errors: adErrors + hbFailures("marketing-ad-conversion-dispatch"), heartbeatStale: hbStale("marketing-ad-conversion-dispatch", 12) })),
      last_seen: hbLast("marketing-ad-conversion-dispatch", adLastActivity),
      pending: adPending,
      running: 0,
      errors_24h: adErrors + hbFailures("marketing-ad-conversion-dispatch"),
      details: hbDetails("marketing-ad-conversion-dispatch", ["Drena conversoes Meta/Google", `${adErrors} falha(s) recentes`]),
    },
    {
      id: "uazapi-instance-sync",
      label: "Sync Uazapi",
      schedule: "5 min",
      severity: workerSeverity({ stale: staleInstances, errors: errorInstances + hbFailures("uazapi-instance-sync"), heartbeatStale: hbStale("uazapi-instance-sync", 12) }),
      status: workerStatus(workerSeverity({ stale: staleInstances, errors: errorInstances + hbFailures("uazapi-instance-sync"), heartbeatStale: hbStale("uazapi-instance-sync", 12) })),
      last_seen: hbLast("uazapi-instance-sync", lastInstanceSync),
      pending: staleInstances,
      running: 0,
      errors_24h: errorInstances + hbFailures("uazapi-instance-sync"),
      details: hbDetails("uazapi-instance-sync", [`${staleInstances} canal(is) sem sync recente`, `${errorInstances} canal(is) em erro`]),
    },
    {
      id: "billing-usage-alerts",
      label: "Alertas de uso",
      schedule: "6 h",
      severity: workerSeverity({ errors: hbFailures("billing-usage-alerts"), heartbeatStale: hbStale("billing-usage-alerts", 390) }),
      status: workerStatus(workerSeverity({ errors: hbFailures("billing-usage-alerts"), heartbeatStale: hbStale("billing-usage-alerts", 390) })),
      last_seen: hbLast("billing-usage-alerts"),
      pending: 0,
      running: 0,
      errors_24h: hbFailures("billing-usage-alerts"),
      details: hbDetails("billing-usage-alerts", ["Dedupe por tenant/metrica/periodo", "Validado via cron externo"]),
    },
    {
      id: "ai-alerts",
      label: "Alertas IA",
      schedule: "6 h",
      severity: workerSeverity({ errors: hbFailures("ai-alerts"), heartbeatStale: hbStale("ai-alerts", 390) }),
      status: workerStatus(workerSeverity({ errors: hbFailures("ai-alerts"), heartbeatStale: hbStale("ai-alerts", 390) })),
      last_seen: hbLast("ai-alerts", billingAlertsLast),
      pending: 0,
      running: 0,
      errors_24h: hbFailures("ai-alerts"),
      details: hbDetails("ai-alerts", ["Alerta 80%/100% de tokens", billingAlertsLast ? "Envio recente detectado" : "Sem alerta recente"]),
    },
  ];

  const tenants = await Promise.all(
    ((tenantsRes.data ?? []) as TenantRow[]).map(async (tenant): Promise<TenantHealth> => {
      const tenantId = String(tenant.id);
      const billing = billingByTenant.get(tenantId) ?? {};
      const usage = await usageForTenant(admin, tenantId);
      const issues: string[] = [];

      const billingStatus = billing.status ? String(billing.status) : null;
      if (billingStatus && BLOCKED_BILLING.has(billingStatus)) issues.push(`Assinatura ${billingStatus}`);

      const channelsError = counts.get(key(tenantId, "channels_error")) ?? 0;
      const channelsDisconnected = counts.get(key(tenantId, "channels_disconnected")) ?? 0;
      const channelsTotal = counts.get(key(tenantId, "channels_total")) ?? 0;
      if (channelsError > 0) issues.push(`${channelsError} canal(is) em erro`);
      if (channelsTotal > 0 && channelsDisconnected === channelsTotal) issues.push("Todos os canais desconectados");

      const aiErrors = counts.get(key(tenantId, "ai_error")) ?? 0;
      const aiStale = counts.get(key(tenantId, "ai_stale_processing")) ?? 0;
      if (aiErrors > 0) issues.push(`${aiErrors} erro(s) de IA em 24h`);
      if (aiStale > 0) issues.push(`${aiStale} job(s) de IA travados`);

      const flowDead = counts.get(key(tenantId, "flow_dead_24h")) ?? 0;
      const flowFailed = counts.get(key(tenantId, "flow_failed_24h")) ?? 0;
      const flowStale = counts.get(key(tenantId, "flow_stale_running")) ?? 0;
      if (flowDead > 0) issues.push(`${flowDead} automacao(oes) mortas`);
      if (flowFailed > 0) issues.push(`${flowFailed} falha(s) de automacao`);
      if (flowStale > 0) issues.push(`${flowStale} automacao(oes) travadas`);

      const webhookErrors = counts.get(key(tenantId, "webhook_errors_24h")) ?? 0;
      if (webhookErrors > 0) issues.push(`${webhookErrors} webhook(s) com erro`);

      const exceeded = usage.filter((row) => row.exceeded);
      if (exceeded.length > 0) issues.push(`${exceeded.length} limite(s) de plano excedido(s)`);

      const critical =
        (billingStatus ? BLOCKED_BILLING.has(billingStatus) : false) ||
        channelsError > 0 ||
        flowDead > 0 ||
        flowStale > 0 ||
        aiStale > 0;

      return {
        tenant_id: tenantId,
        nome: tenant.nome ?? "Sem nome",
        created_at: tenant.created_at,
        severity: critical ? "critical" : issues.length > 0 ? "warning" : "ok",
        issues,
        billing: {
          plan_id: billing.plan_id ? String(billing.plan_id) : null,
          status: billingStatus,
          billing_period: billing.billing_period ? String(billing.billing_period) : null,
          current_period_end: billing.current_period_end ? String(billing.current_period_end) : null,
        },
        channels: {
          total: channelsTotal,
          connected: counts.get(key(tenantId, "channels_connected")) ?? 0,
          connecting: counts.get(key(tenantId, "channels_connecting")) ?? 0,
          disconnected: channelsDisconnected,
          error: channelsError,
          stale_sync: counts.get(key(tenantId, "channels_stale_sync")) ?? 0,
        },
        ai: {
          pending: counts.get(key(tenantId, "ai_pending")) ?? 0,
          processing: counts.get(key(tenantId, "ai_processing")) ?? 0,
          stale_processing: aiStale,
          errors_24h: aiErrors,
        },
        automations: {
          queued_due: counts.get(key(tenantId, "flow_queued_due")) ?? 0,
          running: counts.get(key(tenantId, "flow_running")) ?? 0,
          stale_running: flowStale,
          failed_24h: flowFailed,
          dead_24h: flowDead,
        },
        webhooks: {
          pending_due: counts.get(key(tenantId, "webhook_pending_due")) ?? 0,
          errors_24h: webhookErrors,
          success_24h: counts.get(key(tenantId, "webhook_success_24h")) ?? 0,
        },
        usage,
      };
    }),
  );

  const summary = {
    tenants: tenants.length,
    critical: tenants.filter((tenant) => tenant.severity === "critical").length,
    warning: tenants.filter((tenant) => tenant.severity === "warning").length,
    billing_blocked: tenants.filter((tenant) => tenant.billing.status && BLOCKED_BILLING.has(tenant.billing.status)).length,
    channels_total: tenants.reduce((sum, tenant) => sum + tenant.channels.total, 0),
    channels_connected: tenants.reduce((sum, tenant) => sum + tenant.channels.connected, 0),
    ai_pending: tenants.reduce((sum, tenant) => sum + tenant.ai.pending, 0),
    ai_errors_24h: tenants.reduce((sum, tenant) => sum + tenant.ai.errors_24h, 0),
    automations_due: tenants.reduce((sum, tenant) => sum + tenant.automations.queued_due, 0),
    automations_failed_24h: tenants.reduce((sum, tenant) => sum + tenant.automations.failed_24h + tenant.automations.dead_24h, 0),
    webhook_errors_24h: tenants.reduce((sum, tenant) => sum + tenant.webhooks.errors_24h, 0),
    workers_critical: workers.filter((worker) => worker.severity === "critical").length,
    workers_warning: workers.filter((worker) => worker.severity === "warning").length,
    workers_alerts_24h: (workerAlertsRes.data ?? []).length,
  };

  const workerAlerts = (workerAlertsRes.data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    worker_key: String(row.worker_key),
    worker_label: row.worker_label == null ? null : String(row.worker_label),
    alert_type: row.alert_type as "failure" | "stale",
    severity: row.severity as "warning" | "critical",
    period: String(row.period),
    last_http_status: row.last_http_status == null ? null : Number(row.last_http_status),
    consecutive_failures: Number(row.consecutive_failures ?? 0),
    summary: row.summary == null ? null : String(row.summary),
    sent_at: row.sent_at == null ? null : String(row.sent_at),
    created_at: String(row.created_at),
  })) as WorkerAlert[];

  const workerRuns = (platformWorkerRunsRes.data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    worker_key: String(row.worker_key),
    worker_label: row.worker_label == null ? null : String(row.worker_label),
    schedule: row.schedule == null ? null : String(row.schedule),
    started_at: String(row.started_at),
    finished_at: String(row.finished_at),
    http_status: row.http_status == null ? null : Number(row.http_status),
    ok: Boolean(row.ok),
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    response_excerpt: row.response_excerpt == null ? null : String(row.response_excerpt),
    error_excerpt: row.error_excerpt == null ? null : String(row.error_excerpt),
    created_at: String(row.created_at),
  })) as WorkerRun[];

  return jsonResponse({ generated_at: new Date().toISOString(), summary, workers, workerRuns, workerAlerts, tenants });
});
