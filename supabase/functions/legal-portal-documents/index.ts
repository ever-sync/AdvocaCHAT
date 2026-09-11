import { createAdminClient } from "../_shared/supabase.ts";
import { createPortalDocumentsHandler } from "../_shared/legal-portal-documents.ts";
Deno.serve(createPortalDocumentsHandler(createAdminClient));
