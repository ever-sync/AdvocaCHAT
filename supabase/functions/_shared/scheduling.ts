// Núcleo do cálculo de disponibilidade, compartilhado entre a função authed
// (scheduling-availability) e a pública (scheduling-public).
//   slots livres = expediente (working_hours na tz do prestador, DST-correto)
//                  + exceções 'extra' − exceções 'block' − agendamentos ativos
//   (F2/F3 acrescentam a ocupação do Google freebusy).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { fetchProviderGoogleBusy } from "./google.ts";

export type Interval = { start: number; end: number }; // epoch ms (UTC)

export type AvailabilityParams = {
  providerId: string;
  serviceId?: string | null;
  serviceIds?: string[] | null;
  /** Quando informado, também subtrai a ocupação dessa sala. */
  roomId?: string | null;
  from: string; // YYYY-MM-DD (tz do prestador)
  to: string;
};

export type AvailabilityResult = {
  timezone: string;
  days: { date: string; slots: { startsAt: string; endsAt: string }[] }[];
};

const DAY_MS = 86_400_000;

function tzOffsetMs(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instant))) map[p.type] = p.value;
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - instant;
}

export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let offset = tzOffsetMs(guess, timeZone);
  let result = guess - offset;
  const offset2 = tzOffsetMs(result, timeZone);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset;
  }
  return result;
}

function partsInTz(instant: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instant))) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function parseHm(value: string): { h: number; m: number } {
  const [h, m] = String(value).split(":");
  return { h: Number(h), m: Number(m) };
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  return out;
}

function subtractIntervals(windows: Interval[], busy: Interval[]): Interval[] {
  let result = [...windows];
  for (const b of busy) {
    const next: Interval[] = [];
    for (const w of result) {
      if (b.end <= w.start || b.start >= w.end) {
        next.push(w);
        continue;
      }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    result = next;
  }
  return result.filter((w) => w.end > w.start);
}

export async function computeAvailability(
  admin: SupabaseClient,
  tenantId: string,
  params: AvailabilityParams,
): Promise<AvailabilityResult> {
  const { providerId } = params;
  const serviceId = params.serviceId ?? null;
  const fromDate = params.from;
  const toDate = params.to;

  const { data: settingsRow } = await admin
    .from("scheduling_provider_settings")
    .select("timezone, slot_granularity_min, min_lead_time_min, max_advance_days")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .maybeSingle();

  const timezone = String(settingsRow?.timezone ?? "America/Sao_Paulo");
  const granularity = Number(settingsRow?.slot_granularity_min ?? 15);
  const minLead = Number(settingsRow?.min_lead_time_min ?? 60);
  const maxAdvance = Number(settingsRow?.max_advance_days ?? 60);

  let duration = 30;
  let bufferAntes = 0;
  let bufferDepois = 0;

  const serviceIds = params.serviceIds ?? (params.serviceId ? [params.serviceId] : null);

  if (serviceIds && serviceIds.length > 0) {
    const { data: svcs } = await admin
      .from("scheduling_services")
      .select("product_id, duracao_min, buffer_antes_min, buffer_depois_min")
      .eq("tenant_id", tenantId)
      .eq("provider_id", providerId)
      .in("product_id", serviceIds)
      .eq("ativo", true);

    if (svcs && svcs.length > 0) {
      const svcMap = new Map(svcs.map((s) => [String(s.product_id), s]));
      let totalDuration = 0;
      let firstBufferAntes = 0;
      let lastBufferDepois = 0;

      for (let i = 0; i < serviceIds.length; i++) {
        const sId = serviceIds[i];
        const s = svcMap.get(sId);
        if (s) {
          totalDuration += Number(s.duracao_min ?? 30);
          if (i === 0) {
            firstBufferAntes = Number(s.buffer_antes_min ?? 0);
          }
          if (i === serviceIds.length - 1) {
            lastBufferDepois = Number(s.buffer_depois_min ?? 0);
          }
        } else {
          totalDuration += 30;
        }
      }

      duration = totalDuration;
      bufferAntes = firstBufferAntes;
      bufferDepois = lastBufferDepois;
    }
  }

  const rangeStart = zonedWallTimeToUtc(
    Number(fromDate.slice(0, 4)), Number(fromDate.slice(5, 7)), Number(fromDate.slice(8, 10)), 0, 0, timezone,
  );
  const rangeEnd = zonedWallTimeToUtc(
    Number(toDate.slice(0, 4)), Number(toDate.slice(5, 7)), Number(toDate.slice(8, 10)), 23, 59, timezone,
  );

  const { data: whRows } = await admin
    .from("scheduling_working_hours")
    .select("weekday, start_time, end_time")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId);

  const { data: excRows } = await admin
    .from("scheduling_exceptions")
    .select("kind, starts_at, ends_at")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .lte("starts_at", new Date(rangeEnd).toISOString())
    .gte("ends_at", new Date(rangeStart).toISOString());

  const { data: apptRows } = await admin
    .from("scheduling_appointments")
    .select("starts_at, ends_at, status")
    .eq("tenant_id", tenantId)
    .eq("provider_id", providerId)
    .not("status", "in", "(cancelado,nao_compareceu)")
    .lte("starts_at", new Date(rangeEnd + DAY_MS).toISOString())
    .gte("ends_at", new Date(rangeStart - DAY_MS).toISOString());

  const blocks: Interval[] = [];
  const extras: Interval[] = [];
  for (const e of excRows ?? []) {
    const iv = { start: new Date(String(e.starts_at)).getTime(), end: new Date(String(e.ends_at)).getTime() };
    if (e.kind === "extra") extras.push(iv);
    else blocks.push(iv);
  }
  const appts: Interval[] = (apptRows ?? []).map((a) => ({
    start: new Date(String(a.starts_at)).getTime() - bufferAntes * 60_000,
    end: new Date(String(a.ends_at)).getTime() + bufferDepois * 60_000,
  }));

  // Ocupação da sala (Fase D): horários em que a sala já está em uso (por qualquer
  // prestador) também não estão disponíveis.
  const roomId = params.roomId ?? null;
  if (roomId) {
    const { data: roomRows } = await admin
      .from("scheduling_appointments")
      .select("starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .eq("room_id", roomId)
      .not("status", "in", "(cancelado,nao_compareceu)")
      .lte("starts_at", new Date(rangeEnd + DAY_MS).toISOString())
      .gte("ends_at", new Date(rangeStart - DAY_MS).toISOString());
    for (const r of roomRows ?? []) {
      appts.push({
        start: new Date(String(r.starts_at)).getTime(),
        end: new Date(String(r.ends_at)).getTime(),
      });
    }
  }

  // Ocupação do Google Calendar do prestador (F2). Não quebra se não conectado.
  const googleBusy = await fetchProviderGoogleBusy(
    admin,
    tenantId,
    providerId,
    new Date(rangeStart).toISOString(),
    new Date(rangeEnd).toISOString(),
  );

  const now = Date.now();
  const earliest = now + minLead * 60_000;
  const latest = now + maxAdvance * DAY_MS;
  const stepMs = granularity * 60_000;
  const durationMs = duration * 60_000;

  const days: AvailabilityResult["days"] = [];
  let cursor = rangeStart;
  let i = 0;
  while (cursor <= rangeEnd && i < 370) {
    i++;
    const { year, month, day, weekday } = partsInTz(cursor, timezone);
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    let windows: Interval[] = [];
    for (const wh of whRows ?? []) {
      if (Number(wh.weekday) !== weekday) continue;
      const s = parseHm(String(wh.start_time));
      const e = parseHm(String(wh.end_time));
      windows.push({
        start: zonedWallTimeToUtc(year, month, day, s.h, s.m, timezone),
        end: zonedWallTimeToUtc(year, month, day, e.h, e.m, timezone),
      });
    }
    for (const ex of extras) windows.push(ex);

    windows = mergeIntervals(windows);
    const free = subtractIntervals(windows, [...blocks, ...appts, ...googleBusy]);

    const slots: { startsAt: string; endsAt: string }[] = [];
    for (const w of free) {
      let t = Math.ceil(w.start / stepMs) * stepMs;
      while (t + durationMs <= w.end) {
        if (t >= earliest && t <= latest) {
          slots.push({ startsAt: new Date(t).toISOString(), endsAt: new Date(t + durationMs).toISOString() });
        }
        t += stepMs;
      }
    }
    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    days.push({ date: dateStr, slots });

    cursor = zonedWallTimeToUtc(year, month, day, 12, 0, timezone) + DAY_MS;
  }

  return { timezone, days };
}
