import { handleCors, jsonResponse } from "../_shared/http.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import {
  PermissionDeniedError,
  assertTenantBillingActive,
  getFunctionsBaseUrl,
  requireTenantPermission,
} from "../_shared/supabase.ts";
import {
  createUazapiInstance,
  requestJson,
  resolveInstanceStatus,
  resolvePhoneNumber,
  resolveQrCode,
  setWebhook,
  type UazapiInstanceConfig,
} from "../_shared/uazapi.ts";

const DEFAULT_UAZAPI_BASE_URL = "https://eversync2.uazapi.com";

type CreateUazapiResponse = {
  token?: string | null;
  name?: string | null;
  instance?: {
    token?: string | null;
    name?: string | null;
  } | null;
};

function readAdminToken() {
  const token = Deno.env.get("UAZAPI_ADMIN_TOKEN")?.trim();
  if (!token) {
    throw new Error("Configure UAZAPI_ADMIN_TOKEN no ambiente da função antes de criar canais.");
  }
  return token;
}

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
      "Seu papel nao tem permissao para criar canais.",
    );
    await assertTenantBillingActive(admin, tenantId, "criar canais");

    const body = await request.json().catch(() => ({}));
    const displayName = String(body.displayName ?? "").trim();
    const uazapiBaseUrl = String(body.uazapiBaseUrl ?? DEFAULT_UAZAPI_BASE_URL).trim();
    const isDefault = Boolean(body.isDefault ?? true);

    if (!displayName) {
      throw new Error("displayName e obrigatorio.");
    }

    const { error: limitError } = await admin.rpc("assert_tenant_plan_limit", {
      p_tenant_id: tenantId,
      p_metric: "whatsapp_instances",
      p_increment: 1,
    });

    if (limitError) {
      throw new Error(limitError.message);
    }

    const adminToken = readAdminToken();
    const created = (await createUazapiInstance(
      uazapiBaseUrl,
      adminToken,
      displayName,
    )) as CreateUazapiResponse;
    const createdToken = String(created.token ?? created.instance?.token ?? "").trim();
    const resolvedInstanceName = String(
      created.instance?.name ?? created.name ?? displayName,
    ).trim();

    if (!createdToken) {
      throw new Error("A UAZAPI nao retornou o token da instancia criada.");
    }

    const encryptedApiKey = await encryptSecret(createdToken);
    const { data: instance, error: instanceError } = await admin
      .from("whatsapp_instances")
      .upsert(
        {
          tenant_id: tenantId,
          display_name: displayName,
          uazapi_instance_name: resolvedInstanceName,
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
      throw new Error(instanceError?.message ?? "Nao foi possivel salvar o canal criado.");
    }

    if (isDefault) {
      await admin
        .from("whatsapp_instances")
        .update({ is_default: false })
        .eq("tenant_id", tenantId)
        .neq("id", instance.id);
    }

    const webhookUrl = `${getFunctionsBaseUrl()}/uazapi-webhook?instanceId=${instance.id}&token=${instance.webhook_token}`;
    const config: UazapiInstanceConfig = {
      instanceName: resolvedInstanceName,
      baseUrl: uazapiBaseUrl,
      apiKey: createdToken,
      apiVersion: "v2",
    };

    let webhookState: unknown = null;
    let webhookError: string | null = null;

    try {
      await setWebhook(config, webhookUrl);
      webhookState = await requestJson<unknown>(config, "webhook");
    } catch (error) {
      webhookError = error instanceof Error ? error.message : "Nao foi possivel configurar o webhook.";
    }

    const connectionState = await requestJson<Record<string, unknown>>(config, "instance/connect", "POST", {
      browser: "auto",
      systemName: displayName,
    });
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
      throw new Error(updateError?.message ?? "Nao foi possivel finalizar a criacao do canal.");
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
