import { createAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) {
    return cors;
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").select("id").limit(1);
    const dbOk = !error;

    return jsonResponse(
      {
        ok: dbOk,
        timestamp: new Date().toISOString(),
        database: dbOk ? "up" : "down",
        database_error: error?.message ?? null,
        uazapi: "not_checked",
      },
      dbOk ? 200 : 503,
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      503,
    );
  }
});
