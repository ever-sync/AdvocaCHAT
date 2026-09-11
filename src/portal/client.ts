import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const portalUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const portalAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
export const PORTAL_STORAGE_KEY = `caleo-legal-portal-auth-v1:${portalUrl ? new URL(portalUrl).hostname : "unconfigured"}`;
export const PORTAL_CLOSED_KEY = `${PORTAL_STORAGE_KEY}:closed`;
let client: SupabaseClient | undefined;
export function portalConfiguration() {
  if (!portalUrl || !portalAnonKey)
    throw new Error(
      "O portal está indisponível neste endereço. Entre em contato com o escritório.",
    );
  return { url: portalUrl, anonKey: portalAnonKey };
}
export function getPortalClient() {
  const config = portalConfiguration();
  if (!client)
    client = createClient(config.url, config.anonKey, {
      auth: {
        storageKey: PORTAL_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  return client;
}
export function isPortalSessionClosed() {
  try {
    return localStorage.getItem(PORTAL_CLOSED_KEY) === "1";
  } catch {
    return false;
  }
}
export function markPortalSessionClosed(closed: boolean) {
  try {
    if (closed) {
      localStorage.setItem(PORTAL_CLOSED_KEY, "1");
      localStorage.removeItem(PORTAL_STORAGE_KEY);
    } else localStorage.removeItem(PORTAL_CLOSED_KEY);
  } catch {
    /* In-memory session state still closes the view. */
  }
}
