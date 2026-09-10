// Alertas por e-mail do add-on de IA (agendado por pg_cron via x-cron-secret).
// Avisa o admin do tenant ao cruzar 80% / 100% da cota mensal de tokens, com dedupe
// (1 e-mail por tenant/tipo/mês via tabela ai_alerts). Foco em quota: o cliente é
// avisado antes da IA pausar — útil para conversas de upgrade.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { sendViaResend } from "../_shared/email.ts";

type Admin = ReturnType<typeof createAdminClient>;

function monthStartIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function periodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function monthlyTokensUsed(admin: Admin, tenantId: string): Promise<number> {
  const { data } = await admin
    .from("ai_usage")
    .select("input_tokens, output_tokens")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStartIso());
  return (data ?? []).reduce(
    (sum: number, r: Record<string, number>) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    0,
  );
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
  if (!isInternalRequest(request)) return jsonResponse({ error: "Unauthorized." }, 401);

  const admin = createAdminClient();

  const fromRaw = Deno.env.get("MARKETING_EMAIL_FROM"); // "Nome <email@dominio>"
  if (!fromRaw) return jsonResponse({ ok: true, sent: 0, note: "MARKETING_EMAIL_FROM ausente" });
  const m = fromRaw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const fromName = m ? m[1] || "WChat" : "WChat";
  const fromEmail = m ? m[2] : fromRaw;

  const { data: subs } = await admin
    .from("tenant_ai_subscription")
    .select("tenant_id, active, monthly_token_quota, overage_allowed, trial_ends_at")
    .eq("active", true)
    .gt("monthly_token_quota", 0);

  const period = periodKey();
  let sent = 0;

  for (const sub of subs ?? []) {
    if (sub.overage_allowed) continue; // overage não pausa → não alerta de quota
    if (sub.trial_ends_at && new Date(sub.trial_ends_at as string) < new Date()) continue; // trial já parado

    const used = await monthlyTokensUsed(admin, sub.tenant_id);
    const quota = Number(sub.monthly_token_quota);
    const pct = Math.round((used / quota) * 100);
    const kind = pct >= 100 ? "quota_100" : pct >= 80 ? "quota_80" : null;
    if (!kind) continue;

    // Dedupe: insere o registro do alerta; se já existe (unique), não reenvia.
    const { error: dupErr } = await admin.from("ai_alerts").insert({ tenant_id: sub.tenant_id, kind, period });
    if (dupErr) continue;

    const { data: admins } = await admin
      .from("profiles")
      .select("email")
      .eq("tenant_id", sub.tenant_id)
      .eq("role", "admin")
      .not("email", "is", null);
    const emails = (admins ?? []).map((a: Record<string, unknown>) => String(a.email)).filter(Boolean);
    if (emails.length === 0) continue;

    const usedFmt = used.toLocaleString("pt-BR");
    const quotaFmt = quota.toLocaleString("pt-BR");
    const subject = pct >= 100 ? "IA pausada: cota mensal atingida" : "IA: 80% da cota mensal usada";
    const body =
      pct >= 100
        ? `A IA de atendimento atingiu a cota mensal (${usedFmt}/${quotaFmt} tokens) e está pausada até o próximo mês. Para reativar agora, aumente sua cota com o suporte.`
        : `A IA de atendimento já usou ${pct}% da cota mensal (${usedFmt}/${quotaFmt} tokens). Ao atingir 100%, a IA pausa automaticamente até o próximo mês.`;
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111827;line-height:1.6">${body}</div>`;

    for (const to of emails) {
      try {
        await sendViaResend({ to, fromName, fromEmail, subject, html, text: body });
        sent++;
      } catch (err) {
        console.error("ai-alerts send falhou:", err);
      }
    }
  }

  return jsonResponse({ ok: true, sent });
});
