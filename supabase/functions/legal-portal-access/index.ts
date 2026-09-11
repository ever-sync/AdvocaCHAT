import { createAdminClient } from "../_shared/supabase.ts";
import { createPortalAccessHandler } from "../_shared/legal-portal-access.ts";
Deno.serve(createPortalAccessHandler(createAdminClient, (name) => Deno.env.get(name)));
