import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { updateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type { CrmNegotiationProduct } from "@/types/domain";

type Row = {
  id: string;
  tenant_id: string;
  negotiation_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number | string;
  list_price: number | string;
  unit_price: number | string;
  used_custom_price: boolean;
  created_at: string;
  updated_at: string;
};

const SELECT =
  "id, tenant_id, negotiation_id, product_id, product_name, quantity, list_price, unit_price, used_custom_price, created_at, updated_at";

function mapRow(row: Row): CrmNegotiationProduct {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    negotiationId: row.negotiation_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    listPrice: Number(row.list_price),
    unitPrice: Number(row.unit_price),
    usedCustomPrice: row.used_custom_price,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const negotiationProductsQueryKey = (negotiationId: string | null | undefined) =>
  ["crm-negotiation-products", negotiationId] as const;

export async function listNegotiationProducts(
  negotiationId: string,
): Promise<CrmNegotiationProduct[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_negotiation_products")
    .select(SELECT)
    .eq("negotiation_id", negotiationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Row));
}

export type AddNegotiationProductInput = {
  negotiationId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  usedCustomPrice: boolean;
};

export async function addNegotiationProduct(
  input: AddNegotiationProductInput,
): Promise<CrmNegotiationProduct> {
  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("crm_negotiation_products")
    .insert({
      tenant_id: tenantId,
      negotiation_id: input.negotiationId,
      product_id: input.productId,
      product_name: input.productName.trim(),
      quantity: input.quantity,
      list_price: input.listPrice,
      unit_price: input.unitPrice,
      used_custom_price: input.usedCustomPrice,
    })
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data as Row);
}

export type UpdateNegotiationProductInput = {
  id: string;
  negotiationId: string;
  patch: Partial<Pick<CrmNegotiationProduct, "quantity" | "unitPrice" | "usedCustomPrice">>;
};

export async function updateNegotiationProduct(input: UpdateNegotiationProductInput): Promise<void> {
  const supabase = requireSupabase();
  const row: Record<string, unknown> = {};
  if (input.patch.quantity !== undefined) row.quantity = input.patch.quantity;
  if (input.patch.unitPrice !== undefined) row.unit_price = input.patch.unitPrice;
  if (input.patch.usedCustomPrice !== undefined) row.used_custom_price = input.patch.usedCustomPrice;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("crm_negotiation_products").update(row).eq("id", input.id);
  if (error) throw new Error(error.message);
}

export async function removeNegotiationProduct(id: string): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase.from("crm_negotiation_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Soma os produtos e grava no `total_value` da negociação. Há um trigger no banco
 * para isso, mas mantemos o cálculo no app como garantia (e para refrescar o cache).
 */
export async function syncNegotiationTotalFromProducts(negotiationId: string): Promise<void> {
  const products = await listNegotiationProducts(negotiationId);
  const total = products.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  await updateCrmNegotiation(negotiationId, { totalValue: total });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useNegotiationProducts(negotiationId: string | null | undefined) {
  return useQuery({
    queryKey: negotiationProductsQueryKey(negotiationId),
    queryFn: () => listNegotiationProducts(negotiationId as string),
    enabled: Boolean(negotiationId) && isSupabaseConfigured,
    staleTime: 30_000,
  });
}

/** Recalcula o total da negociação no app e invalida produtos + negociações. */
async function syncAndInvalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  negotiationId: string,
) {
  try {
    await syncNegotiationTotalFromProducts(negotiationId);
  } catch {
    // Mantém a UI consistente mesmo se o patch do total falhar (ex.: sem permissão).
  }
  void queryClient.invalidateQueries({ queryKey: negotiationProductsQueryKey(negotiationId) });
  void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
  void queryClient.invalidateQueries({ queryKey: ["chat-negotiation"] });
}

export function useAddNegotiationProduct(
  options?: UseMutationOptions<CrmNegotiationProduct, Error, AddNegotiationProductInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addNegotiationProduct,
    ...options,
    onSuccess: async (data, variables, context) => {
      await syncAndInvalidate(queryClient, variables.negotiationId);
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateNegotiationProduct(
  options?: UseMutationOptions<void, Error, UpdateNegotiationProductInput>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateNegotiationProduct,
    ...options,
    onSuccess: async (data, variables, context) => {
      await syncAndInvalidate(queryClient, variables.negotiationId);
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useRemoveNegotiationProduct(
  options?: UseMutationOptions<void, Error, { id: string; negotiationId: string }>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => removeNegotiationProduct(id),
    ...options,
    onSuccess: async (data, variables, context) => {
      await syncAndInvalidate(queryClient, variables.negotiationId);
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useNegotiationProductsRealtime(negotiationId: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!negotiationId || !isSupabaseConfigured) return;
    const supabase = requireSupabase();
    const channel = supabase
      .channel(`crm-neg-products:${negotiationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_negotiation_products",
          filter: `negotiation_id=eq.${negotiationId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: negotiationProductsQueryKey(negotiationId),
          });
          void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
          void queryClient.invalidateQueries({ queryKey: ["chat-negotiation"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [negotiationId, queryClient]);
}
