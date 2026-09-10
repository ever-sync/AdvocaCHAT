import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
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

export type CustomerCustomFieldKind = CustomFieldKind;

export type CustomerCustomFieldDefinition = {
  id: string;
  nome: string;
  kind: CustomerCustomFieldKind;
  sortOrder: number;
  options: string[];
};

const FIELD_SELECT = "id, nome, kind, sort_order, options";

function mapField(row: {
  id: string;
  nome: string;
  kind: CustomerCustomFieldKind;
  sort_order: number;
  options?: unknown;
}): CustomerCustomFieldDefinition {
  return {
    id: row.id,
    nome: row.nome,
    kind: row.kind,
    sortOrder: row.sort_order,
    options: parseCustomFieldOptions(row.options),
  };
}

export async function listCustomerCustomFields(): Promise<CustomerCustomFieldDefinition[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("customer_custom_fields")
    .select(FIELD_SELECT)
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .order("nome", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapField(r as never));
}

export async function createCustomerCustomField(input: {
  nome: string;
  kind: CustomerCustomFieldKind;
  options?: string[];
}): Promise<CustomerCustomFieldDefinition> {
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
    .from("customer_custom_fields")
    .select("sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const top = ordRows?.[0] as { sort_order?: number } | undefined;
  const nextOrder = typeof top?.sort_order === "number" ? top.sort_order + 1 : 0;
  const options =
    input.kind === "lista" ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : [];

  const { data, error } = await supabase
    .from("customer_custom_fields")
    .insert({
      tenant_id: tenantId,
      nome: input.nome.trim(),
      kind: input.kind,
      sort_order: nextOrder,
      options,
    })
    .select(FIELD_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return mapField(data as never);
}

export async function deleteCustomerCustomField(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para campos personalizados.");
  }
  const supabase = requireSupabase();
  const { error } = await supabase.from("customer_custom_fields").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export function useCustomerCustomFields(
  options?: Omit<UseQueryOptions<CustomerCustomFieldDefinition[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customer-custom-fields"],
    queryFn: listCustomerCustomFields,
    ...options,
  });
}

export function useCustomerCustomFieldValues(
  customerId: string | undefined,
  options?: Omit<UseQueryOptions<CustomerCustomFieldValueRow[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customer-custom-field-values", customerId],
    queryFn: () => listCustomFieldValuesForCustomer(customerId!),
    enabled: Boolean(customerId),
    ...options,
  });
}

export function useCreateCustomerCustomField(
  options?: UseMutationOptions<
    CustomerCustomFieldDefinition,
    Error,
    { nome: string; kind: CustomerCustomFieldKind; options?: string[] }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomerCustomField,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-custom-fields"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCustomerCustomField(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomerCustomField,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-custom-fields"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export type CustomerCustomFieldValueRow = {
  fieldId: string;
  valueText: string | null;
  valueNumeric: number | null;
  valueDate: string | null;
};

export function customFieldValueToString(
  kind: CustomerCustomFieldKind,
  row: CustomerCustomFieldValueRow,
): string {
  return formatCustomFieldStoredValueForInput(kind, {
    text: row.valueText,
    numeric: row.valueNumeric,
    date: row.valueDate,
  });
}

async function clearCustomFieldValue(
  supabase: ReturnType<typeof requireSupabase>,
  customerId: string,
  fieldId: string,
): Promise<void> {
  const { error } = await supabase
    .from("customer_custom_field_values")
    .delete()
    .eq("customer_id", customerId)
    .eq("field_id", fieldId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function listCustomFieldValuesForCustomer(
  customerId: string,
): Promise<CustomerCustomFieldValueRow[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("customer_custom_field_values")
    .select("field_id, value_text, value_numeric, value_date")
    .eq("customer_id", customerId);

  if (error) {
    throw new Error(error.message);
  }
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

export async function upsertCustomerCustomFieldValue(
  customerId: string,
  fieldId: string,
  kind: CustomerCustomFieldKind,
  raw: string,
): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para salvar valores.");
  }
  const supabase = requireSupabase();
  const normalized = normalizeCustomFieldInputForSave(kind, raw);
  const storage = customFieldStorageColumn(kind);

  if (kind === "moeda" && !raw.trim()) {
    await clearCustomFieldValue(supabase, customerId, fieldId);
    return;
  }

  if (!normalized && kind !== "booleano") {
    await clearCustomFieldValue(supabase, customerId, fieldId);
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

  const { error } = await supabase.from("customer_custom_field_values").upsert(
    {
      customer_id: customerId,
      field_id: fieldId,
      value_text,
      value_numeric,
      value_date,
    },
    { onConflict: "customer_id,field_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function upsertCustomerCustomFieldValues(
  customerId: string,
  fields: CustomerCustomFieldDefinition[],
  values: Record<string, string>,
): Promise<void> {
  await Promise.all(
    fields.map((field) =>
      upsertCustomerCustomFieldValue(customerId, field.id, field.kind, values[field.id] ?? ""),
    ),
  );
}

export function invalidateCustomerCustomFieldValues(queryClient: QueryClient, customerId: string) {
  void queryClient.invalidateQueries({ queryKey: ["customer-custom-field-values", customerId] });
}
