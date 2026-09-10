import { useMemo, useState } from "react";
import { Loader2, Search, Star, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { useFormLeads, type FormLeadRecord } from "@/lib/api/marketing-forms";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import {
  DEFAULT_CRM_FUNNELS,
  funnelListNameIn,
  funnelStageTitleIn,
} from "@/data/crm-funnels";

interface FormLeadsSheetProps {
  formId: string | null;
  formName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  em_andamento: { label: "Em andamento", className: "bg-blue-100 text-blue-700" },
  vendido: { label: "Vendido", className: "bg-emerald-100 text-emerald-700" },
  perdido: { label: "Perdido", className: "bg-red-100 text-red-700" },
  pausado: { label: "Pausado", className: "bg-amber-100 text-amber-700" },
  nao_pausado: { label: "Em andamento", className: "bg-blue-100 text-blue-700" },
};

function StarRating({ value }: { value: number }) {
  const v = Math.min(5, Math.max(0, Math.round(value)));
  if (v <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${v} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= v ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function matchesDate(createdAt: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = (createdAt || "").slice(0, 10); // YYYY-MM-DD
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function FormLeadsSheet({ formId, formName, open, onOpenChange }: FormLeadsSheetProps) {
  const { data: leads = [], isLoading, isError, error } = useFormLeads(formId, { enabled: open });
  const { data: funnels = DEFAULT_CRM_FUNNELS } = useEffectiveCrmFunnels();

  const [search, setSearch] = useState("");
  const [funnelFilter, setFunnelFilter] = useState("all");
  const [starsFilter, setStarsFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (q) {
        const hay = `${lead.customerName} ${lead.customerPhone} ${lead.customerEmail} ${lead.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (funnelFilter !== "all" && lead.funnelId !== funnelFilter) return false;
      if (starsFilter !== "all") {
        const min = Number(starsFilter);
        if (lead.qualification < min) return false;
      }
      if (!matchesDate(lead.createdAt, dateFrom, dateTo)) return false;
      return true;
    });
  }, [leads, search, funnelFilter, starsFilter, dateFrom, dateTo]);

  const qualifiedCount = useMemo(
    () => filtered.filter((l) => l.qualification >= 3).length,
    [filtered],
  );

  const funnelsInUse = useMemo(() => {
    const ids = new Set(leads.map((l) => l.funnelId).filter(Boolean));
    return funnels.filter((f) => ids.has(f.id));
  }, [leads, funnels]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <SheetHeader className="space-y-1 border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden />
            Leads do formulário
          </SheetTitle>
          <SheetDescription>
            <span className="font-medium text-foreground">{formName}</span> — onde cada envio caiu no CRM.
            Confira funil, etapa e estrelas para validar a automação.
          </SheetDescription>
        </SheetHeader>

        {/* Filtros */}
        <div className="grid gap-3 border-b px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Nome, telefone, e-mail…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Funil</Label>
            <Select value={funnelFilter} onValueChange={setFunnelFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os funis</SelectItem>
                {funnelsInUse.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.listName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estrelas</Label>
            <Select value={starsFilter} onValueChange={setStarsFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="5">5 estrelas</SelectItem>
                <SelectItem value="4">4+ estrelas</SelectItem>
                <SelectItem value="3">3+ estrelas</SelectItem>
                <SelectItem value="1">Com qualquer estrela</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
            <div className="space-y-1">
              <Label className="text-xs">De</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9" />
            </div>
          </div>
        </div>

        {/* Resumo */}
        <div className="flex items-center gap-2 px-6 py-2 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">{filtered.length}</span> de {leads.length} leads
          </span>
          <span>·</span>
          <span>
            <span className="font-semibold text-foreground">{qualifiedCount}</span> com 3+ estrelas
          </span>
        </div>

        {/* Tabela */}
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <div className="py-16 text-center text-sm text-red-600">
              Erro ao carregar leads: {error instanceof Error ? error.message : "desconhecido"}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {leads.length === 0
                ? "Nenhum lead deste formulário caiu no CRM ainda."
                : "Nenhum lead bate com os filtros."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead className="w-[120px]">Estrelas</TableHead>
                  <TableHead>Funil / Etapa</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[130px]">Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <LeadRow key={lead.negotiationId} lead={lead} funnels={funnels} />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LeadRow({
  lead,
  funnels,
}: {
  lead: FormLeadRecord;
  funnels: typeof DEFAULT_CRM_FUNNELS;
}) {
  const status = STATUS_LABELS[lead.status] ?? {
    label: lead.status || "—",
    className: "bg-muted text-muted-foreground",
  };
  const name = lead.customerName || lead.title || "Lead sem nome";
  const contact = lead.customerPhone || lead.customerEmail;

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{name}</p>
          {contact ? <p className="truncate text-xs text-muted-foreground">{contact}</p> : null}
        </div>
      </TableCell>
      <TableCell>
        <StarRating value={lead.qualification} />
      </TableCell>
      <TableCell>
        <div className="min-w-0">
          <p className="truncate text-sm">{funnelListNameIn(funnels, lead.funnelId)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {funnelStageTitleIn(funnels, lead.funnelId, lead.stageId)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className={cn("font-normal", status.className)}>
          {status.label}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</TableCell>
    </TableRow>
  );
}
