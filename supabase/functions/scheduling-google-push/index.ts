// scheduling-google-push: worker (cron) que espelha agendamentos do WChat no
// Google Calendar do prestador. Processa linhas com google_sync_status
// 'pending'/'error': cria/atualiza/remove o evento e guarda o google_event_id.
// Só aceita chamada interna (x-cron-secret).
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import {
  deleteCalendarEvent,
  getValidGoogleAccessToken,
  insertCalendarEvent,
  patchCalendarEvent,
} from "../_shared/google.ts";

type Appt = {
  id: string;
  provider_id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  service_nome: string | null;
  customer_nome: string | null;
  customer_telefone: string | null;
  notes: string | null;
  google_event_id: string | null;
  google_calendar_id: string | null;
};

type ConnCacheEntry = { token: string; calendarId: string } | null;

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (!isInternalRequest(request)) return jsonResponse({ error: "Forbidden." }, 401);

  const admin = createAdminClient();
  let synced = 0;
  let skipped = 0;
  let errored = 0;

  const connCache = new Map<string, ConnCacheEntry>();
  async function getConn(tenantId: string, providerId: string): Promise<ConnCacheEntry> {
    const cacheKey = `${tenantId}:${providerId}`;
    if (connCache.has(cacheKey)) return connCache.get(cacheKey)!;
    const { data: conn } = await admin
      .from("scheduling_google_connections")
      .select("id, tenant_id, provider_id, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, status, calendar_id")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .maybeSingle();
    if (!conn || conn.status === "revoked") {
      connCache.set(cacheKey, null);
      return null;
    }
    const token = await getValidGoogleAccessToken(admin, conn as never);
    const entry: ConnCacheEntry = token ? { token, calendarId: String(conn.calendar_id ?? "primary") } : null;
    connCache.set(cacheKey, entry);
    return entry;
  }

  const { data: rows, error } = await admin
    .from("scheduling_appointments")
    .select("id, tenant_id, provider_id, status, starts_at, ends_at, service_nome, customer_nome, customer_telefone, notes, google_event_id, google_calendar_id")
    .in("google_sync_status", ["pending", "error"])
    .order("updated_at", { ascending: true })
    .limit(50);

  if (error) return jsonResponse({ error: error.message }, 500);

  for (const r of (rows ?? []) as (Appt & { tenant_id: string })[]) {
    const setStatus = (patch: Record<string, unknown>) =>
      admin.from("scheduling_appointments").update(patch).eq("id", r.id);

    try {
      const conn = await getConn(r.tenant_id, r.provider_id);
      if (!conn) {
        await setStatus({ google_sync_status: "skip" });
        skipped++;
        continue;
      }

      const isCancelled = r.status === "cancelado" || r.status === "nao_compareceu";

      if (isCancelled) {
        if (r.google_event_id) {
          await deleteCalendarEvent(conn.token, r.google_calendar_id ?? conn.calendarId, r.google_event_id);
        }
        await setStatus({
          google_sync_status: "synced",
          google_synced_at: new Date().toISOString(),
          google_sync_error: null,
        });
        synced++;
        continue;
      }

      const eventInput = {
        summary: `${r.service_nome ?? "Agendamento"}${r.customer_nome ? ` - ${r.customer_nome}` : ""}`,
        description: [r.customer_telefone ? `Tel: ${r.customer_telefone}` : null, r.notes || null]
          .filter(Boolean)
          .join("\n"),
        startIso: r.starts_at,
        endIso: r.ends_at,
        appointmentId: r.id,
      };

      if (r.google_event_id) {
        await patchCalendarEvent(conn.token, r.google_calendar_id ?? conn.calendarId, r.google_event_id, eventInput);
        await setStatus({
          google_sync_status: "synced",
          google_synced_at: new Date().toISOString(),
          google_sync_error: null,
        });
      } else {
        const eventId = await insertCalendarEvent(conn.token, conn.calendarId, eventInput);
        await setStatus({
          google_event_id: eventId,
          google_calendar_id: conn.calendarId,
          google_sync_status: "synced",
          google_synced_at: new Date().toISOString(),
          google_sync_error: null,
        });
      }
      synced++;
    } catch (err) {
      await setStatus({
        google_sync_status: "error",
        google_sync_error: (err instanceof Error ? err.message : "erro").slice(0, 500),
      });
      errored++;
    }
  }

  return jsonResponse({ ok: true, synced, skipped, errored, scanned: rows?.length ?? 0 });
});
