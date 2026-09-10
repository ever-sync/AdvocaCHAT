import { handleCors, jsonResponse } from "../_shared/http.ts";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  createAdminClient,
  getFunctionsBaseUrl,
  isInternalRequest,
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
    const body = await request.json().catch(() => ({}));
    const instanceId = body.instanceId as string | undefined;
    const internal = isInternalRequest(request);
    const context = internal
      ? { admin: createAdminClient(), tenantId: String(body.tenantId ?? "") || null }
      : await requireTenantPermission(
          request,
          "configuracoes",
          "edit",
          "Seu papel nao tem permissao para sincronizar instancias.",
        );
    if (!internal) {
      await assertTenantBillingActive(context.admin, context.tenantId, "sincronizar canais");
    }

    let query = context.admin
      .from("whatsapp_instances")
      .select("*")
      .is("archived_at", null);
    if (context.tenantId) {
      query = query.eq("tenant_id", context.tenantId);
    }
    if (instanceId) {
      query = query.eq("id", instanceId);
    }

    const { data: instances, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const synced: string[] = [];

    for (const instance of instances ?? []) {
      const apiKey = await decryptSecret(instance.encrypted_apikey);

      try {
        const resolved = await resolveConnectionConfig(
          instance.uazapi_base_url,
          apiKey,
          instance.uazapi_instance_name,
        );
        const connectionState = resolved.connectionState;
        const resolvedInstanceName = resolved.config.instanceName;
        const webhookUrl = `${getFunctionsBaseUrl()}/uazapi-webhook?instanceId=${instance.id}&token=${instance.webhook_token}`;
        const config = {
          instanceName: resolvedInstanceName,
          baseUrl: instance.uazapi_base_url,
          apiKey,
        };

        let webhookError: string | null = null;

        try {
          await setWebhook(config, webhookUrl);
          await findWebhook(config);
        } catch (error) {
          webhookError = error instanceof Error ? error.message : "Nao foi possivel configurar o webhook.";
        }

        await context.admin
          .from("whatsapp_instances")
          .update({
            uazapi_instance_name: resolvedInstanceName,
            status: resolveInstanceStatus(connectionState),
            phone_number: resolvePhoneNumber(connectionState, instance.phone_number),
            last_qr: resolveQrCode(connectionState),
            last_sync_at: new Date().toISOString(),
            last_error: webhookError,
          })
          .eq("id", instance.id);

        synced.push(instance.id);
      } catch (instanceError) {
        await context.admin
          .from("whatsapp_instances")
          .update({
            status: "error",
            last_sync_at: new Date().toISOString(),
            last_error:
              instanceError instanceof Error
                ? instanceError.message
                : "Erro de sincronizacao.",
          })
          .eq("id", instance.id);
      }
    }

    return jsonResponse({ success: true, synced });
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
