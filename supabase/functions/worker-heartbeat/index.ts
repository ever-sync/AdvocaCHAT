// Registra heartbeat generico dos workers disparados pelo cron externo.
// Acesso interno via x-cron-secret.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "1", "yes", "ok"].includes(value.toLowerCase());
  return false;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!isInternalRequest(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON invalido." }, 400);
  }

  const workerKey = asString(body.worker_key);
  if (!workerKey) {
    return jsonResponse({ error: "worker_key obrigatorio." }, 400);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_platform_worker_run", {
    p_worker_key: workerKey,
    p_worker_label: asString(body.worker_label),
    p_schedule: asString(body.schedule),
    p_started_at: asString(body.started_at),
    p_finished_at: asString(body.finished_at),
    p_http_status: asNumber(body.http_status),
    p_ok: asBoolean(body.ok),
    p_duration_ms: asNumber(body.duration_ms),
    p_response_excerpt: asString(body.response_excerpt),
    p_error_excerpt: asString(body.error_excerpt),
    p_metadata: typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {},
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, heartbeat: data });
});
