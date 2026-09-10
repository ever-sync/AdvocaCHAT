import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Download,
  FileUp,
  Filter,
  Gauge,
  Loader2,
  MoreVertical,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateMarketingFlow,
  useDeleteMarketingFlow,
  useDuplicateMarketingFlow,
  useMarketingFlows,
  useUpdateMarketingFlow,
  type MarketingFlowRecord,
  type MarketingFlowStatus,
} from "@/lib/api/marketing-flows";
import {
  MARKETING_FLOW_STATUSES,
  isMarketingFlowStatus,
} from "@/lib/marketing/flow-types";
import { statsFor, useMarketingFlowStats } from "@/lib/api/marketing-flow-stats";
import { ChannelLimitsDialog } from "@/components/marketing/ChannelLimitsDialog";
import { ACTION_ICONS } from "@/components/marketing/flow-actions";
import {
  MARKETING_TRIGGER_DEFINITIONS,
  MARKETING_TRIGGER_CATEGORY_LABEL,
} from "@/lib/marketing/flow-triggers";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SortField = "createdAt" | "updatedAt";
type SortDirection = "asc" | "desc";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR");
}

const STATUS_BADGE_CLASS: Record<MarketingFlowStatus, string> = {
  ativo: "bg-emerald-500 text-white hover:bg-emerald-500",
  pausado: "bg-amber-500 text-white hover:bg-amber-500",
  rascunho: "bg-muted text-muted-foreground hover:bg-muted",
  arquivado: "bg-slate-500/80 text-white hover:bg-slate-500/80",
};

type FlowTemplateStep = {
  actionId: string;
  label: string;
  iconKey: string;
  iconClass: string;
  subtitle?: string;
  subtitleVariant?: "plain" | "primary" | "chip" | "multiline";
  /** Config estruturada pré-preenchida (mesmo shape de MarketingFlowStep.config). */
  config?: Record<string, unknown>;
};

type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Gatilho de entrada sugerido (preenche o fluxo ao usar o modelo). */
  trigger?: string;
  steps: FlowTemplateStep[];
};

/** Prévia visual dos passos de um modelo: bolinhas com o ícone de cada ação. */
function TemplateStepsPreview({ steps }: { steps: FlowTemplateStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => {
        const Icon = ACTION_ICONS[step.iconKey];
        return (
          <div key={`${step.actionId}-${index}`} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white",
                step.iconClass,
              )}
              title={step.label}
            >
              {Icon ? (
                <Icon
                  className={cn("h-3 w-3", step.iconKey === "star" ? "fill-current" : "")}
                  aria-hidden
                />
              ) : null}
            </span>
            {index < steps.length - 1 ? (
              <span className="h-px w-3 bg-border" aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "form-qualificado-crm-whatsapp",
    name: "Formulário qualificado → CRM + WhatsApp",
    description:
      "Lead que bate os critérios do formulário entra no CRM, ganha estrelas e recebe WhatsApp. Quem não bate, nem entra.",
    category: "Vendas",
    trigger: "form_submitted",
    steps: [
      {
        actionId: "criar-negociacao",
        label: "Criar Negociação no CRM",
        iconKey: "star",
        iconClass: "bg-sky-500",
      },
      {
        actionId: "definir-qualificacao",
        label: "Definir qualificação (estrelas)",
        iconKey: "star",
        iconClass: "bg-sky-500",
        subtitle: "★★★★ (4)",
        subtitleVariant: "plain",
        config: { qualification: 4 },
      },
      {
        actionId: "whatsapp",
        label: "Enviar WhatsApp",
        iconKey: "message-circle",
        iconClass: "bg-violet-600",
        subtitle: "Boas-vindas ao lead qualificado",
        subtitleVariant: "primary",
      },
    ],
  },
  {
    id: "boas-vindas-whatsapp",
    name: "Boas-vindas no WhatsApp",
    description: "Etiqueta o lead como oportunidade e dispara uma mensagem de WhatsApp.",
    category: "Vendas",
    trigger: "form_submitted",
    steps: [
      {
        actionId: "adicionar-tags",
        label: "Adicionar Tags",
        iconKey: "tag",
        iconClass: "bg-pink-500",
        subtitle: "oportunidade",
        subtitleVariant: "chip",
        config: { tag: "oportunidade" },
      },
      {
        actionId: "whatsapp",
        label: "Enviar WhatsApp",
        iconKey: "message-circle",
        iconClass: "bg-violet-600",
        subtitle: "Boas-vindas",
        subtitleVariant: "primary",
      },
    ],
  },
  {
    id: "captura-lead-crm",
    name: "Captura de lead no CRM",
    description: "Adiciona uma etiqueta no lead e abre uma negociação no CRM.",
    category: "Vendas",
    trigger: "form_submitted",
    steps: [
      {
        actionId: "adicionar-tags",
        label: "Adicionar Tags",
        iconKey: "tag",
        iconClass: "bg-pink-500",
        subtitle: "novo lead",
        subtitleVariant: "chip",
      },
      {
        actionId: "criar-negociacao",
        label: "Criar Negociação no CRM",
        iconKey: "star",
        iconClass: "bg-sky-500",
      },
    ],
  },
  {
    id: "espera-e-email",
    name: "Espera + e-mail",
    description: "Aguarda 1 dia e envia um e-mail de follow-up ao lead.",
    category: "Pós-venda",
    trigger: "form_submitted",
    steps: [
      {
        actionId: "espera",
        label: "Espera",
        iconKey: "clock",
        iconClass: "bg-orange-500",
        subtitle: "1 dia(s), 0 hora(s) e 0 minuto(s)",
        subtitleVariant: "plain",
      },
      {
        actionId: "email",
        label: "Enviar email",
        iconKey: "mail",
        iconClass: "bg-violet-600",
      },
    ],
  },
  {
    id: "recuperacao-carrinho",
    name: "Recuperação de lead frio",
    description: "Espera 2 dias sem resposta e reengaja o lead por WhatsApp.",
    category: "Recuperação",
    trigger: "form_submitted",
    steps: [
      {
        actionId: "espera",
        label: "Espera",
        iconKey: "clock",
        iconClass: "bg-orange-500",
        subtitle: "2 dia(s), 0 hora(s) e 0 minuto(s)",
        subtitleVariant: "plain",
      },
      {
        actionId: "whatsapp",
        label: "Enviar WhatsApp",
        iconKey: "message-circle",
        iconClass: "bg-violet-600",
        subtitle: "Reengajamento",
        subtitleVariant: "primary",
      },
      {
        actionId: "adicionar-tags",
        label: "Adicionar Tags",
        iconKey: "tag",
        iconClass: "bg-pink-500",
        subtitle: "reengajado",
        subtitleVariant: "chip",
      },
    ],
  },
  {
    id: "qualificacao-whatsapp",
    name: "Qualificação no WhatsApp",
    description: "Responde quem mandou mensagem e etiqueta como oportunidade.",
    category: "Vendas",
    trigger: "whatsapp_message_received",
    steps: [
      {
        actionId: "whatsapp",
        label: "Enviar WhatsApp",
        iconKey: "message-circle",
        iconClass: "bg-violet-600",
        subtitle: "Saudação",
        subtitleVariant: "primary",
      },
      {
        actionId: "adicionar-tags",
        label: "Adicionar Tags",
        iconKey: "tag",
        iconClass: "bg-pink-500",
        subtitle: "oportunidade",
        subtitleVariant: "chip",
        config: { tag: "oportunidade" },
      },
    ],
  },
];

export function MarketingAutomations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>("10");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deleteTarget, setDeleteTarget] = useState<MarketingFlowRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("Novo fluxo");
  const [newTrigger, setNewTrigger] = useState<string>("none");
  const [channelLimitsOpen, setChannelLimitsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<MarketingFlowStatus>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: flows, isLoading, error } = useMarketingFlows();
  const { data: stats } = useMarketingFlowStats();
  const createFlow = useCreateMarketingFlow();
  const updateFlow = useUpdateMarketingFlow();
  const duplicateFlow = useDuplicateMarketingFlow();
  const deleteFlow = useDeleteMarketingFlow();

  const openCreateDialog = () => {
    setNewName("Novo fluxo");
    setNewTrigger("none");
    setCreateOpen(true);
  };

  const triggerPatch = (triggerType: string): Record<string, unknown> | undefined =>
    triggerType && triggerType !== "none" ? { type: triggerType } : undefined;

  const handleCreateBlank = () => {
    createFlow.mutate(
      { name: newName.trim() || "Novo fluxo", trigger: triggerPatch(newTrigger) },
      {
        onSuccess: (flow) => {
          setCreateOpen(false);
          navigate(`/marketing/fluxo/${flow.id}`);
        },
        onError: (e) =>
          toast({ title: "Erro ao criar fluxo", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleToggleStatus = (flow: MarketingFlowRecord) => {
    const nextStatus: MarketingFlowStatus = flow.status === "ativo" ? "pausado" : "ativo";
    updateFlow.mutate(
      { id: flow.id, patch: { status: nextStatus } },
      {
        onSuccess: () =>
          toast({ title: nextStatus === "ativo" ? "Fluxo ativado" : "Fluxo pausado" }),
        onError: (e) =>
          toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleDuplicate = (flow: MarketingFlowRecord) => {
    duplicateFlow.mutate(flow.id, {
      onSuccess: () => toast({ title: "Fluxo duplicado" }),
      onError: (e) =>
        toast({ title: "Erro ao duplicar", description: e.message, variant: "destructive" }),
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    deleteFlow.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ title: "Fluxo removido" });
        setDeleteTarget(null);
      },
      onError: (e) =>
        toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
    });
  };

  const handleUseTemplate = (template: FlowTemplate) => {
    const trimmed = newName.trim();
    createFlow.mutate(
      {
        name: trimmed && trimmed !== "Novo fluxo" ? trimmed : template.name,
        definition: { steps: template.steps },
        trigger: triggerPatch(newTrigger !== "none" ? newTrigger : template.trigger ?? "none"),
      },
      {
        onSuccess: (flow) => {
          setCreateOpen(false);
          navigate(`/marketing/fluxo/${flow.id}`);
        },
        onError: (e) =>
          toast({
            title: "Erro ao criar a partir do modelo",
            description: e.message,
            variant: "destructive",
          }),
      },
    );
  };

  const handleExport = () => {
    const list = flows ?? [];
    if (list.length === 0) {
      toast({ title: "Nada para exportar" });
      return;
    }
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      flows: list.map((flow) => ({
        name: flow.name,
        status: flow.status,
        definition: flow.definition,
        criteria: flow.criteria,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fluxos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast({ title: `${list.length} fluxo(s) exportado(s)` });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    let success = 0;
    let failed = 0;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.flows)) {
        throw new Error('Arquivo inválido: esperava { "flows": [...] }.');
      }
      for (const item of data.flows) {
        if (!item || typeof item !== "object" || typeof item.name !== "string") {
          failed++;
          continue;
        }
        try {
          await createFlow.mutateAsync({
            name: item.name,
            status: isMarketingFlowStatus(item.status) ? item.status : "rascunho",
            definition:
              item.definition && typeof item.definition === "object"
                ? (item.definition as Record<string, unknown>)
                : undefined,
            criteria:
              item.criteria && typeof item.criteria === "object"
                ? (item.criteria as Record<string, unknown>)
                : undefined,
          });
          success++;
        } catch {
          failed++;
        }
      }
      toast({
        title: "Importação concluída",
        description:
          failed > 0
            ? `${success} importado(s), ${failed} falharam`
            : `${success} fluxo(s) importado(s)`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: "Erro ao importar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("desc");
  };

  const filtered = useMemo<MarketingFlowRecord[]>(() => {
    const all = flows ?? [];
    const term = search.trim().toLowerCase();
    const byTerm = term
      ? all.filter((flow) => flow.name.toLowerCase().includes(term))
      : all;
    const byStatus = statusFilter.size > 0
      ? byTerm.filter((flow) => statusFilter.has(flow.status))
      : byTerm;

    return [...byStatus].sort((a, b) => {
      const av = new Date(a[sortField]).getTime();
      const bv = new Date(b[sortField]).getTime();
      return sortDirection === "asc" ? av - bv : bv - av;
    });
  }, [flows, search, statusFilter, sortField, sortDirection]);

  const total = filtered.length;
  const size = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * size;
  const visible = filtered.slice(start, start + size);

  const filtersCount = statusFilter.size;

  const toggleStatusFilter = (status: MarketingFlowStatus, checked: boolean) => {
    setPage(1);
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(status);
      else next.delete(status);
      return next;
    });
  };

  const clearFilters = () => {
    setPage(1);
    setStatusFilter(new Set());
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Automação de Marketing
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-primary hover:bg-primary/10"
                aria-label="Importar / exportar"
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                ) : (
                  <FileUp className="h-5 w-5" aria-hidden />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuItem onSelect={handleImportClick} className="gap-2">
                <Upload className="h-4 w-4" aria-hidden />
                Importar fluxos (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExport} className="gap-2">
                <Download className="h-4 w-4" aria-hidden />
                Exportar fluxos (.json)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            onClick={() => setChannelLimitsOpen(true)}
          >
            <Gauge className="h-4 w-4" aria-hidden />
            Limites de envio
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="bg-primary/10 text-primary hover:bg-primary/15"
            onClick={openCreateDialog}
          >
            Modelos
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={openCreateDialog}
            disabled={createFlow.isPending}
          >
            {createFlow.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Criar fluxo
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar fluxo"
            className="h-10 rounded-full pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              className="h-10 gap-2 rounded-full bg-primary/10 text-primary hover:bg-primary/15"
            >
              <Filter className="h-4 w-4" aria-hidden />
              Filtros ({filtersCount})
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Status</p>
              {filtersCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Limpar
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {MARKETING_FLOW_STATUSES.map((status) => (
                <label
                  key={status}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm text-foreground hover:bg-muted/60"
                >
                  <Checkbox
                    checked={statusFilter.has(status)}
                    onCheckedChange={(checked) =>
                      toggleStatusFilter(status, checked === true)
                    }
                  />
                  <span className="capitalize">{status}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nome do fluxo
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entrada de leads
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Leads ativos
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort("createdAt")}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  Criação
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      sortField === "createdAt" && sortDirection === "asc" ? "rotate-180" : "",
                    )}
                    aria-hidden
                  />
                </button>
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleSort("updatedAt")}
                  className="inline-flex items-center gap-1 hover:text-primary"
                >
                  Última alteração
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      sortField === "updatedAt" && sortDirection === "asc" ? "rotate-180" : "",
                    )}
                    aria-hidden
                  />
                </button>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Carregando fluxos…
                  </span>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-destructive"
                >
                  Não foi possível carregar os fluxos. {error.message}
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {(flows ?? []).length === 0
                    ? "Nenhum fluxo criado ainda. Clique em “Criar fluxo” para começar."
                    : search.trim() || filtersCount > 0
                      ? "Nenhum fluxo encontrado para os filtros aplicados."
                      : "Nenhum fluxo encontrado."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((flow) => (
                <TableRow key={flow.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => navigate(`/marketing/fluxo/${flow.id}`)}
                      className="font-medium text-primary hover:underline"
                    >
                      {flow.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        STATUS_BADGE_CLASS[flow.status],
                      )}
                    >
                      {flow.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatNumber(statsFor(stats, flow.id).totalEntered)}</TableCell>
                  <TableCell>
                    {formatNumber(statsFor(stats, flow.id).activeCount)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(flow.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(flow.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-md bg-primary/10 text-primary hover:bg-primary/15"
                          aria-label="Ações do fluxo"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[220px] rounded-xl p-2 shadow-lg"
                      >
                        <DropdownMenuItem
                          className="px-3 py-2 text-base font-semibold"
                          onSelect={() => navigate(`/marketing/fluxo/${flow.id}`)}
                        >
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="px-3 py-2 text-base font-semibold"
                          onSelect={() => handleToggleStatus(flow)}
                        >
                          {flow.status === "ativo" ? "Pausar" : "Ativar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="px-3 py-2 text-base font-semibold"
                          onSelect={() => handleDuplicate(flow)}
                        >
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="px-3 py-2 text-base font-semibold text-destructive focus:text-destructive"
                          onSelect={(event) => {
                            event.preventDefault();
                            setDeleteTarget(flow);
                          }}
                        >
                          Excluir fluxo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Exibindo</span>
          <Select
            value={pageSize}
            onValueChange={(value) => {
              setPageSize(value as (typeof PAGE_SIZE_OPTIONS)[number]);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>
            de {total} {total === 1 ? "fluxo" : "fluxos"}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="font-semibold text-foreground">{safePage}</span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            className="text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>

      <ChannelLimitsDialog open={channelLimitsOpen} onOpenChange={setChannelLimitsOpen} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo fluxo</DialogTitle>
            <DialogDescription>
              Dê um nome, escolha o gatilho de entrada e comece do zero ou a partir de um modelo.
              Tudo pode ser editado depois.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-flow-name" className="text-xs text-muted-foreground">
                Nome do fluxo
              </Label>
              <Input
                id="new-flow-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Boas-vindas de novos leads"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Gatilho de entrada</Label>
              <Select value={newTrigger} onValueChange={setNewTrigger}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolher depois" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Escolher depois</SelectItem>
                  {MARKETING_TRIGGER_DEFINITIONS.map((def) => (
                    <SelectItem key={def.type} value={def.type}>
                      {MARKETING_TRIGGER_CATEGORY_LABEL[def.category]} · {def.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Comece com
            </p>
            <div className="grid max-h-[46vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleCreateBlank}
                disabled={createFlow.isPending}
                className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Plus className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-foreground">Em branco</span>
                <span className="text-xs text-muted-foreground">
                  Monte o fluxo do zero arrastando ações no editor.
                </span>
              </button>

              {FLOW_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => handleUseTemplate(template)}
                  disabled={createFlow.isPending}
                  className="flex flex-col items-start gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{template.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {template.category}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{template.description}</span>
                  <TemplateStepsPreview steps={template.steps} />
                  <span className="text-[11px] text-muted-foreground">
                    {template.steps.length} passo(s)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {createFlow.isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Criando fluxo…
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `O fluxo “${deleteTarget.name}” será removido permanentemente. Esta ação não pode ser desfeita.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFlow.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDelete();
              }}
              disabled={deleteFlow.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFlow.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Excluindo…
                </span>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
