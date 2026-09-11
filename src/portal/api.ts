import { getPortalClient, portalConfiguration } from "./client";
import { combinedPortalSignal } from "./request-scope";

export class PortalApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PortalApiError";
  }
}
function failure(status: number) {
  return new PortalApiError(
    status,
    status === 401
      ? "Sua sessão expirou. Entre novamente."
      : status === 403 || status === 404
      ? "Este acesso não está disponível. O escritório pode ter alterado a autorização."
      : status === 409
      ? "A situação mudou. Atualize a página antes de continuar."
      : status === 400 || status === 422
      ? "Não foi possível confirmar os dados. Confira os campos e a validade do acesso."
      : "Não foi possível consultar o portal agora. Tente novamente.",
  );
}
async function request(
  endpoint:
    | "legal-portal-access"
    | "legal-portal-documents"
    | "legal-diligence-access"
    | "legal-diligence-documents",
  body: object | FormData,
  options: { signal?: AbortSignal; anonymous?: boolean; binary?: boolean } = {},
) {
  const scope = combinedPortalSignal(options.signal);
  try {
    const config = portalConfiguration();
    let token = "";
    if (!options.anonymous) {
      const { data, error } = await getPortalClient().auth.getSession();
      if (error || !data.session || data.session.user.role !== "legal_portal") {
        throw failure(401);
      }
      token = data.session.access_token;
    }
    if (!scope.current() || scope.signal.aborted) {
      throw new DOMException("Request cancelled", "AbortError");
    }
    const headers: Record<string, string> = { apikey: config.anonKey };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${config.url}/functions/v1/${endpoint}`, {
      method: "POST",
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: scope.signal,
    });
    if (!response.ok) throw failure(response.status);
    const result = options.binary
      ? {
        blob: await response.blob(),
        filename: downloadFilename(
          response.headers.get("content-disposition"),
        ),
      }
      : await response.json();
    if (!scope.current() || scope.signal.aborted) {
      throw new DOMException("Request cancelled", "AbortError");
    }
    return result;
  } catch (error) {
    if (
      error instanceof PortalApiError ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw error;
    }
    throw new PortalApiError(
      0,
      "Não foi possível conectar ao portal. Confira sua conexão e tente novamente.",
    );
  } finally {
    scope.cleanup();
  }
}
function downloadFilename(header: string | null) {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replace(/[\\/\r\n]/g, "_");
    } catch {
      /* Fall back to the safe attachment name. */
    }
  }
  return (
    header?.match(/filename="([^"\r\n]+)"/i)?.[1].replace(/[\\/]/g, "_") ??
      "documento"
  );
}
export async function portalAccess<T>(
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  return (await request("legal-portal-access", body, { signal })) as T;
}
export async function inspectPortalInvite(
  token: string,
  signal?: AbortSignal,
): Promise<{ available: boolean }> {
  return (await request(
    "legal-portal-access",
    { action: "inspect", token },
    { signal, anonymous: true },
  )) as { available: boolean };
}
export async function acceptPortalInvite(token: string) {
  return portalAccess<{ status: string }>({ action: "accept", token });
}
export async function diligenceAccess<T>(
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  return (await request("legal-diligence-access", body, { signal })) as T;
}
export async function acceptDiligenceInvite(token: string) {
  return diligenceAccess<{ status: string; grant_id: string }>({
    action: "accept",
    token,
  });
}
export async function downloadDiligenceDocument(
  grantId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  return (await request("legal-diligence-documents", {
    action: "download",
    grant_id: grantId,
    document_id: documentId,
  }, { signal, binary: true })) as { blob: Blob; filename: string };
}
export async function uploadDiligenceDocument(
  grantId: string,
  file: File,
  description: string,
  idempotencyKey: string,
  category?: "medical" | "fiscal",
  signal?: AbortSignal,
): Promise<{ delivery_id: string; document_id: string; state: string }> {
  const body = new FormData();
  body.set("grant_id", grantId);
  body.set("file", file);
  body.set("description", description);
  body.set("idempotency_key", idempotencyKey);
  if (category) body.set("category", category);
  return (await request("legal-diligence-documents", body, { signal })) as {
    delivery_id: string;
    document_id: string;
    state: string;
  };
}
export async function uploadPortalDocument(
  requestId: string,
  file: File,
  signal?: AbortSignal,
): Promise<{ id: string; status: string }> {
  const body = new FormData();
  body.set("request_id", requestId);
  body.set("file", file);
  return (await request("legal-portal-documents", body, { signal })) as {
    id: string;
    status: string;
  };
}
export async function downloadPortalDocument(
  membershipId: string,
  releaseId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  return (await request(
    "legal-portal-documents",
    { action: "download", membership_id: membershipId, release_id: releaseId },
    { signal, binary: true },
  )) as { blob: Blob; filename: string };
}
export async function downloadPortalExport(
  membershipId: string,
  exportId: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  return (await request(
    "legal-portal-documents",
    {
      action: "download_export",
      membership_id: membershipId,
      export_id: exportId,
    },
    { signal, binary: true },
  )) as { blob: Blob; filename: string };
}
