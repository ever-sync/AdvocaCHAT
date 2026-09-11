import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { getRequiredEnv } from "./supabase.ts";

export function createDiligenceAdmin() {
  // Only the configured Supabase origin is contacted; no judiciary/provider URL.
  const origin = new URL(getRequiredEnv("SUPABASE_URL")).origin;
  return createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) => {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
          );
          if (url.origin !== origin) {
            throw new Error("Unexpected diligence origin");
          }
          return fetch(input, {
            ...init,
            redirect: "error",
            signal: AbortSignal.any([
              ...(init?.signal ? [init.signal] : []),
              AbortSignal.timeout(8000),
            ]),
          });
        },
      },
    },
  );
}
