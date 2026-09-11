import { timingSafeEqual } from "./timing-safe-equal.ts";
import { portalHash, portalUuid } from "./legal-portal.ts";

export type JudicialEnvironment = (name: string) => string | undefined;
export type JudicialProvider = "escavador" | "datajud";
export type JudicialOperation = "consult_cnj" | "discover_oab" | "monitor_process" | "monitor_diary" | "read_updates" | "reconcile_monitor";
export interface JudicialBinding { tenantId: string; accountId: string; provider: JudicialProvider }
export interface JudicialConfig extends JudicialBinding { token: string }
export interface JudicialJob {
  id: string; lease_token: string; operation: JudicialOperation;
  query: Record<string, unknown>; max_requests: number; request_count: number;
  connection: { provider: string; account_id: string; environment: string };
  source_version_id: string;
}
export type JudicialRecord = Record<string, unknown>;
export interface JudicialCandidate { cnj?: string; oab_number?: string; oab_state?: string; title?: string }
export interface JudicialEnvelope {
  eventId: string; raw: string; payload: JudicialRecord;
}
export type JudicialHttpResult =
  | { ok: true; raw: string; value: JudicialRecord; status: number }
  | { ok: false; status: number | null; error: string; ambiguous: boolean; retryable: boolean };
export const JUDICIAL_MAX_BYTES = 1024 * 1024;
export const ESCAVADOR_ORIGIN = "https://api.escavador.com";
const tokenPattern = /^[\x21-\x7e]{32,4096}$/;
const states = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const callbackEvents = new Set(["novo_processo", "nova_movimentacao", "novo_documento", "processo_verificado", "processo_encontrado", "processo_nao_encontrado", "diario_movimentacao_nova", "diario_citacao_nova"]);

export function judicialBinding(env: JudicialEnvironment, provider: JudicialProvider): JudicialBinding | null {
  const prefix = provider === "escavador" ? "LEGAL_ESCAVADOR" : "LEGAL_DATAJUD";
  const tenantId = env(`${prefix}_TENANT_ID`)?.trim(); const accountId = env(`${prefix}_ACCOUNT_ID`)?.trim();
  if (!tenantId || !portalUuid.test(tenantId) || !accountId || !/^[A-Za-z0-9_.:-]{1,120}$/.test(accountId)) return null;
  return { tenantId, accountId, provider };
}
export function judicialConfig(env: JudicialEnvironment, binding: JudicialBinding): JudicialConfig | null {
  // A public DataJud key does not authorize commercial use. No executable DataJud transport exists here.
  if (binding.provider !== "escavador" || env("LEGAL_ESCAVADOR_ENABLED") !== "true") return null;
  const token = env("LEGAL_ESCAVADOR_API_TOKEN")?.trim();
  return token && tokenPattern.test(token) ? { ...binding, token } : null;
}
export function validJudicialSecret(supplied: string | null, expected: string | undefined): boolean {
  return !!supplied && !!expected && tokenPattern.test(expected) && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export function validJudicialCallback(request: Request, env: JudicialEnvironment): boolean {
  const expected = env("LEGAL_ESCAVADOR_CALLBACK_TOKEN")?.trim();
  if (!expected || expected === env("LEGAL_ESCAVADOR_API_TOKEN")?.trim() || expected === env("CRON_SECRET")) return false;
  return validJudicialSecret(request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1] ?? null, expected);
}
export function judicialObject(value: unknown): JudicialRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_shape");
  return value as JudicialRecord;
}
export function judicialIdentifier(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}
export function judicialCnj(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:\d{20}|\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})$/.test(value)) return null;
  const digits = value.replace(/[.-]/g, "");
  const check = 98n - BigInt(digits.slice(0, 7) + digits.slice(9) + "00") % 97n;
  return BigInt(digits.slice(7, 9)) === check ? digits : null;
}
function cnjFormatted(value: unknown): string {
  const v = judicialCnj(value); if (!v) throw new Error("invalid_cnj");
  return `${v.slice(0, 7)}-${v.slice(7, 9)}.${v.slice(9, 13)}.${v.slice(13, 14)}.${v.slice(14, 16)}.${v.slice(16)}`;
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || [...value].some((char) => char.charCodeAt(0) < 32)) throw new Error("invalid_query");
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error("invalid_query");
  return value;
}
export interface JudicialRequest { url: URL; method: "GET" | "POST"; body?: JudicialRecord }
export function judicialRequest(job: JudicialJob): JudicialRequest {
  const q = judicialObject(job.query);
  if (["url", "endpoint", "base_url", "headers", "body"].some((key) => key in q)) throw new Error("invalid_query");
  let request: JudicialRequest;
  switch (job.operation) {
    case "consult_cnj": request = { url: new URL(`/api/v2/processos/numero_cnj/${cnjFormatted(q.cnj)}`, ESCAVADOR_ORIGIN), method: "GET" }; break;
    case "read_updates": request = { url: new URL(`/api/v2/processos/numero_cnj/${cnjFormatted(q.cnj)}/movimentacoes`, ESCAVADOR_ORIGIN), method: "GET" }; request.url.searchParams.set("limit", "20"); break;
    case "discover_oab": {
      const number = text(q.oab_number, 20); const state = text(q.oab_state, 2);
      const type = q.oab_type === undefined ? "ADVOGADO" : text(q.oab_type, 32);
      if (!/^\d{1,12}[A-Z]?$/.test(number) || !states.has(state) || !["ADVOGADO", "ESTAGIARIO", "SUPLEMENTAR", "CONSULTOR_ESTRANGEIRO"].includes(type)) throw new Error("invalid_oab");
      const url = new URL("/api/v2/advogado/processos", ESCAVADOR_ORIGIN);
      url.searchParams.set("oab_numero", number); url.searchParams.set("oab_estado", state); url.searchParams.set("oab_tipo", type); url.searchParams.set("limit", "20");
      request = { url, method: "GET" }; break;
    }
    case "monitor_process": request = { url: new URL("/api/v2/monitoramentos/processos", ESCAVADOR_ORIGIN), method: "POST", body: { numero: cnjFormatted(q.cnj), documentos_publicos: false } }; break;
    case "monitor_diary": {
      if (!Array.isArray(q.origins_ids) || q.origins_ids.length < 1 || q.origins_ids.length > 20) throw new Error("missing_diary_origins");
      const origins = [...new Set(q.origins_ids.map((v) => integer(v, 1, 2147483647)))];
      const variations = q.variations === undefined ? [] : q.variations;
      if (!Array.isArray(variations) || variations.length > 3) throw new Error("invalid_variations");
      request = { url: new URL("/api/v1/monitoramentos", ESCAVADOR_ORIGIN), method: "POST", body: { tipo: "termo", termo: text(q.term, 200), origens_ids: origins, variacoes: variations.map((v) => text(v, 200)), limite_aparicoes: integer(q.limit_appearances, 1, 10000) } }; break;
    }
    case "reconcile_monitor": {
      const id = judicialIdentifier(q.provider_monitor_id);
      if (!id || !/^\d+$/.test(id) || !["process", "diary"].includes(String(q.monitor_kind))) throw new Error("monitor_identity_required");
      request = { url: new URL(q.monitor_kind === "process" ? `/api/v2/monitoramentos/processos/${id}` : `/api/v1/monitoramentos/${id}`, ESCAVADOR_ORIGIN), method: "GET" }; break;
    }
    default: throw new Error("unsupported_operation");
  }
  if (q.cursor !== undefined && q.cursor !== null) {
    if (!["discover_oab", "read_updates"].includes(job.operation)) throw new Error("invalid_cursor");
    const cursor = judicialObject(q.cursor);
    if (Object.keys(cursor).some((key) => !["cursor", "li", "page"].includes(key))) throw new Error("invalid_cursor");
    for (const [key, value] of Object.entries(cursor)) {
      const v = key === "page" && typeof value === "number" ? String(integer(value, 1, 1000000)) : text(value, 1000);
      if (!(key === "cursor" ? /^[A-Za-z0-9_+/=-]+$/ : /^\d{1,20}$/).test(v)) throw new Error("invalid_cursor");
      request.url.searchParams.set(key, v);
    }
  }
  return request;
}

/** Only pagination fields can change; the origin, route and original search scope cannot. */
export function judicialNextPage(value: JudicialRecord, current: URL, initial: URL): URL | null {
  const links = value.links === undefined ? null : judicialObject(value.links);
  const next = links?.next; if (next === undefined || next === null) return null;
  if (typeof next !== "string" || next.length > 4096) throw new Error("unsafe_pagination");
  const url = new URL(next, current);
  if (url.origin !== ESCAVADOR_ORIGIN || url.username || url.password || url.hash || url.pathname !== initial.pathname || url.href === current.href) throw new Error("unsafe_pagination");
  const paging = new Set(["cursor", "li", "page"]);
  for (const key of url.searchParams.keys()) {
    if (url.searchParams.getAll(key).length !== 1) throw new Error("unsafe_pagination");
    if (!paging.has(key) && (!initial.searchParams.has(key) || url.searchParams.get(key) !== initial.searchParams.get(key))) throw new Error("unsafe_pagination");
    if (paging.has(key) && !(key === "cursor" ? /^[A-Za-z0-9_+/=-]{1,1000}$/ : /^\d{1,20}$/).test(url.searchParams.get(key)!)) throw new Error("unsafe_pagination");
  }
  for (const [key, value] of initial.searchParams) if (!paging.has(key)) url.searchParams.set(key, value);
  return url;
}
export function judicialCursor(url: URL): JudicialRecord {
  return Object.fromEntries([...url.searchParams].filter(([key]) => ["cursor", "li", "page"].includes(key)));
}
export async function judicialBytes(stream: ReadableStream<Uint8Array> | null, maximum = JUDICIAL_MAX_BYTES, timeoutMs = 8000): Promise<Uint8Array> {
  if (!stream) throw new Error("empty_body");
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maximum) throw new Error("body_too_large"); chunks.push(value); } })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("body_timeout")), timeoutMs); }),
    ]);
  } catch (error) { void reader.cancel().catch(() => undefined); throw error; }
  finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function judicialJson(bytes: Uint8Array): { raw: string; value: JudicialRecord } {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!raw || raw.includes("\u0000")) throw new Error("invalid_json");
  return { raw, value: judicialObject(JSON.parse(raw)) };
}
export async function judicialFetch(config: JudicialConfig, request: JudicialRequest, fetcher: typeof fetch, timeoutMs = 8000): Promise<JudicialHttpResult> {
  if (config.provider !== "escavador" || request.url.origin !== ESCAVADOR_ORIGIN) throw new Error("unsupported_provider");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let gotResponse = false;
  try {
    return await Promise.race([
      (async (): Promise<JudicialHttpResult> => {
        const response = await fetcher(request.url.href, { method: request.method, redirect: "error", signal: controller.signal, headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json", ...(request.body ? { "Content-Type": "application/json" } : {}) }, ...(request.body ? { body: JSON.stringify(request.body) } : {}) });
        gotResponse = true;
        if (!response.ok) {
          await response.body?.cancel();
          return { ok: false, status: response.status, error: response.status === 429 ? "rate_limited" : response.status === 402 ? "quota_exhausted" : response.status === 401 || response.status === 403 ? "provider_unauthorized" : response.status === 404 ? "not_found" : "provider_error", ambiguous: request.method === "POST" && ![400, 401, 402, 403, 404, 422].includes(response.status), retryable: request.method === "GET" && [502, 503, 504].includes(response.status) };
        }
        const { raw, value } = judicialJson(await judicialBytes(response.body));
        return { ok: true, raw, value, status: response.status };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs); }),
    ]);
  } catch {
    controller.abort();
    return { ok: false, status: null, error: gotResponse ? "invalid_or_incomplete_response" : "transport_error", ambiguous: request.method === "POST", retryable: request.method === "GET" && !gotResponse };
  } finally { if (timer) clearTimeout(timer); }
}

function candidatesOf(value: JudicialRecord, job?: JudicialJob): JudicialCandidate[] {
  const rows = Array.isArray(value.items) ? value.items.slice(0, 100) : [value.processo ?? value];
  const found = new Map<string, JudicialCandidate>();
  for (const item of rows) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as JudicialRecord;
    const cnj = judicialCnj(row.numero_cnj ?? row.numero ?? row.numero_unico);
    if (cnj) found.set(cnj, { cnj });
  }
  // A query's process number is only a candidate for human association, never a grant.
  const cnj = judicialCnj(job?.query.cnj); if (cnj) found.set(cnj, { cnj });
  return [...found.values()];
}
export async function judicialPageEnvelope(raw: string, value: JudicialRecord, job: JudicialJob, url: URL): Promise<JudicialEnvelope> {
  const hash = await portalHash(raw);
  return { eventId: `response:${job.id}:${await portalHash(url.pathname + url.search)}`, raw, payload: {
    original_sha256: hash, event_type: `response_${job.operation}`, provider_monitor_ids: [], candidates: candidatesOf(value, job),
    parser_version: "escavador-f6-v1", source_updated_at: null, published_on: null,
  } };
}
export async function judicialCallbackEnvelope(raw: string, value: JudicialRecord): Promise<JudicialEnvelope> {
  const hash = await portalHash(raw); const id = judicialIdentifier(value.uuid);
  const event = typeof value.event === "string" && /^[a-z_]{1,80}$/.test(value.event) ? value.event : "unsupported_event";
  const monitors = Array.isArray(value.monitoramento) ? value.monitoramento : value.monitoramento ? [value.monitoramento] : [];
  const ids = [...new Set(monitors.slice(0, 100).map((monitor) => monitor && typeof monitor === "object" ? judicialIdentifier((monitor as JudicialRecord).id) : null).filter((v): v is string => !!v && v.length <= 120))];
  const candidates = candidatesOf(value);
  for (const monitor of monitors.slice(0, 100)) {
    if (monitor && typeof monitor === "object") { const cnj = judicialCnj((monitor as JudicialRecord).numero); if (cnj && candidates.length < 100 && !candidates.some((v) => v.cnj === cnj)) candidates.push({ cnj }); }
  }
  return { eventId: id ?? `unidentified:${hash}`, raw, payload: {
    original_sha256: hash, event_type: event, provider_monitor_ids: ids, candidates,
    parser_version: "escavador-f6-v1", source_updated_at: null, published_on: null,
    quarantine_reason: !id ? "missing_event_id" : !callbackEvents.has(event) ? "unsupported_event" : monitors.length > 100 ? "too_many_monitors" : null,
  } };
}
