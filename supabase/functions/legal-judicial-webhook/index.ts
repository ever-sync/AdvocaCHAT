import { createJudicialAdminClient } from "../_shared/legal-judicial-client.ts";
import { createLegalJudicialWebhookHandler } from "../_shared/legal-judicial-handlers.ts";
Deno.serve(createLegalJudicialWebhookHandler(createJudicialAdminClient, (name) => Deno.env.get(name)));
