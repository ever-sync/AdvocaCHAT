// Casa respostas de WhatsApp ("1"/"confirmar"/"2"/"cancelar") com o próximo
// agendamento do cliente e atualiza o status. Best-effort e isolado: qualquer
// erro é engolido para nunca atrapalhar o fluxo normal do webhook.
import { sendMessageViaUazapi } from "./uazapi.ts";
import { decryptSecret } from "./crypto.ts";
import { phoneToRemoteJid } from "./api-instances.ts";
import { createAdminClient } from "./supabase.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

type InstanceLike = {
  tenant_id: string;
  uazapi_instance_name: string;
  uazapi_base_url: string;
  encrypted_apikey: string;
};

const CONFIRM = new Set(["1", "confirmar", "confirmo", "confirmado", "sim", "ok"]);
const CANCEL = new Set(["2", "cancelar", "cancela", "cancelado", "nao", "não"]);

function getStr(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return null;
    }
  }
  return typeof cur === "string" ? cur : null;
}

function getBool(obj: unknown, path: string[]): boolean {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return false;
    }
  }
  return cur === true;
}

function extractText(msg: Record<string, unknown>): string | null {
  return (
    getStr(msg, ["message", "conversation"]) ??
    getStr(msg, ["message", "extendedTextMessage", "text"]) ??
    getStr(msg, ["message", "text"]) ??
    getStr(msg, ["text"]) ??
    getStr(msg, ["body"]) ??
    getStr(msg, ["content"])
  );
}

function extractJid(msg: Record<string, unknown>): string | null {
  return (
    getStr(msg, ["key", "remoteJid"]) ??
    getStr(msg, ["message", "key", "remoteJid"]) ??
    getStr(msg, ["sender"]) ??
    getStr(msg, ["chatid"]) ??
    getStr(msg, ["chatId"])
  );
}

function isFromMe(msg: Record<string, unknown>): boolean {
  return (
    getBool(msg, ["key", "fromMe"]) ||
    getBool(msg, ["fromMe"]) ||
    getBool(msg, ["message", "key", "fromMe"])
  );
}

export async function handleAppointmentConfirmations(
  admin: AdminClient,
  instance: InstanceLike,
  messages: Record<string, unknown>[],
): Promise<number> {
  let handled = 0;
  let cachedConfig: { instanceName: string; baseUrl: string; apiKey: string } | null = null;

  for (const msg of messages) {
    try {
      if (isFromMe(msg)) continue;
      const jid = extractJid(msg);
      const text = extractText(msg);
      if (!jid || !text) continue;

      const normalized = text.trim().toLowerCase();
      const wantsConfirm = CONFIRM.has(normalized);
      const wantsCancel = CANCEL.has(normalized);
      if (!wantsConfirm && !wantsCancel) continue;

      const digits = jid.replace(/\D/g, "");
      if (digits.length < 8) continue;
      const last8 = digits.slice(-8);

      // Próximo agendamento ativo deste telefone.
      const { data: appts } = await admin
        .from("scheduling_appointments")
        .select("id, status, starts_at")
        .eq("tenant_id", instance.tenant_id)
        .in("status", ["agendado", "confirmado"])
        .gt("starts_at", new Date().toISOString())
        .ilike("customer_telefone", `%${last8}%`)
        .order("starts_at", { ascending: true })
        .limit(1);

      const appt = appts?.[0];
      if (!appt) continue;

      const newStatus = wantsConfirm ? "confirmado" : "cancelado";
      if (appt.status === newStatus) continue;

      await admin
        .from("scheduling_appointments")
        .update({ status: newStatus })
        .eq("tenant_id", instance.tenant_id)
        .eq("id", appt.id);
      handled++;

      // Ack (best-effort).
      try {
        if (!cachedConfig) {
          const apiKey = await decryptSecret(instance.encrypted_apikey);
          cachedConfig = {
            instanceName: instance.uazapi_instance_name,
            baseUrl: instance.uazapi_base_url,
            apiKey,
          };
        }
        await sendMessageViaUazapi(cachedConfig, {
          messageType: "text",
          remoteJid: phoneToRemoteJid(digits),
          bodyText: wantsConfirm
            ? "✅ Presença confirmada! Até lá."
            : "Seu agendamento foi cancelado. Se precisar, é só remarcar.",
          payload: {},
        });
      } catch {
        // ignora falha no ack
      }
    } catch {
      // nunca interrompe o webhook
    }
  }

  return handled;
}
