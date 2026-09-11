import { diligenceBody, diligenceBytes } from "./legal-diligence.ts";
import {
  LEGAL_DOCUMENT_MAX_BYTES,
  legalDownloadHeaders,
  validateLegalDocument,
} from "./legal-document-validation.ts";
import {
  type PortalAdmin,
  PortalError,
  portalFailure,
  portalFields,
  portalHash,
  portalHeaders,
  portalId,
  portalMethod,
  portalReply,
  portalRpc,
  portalString,
  portalUser,
  portalUuid,
} from "./legal-portal.ts";

type Prepared = {
  delivery_id: string;
  document: {
    id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    status: string;
  };
};
type Download = {
  document_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
};
function validPath(path: string) {
  return typeof path === "string" && path.split("/").length === 3 &&
    path.split("/").every((part) => portalUuid.test(part));
}
export function createDiligenceDocumentsHandler(
  createAdmin: () => PortalAdmin,
) {
  return async (request: Request): Promise<Response> => {
    const method = portalMethod(request);
    if (method) return method;
    try {
      const admin = createAdmin();
      const store = admin.storage.from("legal-case-documents");
      if (
        request.headers.get("content-type")?.toLowerCase().startsWith(
          "application/json",
        )
      ) {
        const body = await diligenceBody(request, 4096);
        const staff = body.action === "staff_download";
        portalFields(body, ["action", staff ? "version_id" : "grant_id", "document_id"]);
        if (body.action !== "download" && !staff) {
          throw new PortalError(400, "Ação inválida.");
        }
        const actor = await portalUser(admin, request, staff ? "staff" : "portal");
        const args = {
          p_actor_id: actor.id,
          ...(staff ? { p_version_id: portalId(body.version_id) } : { p_grant_id: portalId(body.grant_id) }),
          p_document_id: portalId(body.document_id),
        };
        const rpcName = staff ? "legal_diligence_staff_download" : "legal_diligence_service_download";
        const document = await portalRpc<Download>(
          admin,
          rpcName,
          args,
        );
        if (
          !validPath(document.storage_path) ||
          document.document_id !== args.p_document_id ||
          document.storage_path.split("/")[2] !== document.document_id ||
          !Number.isInteger(document.size_bytes) || document.size_bytes < 1 ||
          document.size_bytes > LEGAL_DOCUMENT_MAX_BYTES ||
          !/^[a-f0-9]{64}$/.test(document.sha256)
        ) throw new PortalError(503, "Documento indisponível.");
        const downloaded = await store.download(document.storage_path);
        if (
          downloaded.error || !downloaded.data ||
          downloaded.data.size !== document.size_bytes
        ) throw new PortalError(503, "Não foi possível recuperar o documento.");
        const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
        if (await portalHash(bytes) !== document.sha256) {
          throw new PortalError(
            503,
            "Não foi possível conferir a integridade do documento.",
          );
        }
        const current = await portalRpc<Download>(
          admin,
          rpcName,
          args,
        );
        if (
          current.document_id !== document.document_id ||
          current.storage_path !== document.storage_path ||
          current.sha256 !== document.sha256 ||
          current.size_bytes !== document.size_bytes ||
          current.mime_type !== document.mime_type ||
          current.file_name !== document.file_name
        ) {
          throw new PortalError(
            403,
            "A autorização do documento foi alterada.",
          );
        }
        return new Response(bytes, {
          headers: {
            ...portalHeaders,
            ...legalDownloadHeaders(current.file_name),
          },
        });
      }
      if (
        !request.headers.get("content-type")?.toLowerCase().startsWith(
          "multipart/form-data",
        )
      ) throw new PortalError(415, "Envie um arquivo.");
      const actor = await portalUser(admin, request, "portal");
      const bytes = await diligenceBytes(
        request.body,
        LEGAL_DOCUMENT_MAX_BYTES + 65536,
        10000,
      );
      let form: FormData;
      try {
        form = await new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: new Blob([new Uint8Array(bytes)]),
        }).formData();
      } catch {
        throw new PortalError(400, "Arquivo inválido.");
      }
      const allowed = ["grant_id", "file", "description", "idempotency_key"];
      if (
        Array.from(form.keys()).some((key) => !allowed.includes(key) && key !== "category") ||
        allowed.some((key) => form.getAll(key).length !== 1) || form.getAll("category").length > 1
      ) throw new PortalError(400, "Campos não permitidos.");
      const category = form.get("category");
      if (category !== null && category !== "medical" && category !== "fiscal") throw new PortalError(400, "Categoria inválida.");
      const grantId = portalId(form.get("grant_id"));
      const idempotencyKey = portalId(form.get("idempotency_key"));
      const description = portalString(form.get("description"), 4000);
      const file = form.get("file");
      if (
        !(file instanceof File) || !file.name.trim() ||
        file.name.length > 200 || Array.from(file.name).some((char) =>
          char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
        )
      ) {
        throw new PortalError(400, "Selecione um arquivo válido.");
      }
      const content = new Uint8Array(await file.arrayBuffer());
      const validation = validateLegalDocument(content, file.type);
      if (validation) {
        throw new PortalError(400, validation);
      }
      const prepared = await portalRpc<Prepared>(
        admin,
        "legal_diligence_service_prepare_upload",
        {
          p_actor_id: actor.id,
          p_grant_id: grantId,
          p_payload: {
            file_name: file.name,
            mime_type: file.type,
            size_bytes: content.length,
            description,
            idempotency_key: idempotencyKey,
            ...(category === null ? {} : { category }),
          },
        },
      );
      const document = prepared.document;
      if (
        !portalUuid.test(prepared.delivery_id) || !document ||
        !validPath(document.storage_path) ||
        document.storage_path.split("/")[2] !== document.id ||
        document.mime_type !== file.type ||
        document.size_bytes !== content.length ||
        !["prepared", "ready", "diligence_restricted"].includes(document.status)
      ) {
        throw new PortalError(503, "Não foi possível preparar o arquivo.");
      }
      const args = {
        p_actor_id: actor.id,
        p_delivery_id: prepared.delivery_id,
      };
      const sha256 = await portalHash(content);
      if (document.status !== "prepared") {
        // Retry after a lost response: SQL rechecks the grant and exact committed hash.
        return portalReply(await portalRpc(admin, "legal_diligence_service_finalize_upload", { ...args, p_sha256: sha256 }));
      }
      const cleanup = async () => {
        try {
          const permission = await portalRpc<
            { cleanup_allowed: boolean; storage_path?: string }
          >(admin, "legal_diligence_service_abandon_upload", args);
          if (
            permission?.cleanup_allowed === true &&
            permission.storage_path === document.storage_path
          ) {
            await store.remove([document.storage_path]);
          }
        } catch {
          /* An uncertain response never authorizes deleting potentially committed bytes. */
        }
      };
      try {
        const uploaded = await store.upload(document.storage_path, content, {
          contentType: file.type,
          upsert: false,
        });
        if (uploaded.error) {
          // A prior upload may have succeeded before its response was lost.
          // Never overwrite: only identical, size-bounded bytes can be reconciled.
          const existing = await store.download(document.storage_path);
          if (existing.error || !existing.data || existing.data.size !== content.length ||
            await portalHash(new Uint8Array(await existing.data.arrayBuffer())) !== sha256) {
            throw new PortalError(503, "Não foi possível armazenar o arquivo. Atualize a diligência antes de repetir.");
          }
        }
        return portalReply(
          await portalRpc(admin, "legal_diligence_service_finalize_upload", {
            ...args,
            p_sha256: sha256,
          }),
          201,
        );
      } catch (error) {
        await cleanup();
        throw error;
      }
    } catch (error) {
      return portalFailure(error);
    }
  };
}
