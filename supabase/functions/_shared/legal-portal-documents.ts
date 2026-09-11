import { limitedBody } from "./limited-body.ts";
import { LEGAL_DOCUMENT_MAX_BYTES, legalDownloadHeaders, validateLegalDocument } from "./legal-document-validation.ts";
import { type PortalAdmin, PortalError, portalBody, portalFailure, portalFields, portalHash, portalHeaders, portalId, portalMethod, portalReply, portalRpc, portalUser, portalUuid } from "./legal-portal.ts";

type Prepared = { id: string; storage_path: string };
type Download = { document_id: string; storage_path: string; file_name: string; mime_type: string; size_bytes: number; sha256: string };
const bucketName = "legal-case-documents";
function validPath(path: string) {
  return typeof path === "string" && path.split("/").length === 3 && path.split("/").every((part) => portalUuid.test(part));
}

export function createPortalDocumentsHandler(createAdmin: () => PortalAdmin) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request); if (method) return method;
    try {
      const admin = createAdmin();
      const actor = await portalUser(admin, request, "portal");
      const store = admin.storage.from(bucketName);
      if (request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
        const body = await portalBody(request, 4096);
        if (body.action === "download_export") {
          portalFields(body, ["action", "membership_id", "export_id"]);
          // Export is an approved minimal manifest. Documents keep individual, revocable downloads.
          const manifest = await portalRpc(admin, "legal_portal_service_request_export", { p_actor_id: actor.id, p_membership_id: portalId(body.membership_id), p_export_id: portalId(body.export_id) });
          return new Response(JSON.stringify(manifest, null, 2), { headers: { ...portalHeaders, ...legalDownloadHeaders("documentos-liberados.json") } });
        }
        portalFields(body, ["action", "membership_id", "release_id"]);
        if (body.action !== "download") throw new PortalError(400, "Ação inválida.");
        const args = { p_actor_id: actor.id, p_membership_id: portalId(body.membership_id), p_release_id: portalId(body.release_id) };
        const document = await portalRpc<Download>(admin, "legal_portal_service_authorize_download", args);
        if (!validPath(document.storage_path) || !Number.isInteger(document.size_bytes) || document.size_bytes < 1 || document.size_bytes > LEGAL_DOCUMENT_MAX_BYTES) throw new PortalError(503, "Documento indisponível.");
        const downloaded = await store.download(document.storage_path);
        if (downloaded.error || !downloaded.data || downloaded.data.size !== document.size_bytes) throw new PortalError(503, "Não foi possível recuperar o documento.");
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        if (await portalHash(bytes) !== document.sha256) throw new PortalError(503, "Não foi possível conferir a integridade do documento.");
        // Fetching bytes is outside SQL locks. Recheck current grants immediately before delivery.
        const current = await portalRpc<Download>(admin, "legal_portal_service_authorize_download", args);
        if (current.document_id !== document.document_id || current.storage_path !== document.storage_path || current.sha256 !== document.sha256 || current.size_bytes !== document.size_bytes) throw new PortalError(403, "A liberação do documento foi alterada.");
        return new Response(bytes, { headers: { ...portalHeaders, ...legalDownloadHeaders(current.file_name) } });
      }
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("multipart/form-data")) throw new PortalError(415, "Envie um arquivo.");
      const bytes = await limitedBody(request, LEGAL_DOCUMENT_MAX_BYTES + 65536);
      if (!bytes) throw new PortalError(413, "Arquivo maior que 10 MB.");
      let form: FormData;
      try { form = await new Request(request.url, { method: "POST", headers: request.headers, body: new Blob([new Uint8Array(bytes)]) }).formData(); }
      catch { throw new PortalError(400, "Arquivo inválido."); }
      const allowed = new Set(["request_id", "file"]);
      if (Array.from(form.keys()).some((key) => !allowed.has(key)) || form.getAll("file").length !== 1 || form.getAll("request_id").length !== 1) throw new PortalError(400, "Campos não permitidos.");
      const requestId = portalId(form.get("request_id"));
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.trim() || file.name.length > 200 || Array.from(file.name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new PortalError(400, "Selecione um arquivo válido.");
      const content = new Uint8Array(await file.arrayBuffer());
      const validation = validateLegalDocument(content, file.type);
      if (validation) throw new PortalError(400, validation);
      const document = await portalRpc<Prepared>(admin, "legal_portal_service_prepare_upload", { p_actor_id: actor.id, p_request_id: requestId, p_file_name: file.name, p_mime_type: file.type, p_size_bytes: content.length });
      if (!validPath(document.storage_path) || document.storage_path.split("/")[2] !== document.id) throw new PortalError(503, "Não foi possível preparar o arquivo.");
      const args = { p_actor_id: actor.id, p_request_id: requestId, p_document_id: document.id };
      const cleanup = async () => {
        // SQL locks/rechecks the document before authorizing cleanup; a committed ready file is immutable.
        try {
          const permission = await portalRpc<{ cleanup_allowed: boolean; storage_path: string }>(admin, "legal_portal_service_abandon_upload", args);
          if (permission?.cleanup_allowed === true && permission.storage_path === document.storage_path) await store.remove([document.storage_path]);
        } catch { /* Keep bytes on denied/ambiguous cleanup; a later authorized retry can reconcile. */ }
      };
      try {
        const uploaded = await store.upload(document.storage_path, content, { contentType: file.type, upsert: false });
        if (uploaded.error) throw new PortalError(503, "Não foi possível armazenar o arquivo.");
        const result = await portalRpc(admin, "legal_portal_service_finalize_upload", { ...args, p_sha256: await portalHash(content) });
        return portalReply(result, 201);
      } catch (error) {
        // Never remove first: a lost finalize response may follow a committed ready document.
        await cleanup();
        throw error;
      }
    } catch (error) { return portalFailure(error); }
  };
}
