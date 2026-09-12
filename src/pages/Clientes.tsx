import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { downloadBlob } from "@/lib/format";
import {
  Search,
  Upload,
  UserPlus,
  X,
  Download,
  ListFilter,
  Briefcase,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users2,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import { CustomerCustomFieldsDialog } from "@/components/customers/CustomerCustomFieldsDialog";
import { CustomerLeadSheet } from "@/components/customers/CustomerLeadSheet";
import { CustomerImportDialog } from "@/components/customers/CustomerImportDialog";
import {
  listCrmNegotiationsByCustomerId,
  useCrmNegotiationCountsByCustomer,
} from "@/lib/api/crm-negotiations";
import { isPersistedCrmNegotiationId } from "@/lib/crm/negotiation-model";
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomers,
  useImportCustomers,
  usePaginatedCustomers,
  useUpdateCustomer,
} from "@/lib/api/customers";
import { useLinkWhatsappChatCustomer } from "@/lib/api/whatsapp";
import { useRoutes } from "@/lib/api/routes";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useAppStore } from "@/store/useAppStore";
import { buildCustomersCsv, buildMinimalCustomerImportTemplateCsv, parseCustomersSpreadsheet } from "@/lib/customers-csv";
import { normalizePhone } from "@/lib/phone";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Customer, CustomerUpsertInput } from "@/types/domain";
import { CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import { pageShellClasses } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [50, 100, 200, 600, 1000] as const;
type ClientesPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const REGIAO_LABELS: Record<string, string> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
  centro: "Centro",
  metropolitana: "Metropolitana",
  litoral: "Litoral",
  interior: "Interior",
  rural: "Rural",
  outros: "Outros",
};

/** Lista de contatos — paleta CaleoCRM (branco + roxo) */
const ui = {
  screen: cn(pageShellClasses.root, "space-y-4"),
  panel:
    "overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_1px_3px_hsl(var(--wchat-brand-600)/0.06)]",
  btnSecondary:
    "h-9 gap-2 rounded-[10px] border-0 bg-wchat-100 px-4 font-semibold text-primary shadow-none hover:bg-wchat-200",
  btnPrimary:
    "h-9 gap-2 rounded-[10px] border-0 bg-primary px-4 font-semibold text-primary-foreground shadow-none hover:bg-wchat-700",
  btnGhost: "h-9 rounded-[10px] text-muted-foreground hover:bg-muted",
  input:
    "rounded-[10px] border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary",
  selectTrigger: "h-9 rounded-[10px] border-input bg-card text-foreground",
  selectContent: "border-border bg-card",
  selectItem: "focus:bg-muted",
  popover: "border border-border bg-card p-0 shadow-lg",
  tableHead: "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
  tableRow: "border-border hover:bg-wchat-50",
  tableCellMuted: "text-muted-foreground",
  paginationBtn: "rounded-[10px] border border-border bg-card text-foreground hover:bg-muted",
} as const;

const TABLE_COLSPAN = 7;

function formatCustomerFonte(origem: Customer["origem"]): string {
  if (origem === "organico") {
    return "Orgânico";
  }
  if (origem === "pago") {
    return "Pago";
  }
  return "—";
}

/** Fallback quando o Supabase não está ativo ou a contagem ainda não carregou. */
function negociacoesCountHeuristic(customer: Customer): number {
  if (customer.totalGasto > 0) {
    return 1;
  }
  const stage = customer.sourceColumns?.[CRM_PIPELINE_STAGE_KEY]?.trim();
  if (stage && stage !== "lead") {
    return 1;
  }
  return 0;
}

function buildQuickLeadInput(phone: string, name?: string): CustomerUpsertInput {
  const normalizedPhone = normalizePhone(phone);

  return {
    codigo: "",
    origem: undefined,
    nome: (name ?? "").trim(),
    telefone: normalizedPhone.e164 ?? phone,
    celular: "",
    email: "",
    cnpj: "",
    endereco: "",
    perfil: "B",
    rota: "",
    status: "ativo",
    vendedor: "",
    ultimoPedido: new Date().toISOString().slice(0, 10),
    ticketMedio: 0,
    frequenciaCompra: "Quinzenal",
    totalGasto: 0,
    tipo: "pj",
    razaoSocial: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cpf: "",
    rg: "",
    nascimento: "",
    nomeSocial: "",
    fax: "",
    canal: "colagem_rapida",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    zone: "",
    complemento: "",
    cidade: "",
    estado: "",
    ativo: true,
    observacoes: "",
    cadastradoEm: new Date().toISOString().slice(0, 10),
    sourceColumns: { origem_importacao: "colagem_rapida" },
  };
}

function looksLikePhone(value: string) {
  return Boolean(normalizePhone(value).jid);
}

function hasNameLetters(value: string) {
  return /\p{L}{2,}/u.test(value);
}

function parseQuickLeadsText(raw: string): { rows: CustomerUpsertInput[]; errors: string[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: CustomerUpsertInput[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const chunks = line
      .split(/[;,\t|]/)
      .map((value) => value.trim())
      .filter(Boolean);

    let maybeName = "";
    let maybePhone = line;

    if (chunks.length >= 2) {
      // Identifica entre os chunks qual parece ser telefone e qual parece ser nome.
      // Regra: telefone = chunk com jid valido; nome = chunk com >=2 letras.
      const phoneChunk = chunks.find(looksLikePhone);
      const nameChunk = chunks.find((chunk) => chunk !== phoneChunk && hasNameLetters(chunk));

      if (phoneChunk) {
        maybePhone = phoneChunk;
        maybeName = nameChunk ?? "";
      } else {
        // fallback historico: pega o chunk com mais digitos
        const sorted = [...chunks].sort(
          (a, b) => b.replace(/\D/g, "").length - a.replace(/\D/g, "").length,
        );
        maybePhone = sorted[0] ?? line;
        maybeName = sorted[1] && hasNameLetters(sorted[1]) ? sorted[1] : "";
      }
    }

    const normalized = normalizePhone(maybePhone);
    if (!normalized.jid) {
      errors.push(`Linha ${lineNo}: telefone invalido (${maybePhone}).`);
      return;
    }
    if (seen.has(normalized.jid)) {
      errors.push(`Linha ${lineNo}: telefone duplicado na colagem (${maybePhone}).`);
      return;
    }

    seen.add(normalized.jid);
    rows.push(buildQuickLeadInput(normalized.e164 ?? maybePhone, maybeName));
  });

  return { rows, errors };
}

export default function Clientes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const [search, setSearch] = useState("");
  const [filterPerfil, setFilterPerfil] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterRota, setFilterRota] = useState("todos");
  const [filterRegiao, setFilterRegiao] = useState<"todos" | "norte" | "sul" | "leste" | "oeste" | "centro" | "metropolitana" | "litoral" | "interior" | "rural" | "outros">("todos");
  const [filterBairro, setFilterBairro] = useState("");
  const [filterZona, setFilterZona] = useState("");
  const [filterCidade, setFilterCidade] = useState("");
  const [filterAtivoComercial, setFilterAtivoComercial] = useState<"todos" | "sim" | "nao">("todos");
  const [filterObservacoes, setFilterObservacoes] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ClientesPageSize>(50);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newCustomerPrefill, setNewCustomerPrefill] = useState<Partial<CustomerUpsertInput> | null>(null);
  const [pendingInboxChatId, setPendingInboxChatId] = useState<string | null>(null);
  const [returnToInboxAfterCreate, setReturnToInboxAfterCreate] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<CustomerUpsertInput[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [quickPasteOpen, setQuickPasteOpen] = useState(false);
  const [quickPasteText, setQuickPasteText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [sheetCustomer, setSheetCustomer] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canEditClientes = can("clientes", "edit");
  const canDeleteClientes = can("clientes", "delete");
  const canViewCrm = can("crm", "view");
  const debouncedSearch = useDebouncedValue(search, 300);
  const searchPending = search.trim() !== debouncedSearch.trim();

  async function openCustomerNegotiation(customer: Customer) {
    if (!canViewCrm) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel não tem permissão para abrir negociações no CRM.",
        variant: "destructive",
      });
      return;
    }
    if (!isSupabaseConfigured) {
      toast({
        title: "CRM indisponível",
        description: "Configure o Supabase para vincular negociações aos contatos.",
        variant: "destructive",
      });
      return;
    }
    try {
      const negotiations = await listCrmNegotiationsByCustomerId(customer.id);
      const target = negotiations.find((n) => isPersistedCrmNegotiationId(n.id));
      if (!target) {
        navigate(`/clientes/${encodeURIComponent(customer.id)}`);
        return;
      }
      navigate(`/crm/negociacao/${encodeURIComponent(target.id)}`);
    } catch (err) {
      toast({
        title: "Não foi possível abrir a negociação",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const filters = useMemo(
    () => ({
      search: debouncedSearch,
      perfil: filterPerfil,
      status: filterStatus,
      rota: filterRota,
      regiao: filterRegiao,
      ...(filterBairro.trim() ? { bairro: filterBairro.trim() } : {}),
      ...(filterZona.trim() ? { zone: filterZona.trim() } : {}),
      ...(filterCidade.trim() ? { cidade: filterCidade.trim() } : {}),
      ...(filterAtivoComercial !== "todos" ? { ativoComercial: filterAtivoComercial } : {}),
      ...(filterObservacoes.trim() ? { observacoesContem: filterObservacoes.trim() } : {}),
      ...(filterTag.trim() ? { tag: filterTag.trim() } : {}),
      /** Escopo da lista no cache (RLS no Supabase filtra atendente: pool + próprios). */
      listScopeRole: profile?.role,
      listScopeUserId: profile?.role === "atendimento" ? profile?.id : undefined,
    }),
    [
      filterAtivoComercial,
      filterBairro,
      filterCidade,
      filterObservacoes,
      filterPerfil,
      filterRegiao,
      filterRota,
      filterStatus,
      filterTag,
      filterZona,
      profile?.id,
      profile?.role,
      debouncedSearch,
    ],
  );

  const { data: routesFromApi = [] } = useRoutes();

  const {
    data: paginatedResponse,
    isLoading,
    isFetching,
    error,
  } = usePaginatedCustomers(filters, page, pageSize);

  const filtered = paginatedResponse?.data ?? [];
  const totalCount = paginatedResponse?.count ?? 0;
  const { data: negCountsByCustomer, isSuccess: negCountsReady } = useCrmNegotiationCountsByCustomer({
    enabled: isSupabaseConfigured,
  });
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomers = useDeleteCustomers();
  const linkInboxChat = useLinkWhatsappChatCustomer();
  const importCustomers = useImportCustomers();

  const rotas = useMemo(
    () =>
      [...new Set(routesFromApi.map((route) => route.nome.trim()).filter((nome) => nome.length > 0))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [routesFromApi],
  );
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginated = filtered;
  const pageRangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageRangeEnd = totalCount === 0 ? 0 : Math.min(page * pageSize, totalCount);
  const selectedCustomers = useMemo(
    () => paginated.filter((customer) => selectedIds.has(customer.id)),
    [paginated, selectedIds],
  );
  const allPageSelected =
    paginated.length > 0 && paginated.every((customer) => selectedIds.has(customer.id));
  const somePageSelected = paginated.some((customer) => selectedIds.has(customer.id));
  const pageItems = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: Array<number | "ellipsis-left" | "ellipsis-right"> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) {
      items.push("ellipsis-left");
    }

    for (let current = start; current <= end; current += 1) {
      items.push(current);
    }

    if (end < totalPages - 1) {
      items.push("ellipsis-right");
    }

    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (searchParams.get("novo") !== "1") {
      return;
    }

    const telefone = searchParams.get("telefone")?.trim() ?? "";
    const nome = searchParams.get("nome")?.trim() ?? "";
    const inboxChatId = searchParams.get("inboxChatId")?.trim() ?? "";
    const returnTo = searchParams.get("returnTo")?.trim() ?? "";
    const prefill: Partial<CustomerUpsertInput> = {
      ...(telefone ? { telefone } : {}),
      ...(nome ? { nome } : {}),
    };

    setNewCustomerPrefill(Object.keys(prefill).length > 0 ? prefill : null);
    setPendingInboxChatId(inboxChatId || null);
    setReturnToInboxAfterCreate(returnTo === "inbox");
    setDialogOpen(true);

    const next = new URLSearchParams(searchParams);
    next.delete("novo");
    next.delete("telefone");
    next.delete("nome");
    next.delete("inboxChatId");
    next.delete("returnTo");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearAdvancedFilters = () => {
    setFilterPerfil("todos");
    setFilterStatus("todos");
    setFilterRota("todos");
    setFilterRegiao("todos");
    setFilterBairro("");
    setFilterZona("");
    setFilterCidade("");
    setFilterAtivoComercial("todos");
    setFilterObservacoes("");
    setFilterTag("");
    setPage(1);
  };

  function clearAllListFilters() {
    setSearch("");
    clearAdvancedFilters();
  }

  function removeActiveFilterChip(chipId: string) {
    setPage(1);
    switch (chipId) {
      case "search":
        setSearch("");
        break;
      case "perfil":
        setFilterPerfil("todos");
        break;
      case "status":
        setFilterStatus("todos");
        break;
      case "rota":
        setFilterRota("todos");
        break;
      case "regiao":
        setFilterRegiao("todos");
        break;
      case "bairro":
        setFilterBairro("");
        break;
      case "zona":
        setFilterZona("");
        break;
      case "cidade":
        setFilterCidade("");
        break;
      case "ativoComercial":
        setFilterAtivoComercial("todos");
        break;
      case "observacoes":
        setFilterObservacoes("");
        break;
      case "tag":
        setFilterTag("");
        break;
      default:
        break;
    }
  }

  const hasAdvancedFilters =
    filterPerfil !== "todos" ||
    filterStatus !== "todos" ||
    filterRota !== "todos" ||
    filterRegiao !== "todos" ||
    filterBairro.trim() !== "" ||
    filterZona.trim() !== "" ||
    filterCidade.trim() !== "" ||
    filterAtivoComercial !== "todos" ||
    filterObservacoes.trim() !== "" ||
    filterTag.trim() !== "";

  const advancedFiltersActiveCount = useMemo(() => {
    let n = 0;
    if (filterPerfil !== "todos") n += 1;
    if (filterStatus !== "todos") n += 1;
    if (filterRota !== "todos") n += 1;
    if (filterRegiao !== "todos") n += 1;
    if (filterBairro.trim() !== "") n += 1;
    if (filterZona.trim() !== "") n += 1;
    if (filterCidade.trim() !== "") n += 1;
    if (filterAtivoComercial !== "todos") n += 1;
    if (filterObservacoes.trim() !== "") n += 1;
    if (filterTag.trim() !== "") n += 1;
    return n;
  }, [
    filterAtivoComercial,
    filterBairro,
    filterCidade,
    filterObservacoes,
    filterPerfil,
    filterRegiao,
    filterRota,
    filterStatus,
    filterTag,
    filterZona,
  ]);

  const hasAnyListFilters = Boolean(search.trim()) || hasAdvancedFilters;

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string }> = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      chips.push({ id: "search", label: `Busca: ${trimmedSearch}` });
    }
    if (filterPerfil !== "todos") {
      chips.push({ id: "perfil", label: `Perfil ${filterPerfil}` });
    }
    if (filterStatus !== "todos") {
      const statusLabel =
        filterStatus === "ativo" ? "Ativo" : filterStatus === "inativo" ? "Inativo" : "Bloqueado";
      chips.push({ id: "status", label: statusLabel });
    }
    if (filterRota !== "todos") {
      chips.push({ id: "rota", label: `Rota: ${filterRota}` });
    }
    if (filterRegiao !== "todos") {
      chips.push({ id: "regiao", label: REGIAO_LABELS[filterRegiao] ?? filterRegiao });
    }
    if (filterBairro.trim()) {
      chips.push({ id: "bairro", label: `Bairro: ${filterBairro.trim()}` });
    }
    if (filterZona.trim()) {
      chips.push({ id: "zona", label: `Zona: ${filterZona.trim()}` });
    }
    if (filterCidade.trim()) {
      chips.push({ id: "cidade", label: `Cidade: ${filterCidade.trim()}` });
    }
    if (filterAtivoComercial !== "todos") {
      chips.push({
        id: "ativoComercial",
        label: filterAtivoComercial === "sim" ? "Comercial: sim" : "Comercial: não",
      });
    }
    if (filterObservacoes.trim()) {
      chips.push({ id: "observacoes", label: `Obs: ${filterObservacoes.trim()}` });
    }
    if (filterTag.trim()) {
      chips.push({ id: "tag", label: `Tag: ${filterTag.trim()}` });
    }
    return chips;
  }, [
    filterAtivoComercial,
    filterBairro,
    filterCidade,
    filterObservacoes,
    filterPerfil,
    filterRegiao,
    filterRota,
    filterStatus,
    filterTag,
    filterZona,
    search,
  ]);

  const resultsSummary = useMemo(() => {
    if (isLoading && filtered.length === 0) {
      return "Carregando contatos…";
    }
    const countLabel = `${totalCount.toLocaleString("pt-BR")} contato${totalCount === 1 ? "" : "s"}`;
    if (hasAnyListFilters) {
      return `${countLabel} com filtros aplicados`;
    }
    return countLabel;
  }, [filtered.length, totalCount, hasAnyListFilters, isLoading]);

  const exportCustomers = (customers: Customer[], fileLabel: string) => {
    if (!customers.length) {
      toast({
        title: "Nada para exportar",
        description: "Selecione ou filtre clientes antes de exportar.",
      });
      useAppStore.getState().addNotification({
        tipo: "aviso",
        titulo: "Nada para exportar",
        descricao: "Selecione ou filtre clientes antes de exportar.",
      });
      return;
    }

    const csvContent = buildCustomersCsv(customers);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadBlob(`${fileLabel}.csv`, blob);
  };

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function openCustomerProfile(customerId: string) {
    navigate(`/clientes/${encodeURIComponent(customerId)}`);
  }

  function downloadMinimalImportTemplate() {
    const csv = buildMinimalCustomerImportTemplateCsv();
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    downloadBlob("modelo-leads-telefone.csv", blob);
  }

  function openQuickPastePreview() {
    const { rows, errors } = parseQuickLeadsText(quickPasteText);
    if (rows.length === 0) {
      toast({
        title: "Nenhum lead valido",
        description: "Cole ao menos um telefone valido para continuar.",
        variant: "destructive",
      });
      useAppStore.getState().addNotification({
        tipo: "aviso",
        titulo: "Nenhum lead valido na colagem",
        descricao: "Cole ao menos um telefone valido para continuar.",
      });
      return;
    }

    setImportRows(rows);
    setImportErrors(errors);
    setImportFileName("colagem-rapida");
    setQuickPasteOpen(false);
    setImportDialogOpen(true);
  }

  return (
    <div className={ui.screen}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }

          const parsedCsv = await parseCustomersSpreadsheet(file);

          setImportRows(parsedCsv.rows);
          setImportErrors(parsedCsv.errors);
          setImportFileName(file.name);
          setImportDialogOpen(true);
          event.target.value = "";
        }}
      />

      <div className={cn(pageShellClasses.content, "flex flex-col gap-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(var(--wchat-brand-700))] text-primary-foreground shadow-[0_6px_16px_-8px_hsl(262_60%_40%/0.7)]">
              <Users2 className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-0.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Contatos</h1>
              <p className="text-sm text-muted-foreground">{resultsSummary}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className={ui.btnSecondary}
              disabled={!canEditClientes}
              title={!canEditClientes ? "Seu papel nao tem permissao para importar contatos." : undefined}
              onClick={() => {
                if (!canEditClientes) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para importar contatos.",
                    variant: "destructive",
                  });
                  return;
                }
                fileInputRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4 shrink-0" />
              Importar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={ui.btnPrimary}
              disabled={!canEditClientes}
              title={!canEditClientes ? "Seu papel nao tem permissao para cadastrar clientes." : undefined}
              onClick={() => {
                if (!canEditClientes) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para cadastrar clientes.",
                    variant: "destructive",
                  });
                  return;
                }
                setSheetCustomer(null);
                setNewCustomerPrefill(null);
                setPendingInboxChatId(null);
                setReturnToInboxAfterCreate(false);
                setDialogOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              Cadastrar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className={`${ui.btnGhost} h-9 w-9 shrink-0`} aria-label="Mais ações">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  disabled={!canEditClientes}
                  onClick={() => {
                    if (!canEditClientes) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel nao tem permissao para colar contatos.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setQuickPasteOpen((c) => !c);
                  }}
                >
                  Colar contatos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadMinimalImportTemplate()}>Baixar modelo (telefone)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => exportCustomers(filtered, "clientes-export")}>Exportar CSV</DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEditClientes}
                  onClick={() => {
                    if (!canEditClientes) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel nao tem permissao para editar campos personalizados.",
                        variant: "destructive",
                      });
                      return;
                    }
                    setCustomFieldsOpen(true);
                  }}
                >
                  Campos personalizados
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[min(100%,20rem)] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, e-mail..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              className={`h-10 pl-9 pr-9 ${ui.input}`}
              aria-busy={searchPending || isFetching}
            />
            {searchPending || (isFetching && !isLoading) ? (
              <Loader2
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
          <Popover modal={false}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" className={ui.btnSecondary}>
                <ListFilter className="h-4 w-4 shrink-0" />
                Filtros{advancedFiltersActiveCount > 0 ? ` (${advancedFiltersActiveCount})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className={`w-[min(calc(100vw-2rem),32rem)] p-4 ${ui.popover}`}>
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-border pb-3">
                <p className="text-sm font-semibold text-foreground">Filtros</p>
                {hasAdvancedFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-muted-foreground"
                    onClick={clearAdvancedFilters}
                  >
                    <X className="h-3.5 w-3.5" /> Limpar
                  </Button>
                ) : null}
              </div>
              <div className="grid max-h-[min(70vh,28rem)] gap-3 overflow-y-auto overscroll-y-contain pt-3 sm:grid-cols-2">
                <Select value={filterPerfil} onValueChange={(value) => { setFilterPerfil(value); setPage(1); }}>
                  <SelectTrigger className={`w-full ${ui.selectTrigger}`}>
                    <SelectValue placeholder="Perfil" />
                  </SelectTrigger>
                  <SelectContent className={ui.selectContent}>
                    <SelectItem value="todos" className={ui.selectItem}>
                      Todos perfis
                    </SelectItem>
                    <SelectItem value="A" className={ui.selectItem}>
                      Perfil A
                    </SelectItem>
                    <SelectItem value="B" className={ui.selectItem}>
                      Perfil B
                    </SelectItem>
                    <SelectItem value="C" className={ui.selectItem}>
                      Perfil C
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value); setPage(1); }}>
                  <SelectTrigger className={`w-full ${ui.selectTrigger}`}>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className={ui.selectContent}>
                    <SelectItem value="todos" className={ui.selectItem}>
                      Todos status
                    </SelectItem>
                    <SelectItem value="ativo" className={ui.selectItem}>
                      Ativo
                    </SelectItem>
                    <SelectItem value="inativo" className={ui.selectItem}>
                      Inativo
                    </SelectItem>
                    <SelectItem value="bloqueado" className={ui.selectItem}>
                      Bloqueado
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterRota} onValueChange={(value) => { setFilterRota(value); setPage(1); }}>
                  <SelectTrigger className={`w-full ${ui.selectTrigger}`}>
                    <SelectValue placeholder="Rota" />
                  </SelectTrigger>
                  <SelectContent className={ui.selectContent}>
                    <SelectItem value="todos" className={ui.selectItem}>
                      Todas rotas
                    </SelectItem>
                    {rotas.map((rota) => (
                      <SelectItem key={rota} value={rota} className={ui.selectItem}>
                        {rota}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={filterRegiao}
                  onValueChange={(value) => {
                    setFilterRegiao(
                      value as
                        | "todos"
                        | "norte"
                        | "sul"
                        | "leste"
                        | "oeste"
                        | "centro"
                        | "metropolitana"
                        | "litoral"
                        | "interior"
                        | "rural"
                        | "outros",
                    );
                    setPage(1);
                  }}
                >
                  <SelectTrigger className={`w-full ${ui.selectTrigger}`}>
                    <SelectValue placeholder="Região" />
                  </SelectTrigger>
                  <SelectContent className={ui.selectContent}>
                    <SelectItem value="todos" className={ui.selectItem}>
                      Todas regiões
                    </SelectItem>
                    <SelectItem value="norte" className={ui.selectItem}>
                      Norte
                    </SelectItem>
                    <SelectItem value="sul" className={ui.selectItem}>
                      Sul
                    </SelectItem>
                    <SelectItem value="leste" className={ui.selectItem}>
                      Leste
                    </SelectItem>
                    <SelectItem value="oeste" className={ui.selectItem}>
                      Oeste
                    </SelectItem>
                    <SelectItem value="centro" className={ui.selectItem}>
                      Centro
                    </SelectItem>
                    <SelectItem value="metropolitana" className={ui.selectItem}>
                      Metropolitana
                    </SelectItem>
                    <SelectItem value="litoral" className={ui.selectItem}>
                      Litoral
                    </SelectItem>
                    <SelectItem value="interior" className={ui.selectItem}>
                      Interior
                    </SelectItem>
                    <SelectItem value="rural" className={ui.selectItem}>
                      Rural
                    </SelectItem>
                    <SelectItem value="outros" className={ui.selectItem}>
                      Outros
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Bairro..."
                  value={filterBairro}
                  onChange={(event) => {
                    setFilterBairro(event.target.value);
                    setPage(1);
                  }}
                  className={`w-full ${ui.input}`}
                />
                <Input
                  placeholder="Zona..."
                  value={filterZona}
                  onChange={(event) => {
                    setFilterZona(event.target.value);
                    setPage(1);
                  }}
                  className={`w-full ${ui.input}`}
                />
                <Select
                  value={filterAtivoComercial}
                  onValueChange={(v) => {
                    setFilterAtivoComercial(v as "todos" | "sim" | "nao");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className={`w-full ${ui.selectTrigger}`}>
                    <SelectValue placeholder="Ativo comercial" />
                  </SelectTrigger>
                  <SelectContent className={ui.selectContent}>
                    <SelectItem value="todos" className={ui.selectItem}>
                      Comercial: todos
                    </SelectItem>
                    <SelectItem value="sim" className={ui.selectItem}>
                      Comercial: sim
                    </SelectItem>
                    <SelectItem value="nao" className={ui.selectItem}>
                      Comercial: não
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Cidade..."
                  value={filterCidade}
                  onChange={(event) => {
                    setFilterCidade(event.target.value);
                    setPage(1);
                  }}
                  className={`w-full ${ui.input}`}
                />
                <Input
                  placeholder="Observações..."
                  value={filterObservacoes}
                  onChange={(event) => {
                    setFilterObservacoes(event.target.value);
                    setPage(1);
                  }}
                  className={`w-full sm:col-span-2 ${ui.input}`}
                  title="Filtra por texto nas observações (notas internas)"
                />
                <Input
                  placeholder="Tag..."
                  value={filterTag}
                  onChange={(event) => {
                    setFilterTag(event.target.value);
                    setPage(1);
                  }}
                  className={`w-full sm:col-span-2 ${ui.input}`}
                  title="Filtra tags em observações e source_columns"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => removeActiveFilterChip(chip.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-wchat-50 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-wchat-100"
                title={`Remover filtro: ${chip.label}`}
              >
                <span className="truncate">{chip.label}</span>
                <X className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllListFilters}
              className="px-2 py-1 text-[11px] font-semibold text-primary hover:underline"
            >
              Limpar tudo
            </button>
          </div>
        ) : null}

        {quickPasteOpen ? (
          <div className={`${ui.panel} p-4 md:p-5`}>
            <p className="mb-2 text-sm font-semibold text-foreground">Colagem rápida de leads</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Um contato por linha. Telefone só ou &quot;nome;telefone&quot;, &quot;nome,telefone&quot;.
            </p>
            <textarea
              value={quickPasteText}
              onChange={(event) => setQuickPasteText(event.target.value)}
              placeholder={"+5511999998888\nMaria Silva;+5511988887777"}
              className="min-h-[120px] w-full rounded-[10px] border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className={ui.btnPrimary} onClick={openQuickPastePreview}>
                Validar e importar
              </Button>
              <Button type="button" size="sm" variant="ghost" className={ui.btnGhost} onClick={() => setQuickPasteText("")}>
                Limpar
              </Button>
            </div>
          </div>
        ) : null}

        <div className={ui.panel}>
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary/5 px-4 py-3">
              <span className="text-sm font-medium text-primary">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
              </span>
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-[8px]"
                onClick={clearSelection}
              >
                Limpar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-2 rounded-[8px]"
                onClick={() => exportCustomers(selectedCustomers, "clientes-selecionados")}
              >
                <Download className="h-3.5 w-3.5" />
                Exportar
              </Button>
              {canDeleteClientes ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 rounded-[8px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              ) : null}
            </div>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent [&>th]:border-0">
                <TableHead className={`w-10 ${ui.tableHead}`}>
                  <Checkbox
                    aria-label="Selecionar todos nesta página"
                    checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (checked === true) {
                          paginated.forEach((c) => next.add(c.id));
                        } else {
                          paginated.forEach((c) => next.delete(c.id));
                        }
                        return next;
                      });
                    }}
                    className="border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                  />
                </TableHead>
                <TableHead className={`${ui.tableHead} cursor-default select-none`}>Nome</TableHead>
                <TableHead className={`${ui.tableHead} cursor-default select-none`}>Telefone</TableHead>
                <TableHead className={`hidden sm:table-cell ${ui.tableHead} cursor-default select-none`}>
                  E-mail
                </TableHead>
                <TableHead className={`hidden sm:table-cell ${ui.tableHead} cursor-default select-none`}>
                  Fonte
                </TableHead>
                <TableHead className={`text-right ${ui.tableHead} cursor-default select-none`}>
                  Negociações
                </TableHead>
                <TableHead className={`w-14 text-right ${ui.tableHead} cursor-default select-none`}>
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow className={`${ui.tableRow} hover:bg-transparent`}>
                  <TableCell colSpan={TABLE_COLSPAN} className="h-32 text-center text-muted-foreground">
                    Carregando contatos...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow className={`${ui.tableRow} hover:bg-transparent`}>
                  <TableCell colSpan={TABLE_COLSPAN} className="h-32 text-center text-red-600">
                    {error.message}
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow className={`${ui.tableRow} hover:bg-transparent`}>
                  <TableCell colSpan={TABLE_COLSPAN} className="h-40 text-center">
                    <p className="text-muted-foreground">Nenhum contato encontrado.</p>
                    {hasAnyListFilters ? (
                      <Button
                        type="button"
                        variant="link"
                        className="mt-2 h-auto p-0 text-primary"
                        onClick={clearAllListFilters}
                      >
                        Limpar filtros
                      </Button>
                    ) : canEditClientes ? (
                      <Button
                        type="button"
                        variant="link"
                        className="mt-2 h-auto p-0 text-primary"
                        onClick={() => {
                          setSheetCustomer(null);
                          setNewCustomerPrefill(null);
                          setDialogOpen(true);
                        }}
                      >
                        Cadastrar primeiro contato
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((customer) => {
                  const nNeg =
                    isSupabaseConfigured && negCountsReady
                      ? (negCountsByCustomer?.get(customer.id) ?? 0)
                      : negociacoesCountHeuristic(customer);
                  const showOpenNegotiation =
                    canViewCrm && isSupabaseConfigured && negCountsReady && nNeg > 0;
                  return (
                    <TableRow
                      key={customer.id}
                      className={cn(ui.tableRow, "cursor-pointer")}
                      onClick={() => openCustomerProfile(customer.id)}
                    >
                      <TableCell className="w-10 align-middle" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Selecionar ${customer.nome}`}
                          checked={selectedIds.has(customer.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (checked === true) {
                                next.add(customer.id);
                              } else {
                                next.delete(customer.id);
                              }
                              return next;
                            });
                          }}
                          className="border-input data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        />
                      </TableCell>
                      <TableCell className="max-w-[200px] py-4 font-medium md:max-w-[320px]">
                        {customer.nome?.trim() || "Sem nome"}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap py-4 text-[13px] ${ui.tableCellMuted}`}
                        title={customer.telefone ?? ""}
                      >
                        {customer.telefone?.trim() || "—"}
                      </TableCell>
                      <TableCell
                        className={`hidden max-w-[220px] truncate py-4 text-[13px] sm:table-cell ${ui.tableCellMuted}`}
                        title={customer.email ?? ""}
                      >
                        {customer.email?.trim() ? customer.email : "—"}
                      </TableCell>
                      <TableCell
                        className={`hidden whitespace-nowrap py-4 text-[13px] sm:table-cell ${ui.tableCellMuted}`}
                      >
                        {formatCustomerFonte(customer.origem)}
                      </TableCell>
                      <TableCell className={`py-4 text-right text-[13px] tabular-nums ${ui.tableCellMuted}`}>
                        {nNeg}
                      </TableCell>
                      <TableCell className="py-4 text-right" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
                              aria-label={`Ações para ${customer.nome}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => openCustomerProfile(customer.id)}>
                              Ver perfil
                            </DropdownMenuItem>
                            {showOpenNegotiation ? (
                              <>
                                <DropdownMenuItem onClick={() => void openCustomerNegotiation(customer)}>
                                  <Briefcase className="mr-2 h-4 w-4" />
                                  Abrir negociação
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            ) : null}
                            <DropdownMenuItem
                              disabled={!canEditClientes}
                              onClick={() => {
                                if (!canEditClientes) {
                                  toast({
                                    title: "Ação indisponível",
                                    description: "Seu papel nao tem permissao para editar este contato.",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setSheetCustomer(customer);
                                setNewCustomerPrefill(null);
                                setPendingInboxChatId(null);
                                setReturnToInboxAfterCreate(false);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={!canDeleteClientes}
                              onClick={() => setDeleteTarget(customer)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {totalCount > 0 ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm text-muted-foreground">
                Mostrando {pageRangeStart.toLocaleString("pt-BR")}–{pageRangeEnd.toLocaleString("pt-BR")} de{" "}
                {totalCount.toLocaleString("pt-BR")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Linhas por página</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as ClientesPageSize);
                  setPage(1);
                }}
              >
                <SelectTrigger className={`h-9 w-[100px] ${ui.selectTrigger}`} aria-label="Quantidade de linhas por página">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={ui.selectContent}>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className={ui.selectItem}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>
            </div>
            {totalPages > 1 ? (
              <Pagination className="mx-auto w-full sm:mx-0 sm:w-auto">
                <PaginationContent className="flex-wrap justify-center gap-2">
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className={`${ui.paginationBtn} ${page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                    />
                  </PaginationItem>
                  {pageItems.map((paginationItem, index) => (
                    <PaginationItem key={`${paginationItem}-${index}`}>
                      {typeof paginationItem === "number" ? (
                        <PaginationLink
                          isActive={paginationItem === page}
                          onClick={() => setPage(paginationItem)}
                          className={`cursor-pointer rounded-[10px] ${
                            paginationItem === page
                              ? "border-primary bg-wchat-100 font-semibold text-primary"
                              : ui.paginationBtn
                          }`}
                        >
                          {paginationItem}
                        </PaginationLink>
                      ) : (
                        <PaginationEllipsis className="text-muted-foreground" />
                      )}
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                      className={`${ui.paginationBtn} ${page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </div>
        ) : null}
      </div>

      <CustomerCustomFieldsDialog
        open={customFieldsOpen && canEditClientes}
        onOpenChange={(open) => {
          if (!canEditClientes) {
            setCustomFieldsOpen(false);
            return;
          }
          setCustomFieldsOpen(open);
        }}
      />

      <AlertDialog
        open={Boolean(deleteTarget) && canDeleteClientes}
        onOpenChange={(open) => {
          if (!canDeleteClientes) {
            setDeleteTarget(null);
            return;
          }
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.nome}” será removido da base. Esta ação não pode ser desfeita.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCustomers.isPending || !canDeleteClientes}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCustomers.isPending || !canDeleteClientes}
              onClick={(e) => {
                e.preventDefault();
                if (!canDeleteClientes) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel nao tem permissao para excluir contatos.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!deleteTarget) {
                  return;
                }
                void (async () => {
                  try {
                    await deleteCustomers.mutateAsync([deleteTarget.id]);
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(deleteTarget.id);
                      return next;
                    });
                    toast({
                      title: "Contato excluído",
                      description: `${deleteTarget.nome} foi removido.`,
                    });
                    setDeleteTarget(null);
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
              {deleteCustomers.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteOpen && canDeleteClientes}
        onOpenChange={(open) => {
          if (!open) {
            setBulkDeleteOpen(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-[12px]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {selectedIds.size} contato{selectedIds.size > 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os contatos selecionados serão removidos da base. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCustomers.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCustomers.isPending || !canDeleteClientes || selectedIds.size === 0}
              onClick={(e) => {
                e.preventDefault();
                if (!canDeleteClientes || selectedIds.size === 0) {
                  return;
                }
                const ids = [...selectedIds];
                void (async () => {
                  try {
                    await deleteCustomers.mutateAsync(ids);
                    toast({
                      title: "Contatos excluídos",
                      description: `${ids.length} contato(s) removido(s).`,
                    });
                    clearSelection();
                    setBulkDeleteOpen(false);
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
              {deleteCustomers.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerLeadSheet
        open={dialogOpen && canEditClientes}
        customer={sheetCustomer}
        onOpenChange={(open) => {
          if (!canEditClientes) {
            setDialogOpen(false);
            return;
          }
          setDialogOpen(open);
          if (!open) {
            setSheetCustomer(null);
            setNewCustomerPrefill(null);
            setPendingInboxChatId(null);
            setReturnToInboxAfterCreate(false);
          }
        }}
        initialOverrides={newCustomerPrefill ?? undefined}
        loading={createCustomer.isPending || updateCustomer.isPending || linkInboxChat.isPending}
        onSubmit={async (input) => {
          if (sheetCustomer) {
            await updateCustomer.mutateAsync({ id: sheetCustomer.id, input });
            toast({
              title: "Contato atualizado",
              description: `${input.nome} foi salvo.`,
            });
            return sheetCustomer.id;
          }

          const goBackToInbox = returnToInboxAfterCreate;
          const inboxChatIdForReturn = pendingInboxChatId;
          const created = await createCustomer.mutateAsync(input);
          toast({
            title: "Cliente criado",
            description: `${input.nome} foi adicionado à base.`,
          });
          useAppStore.getState().addNotification({
            tipo: "sucesso",
            titulo: "Cliente criado",
            descricao: `${input.nome} foi adicionado à base.`,
          });

          if (pendingInboxChatId) {
            try {
              await linkInboxChat.mutateAsync({ chatId: pendingInboxChatId, customerId: created.id });
              toast({
                title: "Conversa vinculada",
                description: "O chat do WhatsApp foi associado ao novo cliente.",
              });
            } catch (e) {
              toast({
                title: "Cliente criado — vínculo pendente",
                description:
                  e instanceof Error
                    ? e.message
                    : "Não foi possível vincular a conversa. Faça o vínculo manualmente na inbox.",
                variant: "destructive",
              });
            }
          }

          setNewCustomerPrefill(null);
          setPendingInboxChatId(null);
          setReturnToInboxAfterCreate(false);
          if (goBackToInbox) {
            if (inboxChatIdForReturn) {
              const q = new URLSearchParams({
                chatId: inboxChatIdForReturn,
                profile: "1",
              });
              navigate(`/inbox?${q.toString()}`);
            } else {
              navigate("/inbox");
            }
          }

          return created.id;
        }}
      />

      <CustomerImportDialog
        open={importDialogOpen && canEditClientes}
        onOpenChange={(open) => {
          if (!canEditClientes) {
            setImportDialogOpen(false);
            return;
          }
          setImportDialogOpen(open);
        }}
        rows={importRows}
        errors={importErrors}
        fileName={importFileName}
        loading={importCustomers.isPending}
        onConfirm={async () => {
          await importCustomers.mutateAsync(importRows);
          const importedDesc = `${importRows.length} cliente(s) importado(s) com sucesso.`;
          toast({
            title: "Importação concluída",
            description: importedDesc,
          });
          useAppStore.getState().addNotification({
            tipo: "sucesso",
            titulo: "Importação concluída",
            descricao: importedDesc,
          });
          setImportDialogOpen(false);
          setImportRows([]);
          setImportErrors([]);
          setImportFileName(null);
        }}
      />
    </div>
  );
}
