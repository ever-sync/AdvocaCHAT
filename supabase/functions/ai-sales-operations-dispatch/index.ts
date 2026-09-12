import { handleCors, jsonResponse } from "../_shared/http.ts";
import { sendWhatsappText } from "../_shared/ai-tools.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import {
  LEGAL_DOCUMENT_MAX_BYTES,
  validateLegalDocument,
} from "../_shared/legal-document-validation.ts";

const MAX_FOLLOWUPS = 20;
const MAX_DOCUMENTS = 10;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
]);

function safeName(payload: Record<string, unknown> | null, mime: string) {
  const supplied = String(payload?.fileName ?? payload?.filename ?? "").trim();
  if (supplied) return supplied.replace(/[\\/\0]/g, "_").slice(0, 200);
  const extension =
    mime === "application/pdf"
      ? "pdf"
      : mime === "image/png"
        ? "png"
        : mime === "text/plain"
          ? "txt"
          : "jpg";
  return `documento-whatsapp.${extension}`;
}

async function dispatchFollowups(admin: ReturnType<typeof createAdminClient>) {
  const claimed = await admin.rpc("ai_sales_claim_followups", {
    p_limit: MAX_FOLLOWUPS,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  let sent = 0;
  let failed = 0;
  for (const job of claimed.data ?? []) {
    try {
      const chat = await admin
        .from("whatsapp_chats")
        .select("*")
        .eq("id", job.chat_id)
        .eq("tenant_id", job.tenant_id)
        .maybeSingle();
      if (chat.error || !chat.data) throw new Error("Conversa indisponível.");
      await sendWhatsappText(
        admin,
        chat.data,
        String(job.message_text),
        "ai-sales-followup",
      );
      const done = await admin.rpc("ai_sales_finish_followup", {
        p_id: job.id,
        p_sent: true,
        p_error: null,
      });
      if (done.error) throw new Error(done.error.message);
      sent++;
    } catch (error) {
      failed++;
      await admin.rpc("ai_sales_finish_followup", {
        p_id: job.id,
        p_sent: false,
        p_error: error instanceof Error ? error.message : "Falha no follow-up.",
      });
    }
  }
  return { picked: claimed.data?.length ?? 0, sent, failed };
}

async function dispatchDocuments(admin: ReturnType<typeof createAdminClient>) {
  const claimed = await admin.rpc("ai_sales_claim_document_jobs", {
    p_limit: MAX_DOCUMENTS,
  });
  if (claimed.error) throw new Error(claimed.error.message);
  let stored = 0;
  let failed = 0;
  for (const job of claimed.data ?? []) {
    let prepared: { document_id: string; storage_path: string } | null = null;
    try {
      if (!job.media_url || !/^https:\/\//i.test(job.media_url))
        throw new Error("Anexo sem URL HTTPS armazenada.");
      const response = await fetch(job.media_url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok)
        throw new Error(`Falha ao baixar anexo (${response.status}).`);
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > LEGAL_DOCUMENT_MAX_BYTES)
        throw new Error("Anexo maior que 10 MiB.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > LEGAL_DOCUMENT_MAX_BYTES)
        throw new Error("Anexo vazio ou maior que 10 MiB.");
      const hinted = String(
        response.headers.get("content-type") ??
          job.payload_json?.mimeType ??
          "",
      )
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!ALLOWED_MIME.has(hinted))
        throw new Error("Formato de anexo não permitido no caso jurídico.");
      const invalid = validateLegalDocument(bytes, hinted);
      if (invalid) throw new Error(invalid);
      const name = safeName(job.payload_json, hinted);
      const metadata = await admin.rpc("ai_sales_prepare_legal_document", {
        p_workflow_document_id: job.workflow_document_id,
        p_file_name: name,
        p_mime_type: hinted,
        p_size: bytes.length,
      });
      if (metadata.error || !metadata.data)
        throw new Error(
          metadata.error?.message ?? "Falha ao preparar documento.",
        );
      const preparedDocument = metadata.data as {
        document_id: string;
        storage_path: string;
      };
      prepared = preparedDocument;
      const uploaded = await admin.storage
        .from("legal-case-documents")
        .upload(preparedDocument.storage_path, bytes, {
          contentType: hinted,
          upsert: false,
        });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes),
      );
      const sha256 = Array.from(digest, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const finalized = await admin.rpc("legal_finalize_document", {
        p_document_id: preparedDocument.document_id,
        p_sha256: sha256,
      });
      if (finalized.error) throw new Error(finalized.error.message);
      const done = await admin.rpc("ai_sales_finish_document_job", {
        p_workflow_document_id: job.workflow_document_id,
        p_stored: true,
        p_error: null,
      });
      if (done.error) throw new Error(done.error.message);
      stored++;
    } catch (error) {
      failed++;
      if (prepared) {
        await admin.storage
          .from("legal-case-documents")
          .remove([prepared.storage_path]);
        await admin.rpc("legal_abandon_document", {
          p_document_id: prepared.document_id,
        });
      }
      await admin.rpc("ai_sales_finish_document_job", {
        p_workflow_document_id: job.workflow_document_id,
        p_stored: false,
        p_error: error instanceof Error ? error.message : "Falha no documento.",
      });
    }
  }
  return { picked: claimed.data?.length ?? 0, stored, failed };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST")
    return jsonResponse({ error: "Method not allowed." }, 405);
  if (!isInternalRequest(request))
    return jsonResponse({ error: "Unauthorized." }, 401);
  try {
    const admin = createAdminClient();
    const [followups, documents] = await Promise.all([
      dispatchFollowups(admin),
      dispatchDocuments(admin),
    ]);
    return jsonResponse({ ok: true, followups, documents });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Falha operacional." },
      500,
    );
  }
});
