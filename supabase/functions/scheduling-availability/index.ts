// scheduling-availability: horários livres de um prestador (uso interno/authed).
// O cálculo vive em _shared/scheduling.ts (reusado pela função pública).
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { requireTenantContext } from "../_shared/supabase.ts";
import { computeAvailability } from "../_shared/scheduling.ts";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const { admin, tenantId } = await requireTenantContext(request);
    const body = await request.json().catch(() => ({}));
    const providerId = String(body.providerId ?? "");
    const serviceId = body.serviceId ? String(body.serviceId) : null;
    const serviceIds = Array.isArray(body.serviceIds)
      ? body.serviceIds.map(String)
      : body.serviceIds
      ? String(body.serviceIds).split(",")
      : null;
    const roomId = body.roomId ? String(body.roomId) : null;
    const from = String(body.from ?? "");
    const to = String(body.to ?? "");

    if (!providerId || !from || !to) {
      return jsonResponse({ error: "providerId, from e to são obrigatórios." }, 400);
    }

    const result = await computeAvailability(admin, tenantId, { providerId, serviceId, serviceIds, roomId, from, to });
    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    const status = /bearer|tenant/i.test(message) ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
