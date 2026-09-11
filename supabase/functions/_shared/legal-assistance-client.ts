// deno-lint-ignore no-import-prefix
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getRequiredEnv } from "./supabase.ts";

export function createAssistanceAdminClient() {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }) },
  });
}
