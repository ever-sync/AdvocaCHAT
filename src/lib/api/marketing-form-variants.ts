import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import {
  DEFAULT_FORM_SETTINGS,
  DEFAULT_FORM_THEME,
  type FormField,
  type FormSettings,
  type FormTheme,
} from "@/lib/marketing/form-types";

export interface MarketingFormVariant {
  id: string;
  formId: string;
  tenantId: string;
  name: string;
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
  weight: number;
  totalViews: number;
  totalSubmissions: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const SELECT =
  "id, form_id, tenant_id, name, fields, settings, theme, weight, total_views, total_submissions, is_active, created_at, updated_at";

const QUERY_KEY = "marketing-form-variants";

function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function mapVariant(row: Record<string, unknown>): MarketingFormVariant {
  return {
    id: String(row.id),
    formId: String(row.form_id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ""),
    fields: Array.isArray(row.fields) ? (row.fields as FormField[]) : [],
    settings: { ...DEFAULT_FORM_SETTINGS, ...((row.settings as Partial<FormSettings>) ?? {}) },
    theme: { ...DEFAULT_FORM_THEME, ...((row.theme as Partial<FormTheme>) ?? {}) },
    weight: Number(row.weight ?? 50),
    totalViews: Number(row.total_views ?? 0),
    totalSubmissions: Number(row.total_submissions ?? 0),
    isActive: row.is_active !== false,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMarketingFormVariants(formId: string): Promise<MarketingFormVariant[]> {
  if (!isSupabaseConfigured || !formId) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_form_variants")
    .select(SELECT)
    .eq("form_id", formId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapVariant(asRow(row)));
}

export type MarketingFormVariantCreateInput = {
  formId: string;
  name: string;
  fields?: FormField[];
  settings?: Partial<FormSettings>;
  theme?: Partial<FormTheme>;
  weight?: number;
};

export async function createMarketingFormVariant(
  input: MarketingFormVariantCreateInput,
): Promise<MarketingFormVariant> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_form_variants")
    .insert({
      form_id: input.formId,
      tenant_id: tenantId,
      name: input.name.trim() || "Variante",
      fields: input.fields ?? [],
      settings: { ...DEFAULT_FORM_SETTINGS, ...(input.settings ?? {}) },
      theme: { ...DEFAULT_FORM_THEME, ...(input.theme ?? {}) },
      weight: input.weight ?? 50,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapVariant(asRow(data));
}

export type MarketingFormVariantPatch = Partial<{
  name: string;
  weight: number;
  isActive: boolean;
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
}>;

export async function updateMarketingFormVariant(
  id: string,
  patch: MarketingFormVariantPatch,
): Promise<MarketingFormVariant> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.weight !== undefined) row.weight = patch.weight;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.fields !== undefined) row.fields = patch.fields;
  if (patch.settings !== undefined) row.settings = patch.settings;
  if (patch.theme !== undefined) row.theme = patch.theme;
  const { data, error } = await supabase
    .from("marketing_form_variants")
    .update(row)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapVariant(asRow(data));
}

export async function deleteMarketingFormVariant(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error } = await supabase.from("marketing_form_variants").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Aplica a vencedora: 100% de peso/ativa nela; zera e desativa as demais. */
export async function applyWinnerVariant(formId: string, winnerId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const { error: winErr } = await supabase
    .from("marketing_form_variants")
    .update({ is_active: true, weight: 100 })
    .eq("id", winnerId);
  if (winErr) throw new Error(winErr.message);
  const { error: othersErr } = await supabase
    .from("marketing_form_variants")
    .update({ is_active: false, weight: 0 })
    .eq("form_id", formId)
    .neq("id", winnerId);
  if (othersErr) throw new Error(othersErr.message);
}

// ---------------------------------------------------------------- Hooks

export function useMarketingFormVariants(
  formId: string | null | undefined,
  options?: Omit<UseQueryOptions<MarketingFormVariant[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, formId],
    queryFn: () => listMarketingFormVariants(formId ?? ""),
    enabled: (enabledOption ?? true) && isSupabaseConfigured && !!formId,
  });
}

function useVariantMutation<TInput>(
  mutationFn: (input: TInput) => Promise<unknown>,
  options?: UseMutationOptions<unknown, Error, TInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useCreateMarketingFormVariant(
  options?: UseMutationOptions<unknown, Error, MarketingFormVariantCreateInput>,
) {
  return useVariantMutation(createMarketingFormVariant, options);
}

export function useUpdateMarketingFormVariant(
  options?: UseMutationOptions<unknown, Error, { id: string; patch: MarketingFormVariantPatch }>,
) {
  return useVariantMutation(({ id, patch }) => updateMarketingFormVariant(id, patch), options);
}

export function useDeleteMarketingFormVariant(options?: UseMutationOptions<unknown, Error, string>) {
  return useVariantMutation(deleteMarketingFormVariant, options);
}

export function useApplyWinnerVariant(
  options?: UseMutationOptions<unknown, Error, { formId: string; winnerId: string }>,
) {
  return useVariantMutation(({ formId, winnerId }) => applyWinnerVariant(formId, winnerId), options);
}
