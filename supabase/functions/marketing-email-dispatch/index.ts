// Processa a fila de e-mails (marketing_email_dispatches).
//  - Cron/interno: header x-cron-secret => processa todos os tenants.
//  - App (admin): Authorization Bearer <jwt> => processa apenas o tenant do usuário.
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest, requireTenantContext } from "../_shared/supabase.ts";
import { processPendingDispatches, processWelcomeDispatches } from "../_shared/email.ts";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  try {
    const processBoth = async (admin: ReturnType<typeof createAdminClient>, tenantId?: string | null, limit = 100) => {
      const [marketing, welcome] = await Promise.all([
        processPendingDispatches(admin, tenantId ? { tenantId, limit } : { limit }),
        processWelcomeDispatches(admin, tenantId ? { tenantId, limit } : { limit }),
      ]);
      return {
        processed: marketing.processed + welcome.processed,
        sent: marketing.sent + welcome.sent,
        failed: marketing.failed + welcome.failed,
        skipped: marketing.skipped + welcome.skipped,
        marketing,
        welcome,
      };
    };

    if (isInternalRequest(request)) {
      const admin = createAdminClient();
      const result = await processBoth(admin, null, 100);
      return jsonResponse({ ok: true, scope: "all", ...result });
    }

    const ctx = await requireTenantContext(request);
    const result = await processBoth(ctx.admin, ctx.tenantId, 50);
    return jsonResponse({ ok: true, scope: "tenant", ...result });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro ao processar fila" }, 400);
  }
});
