import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatBRL } from "@/lib/format";
import { Loader2, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { CustomerCustomFieldInput } from "@/components/customers/CustomerCustomFieldInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ServiceProvidersPanel } from "@/components/agendamentos/ServiceProvidersPanel";
import { useToast } from "@/hooks/use-toast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useCreateProduct, useDeleteProducts, useProducts, useUpdateProduct } from "@/lib/api/products";
import {
  customFieldValueToString,
  listCategoryIdsForProduct,
  listCustomFieldValuesForProduct,
  upsertProductCustomFieldValues,
  useCreateProductCategory,
  useCreateProductCustomField,
  useDeleteProductCategory,
  useDeleteProductCustomField,
  useProductCategories,
  useProductCategoryAssignments,
  useProductCustomFields,
  useSetProductCategories,
} from "@/lib/api/product-catalog";
import {
  CUSTOM_FIELD_KINDS,
  FIELD_KIND_GROUPS,
  FIELD_KIND_LABEL,
  type CustomFieldKind,
} from "@/lib/custom-field-kinds";
import type { Product, ProductUpsertInput } from "@/types/domain";
import {
  formatCurrencyInput,
  maskCurrencyInputChange,
  parseCurrencyInput,
} from "@/lib/currency-input";
import { PageShell } from "@/components/layout/PageShell";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { cn } from "@/lib/utils";

const PAGE_TABS = ["produtos", "campos", "categorias"] as const;
type PageTab = (typeof PAGE_TABS)[number];

function parseTab(raw: string | null): PageTab {
  if (raw && (PAGE_TABS as readonly string[]).includes(raw)) {
    return raw as PageTab;
  }
  return "produtos";
}

function formatMoney(value: number) {
  return formatBRL(value);
}

function parseOptionsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function nextProductCode(products: Product[]) {
  const highest = products.reduce((max, product) => {
    const numeric = Number((product.codigo ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(numeric)) {
      return max;
    }
    return Math.max(max, numeric);
  }, 0);
  return String(highest + 1);
}

function defaultProductInput(): ProductUpsertInput {
  return {
    codigo: "",
    tipo: "produto",
    qtdEstoque: 0,
    nome: "",
    precoCompra: 0,
    precoVenda: 0,
    codigoBarras: "",
    unidade: "UN",
    ncm: "",
    cest: "",
    grupo: "Outros",
    pesoBruto: 0,
    pesoLiquido: 0,
    comissao: 0,
    status: "ativo",
    duracaoMin: 30,
    agendavel: false,
  };
}

function productToInput(p: Product): ProductUpsertInput {
  return {
    codigo: p.codigo,
    tipo: p.tipo,
    qtdEstoque: p.qtdEstoque,
    nome: p.nome,
    precoCompra: p.precoCompra,
    precoVenda: p.precoVenda,
    codigoBarras: p.codigoBarras,
    unidade: p.unidade,
    ncm: p.ncm,
    cest: p.cest,
    grupo: p.grupo,
    pesoBruto: p.pesoBruto,
    pesoLiquido: p.pesoLiquido,
    comissao: p.comissao,
    status: p.status,
    duracaoMin: p.duracaoMin ?? 30,
    agendavel: p.agendavel ?? false,
  };
}

// Aba estilo "sublinhado" (premium) sobrescrevendo o pill padrão do shadcn.
const UNDERLINE_TAB =
  "rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

export default function Produtos() {
  const { toast } = useToast();
  const { can } = useRolePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("aba"));
  const canEditProdutos = can("produtos", "edit");
  const canDeleteProdutos = can("produtos", "delete");

  const setTab = useCallback(
    (next: PageTab) => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("aba", next);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "produto" | "servico">("all");
  const productQuery = useProducts({ search });

  const products = useMemo(() => productQuery.data ?? [], [productQuery.data]);
  const filteredProducts = useMemo(
    () => (kindFilter === "all" ? products : products.filter((p) => (p.tipo ?? "produto") === kindFilter)),
    [products, kindFilter],
  );
  const productIds = useMemo(() => products.map((p) => p.id).sort(), [products]);
  const { data: assignmentMap } = useProductCategoryAssignments(productIds);

  const { data: categories = [], isLoading: catLoading } = useProductCategories();
  const createCategory = useCreateProductCategory();
  const deleteCategory = useDeleteProductCategory();

  const { data: fieldDefs = [], isLoading: fieldsLoading } = useProductCustomFields();
  const createField = useCreateProductCustomField();
  const deleteField = useDeleteProductCustomField();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductUpsertInput>(() => defaultProductInput());
  const [valorDisplay, setValorDisplay] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProducts = useDeleteProducts();
  const setProductCats = useSetProductCategories();

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Seleção em massa (catálogo) — apenas quando o papel pode excluir.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Remove da seleção os ids que não existem mais (após excluir/recarregar).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(products.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (live.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [products]);

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));
  const someFilteredSelected = filteredProducts.some((p) => selectedIds.has(p.id));
  const headerChecked: boolean | "indeterminate" = allFilteredSelected
    ? true
    : someFilteredSelected
      ? "indeterminate"
      : false;

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => (checked ? next.add(p.id) : next.delete(p.id)));
      return next;
    });
  };
  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const selectionColumns = canDeleteProdutos ? 7 : 6;

  const [newCategoryNome, setNewCategoryNome] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; nome: string } | null>(null);

  const [newFieldNome, setNewFieldNome] = useState("");
  const [newFieldKind, setNewFieldKind] = useState<CustomFieldKind>("texto");
  const [listaOptionsText, setListaOptionsText] = useState("");
  const [fieldToDelete, setFieldToDelete] = useState<{ id: string; nome: string } | null>(null);

  const [linkProductId, setLinkProductId] = useState<string>("");
  const [linkCats, setLinkCats] = useState<string[]>([]);

  useEffect(() => {
    if (products.length && !linkProductId) {
      setLinkProductId(products[0].id);
    }
  }, [products, linkProductId]);

  useEffect(() => {
    if (!dialogOpen) {
      return;
    }

    if (!editingId) {
      setCustomValues({});
      setCustomFieldsLoading(false);
      return;
    }

    if (fieldDefs.length === 0) {
      setCustomValues({});
      setCustomFieldsLoading(false);
      return;
    }

    let active = true;
    setCustomFieldsLoading(true);

    void listCustomFieldValuesForProduct(editingId)
      .then((rows) => {
        if (!active) {
          return;
        }
        const byField = new Map(rows.map((row) => [row.fieldId, row]));
        const next: Record<string, string> = {};
        for (const field of fieldDefs) {
          const row = byField.get(field.id);
          next[field.id] = row ? customFieldValueToString(field.kind, row) : "";
        }
        setCustomValues(next);
      })
      .catch(() => {
        if (active) {
          setCustomValues({});
        }
      })
      .finally(() => {
        if (active) {
          setCustomFieldsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dialogOpen, editingId, fieldDefs]);

  const openCreate = () => {
    if (!canEditProdutos) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para criar produtos.",
        variant: "destructive",
      });
      return;
    }
    setEditingId(null);
    const base = defaultProductInput();
    setForm({
      ...base,
      codigo: products.length > 0 ? nextProductCode(products) : "1",
    });
    setValorDisplay("");
    setCustomValues({});
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    if (!canEditProdutos) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para editar produtos.",
        variant: "destructive",
      });
      return;
    }
    setEditingId(p.id);
    setForm(productToInput(p));
    setValorDisplay(formatCurrencyInput(p.precoVenda));
    setDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!canEditProdutos) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para salvar produtos.",
        variant: "destructive",
      });
      return;
    }
    if (!form.nome.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    const precoVenda = parseCurrencyInput(valorDisplay);
    if (form.tipo === "produto" && precoVenda <= 0) {
      toast({ title: "Informe o valor do produto", variant: "destructive" });
      return;
    }
    const payload: ProductUpsertInput = {
      ...(editingId ? form : { ...defaultProductInput(), codigo: form.codigo.trim() || nextProductCode(products) }),
      tipo: form.tipo,
      nome: form.nome.trim(),
      precoVenda,
      // Serviço não controla estoque.
      qtdEstoque: form.tipo === "servico" ? 0 : form.qtdEstoque,
      // Campos de agendamento (só fazem sentido em serviço).
      agendavel: form.tipo === "servico" ? (form.agendavel ?? false) : false,
      duracaoMin: form.tipo === "servico" ? (form.duracaoMin ?? 30) : null,
    };

    try {
      let id = editingId;
      if (editingId) {
        await updateProduct.mutateAsync({ id: editingId, input: payload });
      } else {
        const created = await createProduct.mutateAsync(payload);
        id = created.id;
      }
      if (id && fieldDefs.length > 0) {
        await upsertProductCustomFieldValues(id, fieldDefs, customValues);
      }
      toast({ title: editingId ? "Produto atualizado" : "Produto criado" });
      setDialogOpen(false);
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };



  const listaOptions = parseOptionsText(listaOptionsText);
  const canSubmitField =
    newFieldNome.trim() && !createField.isPending && (newFieldKind !== "lista" || listaOptions.length > 0);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.nome])), [categories]);

  const extrasDisabled = !isSupabaseConfigured;

  return (
    <>
    <PageShell contentClassName="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--wchat-brand-700))] text-primary-foreground shadow-[0_6px_16px_-8px_hsl(262_60%_40%/0.7)]">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Serviços e produtos</h1>
            <p className="text-sm text-muted-foreground">
              Seu catálogo de venda no WhatsApp. Campos extras e categorias ficam nas abas ao lado.
            </p>
          </div>
        </div>

        {extrasDisabled ? (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader className="py-3">
              <CardTitle className="text-base">Modo offline</CardTitle>
              <CardDescription>
                Campos personalizados e categorias ficam disponíveis com Supabase configurado. A lista de produtos pode
                usar armazenamento local.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as PageTab)} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="produtos" className={UNDERLINE_TAB}>
              Catálogo
            </TabsTrigger>
            <TabsTrigger value="campos" className={UNDERLINE_TAB} disabled={extrasDisabled}>
              Campos personalizados
            </TabsTrigger>
            <TabsTrigger value="categorias" className={UNDERLINE_TAB} disabled={extrasDisabled}>
              Categorias
            </TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="space-y-4 focus-visible:outline-none">
            <Card className="overflow-hidden rounded-xl border-border shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Seus produtos
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "itens"}
                    </span>
                  </CardTitle>
                  <CardDescription>Clique numa linha para editar · selecione para ações em massa.</CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 rounded-[10px]"
                  disabled={!canEditProdutos}
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" />
                  Novo produto
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {canDeleteProdutos && selectedIds.size > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-4 py-3">
                    <span className="text-sm font-medium text-primary">
                      {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
                    </span>
                    <div className="flex-1" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-[8px]"
                      onClick={clearSelection}
                    >
                      Limpar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 rounded-[8px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setBulkDeleteOpen(true)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir selecionados
                    </Button>
                  </div>
                ) : (
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                  <Input
                    placeholder="Buscar por nome ou código…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs rounded-[10px]"
                  />
                  <div className="inline-flex items-center rounded-[10px] border border-border bg-muted/60 p-0.5">
                    {([
                      { v: "all", label: "Todos" },
                      { v: "produto", label: "Produtos" },
                      { v: "servico", label: "Serviços" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setKindFilter(opt.v)}
                        aria-pressed={kindFilter === opt.v}
                        className={cn(
                          "rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors",
                          kindFilter === opt.v
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider">
                      <TableRow className="hover:bg-transparent">
                        {canDeleteProdutos ? (
                          <TableHead className="w-[44px]">
                            <Checkbox
                              checked={headerChecked}
                              onCheckedChange={(v) => toggleSelectAll(v === true)}
                              aria-label="Selecionar todos"
                              disabled={filteredProducts.length === 0}
                            />
                          </TableHead>
                        ) : null}
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden w-[110px] sm:table-cell">Tipo</TableHead>
                        <TableHead className="hidden min-w-[160px] md:table-cell">Categorias</TableHead>
                        <TableHead className="hidden w-[110px] text-right sm:table-cell">Estoque</TableHead>
                        <TableHead className="w-[150px] text-right">Valor de venda</TableHead>
                        <TableHead className="w-[110px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productQuery.isLoading ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={selectionColumns} className="py-10 text-center text-muted-foreground">
                            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                            Carregando…
                          </TableCell>
                        </TableRow>
                      ) : filteredProducts.length === 0 ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={selectionColumns} className="py-16">
                            <div className="flex flex-col items-center gap-3 text-center">
                              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Package className="h-7 w-7" />
                              </div>
                              {products.length === 0 ? (
                                <>
                                  <div className="space-y-1">
                                    <p className="text-base font-semibold text-foreground">Nenhum produto ainda</p>
                                    <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                                      Cadastre seu primeiro item para enviá-lo em conversas, vincular a negociações e medir o catálogo.
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    className="gap-2 rounded-[10px]"
                                    disabled={!canEditProdutos}
                                    onClick={openCreate}
                                  >
                                    <Plus className="h-4 w-4" />
                                    Cadastrar primeiro produto
                                  </Button>
                                </>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-base font-semibold text-foreground">Nenhum item encontrado</p>
                                  <p className="text-sm text-muted-foreground">Ajuste a busca ou o filtro de tipo.</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map((p) => {
                          const catIds = assignmentMap?.get(p.id) ?? [];
                          const tipo = p.tipo ?? "produto";
                          const isServico = tipo === "servico";
                          return (
                          <TableRow
                            key={p.id}
                            data-state={selectedIds.has(p.id) ? "selected" : undefined}
                            className={cn(
                              "group border-border transition-colors hover:bg-primary/[0.04]",
                              selectedIds.has(p.id) && "bg-primary/10 hover:bg-primary/10",
                            )}
                          >
                            {canDeleteProdutos ? (
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.has(p.id)}
                                  onCheckedChange={(v) => toggleSelectOne(p.id, v === true)}
                                  aria-label={`Selecionar ${p.nome}`}
                                />
                              </TableCell>
                            ) : null}
                            <TableCell>
                              <div className="font-medium text-foreground">{p.nome}</div>
                              {p.codigo ? (
                                <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">#{p.codigo}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {isServico ? (
                                <Badge variant="secondary" className="gap-1.5 font-normal">
                                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                                  Serviço
                                </Badge>
                              ) : (
                                <Badge className="gap-1.5 border-primary/20 bg-primary/10 font-normal text-primary hover:bg-primary/10">
                                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                                  Produto
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {catIds.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  catIds.map((cid) => (
                                    <Badge key={cid} variant="secondary" className="text-[10px] font-normal">
                                      {categoryById.get(cid) ?? cid.slice(0, 6)}
                                    </Badge>
                                  ))
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                              {isServico ? (
                                <span className="text-muted-foreground">—</span>
                              ) : p.qtdEstoque <= 0 ? (
                                <span className="font-medium text-destructive">Esgotado</span>
                              ) : p.qtdEstoque <= 5 ? (
                                <span className="font-medium text-amber-600 dark:text-amber-400">
                                  {p.qtdEstoque} un
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{p.qtdEstoque} un</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="font-semibold tabular-nums text-foreground">
                                {p.precoVenda > 0 ? formatMoney(p.precoVenda) : "—"}
                              </div>
                              {!isServico && p.precoCompra > 0 ? (
                                <div className="text-xs tabular-nums text-muted-foreground">
                                  custo {formatMoney(p.precoCompra)}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-[8px]"
                                  aria-label={`Editar ${p.nome}`}
                                  title="Editar"
                                  disabled={!canEditProdutos}
                                  onClick={() => openEdit(p)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-[8px] text-destructive hover:text-destructive"
                                  aria-label={`Excluir ${p.nome}`}
                                  title="Excluir"
                                  disabled={!canDeleteProdutos}
                                  onClick={() => setProductToDelete(p)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campos" className="space-y-4 focus-visible:outline-none">
            <Card className="rounded-[10px]">
              <CardHeader>
                <CardTitle className="text-base">Campos personalizados</CardTitle>
                <CardDescription>
                  Defina atributos extras (texto, números, datas, listas e mais). Eles aparecem ao criar ou editar um
                  produto.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="field-nome">Nome do campo</Label>
                      <Input
                        id="field-nome"
                        value={newFieldNome}
                        onChange={(e) => setNewFieldNome(e.target.value)}
                        placeholder="Ex.: Validade, Lote, Garantia"
                        className="rounded-[10px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tipo</Label>
                      <Select value={newFieldKind} onValueChange={(v) => setNewFieldKind(v as CustomFieldKind)}>
                        <SelectTrigger className="rounded-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[min(60dvh,320px)]">
                          {FIELD_KIND_GROUPS.map((group) => (
                            <SelectGroup key={group}>
                              <SelectLabel>{group}</SelectLabel>
                              {CUSTOM_FIELD_KINDS.filter((k) => k.group === group).map((k) => (
                                <SelectItem key={k.value} value={k.value}>
                                  {k.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        className="w-full rounded-[10px]"
                        disabled={!canEditProdutos || !canSubmitField}
                        onClick={() => {
                          if (!canEditProdutos) {
                            toast({
                              title: "Ação indisponível",
                              description: "Seu papel nao tem permissao para cadastrar campos.",
                              variant: "destructive",
                            });
                            return;
                          }
                          createField.mutate(
                            {
                              nome: newFieldNome,
                              kind: newFieldKind,
                              options: newFieldKind === "lista" ? listaOptions : undefined,
                            },
                            {
                              onSuccess: () => {
                                toast({ title: "Campo criado" });
                                setNewFieldNome("");
                                setListaOptionsText("");
                              },
                              onError: (e) =>
                                toast({ title: "Erro ao criar campo", description: e.message, variant: "destructive" }),
                            },
                          );
                        }}
                      >
                        {createField.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar campo"}
                      </Button>
                    </div>
                  </div>

                  {newFieldKind === "lista" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="field-opcoes">Opções da lista (uma por linha)</Label>
                      <Textarea
                        id="field-opcoes"
                        value={listaOptionsText}
                        onChange={(e) => setListaOptionsText(e.target.value)}
                        placeholder={"Opção A\nOpção B\nOpção C"}
                        className="min-h-[88px] rounded-[10px]"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Campo</TableHead>
                        <TableHead className="min-w-[140px]">Tipo</TableHead>
                        <TableHead className="w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fieldsLoading ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                            Carregando…
                          </TableCell>
                        </TableRow>
                      ) : fieldDefs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                            Nenhum campo definido.
                          </TableCell>
                        </TableRow>
                      ) : (
                        fieldDefs.map((f) => (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium">{f.nome}</TableCell>
                            <TableCell className="text-muted-foreground">{FIELD_KIND_LABEL[f.kind]}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                disabled={!canDeleteProdutos}
                                onClick={() => setFieldToDelete({ id: f.id, nome: f.nome })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categorias" className="space-y-4 focus-visible:outline-none">
            <Card className="rounded-[10px]">
              <CardHeader>
                <CardTitle className="text-base">Categorias do catálogo</CardTitle>
                <CardDescription>Agrupe produtos livremente e vincule na segunda seção.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="cat-nome">Nova categoria</Label>
                    <Input
                      id="cat-nome"
                      value={newCategoryNome}
                      onChange={(e) => setNewCategoryNome(e.target.value)}
                      placeholder="Nome da categoria"
                      className="w-[220px] rounded-[10px]"
                    />
                  </div>
                  <Button
                    type="button"
                    className="rounded-[10px]"
                    disabled={!canEditProdutos || !newCategoryNome.trim() || createCategory.isPending}
                    onClick={() => {
                      if (!canEditProdutos) {
                        toast({
                          title: "Ação indisponível",
                          description: "Seu papel nao tem permissao para cadastrar categorias.",
                          variant: "destructive",
                        });
                        return;
                      }
                      createCategory.mutate(newCategoryNome.trim(), {
                        onSuccess: () => {
                          toast({ title: "Categoria criada" });
                          setNewCategoryNome("");
                        },
                        onError: (e) =>
                          toast({ title: "Erro", description: e.message, variant: "destructive" }),
                      });
                    }}
                  >
                    {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                  </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Nome</TableHead>
                        <TableHead className="w-[80px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catLoading ? (
                        <TableRow>
                          <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                            Carregando…
                          </TableCell>
                        </TableRow>
                      ) : categories.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                            Nenhuma categoria ainda.
                          </TableCell>
                        </TableRow>
                      ) : (
                        categories.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{c.nome}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                disabled={!canDeleteProdutos}
                                onClick={() => setCategoryToDelete({ id: c.id, nome: c.nome })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                  <Label className="text-base font-semibold">Vincular categorias a um produto</Label>
                  <p className="text-sm text-muted-foreground">Marque todas as categorias que se aplicam ao produto.</p>
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1.5">
                      <Label>Produto</Label>
                      <Select value={linkProductId} onValueChange={setLinkProductId}>
                        <SelectTrigger className="w-[260px] rounded-[10px]">
                          <SelectValue placeholder="Escolha" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <LoadLinkCats productId={linkProductId} onLoaded={setLinkCats} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categories.map((c) => (
                      <label
                        key={c.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-[10px] border border-transparent px-2 py-1.5 hover:bg-muted/60",
                          linkCats.includes(c.id) && "border-primary/30 bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={linkCats.includes(c.id)}
                          onCheckedChange={(chk) => {
                            setLinkCats((prev) =>
                              chk === true ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                            );
                          }}
                        />
                        <span className="text-sm">{c.nome}</span>
                      </label>
                    ))}
                  </div>
                  <Button
                    type="button"
                    className="rounded-[10px]"
                    disabled={!canEditProdutos || !linkProductId || setProductCats.isPending}
                    onClick={() => {
                      if (!canEditProdutos) {
                        toast({
                          title: "Ação indisponível",
                          description: "Seu papel nao tem permissao para salvar vínculos.",
                          variant: "destructive",
                        });
                        return;
                      }
                      setProductCats.mutate(
                        { productId: linkProductId, categoryIds: linkCats },
                        {
                          onSuccess: () => toast({ title: "Categorias atualizadas" }),
                          onError: (e) =>
                            toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
                        },
                      );
                    }}
                  >
                    {setProductCats.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Salvar vínculos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </PageShell>

      <Dialog
        open={dialogOpen && canEditProdutos}
        onOpenChange={(open) => {
          if (!canEditProdutos) {
            setDialogOpen(false);
            return;
          }
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[12px] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              Informe nome e valor. Campos extras definidos na aba Campos personalizados aparecem abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["produto", "servico"] as const).map((kind) => {
                  const active = form.tipo === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: kind }))}
                      className={cn(
                        "rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-wchat-50",
                      )}
                      aria-pressed={active}
                    >
                      {kind === "produto" ? "Produto" : "Serviço"}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.tipo === "produto"
                  ? "Controla estoque e baixa na venda."
                  : "Sem controle de estoque; preço pode ficar em aberto."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                className="rounded-[10px]"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder={form.tipo === "produto" ? "Nome do produto" : "Nome do serviço"}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="valor">
                  Valor{form.tipo === "servico" ? " (opcional)" : ""}
                </Label>
                <Input
                  id="valor"
                  className="rounded-[10px]"
                  inputMode="numeric"
                  value={valorDisplay}
                  onChange={(e) => setValorDisplay(maskCurrencyInputChange(e.target.value))}
                  placeholder="R$ 0,00"
                />
              </div>
              {form.tipo === "produto" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="estoque">Estoque</Label>
                  <Input
                    id="estoque"
                    className="rounded-[10px]"
                    inputMode="numeric"
                    value={String(form.qtdEstoque ?? 0)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/\D/g, ""));
                      setForm((f) => ({ ...f, qtdEstoque: Number.isFinite(n) ? n : 0 }));
                    }}
                    placeholder="0"
                  />
                </div>
              ) : null}
            </div>

            {form.tipo === "servico" ? (
              <div className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Agendável</Label>
                    <p className="text-xs text-muted-foreground">Aparece no módulo de Agendamento.</p>
                  </div>
                  <Switch
                    checked={form.agendavel ?? false}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, agendavel: v }))}
                  />
                </div>
                {form.agendavel ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="duracao">Duração padrão (min)</Label>
                      <Input
                        id="duracao"
                        className="rounded-[10px]"
                        inputMode="numeric"
                        value={String(form.duracaoMin ?? 30)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ""));
                          setForm((f) => ({ ...f, duracaoMin: Number.isFinite(n) && n > 0 ? n : 30 }));
                        }}
                        placeholder="30"
                      />
                    </div>
                    {editingId ? (
                      <div className="space-y-1.5">
                        <Label className="text-sm">Prestadores</Label>
                        <ServiceProvidersPanel
                          productId={editingId}
                          defaultDuration={form.duracaoMin ?? 30}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Salve o serviço para vincular os prestadores que o realizam.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}

            {fieldDefs.length > 0 ? (
              <div className="space-y-4 border-t border-border/60 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campos personalizados
                </p>
                {customFieldsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando…
                  </div>
                ) : (
                  fieldDefs.map((field) => (
                    <CustomerCustomFieldInput
                      key={field.id}
                      field={field}
                      value={customValues[field.id] ?? ""}
                      onChange={(value) =>
                        setCustomValues((current) => ({ ...current, [field.id]: value }))
                      }
                    />
                  ))
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-[10px]" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-[10px]"
              disabled={!canEditProdutos || createProduct.isPending || updateProduct.isPending}
              onClick={() => void saveProduct()}
            >
              {(createProduct.isPending || updateProduct.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(productToDelete) && canDeleteProdutos}
        onOpenChange={(open) => {
          if (!canDeleteProdutos) {
            setProductToDelete(null);
            return;
          }
          if (!open) {
            setProductToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {productToDelete
                ? `“${productToDelete.nome}” será removido do catálogo. Esta ação não pode ser desfeita.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[10px]" disabled={deleteProducts.isPending || !canDeleteProdutos}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[10px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProducts.isPending || !canDeleteProdutos}
              onClick={(e) => {
                e.preventDefault();
                if (!canDeleteProdutos) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para excluir produtos.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!productToDelete) {
                  return;
                }
                void (async () => {
                  try {
                    await deleteProducts.mutateAsync([productToDelete.id]);
                    if (linkProductId === productToDelete.id) {
                      setLinkProductId("");
                      setLinkCats([]);
                    }
                    if (editingId === productToDelete.id) {
                      setDialogOpen(false);
                      setEditingId(null);
                    }
                    toast({
                      title: "Produto excluído",
                      description: `${productToDelete.nome} foi removido.`,
                    });
                    setProductToDelete(null);
                  } catch (err) {
                    toast({
                      title: "Não foi possível excluir",
                      description: err instanceof Error ? err.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }}
            >
              {deleteProducts.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteOpen && canDeleteProdutos}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteOpen(false);
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedIds.size} {selectedIds.size > 1 ? "itens" : "item"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os itens selecionados serão removidos do catálogo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[10px]" disabled={deleteProducts.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[10px] bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProducts.isPending || !canDeleteProdutos}
              onClick={(e) => {
                e.preventDefault();
                if (!canDeleteProdutos || selectedIds.size === 0) {
                  return;
                }
                const ids = [...selectedIds];
                void (async () => {
                  try {
                    const count = await deleteProducts.mutateAsync(ids);
                    if (linkProductId && ids.includes(linkProductId)) {
                      setLinkProductId("");
                      setLinkCats([]);
                    }
                    if (editingId && ids.includes(editingId)) {
                      setDialogOpen(false);
                      setEditingId(null);
                    }
                    clearSelection();
                    setBulkDeleteOpen(false);
                    toast({
                      title: "Itens excluídos",
                      description: `${count} ${count === 1 ? "item removido" : "itens removidos"} do catálogo.`,
                    });
                  } catch (err) {
                    toast({
                      title: "Não foi possível excluir",
                      description: err instanceof Error ? err.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }}
            >
              {deleteProducts.isPending ? "Excluindo…" : "Excluir selecionados"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(categoryToDelete) && canDeleteProdutos}
        onOpenChange={(open) => {
          if (!canDeleteProdutos) {
            setCategoryToDelete(null);
            return;
          }
          if (!open) {
            setCategoryToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete?.nome} será removida e desvinculada dos produtos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[10px]" disabled={!canDeleteProdutos}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[10px]"
              disabled={!canDeleteProdutos}
              onClick={() => {
                if (!canDeleteProdutos) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para excluir categorias.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!categoryToDelete) return;
                deleteCategory.mutate(categoryToDelete.id, {
                  onSuccess: () => {
                    toast({ title: "Categoria removida" });
                    setCategoryToDelete(null);
                  },
                  onError: (e) =>
                    toast({ title: "Erro", description: e.message, variant: "destructive" }),
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(fieldToDelete) && canDeleteProdutos}
        onOpenChange={(open) => {
          if (!canDeleteProdutos) {
            setFieldToDelete(null);
            return;
          }
          if (!open) {
            setFieldToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
            <AlertDialogDescription>
              {fieldToDelete?.nome}: valores salvos nos produtos serão apagados em cascata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[10px]" disabled={!canDeleteProdutos}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-[10px]"
              disabled={!canDeleteProdutos}
              onClick={() => {
                if (!canDeleteProdutos) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para excluir campos.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!fieldToDelete) return;
                deleteField.mutate(fieldToDelete.id, {
                  onSuccess: () => {
                    toast({ title: "Campo removido" });
                    setFieldToDelete(null);
                  },
                  onError: (e) =>
                    toast({ title: "Erro", description: e.message, variant: "destructive" }),
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LoadLinkCats({ productId, onLoaded }: { productId: string; onLoaded: (ids: string[]) => void }) {
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!productId || !isSupabaseConfigured) {
        onLoaded([]);
        return;
      }
      try {
        const ids = await listCategoryIdsForProduct(productId);
        if (!cancelled) onLoaded(ids);
      } catch {
        if (!cancelled) onLoaded([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [productId, onLoaded]);

  return null;
}
