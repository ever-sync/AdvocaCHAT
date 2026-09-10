import { authenticateApiKey, hasApiScope } from "../_shared/api-auth.ts";
import { handleApiCors, apiJsonResponse } from "../_shared/api-http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

type IngestBody = {
  eventName?: unknown;
  event_name?: unknown;
  sourceSystem?: unknown;
  source_system?: unknown;
  customerId?: unknown;
  customer_id?: unknown;
  negotiationId?: unknown;
  negotiation_id?: unknown;
  payload?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

Deno.serve(async (request) => {
  const cors = handleApiCors(request);
  if (cors) return cors;

  if (request.method.toUpperCase() !== "POST") {
    return apiJsonResponse({ error: "Method not allowed." }, 405);
  }

  const admin = createAdminClient();
  const auth = await authenticateApiKey(admin, request);
  if (!auth) {
    return apiJsonResponse({ error: "Unauthorized." }, 401);
  }
  if (!hasApiScope(auth, "write")) {
    return apiJsonResponse({ error: "Missing write scope." }, 403);
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return apiJsonResponse({ error: "Invalid JSON." }, 400);
  }

  const eventName = str(body.eventName ?? body.event_name);
  if (!eventName) {
    return apiJsonResponse({ error: "eventName is required." }, 400);
  }

  const sourceSystem = str(body.sourceSystem ?? body.source_system);
  const customerId = str(body.customerId ?? body.customer_id) || null;
  const negotiationId = str(body.negotiationId ?? body.negotiation_id) || null;
  const payload = asJsonObject(body.payload);

  const context = {
    event_name: eventName,
    source_system: sourceSystem || null,
    customer_id: customerId,
    negotiation_id: negotiationId,
    payload,
    webhook: {
      eventName,
      sourceSystem: sourceSystem || null,
      customerId,
      negotiationId,
      payload,
    },
  };

  const { data, error } = await admin.rpc("enroll_marketing_flow_participants", {
    p_tenant_id: auth.tenantId,
    p_trigger_type: "webhook_received",
    p_customer_id: customerId,
    p_negotiation_id: negotiationId,
    p_context: context,
  });

  if (error) {
    return apiJsonResponse({ error: error.message }, 500);
  }

  return apiJsonResponse({
    ok: true,
    tenantId: auth.tenantId,
    eventName,
    sourceSystem: sourceSystem || null,
    matched: Number(data ?? 0),
  });
});
