import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import type {
  CustomerCreditRecord,
  CustomerCreditSummary,
  ReturnRecord,
  SaleFlowPayload,
  SaleItemRecord,
  SalePaymentMethod,
  SaleRecord,
} from "@/types/domain";

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  list_price: number;
  unit_price: number;
  used_custom_price: boolean;
  created_at: string | null;
};

type SaleRow = {
  id: string;
  customer_id: string | null;
  chat_id: string | null;
  sold_by: string;
  sold_at: string | null;
  payment_method: string | null;
  notes: string | null;
  sale_items: SaleItemRow[] | null;
  customers?: { nome: string | null } | null;
};

type ReturnRow = {
  id: string;
  customer_id: string | null;
  sale_id: string | null;
  source: "existing_sale" | "other_sale";
  resolution: "troca" | "credito";
  product_id: string | null;
  product_name: string | null;
  quantity: number | string | null;
  sale_item_id: string | null;
  amount: number;
  used_custom_price: boolean;
  returned_at: string | null;
  notes: string | null;
  customers?: { nome: string | null } | null;
};

type CustomerCreditRow = {
  id: string;
  customer_id: string;
  return_id: string | null;
  type: "credit_from_return" | "debit_usage";
  amount: number;
  description: string | null;
  created_at: string | null;
  customers?: { nome: string | null } | null;
};

type RegisterSaleFlowResult = {
  flow_type: "venda" | "devolucao";
  sale_id?: string | null;
  return_id?: string | null;
  credit_id?: string | null;
  amount?: number | null;
  resolution?: "troca" | "credito" | null;
  payment_method?: string | null;
  credit_applied?: number | null;
  /** Presente em vendas quando a RPC usou `p_sale_items` (varias linhas). */
  multiItem?: boolean;
  /** Devolucao: quantidade registrada. */
  returnQuantity?: number | null;
};

export function parseRegisterSaleFlowResult(raw: unknown): RegisterSaleFlowResult | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const flow = o.flow_type;
  if (flow !== "venda" && flow !== "devolucao") {
    return null;
  }
  return {
    flow_type: flow,
    sale_id: (o.sale_id as string | null | undefined) ?? null,
    return_id: (o.return_id as string | null | undefined) ?? null,
    credit_id: (o.credit_id as string | null | undefined) ?? null,
    amount: o.amount != null ? Number(o.amount) : null,
    resolution: o.resolution === "troca" || o.resolution === "credito" ? o.resolution : null,
    payment_method: (o.payment_method as string | null | undefined) ?? null,
    credit_applied: o.credit_applied != null ? Number(o.credit_applied) : null,
    multiItem: Boolean(o.multi_item),
    returnQuantity: o.return_quantity != null ? Number(o.return_quantity) : null,
  };
}

const SALE_PAYMENT_METHODS = new Set<string>([
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "fiado",
  "credito_loja",
  "outro",
  "nao_informado",
]);

function mapPaymentMethod(value: string | null | undefined): SalePaymentMethod {
  const raw = value?.trim().toLowerCase();
  if (raw && SALE_PAYMENT_METHODS.has(raw)) {
    return raw as SalePaymentMethod;
  }
  return "nao_informado";
}

function mapSaleItemRow(row: SaleItemRow): SaleItemRecord {
  return {
    id: row.id,
    saleId: row.sale_id,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity ?? 0),
    listPrice: Number(row.list_price ?? 0),
    unitPrice: Number(row.unit_price ?? 0),
    usedCustomPrice: Boolean(row.used_custom_price),
    createdAt: row.created_at ?? undefined,
  };
}

function mapSaleRow(row: SaleRow): SaleRecord {
  const items = (row.sale_items ?? [])
    .map(mapSaleItemRow)
    .sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) {
        return ta - tb;
      }
      return a.id.localeCompare(b.id);
    });
  const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customers?.nome?.trim() || "Cliente sem nome",
    chatId: row.chat_id,
    soldBy: row.sold_by,
    soldAt: row.sold_at ?? "",
    paymentMethod: mapPaymentMethod(row.payment_method),
    notes: row.notes?.trim() ? row.notes : null,
    items,
    totalAmount,
  };
}

function mapReturnRow(row: ReturnRow): ReturnRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customers?.nome?.trim() || "Cliente sem nome",
    saleId: row.sale_id,
    source: row.source,
    resolution: row.resolution,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity ?? 1),
    saleItemId: row.sale_item_id ?? undefined,
    amount: Number(row.amount ?? 0),
    usedCustomPrice: Boolean(row.used_custom_price),
    returnedAt: row.returned_at ?? "",
    notes: row.notes?.trim() ? row.notes.trim() : null,
  };
}

function mapCustomerCreditRow(row: CustomerCreditRow): CustomerCreditRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customers?.nome?.trim() || "Cliente sem nome",
    returnId: row.return_id,
    type: row.type,
    amount: Number(row.amount ?? 0),
    description: row.description,
    createdAt: row.created_at ?? "",
  };
}

export async function registerSaleFlow(payload: SaleFlowPayload) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para registrar vendas e devolucoes.");
  }

  const supabase = requireSupabase();
  const useSaleLines = payload.flowType === "venda" && Boolean(payload.saleLines?.length);

  const p_sale_items = useSaleLines
    ? payload.saleLines!.map((line) => ({
        product_id: line.productId,
        quantity: line.quantity,
        other_price: Boolean(line.otherPrice),
        custom_unit_price:
          line.otherPrice && line.customUnitPrice != null && Number.isFinite(line.customUnitPrice)
            ? line.customUnitPrice
            : null,
      }))
    : null;

  const { data, error } = await supabase.rpc("register_sale_flow", {
    p_chat_id: payload.chatId,
    p_customer_id: payload.customerId ?? null,
    p_flow_type: payload.flowType,
    p_sold_by: payload.soldBy ?? null,
    p_sale_product_id: useSaleLines ? null : payload.saleProductId ?? null,
    p_sale_other_price: useSaleLines ? false : Boolean(payload.saleOtherPrice),
    p_sale_custom_price: useSaleLines ? null : payload.saleCustomPrice ?? null,
    p_return_source: payload.returnSource ?? null,
    p_return_existing_sale_id: payload.returnExistingSaleId ?? null,
    p_return_sale_item_id:
      payload.flowType === "devolucao" &&
      payload.returnSource === "existente" &&
      payload.returnSaleItemId?.trim()
        ? payload.returnSaleItemId.trim()
        : null,
    p_return_product_id: payload.returnProductId ?? null,
    p_return_other_price: Boolean(payload.returnOtherPrice),
    p_return_custom_price: payload.returnCustomPrice ?? null,
    p_return_quantity:
      payload.flowType === "devolucao" &&
      payload.returnQuantity != null &&
      Number.isFinite(payload.returnQuantity)
        ? payload.returnQuantity
        : null,
    p_return_resolution: payload.returnResolution ?? null,
    p_sale_payment_method: payload.flowType === "venda" ? payload.salePaymentMethod ?? null : null,
    p_sale_credit_amount: payload.flowType === "venda" ? payload.saleCreditAmount ?? null : null,
    p_sale_notes:
      payload.flowType === "venda" && payload.saleNotes?.trim()
        ? payload.saleNotes.trim().slice(0, 2000)
        : null,
    p_sale_items,
    p_return_notes:
      payload.flowType === "devolucao" && payload.returnNotes?.trim()
        ? payload.returnNotes.trim().slice(0, 2000)
        : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRegisterSaleFlowResult(data);
}

export async function listSales(filters?: { customerId?: string | null; chatId?: string | null; limit?: number }) {
  if (!isSupabaseConfigured) {
    return [] as SaleRecord[];
  }

  const supabase = requireSupabase();
  let query = supabase
    .from("sales")
    .select(
      "id, customer_id, chat_id, sold_by, sold_at, payment_method, notes, customers(nome), sale_items(id, sale_id, product_id, product_name, quantity, list_price, unit_price, used_custom_price, created_at)",
    )
    .order("sold_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters?.chatId) {
    query = query.eq("chat_id", filters.chatId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapSaleRow(row as unknown as SaleRow));
}

export async function listReturns(filters?: {
  customerId?: string | null;
  saleId?: string | null;
  limit?: number;
}) {
  if (!isSupabaseConfigured) {
    return [] as ReturnRecord[];
  }

  const supabase = requireSupabase();
  let query = supabase
    .from("returns")
    .select(
      "id, customer_id, sale_id, source, resolution, product_id, product_name, quantity, sale_item_id, amount, used_custom_price, returned_at, notes, customers(nome)",
    )
    .is("voided_at", null)
    .order("returned_at", { ascending: false })
    .limit(filters?.limit ?? 200);

  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  if (filters?.saleId) {
    query = query.eq("sale_id", filters.saleId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapReturnRow(row as unknown as ReturnRow));
}

export async function voidReturn(returnId: string) {
  if (!isSupabaseConfigured) {
    throw new Error("Configure o Supabase para estornar devolucoes.");
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("void_return", {
    p_return_id: returnId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function useVoidReturn(
  options?: Omit<UseMutationOptions<unknown, Error, string>, "mutationFn">,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: voidReturn,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-credit-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export async function listCustomerCredits(filters?: { customerId?: string | null; limit?: number }) {
  if (!isSupabaseConfigured) {
    return [] as CustomerCreditRecord[];
  }

  const supabase = requireSupabase();
  let query = supabase
    .from("customer_credits")
    .select("id, customer_id, return_id, type, amount, description, created_at, customers(nome)")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 500);

  if (filters?.customerId) {
    query = query.eq("customer_id", filters.customerId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapCustomerCreditRow(row as unknown as CustomerCreditRow));
}

export async function getCustomerCreditSummary(customerId: string) {
  const credits = await listCustomerCredits({ customerId, limit: 500 });
  const total = credits.reduce(
    (sum, item) => sum + (item.type === "debit_usage" ? -item.amount : item.amount),
    0,
  );

  return {
    customerId,
    customerName: credits[0]?.customerName ?? "Cliente sem nome",
    totalCredit: total,
    creditsCount: credits.filter((item) => item.type === "credit_from_return").length,
    lastCreditAt: credits.find((item) => item.type === "credit_from_return")?.createdAt,
  } satisfies CustomerCreditSummary;
}

export function buildCreditsSummary(credits: CustomerCreditRecord[]) {
  const byCustomer = new Map<string, CustomerCreditSummary>();

  for (const row of credits) {
    const current = byCustomer.get(row.customerId) ?? {
      customerId: row.customerId,
      customerName: row.customerName,
      totalCredit: 0,
      creditsCount: 0,
      lastCreditAt: undefined,
    };

    current.totalCredit += row.type === "debit_usage" ? -row.amount : row.amount;
    if (row.type === "credit_from_return") {
      current.creditsCount += 1;
      if (!current.lastCreditAt || new Date(row.createdAt).getTime() > new Date(current.lastCreditAt).getTime()) {
        current.lastCreditAt = row.createdAt;
      }
    }

    byCustomer.set(row.customerId, current);
  }

  return Array.from(byCustomer.values()).sort((a, b) => b.totalCredit - a.totalCredit);
}

export function useRegisterSaleFlow(
  options?: UseMutationOptions<RegisterSaleFlowResult | null, Error, SaleFlowPayload>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registerSaleFlow,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["returns"] });
      await queryClient.invalidateQueries({ queryKey: ["customer-credits"] });
      if (variables.flowType === "venda" || variables.flowType === "devolucao") {
        await queryClient.invalidateQueries({ queryKey: ["products"] });
      }
      if (variables.customerId) {
        await queryClient.invalidateQueries({ queryKey: ["sales", "customer", variables.customerId] });
        await queryClient.invalidateQueries({ queryKey: ["returns", "customer", variables.customerId] });
        await queryClient.invalidateQueries({ queryKey: ["customer-credits", "customer", variables.customerId] });
        await queryClient.invalidateQueries({ queryKey: ["customer-credit-summary", variables.customerId] });
      }
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useSales(
  filters?: { customerId?: string | null; chatId?: string | null; limit?: number },
  options?: Omit<UseQueryOptions<SaleRecord[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["sales", filters ?? {}],
    queryFn: () => listSales(filters),
    ...options,
  });
}

export function useCustomerSales(
  customerId?: string | null,
  filters?: { limit?: number },
  options?: Omit<UseQueryOptions<SaleRecord[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["sales", "customer", customerId, filters?.limit ?? 200],
    queryFn: () => listSales({ customerId, limit: filters?.limit ?? 200 }),
    enabled: Boolean(customerId) && (options?.enabled ?? true),
    ...options,
  });
}

export function useReturns(
  filters?: { customerId?: string | null; saleId?: string | null; limit?: number },
  options?: Omit<UseQueryOptions<ReturnRecord[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["returns", filters ?? {}],
    queryFn: () => listReturns(filters),
    ...options,
  });
}

export function useCustomerCredits(
  filters?: { customerId?: string | null; limit?: number },
  options?: Omit<UseQueryOptions<CustomerCreditRecord[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customer-credits", filters ?? {}],
    queryFn: () => listCustomerCredits(filters),
    ...options,
  });
}

export function useCustomerCreditSummary(
  customerId?: string | null,
  options?: Omit<UseQueryOptions<CustomerCreditSummary, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customer-credit-summary", customerId],
    queryFn: () => getCustomerCreditSummary(customerId as string),
    enabled: Boolean(customerId) && (options?.enabled ?? true),
    ...options,
  });
}
