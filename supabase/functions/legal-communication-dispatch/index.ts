import { createAdminClient } from "../_shared/supabase.ts";
import { createLegalDispatchHandler } from "../_shared/legal-communication-handlers.ts";
Deno.serve(createLegalDispatchHandler(createAdminClient, (name) => Deno.env.get(name)));
