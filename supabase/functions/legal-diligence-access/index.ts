import { createDiligenceAdmin } from "../_shared/legal-diligence-client.ts";
import { createDiligenceAccessHandler } from "../_shared/legal-diligence-access.ts";
Deno.serve(
  createDiligenceAccessHandler(
    createDiligenceAdmin,
    (name) => Deno.env.get(name),
  ),
);
