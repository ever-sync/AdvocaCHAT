import { phoneToRemoteJid, resolveWhatsappInstance } from "../_shared/api-instances.ts";
import { ensureChat } from "../_shared/domain.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  createAdminClient,
  requireTenantPermission,
} from "../_shared/supabase.ts";

type Body = {
  phone?: string;
  remote_jid?: string;
  display_name?: string;
};

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonResponse({ error: "Invalid JSON." }, 400);
  }

  try {
    const { admin, tenantId } = await requireTenantPermission(request, "atendimento");
    await assertTenantBillingActive(admin, tenantId, "iniciar atendimentos");

    const phone = String(body.phone ?? "").trim();
    const remoteJidInput = String(body.remote_jid ?? "").trim();
    const remoteJid = remoteJidInput || (phone ? phoneToRemoteJid(phone) : "");
    if (!remoteJid) {
      return jsonResponse({ error: "Informe phone ou remote_jid." }, 400);
    }

    const admin = createAdminClient();
    const instance = await resolveWhatsappInstance(admin, tenantId, null);
    const displayName = String(body.display_name ?? "Cliente").trim() || "Cliente";

    const chat = await ensureChat(admin, instance, {
      remoteJid,
      displayName,
      lastMessagePreview: "",
      lastMessageAt: new Date().toISOString(),
      autoAssign: true,
    });

    return jsonResponse({
      ok: true,
      chat_id: chat.id,
      remote_jid: remoteJid,
    });
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return jsonResponse({ error: err.message }, err.status);
    }
    const message = err instanceof Error ? err.message : "Erro ao abrir conversa.";
    return jsonResponse({ error: message }, 500);
  }
});
