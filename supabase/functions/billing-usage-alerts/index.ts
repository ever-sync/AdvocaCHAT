// Alertas gerais de limites do plano (80% e 100%) com dedupe mensal.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { sendViaResend } from "../_shared/email.ts";

type Admin = ReturnType<typeof createAdminClient>;

const METRIC_LABEL: Record<string, string> = {
  customers: "clientes",
  whatsapp_instances: "canais WhatsApp",
  users: "usuários",
  ai_monthly_tokens: "tokens de IA",
  marketing_flow_runs_monthly: "execuções de automação",
  storage_gb: "armazenamento",
};

const METRICS = [
  "customers",
  "whatsapp_instances",
  "users",
  "ai_monthly_tokens",
  "marketing_flow_runs_monthly",
  "storage_gb",
] as const;

function periodKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseFrom() {
  const fromRaw = Deno.env.get("MARKETING_EMAIL_FROM");
  if (!fromRaw) return null;
  const m = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return {
    fromName: m ? m[1] || "WChat" : "WChat",
    fromEmail: m ? m[2] : fromRaw,
  };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function appUrl() {
  return (
    Deno.env.get("APP_SITE_URL")?.trim() ||
    Deno.env.get("PUBLIC_APP_URL")?.trim() ||
    Deno.env.get("VITE_APP_URL")?.trim() ||
    "https://wchat.digital"
  ).replace(/\/+$/, "");
}

async function adminEmails(admin: Admin, tenantId: string) {
  const { data } = await admin
    .from("profiles")
    .select("email")
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .eq("status", "active")
    .not("email", "is", null);

  return [...new Set((data ?? []).map((row: Record<string, unknown>) => String(row.email)).filter(Boolean))];
}

async function sendAlertEmail(input: {
  to: string;
  fromName: string;
  fromEmail: string;
  tenantName: string;
  metric: string;
  threshold: 80 | 100;
  used: number;
  limit: number;
}) {
  const label = METRIC_LABEL[input.metric] ?? input.metric;
  const pct = Math.round((input.used / input.limit) * 100);
  const subject =
    input.threshold >= 100
      ? `WChat: limite de ${label} atingido`
      : `WChat: ${pct}% do limite de ${label} usado`;
  const planUrl = `${appUrl()}/configuracoes?aba=plano`;
  const text =
    input.threshold >= 100
      ? `O tenant ${input.tenantName} atingiu o limite de ${label}: ${formatNumber(input.used)}/${formatNumber(input.limit)}. Alguns recursos podem ficar bloqueados até upgrade de plano ou ajuste manual. Acesse: ${planUrl}`
      : `O tenant ${input.tenantName} já usou ${pct}% do limite de ${label}: ${formatNumber(input.used)}/${formatNumber(input.limit)}. Acompanhe o uso em: ${planUrl}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#111827;line-height:1.6">
      <h2 style="margin:0 0 12px">Limite ${input.threshold >= 100 ? "atingido" : "em atenção"}</h2>
      <p>${text}</p>
      <p><a href="${planUrl}" style="display:inline-block;background:#5b21b6;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Ver plano e uso</a></p>
    </div>
  `;

  await sendViaResend({
    to: input.to,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    subject,
    html,
    text,
  });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!isInternalRequest(request)) return jsonResponse({ error: "Unauthorized." }, 401);

  const admin = createAdminClient();
  const from = parseFrom();
  if (!from) return jsonResponse({ ok: true, sent: 0, note: "MARKETING_EMAIL_FROM ausente" });

  const { data: subscriptions, error } = await admin
    .from("billing_subscriptions")
    .select("tenant_id, plan_id, tenants(nome)")
    .in("status", ["trialing", "active", "past_due", "incomplete"]);

  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const period = periodKey();
  let checked = 0;
  let inserted = 0;
  let sent = 0;

  for (const sub of subscriptions ?? []) {
    const tenantId = String((sub as Record<string, unknown>).tenant_id);
    const tenantJoin = (sub as { tenants?: { nome?: string | null } | null }).tenants;
    const tenantName = tenantJoin?.nome ?? tenantId;
    const emails = await adminEmails(admin, tenantId);
    if (emails.length === 0) continue;

    for (const metric of METRICS) {
      const [{ data: limitValue }, { data: usedValue }] = await Promise.all([
        admin.rpc("get_tenant_plan_limit", { p_tenant_id: tenantId, p_metric: metric }),
        admin.rpc("get_tenant_current_usage", { p_tenant_id: tenantId, p_metric: metric }),
      ]);

      const limit = Number(limitValue ?? 0);
      const used = Number(usedValue ?? 0);
      if (!limit || limit <= 0) continue;
      checked++;

      const pct = Math.round((used / limit) * 100);
      const threshold: 80 | 100 | null = pct >= 100 ? 100 : pct >= 80 ? 80 : null;
      if (!threshold) continue;

      const { error: dedupeError } = await admin.from("billing_usage_alerts").insert({
        tenant_id: tenantId,
        metric,
        threshold,
        period,
        used,
        limit_value: limit,
        recipients: emails,
      });
      if (dedupeError) continue;
      inserted++;

      for (const to of emails) {
        try {
          await sendAlertEmail({
            to,
            ...from,
            tenantName,
            metric,
            threshold,
            used,
            limit,
          });
          sent++;
        } catch (sendError) {
          console.error("billing-usage-alerts send falhou:", sendError);
        }
      }

      await admin
        .from("billing_usage_alerts")
        .update({ sent_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("metric", metric)
        .eq("threshold", threshold)
        .eq("period", period);
    }
  }

  return jsonResponse({ ok: true, checked, inserted, sent });
});
