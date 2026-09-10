import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  customFieldStorageColumn,
  parseCustomFieldOptions,
  type CustomFieldKind,
} from "@/lib/custom-field-kinds";
import {
  formatCustomFieldStoredValueForInput,
  normalizeCustomFieldInputForSave,
  parseCustomFieldNumericForSave,
} from "@/lib/custom-field-masks";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type ProductCategory = {
  id: string;
  nome: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProductCustomFieldKind = CustomFieldKind;

export type ProductCustomFieldDefinition = {
  id: string;
  nome: string;
  kind: ProductCustomFieldKind;
  sortOrder: number;
  options: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProductCustomFieldValueRow = {
  fieldId: string;
  valueText: string | null;
  valueNumeric: number | null;
  valueDate: string | null;
};

const CAT_SELECT = "id, nome, created_at, updated_at";
const FIELD_SELECT = "id, nome, kind, sort_order, options, created_at, updated_at";

function mapCategory(row: {
  id: string;
  nome: string;
  created_at: string | null;
  updated_at: string | null;
}): ProductCategory {
  return {
    id: row.id,
    nome: row.nome,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapField(row: {
  id: string;
  nome: string;
  kind: ProductCustomFieldKind;
  sort_order: number;
  options?: unknown;
  created_at: string | null;
  updated_at: string | null;
}): ProductCustomFieldDefinition {
  return {
    id: row.id,
    nome: row.nome,
    kind: row.kind,
    sortOrder: row.sort_order,
    options: parseCustomFieldOptions(row.options),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProductCategories(): Promise<ProductCategory[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("product_categories")
    .select(CAT_SELECT)
    .eq("tenant_id", tenantId)
    .order("nome", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCategory(r as never));
}

export async function createProductCategory(nome: string): Promise<ProductCategory> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para usar categorias de produto.");
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("product_categories")
    .insert({ tenant_id: tenantId, nome: nome.trim() })
    .select(CAT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapCategory(data as never);
}

export async function deleteProductCategory(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para usar categorias de produto.");
  }
  const supabase = requireSupabase();
  const { error } = await supabase.from("product_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCategoryIdsForProduct(productId: string): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("product_category_assignments")
    .select("category_id")
    .eq("product_id", productId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { category_id: string }) => r.category_id);
}

export async function setProductCategories(productId: string, categoryIds: string[]): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para vincular categorias.");
  }
  const supabase = requireSupabase();
  const uniq = [...new Set(categoryIds)];

  const { error: delErr } = await supabase.from("product_category_assignments").delete().eq("product_id", productId);
  if (delErr) throw new Error(delErr.message);

  if (!uniq.length) return;

  const { error } = await supabase.from("product_category_assignments").insert(
    uniq.map((category_id) => ({ product_id: productId, category_id })),
  );
  if (error) throw new Error(error.message);
}

export async function listAssignmentsByProduct(productIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!isSupabaseConfigured || !productIds.length) return map;

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("product_category_assignments")
    .select("product_id, category_id")
    .in("product_id", productIds);

  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const pid = (row as { product_id: string }).product_id;
    const cid = (row as { category_id: string }).category_id;
    const prev = map.get(pid) ?? [];
    prev.push(cid);
    map.set(pid, prev);
  }
  return map;
}

export async function listProductCustomFields(): Promise<ProductCustomFieldDefinition[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("product_custom_fields")
    .select(FIELD_SELECT)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapField(r as never));
}

export async function createProductCustomField(input: {
  nome: string;
  kind: ProductCustomFieldKind;
  options?: string[];
}): Promise<ProductCustomFieldDefinition> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para campos personalizados.");
  }
  if (input.kind === "lista") {
    const opts = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length === 0) {
      throw new Error("Informe ao menos uma opção para o campo de lista.");
    }
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data: ordRows } = await supabase
    .from("product_custom_fields")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const top = ordRows?.[0] as { sort_order?: number } | undefined;
  const nextOrder = typeof top?.sort_order === "number" ? top.sort_order + 1 : 0;
  const options =
    input.kind === "lista" ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : [];

  const { data, error } = await supabase
    .from("product_custom_fields")
    .insert({
      tenant_id: tenantId,
      nome: input.nome.trim(),
      kind: input.kind,
      sort_order: nextOrder,
      options,
    })
    .select(FIELD_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapField(data as never);
}

export function customFieldValueToString(
  kind: ProductCustomFieldKind,
  row: ProductCustomFieldValueRow,
): string {
  return formatCustomFieldStoredValueForInput(kind, {
    text: row.valueText,
    numeric: row.valueNumeric,
    date: row.valueDate,
  });
}

export async function deleteProductCustomField(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para campos personalizados.");
  }
  const supabase = requireSupabase();
  const { error } = await supabase.from("product_custom_fields").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCustomFieldValuesForProduct(productId: string): Promise<ProductCustomFieldValueRow[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("product_custom_field_values")
    .select("field_id, value_text, value_numeric, value_date")
    .eq("product_id", productId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    fieldId: (r as { field_id: string }).field_id,
    valueText: (r as { value_text: string | null }).value_text,
    valueNumeric:
      (r as { value_numeric: number | string | null }).value_numeric != null
        ? Number((r as { value_numeric: number | string }).value_numeric)
        : null,
    valueDate: (r as { value_date: string | null }).value_date,
  }));
}

async function clearCustomFieldValue(
  supabase: ReturnType<typeof requireSupabase>,
  productId: string,
  fieldId: string,
): Promise<void> {
  const { error } = await supabase
    .from("product_custom_field_values")
    .delete()
    .eq("product_id", productId)
    .eq("field_id", fieldId);
  if (error) throw new Error(error.message);
}

export async function upsertCustomFieldValue(
  productId: string,
  fieldId: string,
  kind: ProductCustomFieldKind,
  raw: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para salvar valores.");
  }
  const supabase = requireSupabase();
  const normalized = normalizeCustomFieldInputForSave(kind, raw);
  const storage = customFieldStorageColumn(kind);

  if (kind === "moeda" && !raw.trim()) {
    await clearCustomFieldValue(supabase, productId, fieldId);
    return;
  }

  if (!normalized && kind !== "booleano") {
    await clearCustomFieldValue(supabase, productId, fieldId);
    return;
  }

  let value_text: string | null = null;
  let value_numeric: number | null = null;
  let value_date: string | null = null;

  if (storage === "text") {
    value_text = kind === "booleano" ? normalized || "0" : normalized;
  } else if (storage === "numeric") {
    if (kind === "moeda") {
      value_numeric = parseCustomFieldNumericForSave(kind, raw.trim());
    } else {
      value_numeric = parseCustomFieldNumericForSave(kind, normalized);
    }
  } else if (storage === "date") {
    value_date = normalized.slice(0, 10);
  }

  const { error } = await supabase.from("product_custom_field_values").upsert(
    {
      product_id: productId,
      field_id: fieldId,
      value_text,
      value_numeric,
      value_date,
    },
    { onConflict: "product_id,field_id" },
  );

  if (error) throw new Error(error.message);
}

export async function upsertProductCustomFieldValues(
  productId: string,
  fields: ProductCustomFieldDefinition[],
  values: Record<string, string>,
): Promise<void> {
  await Promise.all(
    fields.map((field) =>
      upsertCustomFieldValue(productId, field.id, field.kind, values[field.id] ?? ""),
    ),
  );
}

export function useProductCategories(options?: Omit<UseQueryOptions<ProductCategory[], Error>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["product-catalog", "categories"],
    queryFn: listProductCategories,
    ...options,
  });
}

export function useProductCategoryAssignments(productIds: string[]) {
  const sortedKey = useMemo(() => productIds.join(","), [productIds]);

  return useQuery({
    queryKey: ["product-catalog", "assignments", sortedKey],
    queryFn: () => listAssignmentsByProduct(productIds),
    enabled: isSupabaseConfigured && productIds.length > 0,
  });
}

export function useProductCustomFields(
  options?: Omit<UseQueryOptions<ProductCustomFieldDefinition[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["product-catalog", "fields"],
    queryFn: listProductCustomFields,
    ...options,
  });
}

export function useCustomFieldValues(productId: string | null) {
  return useQuery({
    queryKey: ["product-catalog", "values", productId],
    queryFn: () => listCustomFieldValuesForProduct(productId!),
    enabled: Boolean(isSupabaseConfigured && productId),
  });
}

export function useCreateProductCategory(
  options?: UseMutationOptions<ProductCategory, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductCategory,
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog", "categories"] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useDeleteProductCategory(options?: UseMutationOptions<void, Error, string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProductCategory,
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog"] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useSetProductCategories(
  options?: UseMutationOptions<void, Error, { productId: string; categoryIds: string[] }>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, categoryIds }) => setProductCategories(productId, categoryIds),
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog", "assignments"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useCreateProductCustomField(
  options?: UseMutationOptions<
    ProductCustomFieldDefinition,
    Error,
    { nome: string; kind: ProductCustomFieldKind; options?: string[] }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductCustomField,
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog", "fields"] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useDeleteProductCustomField(options?: UseMutationOptions<void, Error, string>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProductCustomField,
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog"] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}

export function useUpsertCustomFieldValue(
  options?: UseMutationOptions<
    void,
    Error,
    { productId: string; fieldId: string; kind: ProductCustomFieldKind; raw: string }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, fieldId, kind, raw }) => upsertCustomFieldValue(productId, fieldId, kind, raw),
    ...options,
    onSuccess: async (data, variables, ctx) => {
      await qc.invalidateQueries({ queryKey: ["product-catalog", "values", variables.productId] });
      await options?.onSuccess?.(data, variables, ctx);
    },
  });
}
