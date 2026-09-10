import { createClient } from "@supabase/supabase-js";

import { isE2eMockAuth } from "@/lib/e2e";


const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

/** E2E força modo mock local (sem API) mesmo se `.env` tiver credenciais. */
export const isSupabaseConfigured = !isE2eMockAuth && Boolean(supabaseUrl && supabaseAnonKey);
export { supabaseUrl, supabaseAnonKey };

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        lock: async (_name, _acquireTimeout, fn) => {
          return await fn();
        },
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
    );
  }

  return supabase;
}
