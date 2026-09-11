import { createAdminClient } from "../_shared/supabase.ts";
import { createLegalWebhookHandler } from "../_shared/legal-communication-handlers.ts";
Deno.serve(createLegalWebhookHandler(createAdminClient, (name) => Deno.env.get(name)));
