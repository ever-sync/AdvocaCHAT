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
  slugifyFormName,
  type FormField,
  type FormSettings,
  type FormTheme,
  type MarketingFormRecord,
} from "@/lib/marketing/form-types";

const SELECT = [
  "id",
  "tenant_id",
  "name",
  "slug",
  "description",
  "fields",
  "settings",
  "theme",
  "allowed_domains",
  "is_active",
  "email_template_id",
  "submit_webhook_url",
  "submit_redirect_url",
  "submit_message",
  "total_views",
  "total_submissions",
  "created_at",
  "updated_at",
].join(", ");

const QUERY_KEY = "marketing-forms";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Casta uma linha do Supabase (que pode ser um union com erro) para Record. */
function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function toFields(value: unknown): FormField[] {
  return Array.isArray(value) ? (value as FormField[]) : [];
}

function toSettings(value: unknown): FormSettings {
  return { ...DEFAULT_FORM_SETTINGS, ...(asRecord(value) as Partial<FormSettings>) };
}

function toTheme(value: unknown): FormTheme {
  return { ...DEFAULT_FORM_THEME, ...(asRecord(value) as Partial<FormTheme>) };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

export function mapMarketingFormRow(row: Record<string, unknown>): MarketingFormRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ""),
    slug: row.slug == null ? null : String(row.slug),
    description: row.description == null ? null : String(row.description),
    fields: toFields(row.fields),
    settings: toSettings(row.settings),
    theme: toTheme(row.theme),
    allowedDomains: toStringArray(row.allowed_domains),
    isActive: row.is_active !== false,
    emailTemplateId: row.email_template_id == null ? null : String(row.email_template_id),
    submitWebhookUrl: row.submit_webhook_url == null ? null : String(row.submit_webhook_url),
    submitRedirectUrl: row.submit_redirect_url == null ? null : String(row.submit_redirect_url),
    submitMessage: String(row.submit_message ?? ""),
    totalViews: Number(row.total_views ?? 0),
    totalSubmissions: Number(row.total_submissions ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export type MarketingFormCreateInput = {
  name: string;
  description?: string | null;
  slug?: string | null;
  fields?: FormField[];
  settings?: Partial<FormSettings>;
  theme?: Partial<FormTheme>;
  allowedDomains?: string[];
  isActive?: boolean;
  submitWebhookUrl?: string | null;
  submitRedirectUrl?: string | null;
  submitMessage?: string;
};

export type MarketingFormPatch = Partial<{
  name: string;
  description: string | null;
  slug: string | null;
  fields: FormField[];
  settings: FormSettings;
  theme: FormTheme;
  allowedDomains: string[];
  isActive: boolean;
  emailTemplateId: string | null;
  submitWebhookUrl: string | null;
  submitRedirectUrl: string | null;
  submitMessage: string;
}>;

function patchToRow(patch: MarketingFormPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.slug !== undefined) row.slug = patch.slug;
  if (patch.fields !== undefined) row.fields = patch.fields;
  if (patch.settings !== undefined) row.settings = patch.settings;
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.allowedDomains !== undefined) row.allowed_domains = patch.allowedDomains;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.emailTemplateId !== undefined) row.email_template_id = patch.emailTemplateId;
  if (patch.submitWebhookUrl !== undefined) row.submit_webhook_url = patch.submitWebhookUrl;
  if (patch.submitRedirectUrl !== undefined) row.submit_redirect_url = patch.submitRedirectUrl;
  if (patch.submitMessage !== undefined) row.submit_message = patch.submitMessage;
  return row;
}

export async function listMarketingForms(): Promise<MarketingFormRecord[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_forms")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMarketingFormRow(asRow(row)));
}

export async function getMarketingFormById(id: string): Promise<MarketingFormRecord | null> {
  if (!isSupabaseConfigured || !id) return null;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_forms")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapMarketingFormRow(asRow(data)) : null;
}

export async function createMarketingForm(input: MarketingFormCreateInput): Promise<MarketingFormRecord> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const name = input.name.trim() || "Formulário sem nome";
  const { data, error } = await supabase
    .from("marketing_forms")
    .insert({
      tenant_id: tenantId,
      name,
      slug: input.slug ?? slugifyFormName(name),
      description: input.description ?? null,
      fields: input.fields ?? [],
      settings: { ...DEFAULT_FORM_SETTINGS, ...(input.settings ?? {}) },
      theme: { ...DEFAULT_FORM_THEME, ...(input.theme ?? {}) },
      allowed_domains: input.allowedDomains ?? [],
      is_active: input.isActive ?? true,
      submit_webhook_url: input.submitWebhookUrl ?? null,
      submit_redirect_url: input.submitRedirectUrl ?? null,
      ...(input.submitMessage !== undefined ? { submit_message: input.submitMessage } : {}),
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapMarketingFormRow(asRow(data));
}

export async function updateMarketingForm(id: string, patch: MarketingFormPatch): Promise<MarketingFormRecord> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_forms")
    .update(patchToRow(patch))
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  return mapMarketingFormRow(asRow(data));
}

export async function deleteMarketingForm(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("marketing_forms")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function duplicateMarketingForm(id: string): Promise<MarketingFormRecord> {
  const source = await getMarketingFormById(id);
  if (!source) throw new Error("Formulário não encontrado.");
  return createMarketingForm({
    name: `${source.name} (cópia)`,
    description: source.description,
    fields: source.fields,
    settings: source.settings,
    theme: source.theme,
    allowedDomains: source.allowedDomains,
    isActive: false,
    submitWebhookUrl: source.submitWebhookUrl,
    submitRedirectUrl: source.submitRedirectUrl,
    submitMessage: source.submitMessage,
  });
}

// ---------------------------------------------------------------- Hooks

export function useMarketingForms(
  options?: Omit<UseQueryOptions<MarketingFormRecord[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "list"],
    queryFn: listMarketingForms,
    enabled: (enabledOption ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useMarketingForm(
  id: string | null | undefined,
  options?: Omit<UseQueryOptions<MarketingFormRecord | null>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "detail", id],
    queryFn: () => getMarketingFormById(id ?? ""),
    enabled: (enabledOption ?? true) && isSupabaseConfigured && !!id,
  });
}

export function useCreateMarketingForm(
  options?: UseMutationOptions<MarketingFormRecord, Error, MarketingFormCreateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMarketingForm,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useUpdateMarketingForm(
  options?: UseMutationOptions<MarketingFormRecord, Error, { id: string; patch: MarketingFormPatch }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MarketingFormPatch }) => updateMarketingForm(id, patch),
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDeleteMarketingForm(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMarketingForm,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

export function useDuplicateMarketingForm(options?: UseMutationOptions<MarketingFormRecord, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: duplicateMarketingForm,
    ...options,
    onSuccess: (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(data, vars, ctx);
    },
  });
}

// --------------------------------------------------- Leads do formulário
// Cada submissão vira uma linha em crm_negotiation_marketing (1:1 com a
// negociação do CRM). Aqui listamos esses leads com o funil/etapa/qualificação
// atuais da negociação — é o que permite validar se a automação roteou certo.

export type FormLeadRecord = {
  negotiationId: string;
  createdAt: string;
  /** Lead score do marketing (0–100). */
  score: number;
  isDuplicate: boolean;
  title: string;
  funnelId: string;
  stageId: string;
  status: string;
  /** Qualificação da negociação no CRM, 0–5 ("estrelas"). */
  qualification: number;
  totalValue: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
};

const FORM_LEADS_SELECT = `
  negotiation_id,
  score,
  created_at,
  is_duplicate,
  negotiation:crm_negotiations!negotiation_id (
    id, title, funnel_id, stage_id, status, qualification, total_value,
    customer:customers!customer_id ( nome, telefone, email )
  )
`;

/** PostgREST devolve embed to-one como objeto; tolera array por segurança. */
function embedOne(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

function mapFormLeadRow(row: Record<string, unknown>): FormLeadRecord {
  const neg = embedOne(row.negotiation);
  const customer = embedOne(neg.customer);
  return {
    negotiationId: String(row.negotiation_id ?? ""),
    createdAt: String(row.created_at ?? ""),
    score: Number(row.score ?? 0),
    isDuplicate: row.is_duplicate === true,
    title: String(neg.title ?? ""),
    funnelId: neg.funnel_id == null ? "" : String(neg.funnel_id),
    stageId: neg.stage_id == null ? "" : String(neg.stage_id),
    status: neg.status == null ? "" : String(neg.status),
    qualification: Number(neg.qualification ?? 0),
    totalValue: Number(neg.total_value ?? 0),
    customerName: customer.nome == null ? "" : String(customer.nome),
    customerPhone: customer.telefone == null ? "" : String(customer.telefone),
    customerEmail: customer.email == null ? "" : String(customer.email),
  };
}

export async function listFormLeads(formId: string): Promise<FormLeadRecord[]> {
  if (!isSupabaseConfigured || !formId) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiation_marketing")
    .select(FORM_LEADS_SELECT)
    .eq("tenant_id", tenantId)
    .eq("form_id", formId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapFormLeadRow(asRow(row)));
}

export function useFormLeads(
  formId: string | null,
  options?: Omit<UseQueryOptions<FormLeadRecord[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "leads", formId],
    queryFn: () => listFormLeads(formId ?? ""),
    enabled: (enabledOption ?? true) && isSupabaseConfigured && !!formId,
    staleTime: 30_000,
  });
}
