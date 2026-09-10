// Alerta proativo de workers da plataforma.
// Envia e-mail para platform_admins quando um worker fica stale ou acumula falhas.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { sendViaResend } from "../_shared/email.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";

type Admin = ReturnType<typeof createAdminClient>;

type WorkerHeartbeat = {
  worker_key: string;
  worker_label: string | null;
  schedule: string | null;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_http_status: number | null;
  last_ok: boolean;
  consecutive_failures: number;
  duration_ms: number | null;
  response_excerpt: string | null;
  error_excerpt: string | null;
  metadata: Record<string, unknown> | null;
};

type WorkerAlertInput = {
  worker_key: string;
  worker_label: string;
  alert_type: "failure" | "stale";
  severity: "warning" | "critical";
  period: string;
  last_http_status: number | null;
  consecutive_failures: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  summary: string;
  details: Record<string, unknown>;
};

function scheduleMinutes(schedule: string | null): number {
  const s = String(schedule ?? "").trim().toLowerCase();
  const match = s.match(/^(\d+)\s*(min|mins|minute|minutes|m)$/);
  if (match) return Math.max(1, Number(match[1]));
  const hourMatch = s.match(/^(\d+)\s*(h|hora|horas|hour|hours)$/);
  if (hourMatch) return Math.max(1, Number(hourMatch[1]) * 60);
  return 5;
}

function shouldAlert(heartbeat: WorkerHeartbeat, now = new Date()) {
  const schedule = scheduleMinutes(heartbeat.schedule);
  const staleThreshold = Math.max(3, schedule * 3);
  const lastFinished = heartbeat.last_finished_at ? new Date(heartbeat.last_finished_at).getTime() : 0;
  const stale = !lastFinished || now.getTime() - lastFinished > staleThreshold * 60_000;
  const failure = heartbeat.consecutive_failures > 0 || heartbeat.last_ok === false;

  if (failure) {
    return {
      alert_type: "failure" as const,
      severity: heartbeat.consecutive_failures >= 3 ? "critical" as const : "warning" as const,
      stale,
      should_send: true,
    };
  }

  if (stale) {
    return {
      alert_type: "stale" as const,
      severity: "critical" as const,
      stale,
      should_send: true,
    };
  }

  return {
    alert_type: null,
    severity: null,
    stale,
    should_send: false,
  };
}

function periodKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}`;
}

async function platformAdminEmails(admin: Admin): Promise<string[]> {
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id, profiles!platform_admins_user_id_fkey(email,status)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const emails = (data ?? [])
    .map((row: Record<string, unknown>) => {
      const profile = row.profiles as { email?: string | null; status?: string | null } | null;
      return profile?.status === "active" ? String(profile.email ?? "") : "";
    })
    .filter(Boolean);

  return [...new Set(emails)];
}

function renderEmail(input: WorkerAlertInput) {
  const prettyLabel = input.worker_label || input.worker_key;
  const details = [
    `Ultimo HTTP: ${input.last_http_status ?? "n/a"}`,
    `Falhas consecutivas: ${input.consecutive_failures}`,
    `Ultimo start: ${input.last_started_at ?? "n/a"}`,
    `Ultimo finish: ${input.last_finished_at ?? "n/a"}`,
  ];

  return {
    subject:
      input.alert_type === "stale"
        ? `WChat: worker ${prettyLabel} sem heartbeat`
        : `WChat: worker ${prettyLabel} com falha`,
    text: [
      `Worker: ${prettyLabel}`,
      `Tipo: ${input.alert_type}`,
      `Severidade: ${input.severity}`,
      `Resumo: ${input.summary}`,
      "",
      ...details,
      "",
      `Detalhes: ${JSON.stringify(input.details)}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6">
        <h2 style="margin:0 0 12px">Alerta de worker: ${prettyLabel}</h2>
        <p><strong>Tipo:</strong> ${input.alert_type}</p>
        <p><strong>Severidade:</strong> ${input.severity}</p>
        <p><strong>Resumo:</strong> ${input.summary}</p>
        <ul>
          ${details.map((line) => `<li>${line}</li>`).join("")}
        </ul>
        <pre style="background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto">${JSON.stringify(input.details, null, 2)}</pre>
      </div>
    `,
  };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!isInternalRequest(request)) return jsonResponse({ error: "Unauthorized." }, 401);

  const admin = createAdminClient();
  const now = new Date();
  const { data: rows, error } = await admin
    .from("platform_worker_heartbeats")
    .select(
      "worker_key, worker_label, schedule, last_started_at, last_finished_at, last_success_at, last_failure_at, last_http_status, last_ok, consecutive_failures, duration_ms, response_excerpt, error_excerpt, metadata",
    )
    .order("worker_key", { ascending: true });
  if (error) return jsonResponse({ error: error.message }, 500);

  const emails = await platformAdminEmails(admin);
  if (emails.length === 0) {
    return jsonResponse({ ok: true, sent: 0, note: "Nenhum platform admin com e-mail ativo." });
  }

  const inserted: Array<{ worker_key: string; alert_type: string }> = [];
  let sent = 0;
  let evaluated = 0;

  for (const row of (rows ?? []) as WorkerHeartbeat[]) {
    if (row.worker_key === "worker-alerts") continue;
    const verdict = shouldAlert(row, now);
    evaluated++;
    if (!verdict.should_send || !verdict.alert_type || !verdict.severity) continue;

    const period = periodKey(now);
    const summary =
      verdict.alert_type === "stale"
        ? `Worker ${row.worker_key} sem heartbeat dentro da janela esperada`
        : `Worker ${row.worker_key} com falha ou falhas consecutivas`;

    const details = {
      source: "worker-alerts",
      stale: verdict.stale,
      last_http_status: row.last_http_status,
      consecutive_failures: row.consecutive_failures,
      last_started_at: row.last_started_at,
      last_finished_at: row.last_finished_at,
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at,
      schedule: row.schedule,
      response_excerpt: row.response_excerpt,
      error_excerpt: row.error_excerpt,
      metadata: row.metadata ?? {},
    };

    const { error: insertError } = await admin
      .from("platform_worker_alerts")
      .insert({
        worker_key: row.worker_key,
        worker_label: row.worker_label,
        alert_type: verdict.alert_type,
        severity: verdict.severity,
        period,
        last_http_status: row.last_http_status,
        consecutive_failures: row.consecutive_failures,
        last_started_at: row.last_started_at,
        last_finished_at: row.last_finished_at,
        last_success_at: row.last_success_at,
        last_failure_at: row.last_failure_at,
        summary,
        details,
        sent_to: emails,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      if (String(insertError.message).includes("duplicate key")) continue;
      return jsonResponse({ error: insertError.message }, 500);
    }

    inserted.push({ worker_key: row.worker_key, alert_type: verdict.alert_type });

    const email = renderEmail({
      worker_key: row.worker_key,
      worker_label: row.worker_label ?? row.worker_key,
      alert_type: verdict.alert_type,
      severity: verdict.severity,
      period,
      last_http_status: row.last_http_status,
      consecutive_failures: row.consecutive_failures,
      last_started_at: row.last_started_at,
      last_finished_at: row.last_finished_at,
      last_success_at: row.last_success_at,
      last_failure_at: row.last_failure_at,
      summary,
      details,
    });

    const fromRaw = Deno.env.get("MARKETING_EMAIL_FROM");
    if (!fromRaw) continue;
    const match = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    const fromName = match ? match[1] || "WChat" : "WChat";
    const fromEmail = match ? match[2] : fromRaw;

    for (const to of emails) {
      try {
        await sendViaResend({ to, fromName, fromEmail, subject: email.subject, html: email.html, text: email.text });
        sent++;
      } catch (sendError) {
        console.error("worker-alerts send falhou:", sendError);
      }
    }

    await admin
      .from("platform_worker_alerts")
      .update({ sent_at: new Date().toISOString() })
      .eq("worker_key", row.worker_key)
      .eq("alert_type", verdict.alert_type)
      .eq("period", period);
  }

  return jsonResponse({ ok: true, evaluated, inserted: inserted.length, sent });
});
