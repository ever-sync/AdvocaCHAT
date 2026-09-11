import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { limitedBody } from "./limited-body.ts";

export type PortalAdmin = SupabaseClient;
export const portalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const portalToken = /^[0-9a-f]{64}$/;
export const portalHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export class PortalError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function portalReply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: portalHeaders });
}
export function portalFailure(error: unknown) {
  return portalReply({ error: error instanceof PortalError ? error.message : "Não foi possível concluir a operação." }, error instanceof PortalError ? error.status : 503);
}
export function portalMethod(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: portalHeaders });
  if (request.method !== "POST") return portalReply({ error: "Método não permitido." }, 405);
  return null;
}
export async function portalBody(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new PortalError(415, "Envie uma solicitação JSON.");
  const bytes = await limitedBody(request, limit);
  if (!bytes) throw new PortalError(413, "Solicitação muito grande.");
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new PortalError(400, "Solicitação inválida."); }
}
export function portalFields(body: Record<string, unknown>, names: string[]) {
  if (Object.keys(body).some((key) => !names.includes(key))) throw new PortalError(400, "Campos não permitidos.");
}
export function portalId(value: unknown): string {
  if (typeof value !== "string" || !portalUuid.test(value)) throw new PortalError(400, "Identificador inválido.");
  return value;
}
export function portalString(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\u0000")) throw new PortalError(400, "Texto inválido.");
  return value.trim();
}
export function portalCategory(value: unknown): string {
  if (typeof value !== "string" || !["general", "medical", "fiscal"].includes(value)) throw new PortalError(400, "Categoria inválida.");
  return value;
}
export function portalSecret(value: unknown): string {
  if (typeof value !== "string" || !portalToken.test(value)) throw new PortalError(404, "Convite indisponível.");
  return value;
}
export async function portalHash(value: string | Uint8Array): Promise<string> {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function newPortalToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function portalRpc<T>(admin: PortalAdmin, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : error.code === "23505" ? 409 : 503;
    throw new PortalError(status, status === 403 ? "Acesso indisponível ou autorização alterada." : "Não foi possível concluir a operação. Confira a situação e tente novamente.");
  }
  return data as T;
}
export function assertPortalUser(user: User | null): asserts user is User {
  if (!user || !portalUuid.test(user.id) || user.role !== "legal_portal" || user.app_metadata?.legal_portal !== true) throw new PortalError(403, "Acesso exclusivo do portal.");
}
export async function portalUser(admin: PortalAdmin, request: Request, kind: "portal" | "staff"): Promise<User> {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)?.[1];
  if (!token || token.length > 16384) throw new PortalError(401, "Entre na sua conta.");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new PortalError(401, "Sessão inválida ou expirada.");
  const user = data.user;
  if (kind === "portal") assertPortalUser(user);
  else {
    if (user.role !== "authenticated" || user.app_metadata?.legal_portal === true) throw new PortalError(403, "Acesso interno necessário.");
    const profile = await admin.from("profiles").select("id,status,tenant_id").eq("id", user.id).maybeSingle();
    if (profile.error || profile.data?.status !== "active" || !profile.data?.tenant_id) throw new PortalError(403, "Acesso interno indisponível.");
  }
  return user;
}
