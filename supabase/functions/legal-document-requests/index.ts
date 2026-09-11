import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createAdminClient, getRequiredEnv } from "../_shared/supabase.ts";
import { corsHeaders, handleCors } from "../_shared/http.ts";
import { limitedBody } from "../_shared/limited-body.ts";
import { LEGAL_DOCUMENT_MAX_BYTES, validateLegalDocument } from "../_shared/legal-document-validation.ts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern = /^[0-9a-f]{64}$/;
const bucket = "legal-case-documents";
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
async function hash(bytes: Uint8Array) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)))); }
function reply(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
const unavailable = () => reply({ error: "Este link está indisponível, expirou ou já foi utilizado. Solicite outro ao escritório." }, 404);

Deno.serve(async (request: Request) => {
  const cors = handleCors(request); if (cors) return cors;
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const admin = createAdminClient();
    if (request.headers.get("Content-Type")?.includes("application/json")) {
      const bytes = await limitedBody(request, 4096); if (!bytes) return reply({ error: "Solicitação muito grande." }, 413);
      let body; try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return reply({ error: "Solicitação inválida." }, 400); }
      if (body?.action === "issue") {
        const authorization = request.headers.get("Authorization") ?? "";
        const jwt = authorization.match(/^Bearer (.+)$/i)?.[1]; if (!jwt) return reply({ error: "Entre na sua conta." }, 401);
        const identity = await admin.auth.getUser(jwt); if (identity.error || !identity.data.user) return reply({ error: "Sessão inválida." }, 401);
        if (typeof body.request_id !== "string" || !uuid.test(body.request_id)) return reply({ error: "Solicitação inválida." }, 400);
        const user = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const issued = await user.rpc("legal_issue_document_request_token", { p_request_id: body.request_id, p_token_hash: await hash(new TextEncoder().encode(token)), p_expires_at: expiresAt });
        if (issued.error) return reply({ error: "Não foi possível liberar um link para esta solicitação. Confira o acesso e a situação." }, 403);
        return reply({ token, expires_at: expiresAt });
      }
      const publicToken = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
      if (body?.action !== "inspect" || !tokenPattern.test(publicToken)) return unavailable();
      const inspected = await admin.rpc("legal_public_document_request", { p_token_hash: await hash(new TextEncoder().encode(publicToken)) });
      if (inspected.error || !inspected.data) return unavailable();
      // Do not expose case/client IDs, category, custom title/instructions or filenames.
      return reply({ available: true, expires_at: inspected.data.expires_at, max_bytes: LEGAL_DOCUMENT_MAX_BYTES });
    }
    if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) return reply({ error: "Envie um arquivo." }, 400);
    const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
    if (!tokenPattern.test(token)) return unavailable();
    const tokenHash = await hash(new TextEncoder().encode(token));
    const access = await admin.rpc("legal_public_document_request", { p_token_hash: tokenHash });
    if (access.error || !access.data) return unavailable();
    const bytes = await limitedBody(request, LEGAL_DOCUMENT_MAX_BYTES + 64 * 1024); if (!bytes) return reply({ error: "Arquivo maior que 10 MB." }, 413);
    let form; try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: new Blob([new Uint8Array(bytes)]) }).formData(); } catch { return reply({ error: "Arquivo inválido." }, 400); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.trim() || file.name.length > 200) return reply({ error: "Selecione um arquivo válido." }, 400);
    const content = new Uint8Array(await file.arrayBuffer()); const validation = validateLegalDocument(content, file.type);
    if (validation) return reply({ error: validation }, 400);
    const prepared = await admin.rpc("legal_public_prepare_request_upload", { p_token_hash: tokenHash, p_file_name: file.name, p_mime_type: file.type, p_size_bytes: content.length });
    if (prepared.error || !prepared.data) return unavailable();
    const document = prepared.data;
    const uploaded = await admin.storage.from(bucket).upload(document.storage_path, content, { contentType: file.type, upsert: false });
    const abandon = () => admin.rpc("legal_public_abandon_request_upload", { p_token_hash: tokenHash, p_document_id: document.id });
    if (uploaded.error) { await abandon(); return reply({ error: "O envio não foi concluído. Solicite outro link ao escritório." }, 503); }
    const finalized = await admin.rpc("legal_public_finalize_request_upload", { p_token_hash: tokenHash, p_document_id: document.id, p_sha256: await hash(content) });
    if (finalized.error) { await admin.storage.from(bucket).remove([document.storage_path]); await abandon(); return unavailable(); }
    return reply({ received: true, message: "Documento recebido para revisão pelo escritório." }, 201);
  } catch {
    // Never log credentials, tokens, submitted contents or PII.
    return reply({ error: "Não foi possível concluir. Reabra o link ou procure o escritório." }, 500);
  }
});
