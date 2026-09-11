import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { createAdminClient, getRequiredEnv } from "../_shared/supabase.ts";
import { corsHeaders, handleCors } from "../_shared/http.ts";
import { limitedBody } from "../_shared/limited-body.ts";
import { LEGAL_DOCUMENT_MAX_BYTES, legalDownloadHeaders, validateLegalDocument } from "../_shared/legal-document-validation.ts";

const bucket = "legal-case-documents";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function reply(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (request: Request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return reply("Método não permitido.", 405);

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply("Sessão inválida.", 401);
    const admin = createAdminClient();
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError || !identity.user) return reply("Sessão inválida.", 401);
    const { data: profile, error: profileError } = await admin.from("profiles").select("tenant_id,status").eq("id", identity.user.id).single();
    if (profileError || !profile?.tenant_id || profile.status !== "active") return reply("Acesso não autorizado.", 403);
    // Every metadata read and RPC below uses the user's JWT and physical-tenant RLS.
    const user = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (request.headers.get("Content-Type")?.includes("application/json")) {
      const body = await limitedBody(request, 4096);
      if (!body) return reply("Solicitação muito grande.", 413);
      let payload;
      try { payload = JSON.parse(new TextDecoder().decode(body)); } catch { return reply("Solicitação inválida.", 400); }
      if (!payload || payload.action !== "download" || typeof payload.document_id !== "string" || !uuid.test(payload.document_id)) return reply("Solicitação inválida.", 400);
      const { data: document, error } = await user.from("legal_case_documents").select("id,storage_path,file_name,status").eq("id", payload.document_id).eq("status", "ready").maybeSingle();
      if (error || !document) return reply("Documento indisponível ou sem permissão.", 404);
      const audit = await user.rpc("legal_record_document_download", { p_document_id: document.id });
      if (audit.error) return reply("Acesso não autorizado.", 403);
      const downloaded = await admin.storage.from(bucket).download(document.storage_path);
      if (downloaded.error || !downloaded.data) return reply("Não foi possível recuperar o arquivo.", 503);
      return new Response(downloaded.data.stream(), {
        headers: { ...corsHeaders, ...legalDownloadHeaders(document.file_name) },
      });
    }

    if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) return reply("Envie um arquivo.", 400);
    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (contentLength > LEGAL_DOCUMENT_MAX_BYTES + 64 * 1024) return reply("Arquivo maior que 10 MB.", 413);
    const body = await limitedBody(request, LEGAL_DOCUMENT_MAX_BYTES + 64 * 1024);
    if (!body) return reply("Arquivo maior que 10 MB.", 413);
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: new Blob([new Uint8Array(body)]) }).formData();
    const file = form.get("file");
    const caseId = String(form.get("case_id") ?? "");
    const category = String(form.get("category") ?? "");
    const displayName = String(form.get("display_name") ?? "").trim();
    if (!(file instanceof File) || !uuid.test(caseId) || !["general", "medical", "fiscal"].includes(category) || !displayName || displayName.length > 180 || file.name.length > 200) return reply("Dados do documento inválidos.", 400);
    if (file.size > LEGAL_DOCUMENT_MAX_BYTES) return reply("Arquivo maior que 10 MB.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validation = validateLegalDocument(bytes, file.type);
    if (validation) return reply(validation, 400);
    const { data: document, error: preparedError } = await user.rpc("legal_prepare_document", {
      p_case_id: caseId, p_category: category, p_display_name: displayName,
      p_file_name: file.name, p_mime_type: file.type, p_size_bytes: bytes.length,
    });
    if (preparedError || !document) return reply(preparedError?.message ?? "Acesso não autorizado.", 403);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const sha256 = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
    const uploaded = await admin.storage.from(bucket).upload(document.storage_path, bytes, { contentType: file.type, upsert: false });
    if (uploaded.error) {
      await admin.rpc("legal_abandon_document", { p_document_id: document.id });
      return reply("Falha ao armazenar o arquivo. Tente novamente.", 503);
    }
    // Revalidate current membership before publishing a file uploaded during a revocation.
    const access = await user.from("legal_case_documents").select("id").eq("id", document.id).maybeSingle();
    if (access.error || !access.data) {
      await admin.storage.from(bucket).remove([document.storage_path]);
      await admin.rpc("legal_abandon_document", { p_document_id: document.id });
      return reply("A permissão de acesso foi alterada.", 403);
    }
    const finalized = await admin.rpc("legal_finalize_document", { p_document_id: document.id, p_sha256: sha256 });
    if (finalized.error) {
      await admin.storage.from(bucket).remove([document.storage_path]);
      await admin.rpc("legal_abandon_document", { p_document_id: document.id });
      return reply("Não foi possível concluir o documento.", 503);
    }
    return new Response(JSON.stringify(finalized.data), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    // Never log request payloads, document contents or authorization tokens.
    return reply("Não foi possível processar o documento.", 500);
  }
});
