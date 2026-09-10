import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { requireSupabase } from "@/lib/supabase";
import { getCurrentTenantId } from "./tenant";

export interface DocumentTemplateField {
  id: string;
  label: string;
  type: "text" | "number" | "radio" | "checkbox" | "textarea";
  required: boolean;
  options?: string[];
}

export interface DocumentTemplate {
  id: string;
  tenantId: string;
  category: "anamnese" | "orcamento" | "contrato";
  name: string;
  content: string;
  fields: DocumentTemplateField[];
  createdAt: string;
  updatedAt: string;
}

// Convert DB raw row to DocumentTemplate model
function mapRow(value: unknown): DocumentTemplate {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    category: row.category as DocumentTemplate["category"],
    name: String(row.name ?? ""),
    content: String(row.content ?? ""),
    fields: Array.isArray(row.fields) ? (row.fields as DocumentTemplateField[]) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function useDocumentTemplates(category?: "anamnese" | "orcamento" | "contrato") {
  return useQuery({
    queryKey: ["crm-document-templates", category],
    queryFn: async () => {
      const supabase = requireSupabase();
      const tenantId = await getCurrentTenantId();

      let query = supabase
        .from("crm_document_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return (data || []).map(mapRow);
    },
  });
}

export function useDocumentTemplate(id: string | null | undefined) {
  return useQuery({
    queryKey: ["crm-document-template", id],
    queryFn: async () => {
      if (!id) return null;
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("crm_document_templates")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;

      return mapRow(data);
    },
    enabled: !!id,
  });
}

export function useCreateDocumentTemplate(options?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      category: "anamnese" | "orcamento" | "contrato";
      name: string;
      content?: string;
      fields?: DocumentTemplateField[];
    }) => {
      const supabase = requireSupabase();
      const tenantId = await getCurrentTenantId();

      const { data, error } = await supabase
        .from("crm_document_templates")
        .insert({
          tenant_id: tenantId,
          category: input.category,
          name: input.name,
          content: input.content || "",
          fields: input.fields || [],
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return mapRow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-document-templates"] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      options?.onError?.(err);
    },
  });
}

export function useUpdateDocumentTemplate(options?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      content?: string;
      fields?: DocumentTemplateField[];
    }) => {
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("crm_document_templates")
        .update({
          name: input.name,
          content: input.content,
          fields: input.fields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return mapRow(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-document-templates"] });
      queryClient.invalidateQueries({ queryKey: ["crm-document-template", data.id] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      options?.onError?.(err);
    },
  });
}

export function useDeleteDocumentTemplate(options?: { onSuccess?: () => void; onError?: (err: Error) => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("crm_document_templates")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["crm-document-templates"] });
      queryClient.invalidateQueries({ queryKey: ["crm-document-template", id] });
      options?.onSuccess?.();
    },
    onError: (err) => {
      options?.onError?.(err);
    },
  });
}
