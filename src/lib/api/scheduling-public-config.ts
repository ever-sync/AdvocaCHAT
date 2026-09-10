import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";

export type PublicBookingConfig = {
  tenantId: string;
  slug: string;
  isActive: boolean;
  titulo: string | null;
  descricao: string | null;
  msgConfirmacao: string | null;
  msgLembrete24h: string | null;
  msgLembrete1h: string | null;
};

function asDbRow(row: unknown): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

const SELECT = "tenant_id, slug, is_active, titulo, descricao, msg_confirmacao, msg_lembrete_24h, msg_lembrete_1h";

function mapRow(row: Record<string, unknown>): PublicBookingConfig {
  return {
    tenantId: String(row.tenant_id),
    slug: String(row.slug ?? ""),
    isActive: Boolean(row.is_active),
    titulo: row.titulo != null ? String(row.titulo) : null,
    descricao: row.descricao != null ? String(row.descricao) : null,
    msgConfirmacao: row.msg_confirmacao != null ? String(row.msg_confirmacao) : null,
    msgLembrete24h: row.msg_lembrete_24h != null ? String(row.msg_lembrete_24h) : null,
    msgLembrete1h: row.msg_lembrete_1h != null ? String(row.msg_lembrete_1h) : null,
  };
}

export async function getPublicBookingConfig(): Promise<PublicBookingConfig | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("scheduling_public_config")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(asDbRow(data)) : null;
}

export type PublicBookingConfigInput = {
  slug: string;
  isActive: boolean;
  titulo?: string | null;
  descricao?: string | null;
  msgConfirmacao?: string | null;
  msgLembrete24h?: string | null;
  msgLembrete1h?: string | null;
};

export async function upsertPublicBookingConfig(
  input: PublicBookingConfigInput,
): Promise<PublicBookingConfig> {
  if (!isSupabaseConfigured) throw new Error("Supabase não configurado.");
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new Error("Informe um slug válido (letras, números e hífen).");
  const { data, error } = await supabase
    .from("scheduling_public_config")
    .upsert(
      {
        tenant_id: tenantId,
        slug,
        is_active: input.isActive,
        titulo: input.titulo ?? null,
        descricao: input.descricao ?? null,
        msg_confirmacao: input.msgConfirmacao ?? null,
        msg_lembrete_24h: input.msgLembrete24h ?? null,
        msg_lembrete_1h: input.msgLembrete1h ?? null,
      },
      { onConflict: "tenant_id" },
    )
    .select(SELECT)
    .single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("Esse link (slug) já está em uso. Escolha outro.");
    }
    throw new Error(error.message);
  }
  return mapRow(asDbRow(data));
}

const KEY = ["scheduling-public-config"] as const;

export function usePublicBookingConfig(
  options?: Omit<UseQueryOptions<PublicBookingConfig | null>, "queryKey" | "queryFn">,
) {
  const { enabled: enabledOption, ...rest } = options ?? {};
  return useQuery({
    ...rest,
    queryKey: KEY,
    queryFn: getPublicBookingConfig,
    enabled: isSupabaseConfigured && (enabledOption ?? true),
    staleTime: 60_000,
  });
}

export function useUpsertPublicBookingConfig(
  options?: UseMutationOptions<PublicBookingConfig, Error, PublicBookingConfigInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertPublicBookingConfig,
    ...options,
    onSuccess: async (data, vars, ctx) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      await options?.onSuccess?.(data, vars, ctx);
    },
  });
}
