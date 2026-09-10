// Processa a fila de boas-vindas dos novos usuários.
//  - Cron/internal: header x-cron-secret => processa todos os tenants.
//  - App autenticado: Authorization Bearer <jwt> => processa apenas o tenant do usuário.

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest, requireTenantContext } from "../_shared/supabase.ts";
import { processWelcomeDispatches } from "../_shared/email.ts";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    if (isInternalRequest(request)) {
      const admin = createAdminClient();
      const result = await processWelcomeDispatches(admin, { limit: 100 });
      return jsonResponse({ ok: true, scope: "all", ...result });
    }

    const ctx = await requireTenantContext(request);
    const result = await processWelcomeDispatches(ctx.admin, { tenantId: ctx.tenantId, limit: 50 });
    return jsonResponse({ ok: true, scope: "tenant", ...result });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro ao processar boas-vindas" }, 400);
  }
});
