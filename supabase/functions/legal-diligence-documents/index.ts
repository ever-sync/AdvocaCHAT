import { createDiligenceAdmin } from "../_shared/legal-diligence-client.ts";
import { createDiligenceDocumentsHandler } from "../_shared/legal-diligence-documents.ts";
Deno.serve(createDiligenceDocumentsHandler(createDiligenceAdmin));
