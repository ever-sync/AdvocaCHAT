// Retired public clinical-document submission. Old browser-side HMAC signatures
// were not an authorization boundary. Saved documents remain available internally.
import { handleCors, jsonResponse } from "../_shared/http.ts";

Deno.serve((request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  const response = jsonResponse({
    error: "Este link antigo foi descontinuado. Solicite um novo link seguro ao escritório.",
    code: "legacy_public_document_retired",
  }, 410);
  response.headers.set("Cache-Control", "no-store");
  return response;
});
