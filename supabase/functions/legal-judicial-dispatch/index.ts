import { createJudicialAdminClient } from "../_shared/legal-judicial-client.ts";
import { createLegalJudicialDispatchHandler } from "../_shared/legal-judicial-handlers.ts";
Deno.serve(createLegalJudicialDispatchHandler(createJudicialAdminClient, (name) => Deno.env.get(name)));
