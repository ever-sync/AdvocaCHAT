import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { DEFAULT_EMAIL_BLOCKS, type EmailBlock, type MarketingEmailTemplate } from "@/lib/marketing/email-types";

const SELECT = "id, tenant_id, name, subject, blocks, from_name, from_email, reply_to, created_at, updated_at";
const QUERY_KEY = "marketing-email-templates";

function asRow(value: unknown): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function mapTemplate(row: Record<string, unknown>): MarketingEmailTemplate {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name ?? ""),
    subject: String(row.subject ?? ""),
    blocks: Array.isArray(row.blocks) ? (row.blocks as EmailBlock[]) : [],
    fromName: row.from_name == null ? null : String(row.from_name),
    fromEmail: row.from_email == null ? null : String(row.from_email),
    replyTo: row.reply_to == null ? null : String(row.reply_to),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMarketingEmailTemplates(): Promise<MarketingEmailTemplate[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_email_templates")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTemplate(asRow(row)));
}

export type MarketingEmailTemplateCreateInput = {
  name: string;
  subject?: string;
  blocks?: EmailBlock[];
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
};

export async function createMarketingEmailTemplate(
  input: MarketingEmailTemplateCreateInput,
): Promise<MarketingEmailTemplate> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("marketing_email_templates")
    .insert({
      tenant_id: tenantId,
      name: input.name.trim() || "Novo template",
      subject: input.subject ?? "",
      blocks: input.blocks ?? DEFAULT_EMAIL_BLOCKS,
      from_name: input.fromName ?? null,
      from_email: input.fromEmail ?? null,
      reply_to: input.replyTo ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(asRow(data));
}

export type MarketingEmailTemplatePatch = Partial<{
  name: string;
  subject: string;
  blocks: EmailBlock[];
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
}>;

export async function updateMarketingEmailTemplate(
  id: string,
  patch: MarketingEmailTemplatePatch,
): Promise<MarketingEmailTemplate> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.subject !== undefined) row.subject = patch.subject;
  if (patch.blocks !== undefined) row.blocks = patch.blocks;
  if (patch.fromName !== undefined) row.from_name = patch.fromName;
  if (patch.fromEmail !== undefined) row.from_email = patch.fromEmail;
  if (patch.replyTo !== undefined) row.reply_to = patch.replyTo;
  const { data, error } = await supabase
    .from("marketing_email_templates")
    .update(row)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapTemplate(asRow(data));
}

export async function deleteMarketingEmailTemplate(id: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error } = await supabase
    .from("marketing_email_templates")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- Hooks

export function useMarketingEmailTemplates(
  options?: Omit<UseQueryOptions<MarketingEmailTemplate[]>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: [QUERY_KEY, "list"],
    queryFn: listMarketingEmailTemplates,
    enabled: (enabledOption ?? true) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

export function useCreateMarketingEmailTemplate(
  options?: UseMutationOptions<MarketingEmailTemplate, Error, MarketingEmailTemplateCreateInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMarketingEmailTemplate,
    ...options,
    onSuccess: (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(d, v, c);
    },
  });
}

export function useUpdateMarketingEmailTemplate(
  options?: UseMutationOptions<MarketingEmailTemplate, Error, { id: string; patch: MarketingEmailTemplatePatch }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: MarketingEmailTemplatePatch }) =>
      updateMarketingEmailTemplate(id, patch),
    ...options,
    onSuccess: (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(d, v, c);
    },
  });
}

export function useDeleteMarketingEmailTemplate(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMarketingEmailTemplate,
    ...options,
    onSuccess: (d, v, c) => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      options?.onSuccess?.(d, v, c);
    },
  });
}
