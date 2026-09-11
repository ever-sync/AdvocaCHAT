import { createAdminClient } from "../_shared/supabase.ts";
import { createLegalPaymentWebhookHandler } from "../_shared/legal-payment-handlers.ts";
Deno.serve(createLegalPaymentWebhookHandler(createAdminClient, (name) => Deno.env.get(name)));
