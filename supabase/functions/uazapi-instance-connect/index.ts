import { handleCors, jsonResponse } from "../_shared/http.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import {
  PermissionDeniedError,
  getFunctionsBaseUrl,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import {
  findWebhook,
  resolveConnectionConfig,
  resolveInstanceStatus,
  resolvePhoneNumber,
  resolveQrCode,
  setWebhook,
} from "../_shared/uazapi.ts";

Deno.serve(async (request) => {
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { admin, tenantId } = await requireTenantPermission(
      request,
      "configuracoes",
      "edit",
      "Seu papel nao tem permissao para conectar uma instancia.",
    );
    const body = await request.json().catch(() => ({}));
    const displayName = String(body.displayName ?? "").trim();
    const providedInstanceName = String(body.uazapiInstanceName ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();
    const uazapiBaseUrl = String(body.uazapiBaseUrl ?? "https://api.uazapi.com").trim();
    const isDefault = Boolean(body.isDefault);

    if (!displayName || !apiKey) {
      throw new Error("displayName e apiKey sao obrigatorios.");
    }

    const resolved = await resolveConnectionConfig(uazapiBaseUrl, apiKey, providedInstanceName);
    const uazapiInstanceName = resolved.config.instanceName;
    const connectionState = resolved.connectionState;
    const encryptedApiKey = await encryptSecret(apiKey);

    const { data: instance, error: instanceError } = await admin
      .from("whatsapp_instances")
      .upsert(
        {
          tenant_id: tenantId,
          display_name: displayName,
          uazapi_instance_name: uazapiInstanceName,
          uazapi_base_url: uazapiBaseUrl,
          encrypted_apikey: encryptedApiKey,
          status: "connecting",
          is_default: isDefault,
          archived_at: null,
        },
        { onConflict: "tenant_id,uazapi_instance_name" },
      )
      .select("*")
      .single();

    if (instanceError || !instance) {
      throw new Error(instanceError?.message ?? "Nao foi possivel salvar a instancia.");
    }

    if (isDefault) {
      await admin
        .from("whatsapp_instances")
        .update({ is_default: false })
        .eq("tenant_id", tenantId)
        .neq("id", instance.id);
    }

    const webhookUrl = `${getFunctionsBaseUrl()}/uazapi-webhook?instanceId=${instance.id}&token=${instance.webhook_token}`;
    const config = {
      instanceName: uazapiInstanceName,
      baseUrl: uazapiBaseUrl,
      apiKey,
    };

    let webhookState: Record<string, unknown> | null = null;
    let webhookError: string | null = null;

    try {
      await setWebhook(config, webhookUrl);
      webhookState = await findWebhook(config);
    } catch (error) {
      webhookError = error instanceof Error ? error.message : "Nao foi possivel configurar o webhook.";
    }

    const status = resolveInstanceStatus(connectionState);
    const phoneNumber = resolvePhoneNumber(connectionState, instance.phone_number);
    const qr = resolveQrCode(connectionState);

    const { data: updatedInstance, error: updateError } = await admin
      .from("whatsapp_instances")
      .update({
        phone_number: phoneNumber,
        status,
        last_qr: qr,
        last_sync_at: new Date().toISOString(),
        last_error: webhookError,
      })
      .eq("id", instance.id)
      .select(
        "id, display_name, uazapi_instance_name, uazapi_base_url, phone_number, status, is_default, last_qr, last_sync_at, last_error, created_at",
      )
      .single();

    if (updateError || !updatedInstance) {
      throw new Error(updateError?.message ?? "Nao foi possivel atualizar a instancia.");
    }

    return jsonResponse({
      instance: updatedInstance,
      connectionState,
      webhookState,
      warning: webhookError,
    });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error." },
      400,
    );
  }
});
