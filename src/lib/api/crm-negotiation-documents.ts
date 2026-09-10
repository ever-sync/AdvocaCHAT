import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId, getCurrentUserId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CrmNegotiationDocument } from "@/types/domain";

const BUCKET = "crm-lead-documents";
/** 25 MB — alinhado ao bucket */
export const CRM_NEGOTIATION_DOC_MAX_BYTES = 25 * 1024 * 1024;

const SELECT = [
  "id",
  "tenant_id",
  "negotiation_id",
  "display_name",
  "storage_path",
  "file_name",
  "mime_type",
  "file_size",
  "uploaded_by",
  "created_at",
].join(", ");

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

function mapDocumentRow(row: Record<string, unknown>): CrmNegotiationDocument {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    negotiationId: String(row.negotiation_id),
    displayName: String(row.display_name ?? ""),
    storagePath: String(row.storage_path ?? ""),
    fileName: String(row.file_name ?? ""),
    mimeType: String(row.mime_type ?? "application/octet-stream"),
    fileSize: typeof row.file_size === "number" ? row.file_size : Number(row.file_size ?? 0),
    uploadedBy: row.uploaded_by != null ? String(row.uploaded_by) : null,
    createdAt: String(row.created_at),
  };
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "file";
}

export async function listCrmNegotiationDocuments(negotiationId: string): Promise<CrmNegotiationDocument[]> {
  if (!isSupabaseConfigured || !negotiationId) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiation_documents")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("negotiation_id", negotiationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapDocumentRow(asDbRow(r)));
}

export async function createCrmNegotiationDocument(input: {
  negotiationId: string;
  displayName: string;
  file: File;
}): Promise<CrmNegotiationDocument> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const displayName = input.displayName.trim();
  if (!displayName) {
    throw new Error("Informe um nome para o documento.");
  }
  if (!input.file || input.file.size <= 0) {
    throw new Error("Selecione um arquivo.");
  }
  if (input.file.size > CRM_NEGOTIATION_DOC_MAX_BYTES) {
    throw new Error(`Arquivo muito grande (máx. ${CRM_NEGOTIATION_DOC_MAX_BYTES / (1024 * 1024)} MB).`);
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const userId = await getCurrentUserId();
  const negId = input.negotiationId.trim();
  const path = `${tenantId}/${negId}/${crypto.randomUUID()}_${sanitizeFileName(input.file.name)}`;
  const contentType = input.file.type || "application/octet-stream";

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, input.file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (upErr) {
    throw new Error(upErr.message);
  }

  const { data, error } = await supabase
    .from("crm_negotiation_documents")
    .insert({
      tenant_id: tenantId,
      negotiation_id: negId,
      display_name: displayName,
      storage_path: path,
      file_name: input.file.name,
      mime_type: contentType,
      file_size: input.file.size,
      uploaded_by: userId,
    })
    .select(SELECT)
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
  return mapDocumentRow(asDbRow(data));
}

export async function deleteCrmNegotiationDocument(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: existing, error: fetchErr } = await supabase
    .from("crm_negotiation_documents")
    .select("storage_path")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    throw new Error(fetchErr.message);
  }
  if (!existing) {
    throw new Error("Documento não encontrado.");
  }
  const storagePath = String((existing as { storage_path: string }).storage_path ?? "");
  const { error } = await supabase.from("crm_negotiation_documents").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (rmErr) {
    throw new Error(rmErr.message);
  }
}

export async function getCrmNegotiationDocumentSignedUrl(
  storagePath: string,
  expiresSec = 300,
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase não configurado.");
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Não foi possível gerar link do arquivo.");
  }
  return data.signedUrl;
}

function invalidateDocQueries(queryClient: ReturnType<typeof useQueryClient>, negotiationId: string) {
  void queryClient.invalidateQueries({ queryKey: ["crm-negotiation-documents"] });
}

export function useCrmNegotiationDocuments(
  negotiationId: string | undefined,
  options?: Omit<UseQueryOptions<CrmNegotiationDocument[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["crm-negotiation-documents", negotiationId],
    queryFn: () => listCrmNegotiationDocuments(negotiationId!),
    enabled: Boolean(negotiationId) && isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 20_000,
  });
}

export function useCreateCrmNegotiationDocument(
  options?: UseMutationOptions<
    CrmNegotiationDocument,
    Error,
    { negotiationId: string; displayName: string; file: File }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCrmNegotiationDocument,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      invalidateDocQueries(queryClient, vars.negotiationId);
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteCrmNegotiationDocument(
  options?: UseMutationOptions<void, Error, { id: string; negotiationId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => deleteCrmNegotiationDocument(id),
    ...options,
    onSuccess: async (_data, vars, ctx) => {
      invalidateDocQueries(queryClient, vars.negotiationId);
      await options?.onSuccess?.(_data, vars, ctx);
    },
  });
}
export async function listAllCrmDocuments(): Promise<Array<CrmNegotiationDocument & { negotiationTitle?: string; customerName?: string }>> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiation_documents")
    .select(`
      id,
      tenant_id,
      negotiation_id,
      display_name,
      storage_path,
      file_name,
      mime_type,
      file_size,
      uploaded_by,
      created_at,
      negotiation:crm_negotiations (
        title,
        customer:customers (
          nome
        )
      )
    `)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((value) => {
    const row = asDbRow(value);
    const doc = mapDocumentRow(row);
    const neg = asOptionalRecord(row.negotiation);
    const cust = asOptionalRecord(neg?.customer);

    return {
      ...doc,
      negotiationTitle: neg ? String(neg.title ?? "") : undefined,
      customerName: cust ? String(cust.nome ?? "") : undefined,
    };
  });
}

export function useAllCrmDocuments(
  options?: Omit<UseQueryOptions<Array<CrmNegotiationDocument & { negotiationTitle?: string; customerName?: string }>>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: ["crm-negotiation-documents", "all"],
    queryFn: () => listAllCrmDocuments(),
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 20_000,
  });
}
