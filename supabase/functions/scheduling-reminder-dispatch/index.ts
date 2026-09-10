// scheduling-reminder-dispatch: worker (cron) que envia lembretes de agendamento
// por WhatsApp. Reivindica linhas 'queued' vencidas, envia pela instância padrão
// do tenant e marca 'sent' / 'failed' (retry com backoff). Só aceita chamada
// interna (x-cron-secret).
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { resolveWhatsappInstance, phoneToRemoteJid } from "../_shared/api-instances.ts";
import { sendMessageViaUazapi } from "../_shared/uazapi.ts";
import { decryptSecret } from "../_shared/crypto.ts";

const MAX_ATTEMPTS = 3;
const RETRY_MIN = [1, 5, 30]; // minutos por tentativa

type ReminderRow = {
  id: string;
  tenant_id: string;
  appointment_id: string;
  kind: string;
  attempts: number;
};

function fmtDateTime(iso: string, timeZone: string): { data: string; hora: string } {
  const d = new Date(iso);
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone, day: "2-digit", month: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone, hour: "2-digit", minute: "2-digit",
  }).format(d);
  return { data, hora };
}

const DEFAULT_TEMPLATES: Record<string, string> = {
  confirmacao:
    "Olá, {{nome}}! Recebemos seu agendamento de *{{servico}}* para {{data}} às {{hora}}. Responda *1* para confirmar ou *2* para cancelar.",
  lembrete_24h:
    "Olá, {{nome}}! Lembrete do seu *{{servico}}* amanhã, {{data}} às {{hora}}. Responda *1* para confirmar ou *2* para cancelar.",
  lembrete_1h:
    "Olá, {{nome}}! Seu *{{servico}}* é hoje às {{hora}}. Até já!",
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

function buildMessage(
  kind: string,
  appt: { customer_nome: string | null; service_nome: string | null; starts_at: string },
  timeZone: string,
  customTemplate?: string | null,
): string {
  const nome = appt.customer_nome?.trim() || "Olá";
  const servico = appt.service_nome?.trim() || "seu atendimento";
  const { data, hora } = fmtDateTime(appt.starts_at, timeZone);
  const template = customTemplate?.trim() || DEFAULT_TEMPLATES[kind] || DEFAULT_TEMPLATES["lembrete_1h"];
  return applyTemplate(template, { nome, servico, data, hora });
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (!isInternalRequest(request)) {
    return jsonResponse({ error: "Forbidden." }, 401);
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  // Caches por tenant (instância + tz por prestador + templates) para não redecifrar/refazer.
  const instanceCache = new Map<string, { config: { instanceName: string; baseUrl: string; apiKey: string } } | null>();
  const tzCache = new Map<string, string>();
  const templateCache = new Map<string, Record<string, string | null>>();

  async function getTemplates(tenantId: string): Promise<Record<string, string | null>> {
    if (!templateCache.has(tenantId)) {
      const { data } = await admin
        .from("scheduling_public_config")
        .select("msg_confirmacao, msg_lembrete_24h, msg_lembrete_1h")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      templateCache.set(tenantId, {
        confirmacao: data?.msg_confirmacao ?? null,
        lembrete_24h: data?.msg_lembrete_24h ?? null,
        lembrete_1h: data?.msg_lembrete_1h ?? null,
      });
    }
    return templateCache.get(tenantId) ?? {};
  }

  const { data: due, error } = await admin
    .from("scheduling_reminders")
    .select("id, tenant_id, appointment_id, kind, attempts")
    .eq("status", "queued")
    .lte("send_at", nowIso)
    .order("send_at", { ascending: true })
    .limit(50);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  for (const reminder of (due ?? []) as ReminderRow[]) {
    // Claim atômico.
    const { data: claimed } = await admin
      .from("scheduling_reminders")
      .update({ status: "sending", attempts: reminder.attempts + 1, last_attempt_at: nowIso })
      .eq("id", reminder.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // outro worker pegou

    const markFail = async (msg: string) => {
      const willRetry = reminder.attempts + 1 < MAX_ATTEMPTS;
      const delayMin = RETRY_MIN[Math.min(reminder.attempts, RETRY_MIN.length - 1)];
      await admin
        .from("scheduling_reminders")
        .update({
          status: willRetry ? "queued" : "failed",
          send_at: willRetry ? new Date(Date.now() + delayMin * 60_000).toISOString() : undefined,
          error: msg.slice(0, 500),
        })
        .eq("id", reminder.id);
      failed++;
    };

    try {
      const { data: appt } = await admin
        .from("scheduling_appointments")
        .select("provider_id, status, starts_at, customer_nome, customer_telefone, service_nome")
        .eq("id", reminder.appointment_id)
        .maybeSingle();

      if (!appt) {
        await admin.from("scheduling_reminders").update({ status: "skipped", error: "Agendamento não encontrado." }).eq("id", reminder.id);
        skipped++;
        continue;
      }
      if (appt.status === "cancelado" || appt.status === "nao_compareceu" || appt.status === "concluido") {
        await admin.from("scheduling_reminders").update({ status: "skipped", error: `status=${appt.status}` }).eq("id", reminder.id);
        skipped++;
        continue;
      }
      const phone = String(appt.customer_telefone ?? "").trim();
      if (!phone) {
        await admin.from("scheduling_reminders").update({ status: "skipped", error: "Sem telefone." }).eq("id", reminder.id);
        skipped++;
        continue;
      }

      // Instância do tenant (cache).
      if (!instanceCache.has(reminder.tenant_id)) {
        try {
          const instance = await resolveWhatsappInstance(admin, reminder.tenant_id);
          const apiKey = await decryptSecret(instance.encrypted_apikey);
          instanceCache.set(reminder.tenant_id, {
            config: { instanceName: instance.uazapi_instance_name, baseUrl: instance.uazapi_base_url, apiKey },
          });
        } catch {
          instanceCache.set(reminder.tenant_id, null);
        }
      }
      const inst = instanceCache.get(reminder.tenant_id);
      if (!inst) {
        await markFail("Sem instância de WhatsApp ativa.");
        continue;
      }

      // Timezone do prestador (cache).
      if (!tzCache.has(appt.provider_id)) {
        const { data: settings } = await admin
          .from("scheduling_provider_settings")
          .select("timezone")
          .eq("tenant_id", reminder.tenant_id)
          .eq("provider_id", appt.provider_id)
          .maybeSingle();
        tzCache.set(appt.provider_id, String(settings?.timezone ?? "America/Sao_Paulo"));
      }
      const timeZone = tzCache.get(appt.provider_id) ?? "America/Sao_Paulo";

      const templates = await getTemplates(reminder.tenant_id);
      const bodyText = buildMessage(reminder.kind, appt, timeZone, templates[reminder.kind] ?? null);
      await sendMessageViaUazapi(inst.config, {
        messageType: "text",
        remoteJid: phoneToRemoteJid(phone),
        bodyText,
        payload: {},
      });

      await admin
        .from("scheduling_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", reminder.id);
      sent++;
    } catch (err) {
      await markFail(err instanceof Error ? err.message : "Erro ao enviar.");
    }
  }

  return jsonResponse({ ok: true, sent, failed, skipped, scanned: due?.length ?? 0 });
});
