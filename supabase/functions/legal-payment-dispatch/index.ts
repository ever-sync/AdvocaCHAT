import { createAdminClient } from "../_shared/supabase.ts";
import { createLegalPaymentDispatchHandler } from "../_shared/legal-payment-handlers.ts";
Deno.serve(createLegalPaymentDispatchHandler(createAdminClient, (name) => Deno.env.get(name)));
