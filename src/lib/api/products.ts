import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { sanitizeCustomerSearchForPostgrestOrIlike } from "@/lib/customer-search-sanitize";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { getCurrentTenantId } from "@/lib/api/tenant";
import type { Product, ProductFilters, ProductUpsertInput } from "@/types/domain";

const PRODUCTS_STORAGE_KEY = "distribuibot-products";
const PRODUCTS_SELECT = [
  "id",
  "codigo",
  "tipo",
  "qtd_estoque",
  "nome",
  "preco_compra",
  "preco_venda",
  "codigo_barras",
  "unidade",
  "ncm",
  "cest",
  "grupo",
  "peso_bruto",
  "peso_liquido",
  "comissao",
  "status",
  "duracao_min",
  "agendavel",
  "created_at",
  "updated_at",
].join(", ");

type ProductRow = {
  id: string;
  codigo: string;
  tipo: Product["tipo"] | null;
  qtd_estoque: number;
  nome: string;
  preco_compra: number;
  preco_venda: number;
  codigo_barras: string | null;
  unidade: string;
  ncm: string | null;
  cest: string | null;
  grupo: string;
  peso_bruto: number;
  peso_liquido: number;
  comissao: number;
  status: Product["status"];
  duracao_min: number | null;
  agendavel: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapRowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    codigo: row.codigo,
    tipo: row.tipo ?? "produto",
    qtdEstoque: row.qtd_estoque,
    nome: row.nome,
    precoCompra: row.preco_compra,
    precoVenda: row.preco_venda,
    codigoBarras: row.codigo_barras ?? "",
    unidade: row.unidade,
    ncm: row.ncm ?? "",
    cest: row.cest ?? "",
    grupo: row.grupo,
    pesoBruto: row.peso_bruto,
    pesoLiquido: row.peso_liquido,
    comissao: row.comissao,
    status: row.status,
    duracaoMin: row.duracao_min ?? null,
    agendavel: row.agendavel ?? false,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapInputToRow(input: ProductUpsertInput): Omit<ProductRow, "id" | "created_at" | "updated_at"> {
  return {
    codigo: input.codigo,
    tipo: input.tipo,
    qtd_estoque: input.qtdEstoque,
    nome: input.nome,
    preco_compra: input.precoCompra,
    preco_venda: input.precoVenda,
    codigo_barras: input.codigoBarras || null,
    unidade: input.unidade,
    ncm: input.ncm || null,
    cest: input.cest || null,
    grupo: input.grupo,
    peso_bruto: input.pesoBruto,
    peso_liquido: input.pesoLiquido,
    comissao: input.comissao,
    status: input.status,
    duracao_min: input.duracaoMin ?? null,
    agendavel: input.agendavel ?? false,
  };
}

function readLocalProducts() {
  if (typeof window === "undefined") {
    return [] as Product[];
  }

  const stored = window.localStorage.getItem(PRODUCTS_STORAGE_KEY);
  if (!stored) {
    window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
    return [];
  }

  try {
    return JSON.parse(stored) as Product[];
  } catch {
    window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]));
    return [];
  }
}

function writeLocalProducts(products: Product[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products));
}

function applyFilters(products: Product[], filters: ProductFilters = {}) {
  const normalizedSearch = sanitizeCustomerSearchForPostgrestOrIlike(filters.search ?? "").toLowerCase();

  const filtered = products.filter((product) => {
    const matchesSearch =
      !normalizedSearch ||
      product.nome.toLowerCase().includes(normalizedSearch) ||
      product.codigo.toLowerCase().includes(normalizedSearch) ||
      product.codigoBarras.toLowerCase().includes(normalizedSearch) ||
      product.ncm.toLowerCase().includes(normalizedSearch);
    const matchesGroup = !filters.grupo || filters.grupo === "todos" || product.grupo === filters.grupo;
    const matchesUnit = !filters.unidade || filters.unidade === "todos" || product.unidade === filters.unidade;
    const matchesStatus = !filters.status || filters.status === "todos" || product.status === filters.status;
    const matchesSelection =
      !filters.selectedProductIds?.length || filters.selectedProductIds.includes(product.id);

    return matchesSearch && matchesGroup && matchesUnit && matchesStatus && matchesSelection;
  });

  if (typeof filters.limit === "number" && filters.limit > 0) {
    return filtered.slice(0, filters.limit);
  }

  return filtered;
}

export async function listProducts(filters: ProductFilters = {}) {
  if (!isSupabaseConfigured) {
    return applyFilters(readLocalProducts(), filters);
  }

  const supabase = requireSupabase();
  let query = supabase.from("products").select(PRODUCTS_SELECT).order("nome");

  if (filters.grupo && filters.grupo !== "todos") {
    query = query.eq("grupo", filters.grupo);
  }

  if (filters.unidade && filters.unidade !== "todos") {
    query = query.eq("unidade", filters.unidade);
  }

  if (filters.status && filters.status !== "todos") {
    query = query.eq("status", filters.status);
  }

  if (filters.search?.trim()) {
    const search = sanitizeCustomerSearchForPostgrestOrIlike(filters.search);
    if (search.length > 0) {
      query = query.or(
        `nome.ilike.%${search}%,codigo.ilike.%${search}%,codigo_barras.ilike.%${search}%,ncm.ilike.%${search}%`,
      );
    }
  }

  if (filters.selectedProductIds?.length) {
    query = query.in("id", filters.selectedProductIds);
  }

  if (typeof filters.limit === "number" && filters.limit > 0) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRowToProduct(row as unknown as ProductRow));
}

export async function createProduct(input: ProductUpsertInput) {
  if (!isSupabaseConfigured) {
    const nextProduct: Product = {
      id: crypto.randomUUID(),
      ...input,
    };
    writeLocalProducts([nextProduct, ...readLocalProducts()]);
    return nextProduct;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("products")
    .insert({ ...mapInputToRow(input), tenant_id: tenantId })
    .select(PRODUCTS_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToProduct(data as unknown as ProductRow);
}

export async function updateProduct(id: string, input: ProductUpsertInput) {
  if (!isSupabaseConfigured) {
    const products = readLocalProducts();
    const updated = products.map((product) => (product.id === id ? { ...product, ...input } : product));
    writeLocalProducts(updated);
    return updated.find((product) => product.id === id) ?? null;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("products")
    .update(mapInputToRow(input))
    .eq("id", id)
    .select(PRODUCTS_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToProduct(data as unknown as ProductRow);
}

export async function deleteProducts(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) {
    return 0;
  }

  if (!isSupabaseConfigured) {
    const products = readLocalProducts();
    const idsToDelete = new Set(uniqueIds);
    const nextProducts = products.filter((product) => !idsToDelete.has(product.id));
    writeLocalProducts(nextProducts);
    return products.length - nextProducts.length;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error, count } = await supabase
    .from("products")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? uniqueIds.length;
}

export async function importProducts(inputs: ProductUpsertInput[]) {
  if (!inputs.length) {
    return [];
  }

  if (!isSupabaseConfigured) {
    const currentProducts = readLocalProducts();
    const currentByCode = new Map(currentProducts.map((product) => [product.codigo, product]));

    const importedProducts = inputs.map((input) => {
      const existing = currentByCode.get(input.codigo);
      return {
        id: existing?.id ?? crypto.randomUUID(),
        ...input,
        createdAt: existing?.createdAt,
        updatedAt: new Date().toISOString(),
      } satisfies Product;
    });

    const importedCodes = new Set(importedProducts.map((product) => product.codigo));
    const nextProducts = [
      ...importedProducts,
      ...currentProducts.filter((product) => !importedCodes.has(product.codigo)),
    ];

    writeLocalProducts(nextProducts);
    return importedProducts;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("products")
    .upsert(
      inputs.map((input) => ({ ...mapInputToRow(input), tenant_id: tenantId })),
      { onConflict: "tenant_id,codigo" },
    )
    .select(PRODUCTS_SELECT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRowToProduct(row as unknown as ProductRow));
}

export function useProducts(
  filters: ProductFilters,
  options?: Omit<UseQueryOptions<Product[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["products", filters],
    queryFn: () => listProducts(filters),
    ...options,
  });
}

export function useCreateProduct(
  options?: UseMutationOptions<Product, Error, ProductUpsertInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createProduct,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateProduct(
  options?: UseMutationOptions<Product | null, Error, { id: string; input: ProductUpsertInput }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => updateProduct(id, input),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useImportProducts(
  options?: UseMutationOptions<Product[], Error, ProductUpsertInput[]>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importProducts,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteProducts(options?: UseMutationOptions<number, Error, string[]>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteProducts,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product-catalog"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
