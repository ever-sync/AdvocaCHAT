// scheduling-google-pull: worker (cron) que importa a ocupação externa do Google
// Calendar como exceções 'block' (source=google), para a disponibilidade evitar
// conflito com eventos criados fora do WChat. Eventos criados pelo próprio WChat
// (extendedProperties.wchat_appointment_id) são ignorados (anti-eco).
// Só aceita chamada interna (x-cron-secret).
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { getValidGoogleAccessToken, listEventsIncremental } from "../_shared/google.ts";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (!isInternalRequest(request)) return jsonResponse({ error: "Forbidden." }, 401);

  const admin = createAdminClient();
  let imported = 0;
  let removed = 0;
  let providers = 0;

  const { data: conns, error } = await admin
    .from("scheduling_google_connections")
    .select("id, tenant_id, provider_id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, status, calendar_id, sync_token")
    .eq("status", "connected")
    .limit(100);

  if (error) return jsonResponse({ error: error.message }, 500);

  const nowIso = new Date().toISOString();

  for (const conn of conns ?? []) {
    try {
      const token = await getValidGoogleAccessToken(admin, conn as never);
      if (!token) continue;
      providers++;
      const calendarId = String(conn.calendar_id ?? "primary");

      const { events, nextSyncToken } = await listEventsIncremental(token, calendarId, {
        syncToken: conn.sync_token,
        timeMinIso: nowIso,
      });

      for (const ev of events) {
        // Anti-eco: ignora eventos que o próprio WChat criou.
        if (ev.extendedProperties?.private?.wchat_appointment_id) continue;

        const matchExisting = admin
          .from("scheduling_exceptions")
          .select("id")
          .eq("tenant_id", conn.tenant_id)
          .eq("provider_id", conn.provider_id)
          .eq("google_event_id", ev.id)
          .maybeSingle();

        // Cancelado/excluído no Google → remove o bloqueio importado.
        if (ev.status === "cancelled") {
          const { data: existing } = await matchExisting;
          if (existing) {
            await admin.from("scheduling_exceptions").delete().eq("id", existing.id);
            removed++;
          }
          continue;
        }

        const startIso = ev.start?.dateTime;
        const endIso = ev.end?.dateTime;
        if (!startIso || !endIso) continue; // ignora eventos de dia inteiro

        const { data: existing } = await matchExisting;
        const payload = {
          tenant_id: conn.tenant_id,
          provider_id: conn.provider_id,
          kind: "block",
          starts_at: startIso,
          ends_at: endIso,
          reason: ev.summary ?? "Ocupado (Google)",
          source: "google",
          google_event_id: ev.id,
        };
        if (existing) {
          await admin.from("scheduling_exceptions").update(payload).eq("id", existing.id);
        } else {
          await admin.from("scheduling_exceptions").insert(payload);
        }
        imported++;
      }

      await admin
        .from("scheduling_google_connections")
        .update({ sync_token: nextSyncToken, last_sync_at: nowIso, last_error: null })
        .eq("id", conn.id);
    } catch (err) {
      await admin
        .from("scheduling_google_connections")
        .update({ last_error: (err instanceof Error ? err.message : "pull error").slice(0, 500) })
        .eq("id", conn.id);
    }
  }

  return jsonResponse({ ok: true, providers, imported, removed });
});
