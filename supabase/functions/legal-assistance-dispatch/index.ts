import { createAssistanceAdminClient } from "../_shared/legal-assistance-client.ts";
import { createLegalAssistanceHandler } from "../_shared/legal-assistance-handlers.ts";
Deno.serve(createLegalAssistanceHandler(createAssistanceAdminClient, (name) => Deno.env.get(name)));
