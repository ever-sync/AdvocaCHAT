import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CalendarPlus,
  Download,
  Gauge,
  Hand,
  Inbox,
  RefreshCcw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatBRL, downloadBlob } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_CRM_FUNNELS, funnelStageTitleIn } from "@/data/crm-funnels";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { useCreateCrmTask, useCrmTasksReport } from "@/lib/api/crm-tasks";
import { useClaimCrmNegotiation, useUpdateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { useAuth } from "@/hooks/useAuth";
import { useCrmTaskTemplates } from "@/lib/api/crm-task-templates";
import { useTenantCollaborators } from "@/lib/api/settings";
import {
  exportAttendanceCsv,
  useAttendanceReport,
  useCrmCommercialSla,
  useCrmSellerPerformance,
  useFunnelReport,
  useFunnelVelocity,
  useLostReasons,
  useSellerSalesReport,
  useStaleNegotiations,
  useStaleNegotiationsSummary,
} from "@/lib/api/reports";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PainelAoVivo } from "./Painel";
import { ForecastReport } from "@/components/reports/ForecastReport";
import { useSchedulingReport } from "@/lib/api/scheduling-report";


type TabKey =
  | "painel"
  | "atendimento"
  | "funil"
  | "forecast"
  | "parados"
  | "sla"
  | "crm-vendedores"
  | "vendas"
  | "perdas"
  | "tarefas"
  | "agendas";

type QuickPeriod = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";

const QUICK_PERIODS: { value: QuickPeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Mês atual" },
  { value: "lastMonth", label: "Mês passado" },
  { value: "custom", label: "Customizado" },
];

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeForPeriod(period: QuickPeriod, now: Date): { from: string; to: string } | null {
  if (period === "custom") return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") {
    return { from: toIsoDate(today), to: toIsoDate(today) };
  }
  if (period === "last7") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { from: toIsoDate(start), to: toIsoDate(today) };
  }
  if (period === "last30") {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { from: toIsoDate(start), to: toIsoDate(today) };
  }
  if (period === "thisMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: toIsoDate(start), to: toIsoDate(end) };
  }
  // lastMonth
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

function formatCurrency(value: number) {
  return formatBRL(value);
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricTile({
  label,
  value,
  hint,
  variant = "default",
  delta,
}: {
  label: string;
  value: string | number;
  hint?: string;
  variant?: "default" | "warning" | "danger";
  delta?: { current: number; prev: number; invertColor?: boolean } | null;
}) {
  return (
    <div
      className={cn(
        "group rounded-xl border bg-gradient-to-br p-4 transition-shadow hover:shadow-md",
        variant === "danger" && "border-destructive/30 from-destructive/10 to-card",
        variant === "warning" && "border-warning/30 from-warning/10 to-card",
        variant === "default" && "border-border/60 from-muted/50 to-card",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
        {delta ? <DeltaBadge current={delta.current} prev={delta.prev} invertColor={delta.invertColor} /> : null}
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CrmFunnelSelect({
  funnels,
  funnelId,
  onFunnelIdChange,
}: {
  funnels: typeof DEFAULT_CRM_FUNNELS;
  funnelId: string;
  onFunnelIdChange: (id: string) => void;
}) {
  return (
    <Select value={funnelId} onValueChange={onFunnelIdChange}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Funil" />
      </SelectTrigger>
      <SelectContent>
        {funnels.map((f) => (
          <SelectItem key={f.id} value={f.id}>
            {f.listName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState({ label = "Sem dados para o filtro atual." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-5 w-5" />
      {label}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Falha ao carregar o relatório.";
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 py-6 text-center text-sm text-destructive">
      <AlertCircle className="h-5 w-5" />
      <p>{msg}</p>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

function MonthYearSelect({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (next: { year: number; month: number }) => void;
}) {
  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor="sales-month" className="text-xs">Mês</Label>
        <Select value={String(month)} onValueChange={(v) => onChange({ year, month: Number(v) })}>
          <SelectTrigger id="sales-month" className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((label, i) => (
              <SelectItem key={i} value={String(i + 1)}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="sales-year" className="text-xs">Ano</Label>
        <Select value={String(year)} onValueChange={(v) => onChange({ year: Number(v), month })}>
          <SelectTrigger id="sales-year" className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const CHART_COLORS = ["#6E22D9", "#9B5BFF", "#22C55E", "#F59E0B", "#EF4444", "#0EA5E9", "#A3A3A3"];

type SortDir = "asc" | "desc";

function useSortable<T>(rows: T[], defaultKey: keyof T, defaultDir: SortDir = "asc") {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true }) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = useCallback(
    (key: keyof T) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  return { sorted, sortKey, sortDir, toggleSort };
}

function SortableTh<T>({
  k,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
}: {
  k: keyof T;
  sortKey: keyof T;
  sortDir: SortDir;
  onSort: (key: keyof T) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={cn("pb-2 pr-4", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
      >
        {children}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function diffDays(fromIso: string, toIso: string) {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function previousPeriod(fromIso: string, toIso: string): { from: string; to: string } {
  const days = diffDays(fromIso, toIso) + 1;
  const prevTo = new Date(`${fromIso}T00:00:00`);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: toIsoDate(prevFrom), to: toIsoDate(prevTo) };
}

function pctDelta(current: number, prev: number): number | null {
  if (prev === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prev) / Math.abs(prev)) * 100);
}

function DeltaBadge({ current, prev, invertColor = false }: { current: number; prev: number; invertColor?: boolean }) {
  const delta = pctDelta(current, prev);
  if (delta === null) return <span className="text-[10px] text-muted-foreground">—</span>;
  const diff = current - prev;
  const positive = diff > 0;
  const negative = diff < 0;
  const good = invertColor ? negative : positive;
  const bad = invertColor ? positive : negative;
  const cls = good ? "text-success" : bad ? "text-destructive" : "text-muted-foreground";
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium", cls)}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {delta > 0 ? "+" : ""}
      {delta}%
    </span>
  );
}

export default function Relatorios() {
  const { toast } = useToast();
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState<TabKey>("painel");
  const [period, setPeriod] = useState<QuickPeriod>("thisMonth");
  const initialThisMonth = useMemo(() => rangeForPeriod("thisMonth", now)!, [now]);
  const [from, setFrom] = useState(initialThisMonth.from);
  const [to, setTo] = useState(initialThisMonth.to);
  const [salesYear, setSalesYear] = useState(now.getFullYear());
  const [salesMonth, setSalesMonth] = useState(now.getMonth() + 1);
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [schedulingProviderFilter, setSchedulingProviderFilter] = useState<string>("all");
  const [staleLimit, setStaleLimit] = useState(50);
  const [compare, setCompare] = useState(false);

  useEffect(() => {
    const range = rangeForPeriod(period, now);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }, [period, now]);

  const { data: funnels = DEFAULT_CRM_FUNNELS } = useEffectiveCrmFunnels();
  const [funnelId, setFunnelId] = useState(DEFAULT_CRM_FUNNELS[0]?.id ?? "comercial");

  useEffect(() => {
    if (funnels.some((f) => f.id === funnelId)) return;
    setFunnelId(funnels[0]?.id ?? DEFAULT_CRM_FUNNELS[0]?.id ?? "comercial");
  }, [funnelId, funnels]);

  const fromDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const toDate = useMemo(() => new Date(`${to}T23:59:59.999`), [to]);

  const prev = useMemo(() => previousPeriod(from, to), [from, to]);
  const prevFromDate = useMemo(() => new Date(`${prev.from}T00:00:00`), [prev.from]);
  const prevToDate = useMemo(() => new Date(`${prev.to}T23:59:59.999`), [prev.to]);

  const attendanceQ = useAttendanceReport(
    fromDate,
    toDate,
    assigneeFilter === "all" ? undefined : assigneeFilter,
    { enabled: tab === "atendimento" },
  );
  const funnelQ = useFunnelReport(funnelId, fromDate, toDate, { enabled: tab === "funil" });
  const funnelVelocityQ = useFunnelVelocity(funnelId, fromDate, toDate, { enabled: tab === "funil" });
  const staleSummaryQ = useStaleNegotiationsSummary(funnelId, { enabled: tab === "parados" });
  const staleQ = useStaleNegotiations(funnelId, staleLimit, { enabled: tab === "parados" });
  const crmSlaQ = useCrmCommercialSla(funnelId, fromDate, toDate, { enabled: tab === "sla" });
  const crmSellersQ = useCrmSellerPerformance(funnelId, fromDate, toDate, { enabled: tab === "crm-vendedores" });
  const salesQ = useSellerSalesReport(salesYear, salesMonth, { enabled: tab === "vendas" });
  const schedulingReportQ = useSchedulingReport(
    from,
    to,
    schedulingProviderFilter === "all" ? null : schedulingProviderFilter,
    { enabled: tab === "agendas" }
  );
  const schedulingReport = schedulingReportQ.data;

  const prevAttendanceQ = useAttendanceReport(prevFromDate, prevToDate, undefined, {
    enabled: tab === "atendimento" && compare,
  });
  const prevCrmSlaQ = useCrmCommercialSla(funnelId, prevFromDate, prevToDate, {
    enabled: tab === "sla" && compare,
  });
  const lostReasonsQ = useLostReasons(funnelId, fromDate, toDate, { enabled: tab === "perdas" });
  const lostReasons = lostReasonsQ.data ?? [];

  const tasksReportQ = useCrmTasksReport(fromDate, toDate, { enabled: tab === "tarefas" });
  const { data: taskTemplates = [] } = useCrmTaskTemplates();
  const { data: taskCollaborators = [] } = useTenantCollaborators({ enabled: tab === "tarefas" || tab === "agendas" });
  const tasksReport = useMemo(() => tasksReportQ.data ?? [], [tasksReportQ.data]);

  // Pacote 8 — Smart prompts na aba "Parados": criar tarefa de follow-up e
  // atribuir negócio do pool sem sair do relatório.
  const { profile } = useAuth();
  const { data: staleCollaborators = [] } = useTenantCollaborators({ enabled: tab === "parados" });
  const stalePool = useMemo(
    () =>
      staleCollaborators
        .filter((c) => c.status === "active" && c.role === "atendimento")
        .map((c) => ({
          id: c.id,
          name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim(),
        })),
    [staleCollaborators],
  );
  const createCrmTaskMut = useCreateCrmTask();
  const updateCrmNegotiationMut = useUpdateCrmNegotiation();
  const claimCrmNegotiationMut = useClaimCrmNegotiation();
  const [staleReanimBusy, setStaleReanimBusy] = useState(false);
  const [staleAssignOpen, setStaleAssignOpen] = useState<string | null>(null);
  const [staleAssignSearch, setStaleAssignSearch] = useState("");

  // Próximo expediente local (16h se ainda dá tempo hoje; senão amanhã 10h).
  const buildSmartDueAt = useCallback((days = 0): string => {
    const d = new Date();
    if (days > 0) {
      d.setDate(d.getDate() + days);
      d.setHours(10, 0, 0, 0);
    } else if (d.getHours() < 16) {
      d.setHours(16, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
    }
    return d.toISOString();
  }, []);

  const createReanimateTask = useCallback(
    async (
      negotiationId: string,
      assigneeId: string | null,
      title: string,
      dayOffset: number,
    ) => {
      try {
        await createCrmTaskMut.mutateAsync({
          negotiationId,
          assigneeId: assigneeId ?? profile?.id ?? null,
          title,
          dueAt: buildSmartDueAt(dayOffset),
          notes: "Criada pelo painel Reanimar.",
        });
        toast({
          title: dayOffset === 0 ? "Tarefa para hoje criada." : "Tarefa para amanhã criada.",
        });
      } catch (err) {
        toast({
          title: "Não foi possível criar a tarefa",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [buildSmartDueAt, createCrmTaskMut, profile?.id, toast],
  );

  const assignStaleNegotiation = useCallback(
    async (negotiationId: string, assigneeId: string) => {
      try {
        await updateCrmNegotiationMut.mutateAsync({
          id: negotiationId,
          patch: { assigneeId },
        });
        setStaleAssignOpen(null);
        setStaleAssignSearch("");
        toast({ title: "Responsável atribuído." });
      } catch (err) {
        toast({
          title: "Não foi possível atribuir",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [toast, updateCrmNegotiationMut],
  );

  const claimStaleNegotiation = useCallback(
    async (negotiationId: string) => {
      try {
        await claimCrmNegotiationMut.mutateAsync(negotiationId);
        toast({ title: "Negócio assumido." });
      } catch (err) {
        toast({
          title: "Não foi possível assumir",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [claimCrmNegotiationMut, toast],
  );

  const tasksTotals = useMemo(() => {
    const now = Date.now();
    return tasksReport.reduce(
      (acc, t) => {
        acc.total += 1;
        if (t.status === "concluida") {
          acc.done += 1;
        } else {
          acc.open += 1;
          if (t.dueAt && new Date(t.dueAt).getTime() < now) {
            acc.overdue += 1;
          }
        }
        return acc;
      },
      { total: 0, done: 0, open: 0, overdue: 0 },
    );
  }, [tasksReport]);

  const tasksByTemplate = useMemo(() => {
    const titleOf = (id: string | null) =>
      id ? taskTemplates.find((t) => t.id === id)?.title ?? "Modelo removido" : "Sem modelo";
    const map = new Map<string, { id: string; title: string; total: number; done: number }>();
    for (const t of tasksReport) {
      const key = t.templateId ?? "__none__";
      const cur = map.get(key) ?? { id: key, title: titleOf(t.templateId), total: 0, done: 0 };
      cur.total += 1;
      if (t.status === "concluida") cur.done += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [tasksReport, taskTemplates]);

  const tasksByAssignee = useMemo(() => {
    const now = Date.now();
    const nameOf = (id: string | null) =>
      id ? taskCollaborators.find((c) => c.id === id)?.nome || "—" : "Sem responsável";
    const map = new Map<
      string,
      { id: string; name: string; total: number; done: number; overdue: number }
    >();
    for (const t of tasksReport) {
      const key = t.assigneeId ?? "__none__";
      const cur =
        map.get(key) ?? { id: key, name: nameOf(t.assigneeId), total: 0, done: 0, overdue: 0 };
      cur.total += 1;
      if (t.status === "concluida") {
        cur.done += 1;
      } else if (t.dueAt && new Date(t.dueAt).getTime() < now) {
        cur.overdue += 1;
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [tasksReport, taskCollaborators]);

  const attendance = attendanceQ.data ?? [];
  const funnelRows = funnelQ.data ?? [];
  const staleSummary = staleSummaryQ.data;
  const staleRows = staleQ.data ?? [];
  const crmSla = crmSlaQ.data;
  const crmSellers = crmSellersQ.data ?? [];
  const sellerSales = salesQ.data ?? [];
  const prevAttendance = prevAttendanceQ.data ?? [];
  const prevSla = prevCrmSlaQ.data;

  const sortedFunnelRows = useMemo(
    () => [...funnelRows].sort((a, b) => a.stage_order - b.stage_order || a.stage_id.localeCompare(b.stage_id)),
    [funnelRows],
  );

  const attendanceSort = useSortable(attendance, "chats_resolved", "desc");
  const funnelSort = useSortable(sortedFunnelRows, "stage_order", "asc");
  const staleSort = useSortable(staleRows, "days_without_touch", "desc");
  const staleNoTaskRows = useMemo(
    () => (staleQ.data ?? []).filter((r) => r.missing_future_task),
    [staleQ.data],
  );
  const stalePoolRows = useMemo(
    () => (staleQ.data ?? []).filter((r) => !r.assignee_id),
    [staleQ.data],
  );

  const reanimateAllMissingTask = useCallback(async () => {
    if (staleNoTaskRows.length === 0) return;
    setStaleReanimBusy(true);
    const results = await Promise.allSettled(
      staleNoTaskRows.map((r) =>
        createCrmTaskMut.mutateAsync({
          negotiationId: r.negotiation_id,
          assigneeId: r.assignee_id ?? profile?.id ?? null,
          title: "Reanimar contato",
          dueAt: buildSmartDueAt(0),
          notes: "Criada em lote pelo painel Reanimar.",
        }),
      ),
    );
    setStaleReanimBusy(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = staleNoTaskRows.length - ok;
    toast({
      title:
        failed === 0
          ? `${ok} tarefa${ok === 1 ? "" : "s"} de follow-up criada${ok === 1 ? "" : "s"}.`
          : `${ok} concluída${ok === 1 ? "" : "s"}, ${failed} falharam.`,
      variant: failed > 0 ? "destructive" : undefined,
    });
  }, [buildSmartDueAt, createCrmTaskMut, profile?.id, staleNoTaskRows, toast]);
  const sellersSort = useSortable(crmSellers, "won_value", "desc");
  const salesSort = useSortable(sellerSales, "sales_total", "desc");

  const schedulingServices = schedulingReport?.by_service ?? [];
  const schedulingServicesSort = useSortable(schedulingServices, "total", "desc");

  const schedulingProviders = schedulingReport?.by_provider ?? [];
  const schedulingProvidersSort = useSortable(schedulingProviders, "total", "desc");

  const schedulingChartData = useMemo(() => {
    if (!schedulingReport?.by_day) return [];
    return schedulingReport.by_day.map((d) => ({
      data: d.date,
      total: d.total,
      concluido: d.concluido,
      cancelado: d.cancelado,
      nao_compareceu: d.nao_compareceu,
      receita: d.receita,
    }));
  }, [schedulingReport?.by_day]);

  const exportScheduling = () => {
    if (!schedulingReport) return;
    const rows: (string | number | null | undefined)[][] = [
      ["=== RESUMO AGREGADO ==="],
      ["Total de Agendamentos", schedulingReport.summary.total],
      ["Agendados", schedulingReport.summary.agendado],
      ["Confirmados", schedulingReport.summary.confirmado],
      ["Concluídos", schedulingReport.summary.concluido],
      ["Cancelados", schedulingReport.summary.cancelado],
      ["Não Compareceu (No-show)", schedulingReport.summary.nao_compareceu],
      ["Receita Total", formatCurrency(schedulingReport.summary.receita_total)],
      ["Taxa de No-show (%)", schedulingReport.summary.taxa_no_show],
      ["Taxa de Cancelamento (%)", schedulingReport.summary.taxa_cancelamento],
      ["Taxa de Conclusão (%)", schedulingReport.summary.taxa_conclusao],
      [],
      ["=== POR SERVIÇO ==="],
      ["Serviço", "Total Agendamentos", "Concluídos", "Receita"],
      ...schedulingReport.by_service.map((s) => [
        s.service_nome,
        s.total,
        s.concluido,
        formatCurrency(s.receita),
      ]),
    ];

    if (schedulingProviderFilter === "all") {
      rows.push([]);
      rows.push(["=== POR PROFISSIONAL ==="]);
      rows.push(["Profissional", "Total Agendamentos", "Concluídos", "Não Compareceu", "Receita"]);
      rows.push(
        ...schedulingReport.by_provider.map((p) => {
          const name = taskCollaborators.find((c) => c.id === p.provider_id)?.nome || p.provider_id;
          return [
            name,
            p.total,
            p.concluido,
            p.nao_compareceu,
            formatCurrency(p.receita),
          ];
        }),
      );
    }

    downloadCsv(
      `relatorio-agenda-${from}-${to}.csv`,
      ["Métrica/Item", "Valor/Detalhes", "", "", ""],
      rows,
    );
  };

  const assigneeOptions = useMemo(() => {
    const items = (attendance.length > 0 ? attendance : prevAttendance).map((r) => ({
      id: r.assignee_id,
      name: r.assignee_name || r.assignee_id,
    }));
    return items.filter((it, idx, arr) => arr.findIndex((x) => x.id === it.id) === idx);
  }, [attendance, prevAttendance]);

  const attendanceTotals = useMemo(
    () =>
      attendance.reduce(
        (acc, r) => {
          acc.chats_opened += r.chats_opened;
          acc.chats_resolved += r.chats_resolved;
          acc.messages_inbound += r.messages_inbound;
          acc.messages_outbound += r.messages_outbound;
          acc.messages_ai += r.messages_ai;
          return acc;
        },
        { chats_opened: 0, chats_resolved: 0, messages_inbound: 0, messages_outbound: 0, messages_ai: 0 },
      ),
    [attendance],
  );

  const prevAttendanceTotals = useMemo(
    () =>
      prevAttendance.reduce(
        (acc, r) => {
          acc.chats_opened += r.chats_opened;
          acc.chats_resolved += r.chats_resolved;
          acc.messages_inbound += r.messages_inbound;
          acc.messages_outbound += r.messages_outbound;
          acc.messages_ai += r.messages_ai;
          return acc;
        },
        { chats_opened: 0, chats_resolved: 0, messages_inbound: 0, messages_outbound: 0, messages_ai: 0 },
      ),
    [prevAttendance],
  );

  const funnelTotals = useMemo(
    () =>
      sortedFunnelRows.reduce(
        (acc, r) => {
          acc.current_count += r.current_count;
          acc.entered_in_period += r.entered_in_period;
          acc.won_in_period += r.won_in_period;
          acc.lost_in_period += r.lost_in_period;
          return acc;
        },
        { current_count: 0, entered_in_period: 0, won_in_period: 0, lost_in_period: 0 },
      ),
    [sortedFunnelRows],
  );

  const sellersTotals = useMemo(
    () =>
      crmSellers.reduce(
        (acc, r) => {
          acc.open_count += r.open_count;
          acc.pipeline_value += r.pipeline_value;
          acc.won_count += r.won_count;
          acc.won_value += r.won_value;
          acc.lost_count += r.lost_count;
          acc.stale_count += r.stale_count;
          return acc;
        },
        { open_count: 0, pipeline_value: 0, won_count: 0, won_value: 0, lost_count: 0, stale_count: 0 },
      ),
    [crmSellers],
  );

  const salesTotals = useMemo(
    () =>
      sellerSales.reduce(
        (acc, r) => {
          acc.sales_count += r.sales_count;
          acc.sales_total += r.sales_total;
          acc.goal_amount += r.goal_amount;
          return acc;
        },
        { sales_count: 0, sales_total: 0, goal_amount: 0 },
      ),
    [sellerSales],
  );

  const handleExportAtendimento = async () => {
    try {
      const csv = await exportAttendanceCsv(fromDate, toDate);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `atendimento-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Erro ao exportar",
        description: e instanceof Error ? e.message : "Falha no export",
        variant: "destructive",
      });
    }
  };

  const exportFunnel = () => {
    downloadCsv(
      `funil-${funnelId}-${from}-${to}.csv`,
      [
        "Etapa",
        "No funil agora",
        "Entraram no periodo",
        "Conversao %",
        "Media dias",
        "Mediana dias",
        "Vendidos",
        "Perdidos",
      ],
      sortedFunnelRows.map((r) => {
        const v = funnelVelocityByStage.get(r.stage_id);
        return [
          funnelStageTitleIn(funnels, funnelId, r.stage_id),
          r.current_count,
          r.entered_in_period,
          r.conversion_pct ?? "",
          v?.avg_days ?? "",
          v?.median_days ?? "",
          r.won_in_period,
          r.lost_in_period,
        ];
      }),
    );
  };

  const exportStale = () => {
    downloadCsv(
      `parados-${funnelId}.csv`,
      ["Negocio", "Etapa", "Responsavel", "Dias parado", "Valor", "Ultima interacao"],
      staleRows.map((r) => [
        r.title,
        funnelStageTitleIn(funnels, r.funnel_id, r.stage_id),
        r.assignee_name ?? "Pool",
        r.days_without_touch,
        r.total_value,
        r.last_interaction_at ?? "",
      ]),
    );
  };

  const exportCrmSellers = () => {
    downloadCsv(
      `performance-crm-${funnelId}-${from}-${to}.csv`,
      [
        "Responsavel",
        "Abertos",
        "Pipeline",
        "Vendas",
        "Faturamento",
        "Perdas",
        "Win-rate %",
        "Parados",
        "Media dias parado",
      ],
      crmSellers.map((r) => {
        const closed = r.won_count + r.lost_count;
        const winRate = closed > 0 ? Math.round((r.won_count / closed) * 1000) / 10 : "";
        return [
          r.assignee_name,
          r.open_count,
          r.pipeline_value,
          r.won_count,
          r.won_value,
          r.lost_count,
          winRate,
          r.stale_count,
          r.avg_days_without_touch ?? "",
        ];
      }),
    );
  };

  const exportLostReasons = () => {
    downloadCsv(
      `motivos-perda-${funnelId}-${from}-${to}.csv`,
      ["Motivo", "Quantidade", "Valor total"],
      lostReasons.map((r) => [r.reason, r.count, r.total_value]),
    );
  };

  const lostReasonsTotal = useMemo(
    () => lostReasons.reduce((acc, r) => ({ count: acc.count + r.count, total_value: acc.total_value + r.total_value }), { count: 0, total_value: 0 }),
    [lostReasons],
  );

  const exportSales = () => {
    downloadCsv(
      `vendas-${salesYear}-${String(salesMonth).padStart(2, "0")}.csv`,
      ["Vendedor", "Vendas", "Faturamento", "Meta", "% meta"],
      sellerSales.map((r) => [r.seller_name, r.sales_count, r.sales_total, r.goal_amount, r.goal_pct ?? ""]),
    );
  };

  const funnelChartData = useMemo(
    () =>
      sortedFunnelRows.map((r) => ({
        stage: funnelStageTitleIn(funnels, funnelId, r.stage_id),
        atual: r.current_count,
        entradas: r.entered_in_period,
        vendidos: r.won_in_period,
        perdidos: r.lost_in_period,
      })),
    [sortedFunnelRows, funnels, funnelId],
  );

  const funnelVelocityByStage = useMemo(() => {
    const rows = funnelVelocityQ.data ?? [];
    const map = new Map<string, (typeof rows)[number]>();
    for (const v of rows) {
      map.set(v.stage_id, v);
    }
    return map;
  }, [funnelVelocityQ.data]);

  const funnelVelocityChartData = useMemo(
    () =>
      sortedFunnelRows
        .map((r) => {
          const v = funnelVelocityByStage.get(r.stage_id);
          return {
            stage: funnelStageTitleIn(funnels, funnelId, r.stage_id),
            avg_days: v?.avg_days ?? 0,
            median_days: v?.median_days ?? 0,
            transitions: v?.transitions ?? 0,
          };
        })
        .filter((r) => r.transitions > 0),
    [sortedFunnelRows, funnelVelocityByStage, funnels, funnelId],
  );

  const salesChartData = useMemo(
    () =>
      sellerSales.map((r) => ({
        vendedor: r.seller_name,
        faturamento: r.sales_total,
        meta: r.goal_amount,
      })),
    [sellerSales],
  );

  const attendanceChartData = useMemo(
    () =>
      attendanceSort.sorted
        .filter((r) => r.chats_opened + r.messages_outbound > 0)
        .slice(0, 10)
        .map((r) => ({
          atendente: r.assignee_name || "—",
          recebidas: r.messages_inbound,
          enviadas: r.messages_outbound,
          ia: r.messages_ai,
        })),
    [attendanceSort.sorted],
  );

  const sellersChartData = useMemo(
    () =>
      sellersSort.sorted.slice(0, 10).map((r) => ({
        vendedor: r.assignee_name,
        pipeline: r.pipeline_value,
        faturamento: r.won_value,
      })),
    [sellersSort.sorted],
  );

  const showDateInputs = period === "custom";

  return (
    <PageShell contentClassName="flex flex-col space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Painel</h1>
        </div>
        {tab !== "painel" ? (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="period" className="text-xs">Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as QuickPeriod)}>
              <SelectTrigger id="period" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {QUICK_PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {showDateInputs ? (
            <>
              <div>
                <Label htmlFor="from" className="text-xs">De</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
              </div>
              <div>
                <Label htmlFor="to" className="text-xs">Até</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              {from} <span className="px-1">→</span> {to}
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Comparar com período anterior
          </label>
        </div>
        ) : null}
      </div>
      {tab !== "painel" && compare ? (
        <p className="text-xs text-muted-foreground">
          Comparando com <strong>{prev.from}</strong> → <strong>{prev.to}</strong>
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex flex-col gap-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="painel" className="gap-1.5 rounded-lg px-3 data-[state=active]:shadow-sm">
            <Gauge className="h-3.5 w-3.5" />
            Tempo real
          </TabsTrigger>
          <TabsTrigger value="atendimento" className="rounded-lg px-3 data-[state=active]:shadow-sm">Atendimento</TabsTrigger>
          <TabsTrigger value="funil" className="rounded-lg px-3 data-[state=active]:shadow-sm">Funil CRM</TabsTrigger>
          <TabsTrigger value="forecast" className="rounded-lg px-3 data-[state=active]:shadow-sm">Previsão</TabsTrigger>
          <TabsTrigger value="parados" className="rounded-lg px-3 data-[state=active]:shadow-sm">Parados</TabsTrigger>
          <TabsTrigger value="sla" className="rounded-lg px-3 data-[state=active]:shadow-sm">SLA comercial</TabsTrigger>
          <TabsTrigger value="crm-vendedores" className="rounded-lg px-3 data-[state=active]:shadow-sm">Performance CRM</TabsTrigger>
          <TabsTrigger value="vendas" className="rounded-lg px-3 data-[state=active]:shadow-sm">Vendas Trendii</TabsTrigger>
          <TabsTrigger value="perdas" className="rounded-lg px-3 data-[state=active]:shadow-sm">Motivos de perda</TabsTrigger>
          <TabsTrigger value="tarefas" className="rounded-lg px-3 data-[state=active]:shadow-sm">Tarefas</TabsTrigger>
          <TabsTrigger value="agendas" className="rounded-lg px-3 data-[state=active]:shadow-sm">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="painel" className="mt-0">
          <PainelAoVivo />
        </TabsContent>

        <TabsContent value="atendimento" className="mt-0 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label htmlFor="att-assignee" className="text-xs">Atendente</Label>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger id="att-assignee" className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  {assigneeOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void handleExportAtendimento()}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          {compare ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MetricTile label="Chats abertos" value={attendanceTotals.chats_opened} delta={{ current: attendanceTotals.chats_opened, prev: prevAttendanceTotals.chats_opened }} />
              <MetricTile label="Resolvidos" value={attendanceTotals.chats_resolved} delta={{ current: attendanceTotals.chats_resolved, prev: prevAttendanceTotals.chats_resolved }} />
              <MetricTile label="Recebidas" value={attendanceTotals.messages_inbound} delta={{ current: attendanceTotals.messages_inbound, prev: prevAttendanceTotals.messages_inbound }} />
              <MetricTile label="Enviadas" value={attendanceTotals.messages_outbound} delta={{ current: attendanceTotals.messages_outbound, prev: prevAttendanceTotals.messages_outbound }} />
              <MetricTile label="IA" value={attendanceTotals.messages_ai} delta={{ current: attendanceTotals.messages_ai, prev: prevAttendanceTotals.messages_ai }} />
            </div>
          ) : null}
          {!attendanceQ.isError && attendanceChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Volume de mensagens (top 10)</CardTitle>
                <CardDescription>Recebidas, enviadas e respostas via IA por atendente.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="atendente" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RechartsTooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="recebidas" name="Recebidas" fill={CHART_COLORS[5]} />
                      <Bar dataKey="enviadas" name="Enviadas" fill={CHART_COLORS[0]} />
                      <Bar dataKey="ia" name="IA" fill={CHART_COLORS[3]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Resumo por atendente
              </CardTitle>
              <CardDescription>Chats e mensagens no período; SLA de 1ª resposta quando disponível.</CardDescription>
            </CardHeader>
            <CardContent>
              {attendanceQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : attendanceQ.isError ? (
                <ErrorState error={attendanceQ.error} onRetry={() => void attendanceQ.refetch()} />
              ) : attendance.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <SortableTh k="assignee_name" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>Nome</SortableTh>
                          <SortableTh k="chats_opened" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>Chats abertos</SortableTh>
                          <SortableTh k="chats_resolved" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>Resolvidos</SortableTh>
                          <SortableTh k="messages_inbound" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>Recebidas</SortableTh>
                          <SortableTh k="messages_outbound" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>Enviadas</SortableTh>
                          <SortableTh k="messages_ai" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort}>IA</SortableTh>
                          <SortableTh k="avg_first_response_minutes" sortKey={attendanceSort.sortKey} sortDir={attendanceSort.sortDir} onSort={attendanceSort.toggleSort} className="pr-0">1ª resposta (média)</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceSort.sorted.map((row) => (
                          <tr key={row.assignee_id} className="border-b border-border/60">
                            <td className="py-2 pr-4 font-medium">{row.assignee_name || "—"}</td>
                            <td className="py-2 pr-4">{row.chats_opened}</td>
                            <td className="py-2 pr-4">{row.chats_resolved}</td>
                            <td className="py-2 pr-4">{row.messages_inbound}</td>
                            <td className="py-2 pr-4">{row.messages_outbound}</td>
                            <td className="py-2 pr-4">{row.messages_ai}</td>
                            <td className="py-2">{row.avg_first_response_minutes != null ? `${row.avg_first_response_minutes} min` : "—"}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 pr-4">{attendanceTotals.chats_opened}</td>
                          <td className="py-2 pr-4">{attendanceTotals.chats_resolved}</td>
                          <td className="py-2 pr-4">{attendanceTotals.messages_inbound}</td>
                          <td className="py-2 pr-4">{attendanceTotals.messages_outbound}</td>
                          <td className="py-2 pr-4">{attendanceTotals.messages_ai}</td>
                          <td className="py-2">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {attendanceSort.sorted.map((row) => (
                      <div key={row.assignee_id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                        <p className="mb-2 font-medium text-foreground">{row.assignee_name || "—"}</p>
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <div><dt className="text-muted-foreground">Chats abertos</dt><dd>{row.chats_opened}</dd></div>
                          <div><dt className="text-muted-foreground">Resolvidos</dt><dd>{row.chats_resolved}</dd></div>
                          <div><dt className="text-muted-foreground">Recebidas</dt><dd>{row.messages_inbound}</dd></div>
                          <div><dt className="text-muted-foreground">Enviadas</dt><dd>{row.messages_outbound}</dd></div>
                          <div><dt className="text-muted-foreground">IA</dt><dd>{row.messages_ai}</dd></div>
                          <div><dt className="text-muted-foreground">1ª resposta</dt><dd>{row.avg_first_response_minutes != null ? `${row.avg_first_response_minutes} min` : "—"}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funil" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportFunnel} disabled={sortedFunnelRows.length === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          {funnelQ.isError ? (
            <ErrorState error={funnelQ.error} onRetry={() => void funnelQ.refetch()} />
          ) : null}
          {!funnelQ.isError && funnelChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Distribuição por etapa</CardTitle>
                <CardDescription>Cards atuais e entradas no período.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RechartsTooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="atual" name="No funil agora" fill={CHART_COLORS[0]} />
                      <Bar dataKey="entradas" name="Entraram" fill={CHART_COLORS[1]} />
                      <Bar dataKey="vendidos" name="Vendidos" fill={CHART_COLORS[2]} />
                      <Bar dataKey="perdidos" name="Perdidos" fill={CHART_COLORS[4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {funnelVelocityChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Velocidade por etapa</CardTitle>
                <CardDescription>
                  Tempo médio (e mediano) que o negócio passou em cada etapa antes de avançar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelVelocityChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} label={{ value: "dias", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                      <RechartsTooltip formatter={(value: number) => `${value} dias`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="avg_days" name="Média" fill={CHART_COLORS[3] ?? CHART_COLORS[0]} />
                      <Bar dataKey="median_days" name="Mediana" fill={CHART_COLORS[1]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversão e velocidade por etapa</CardTitle>
              <CardDescription>
                Cards atuais, entradas no período, taxa em relação à etapa anterior e tempo médio em cada etapa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnelQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : sortedFunnelRows.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <SortableTh k="stage_order" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort}>Etapa</SortableTh>
                          <SortableTh k="current_count" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort}>No funil agora</SortableTh>
                          <SortableTh k="entered_in_period" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort}>Entraram no período</SortableTh>
                          <SortableTh k="conversion_pct" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort}>Conversão</SortableTh>
                          <th className="py-2 pr-4 font-normal">Média de dias</th>
                          <th className="py-2 pr-4 font-normal">Mediana</th>
                          <SortableTh k="won_in_period" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort}>Vendidos</SortableTh>
                          <SortableTh k="lost_in_period" sortKey={funnelSort.sortKey} sortDir={funnelSort.sortDir} onSort={funnelSort.toggleSort} className="pr-0">Perdidos</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {funnelSort.sorted.map((row) => {
                          const v = funnelVelocityByStage.get(row.stage_id);
                          return (
                            <tr key={row.stage_id} className="border-b border-border/60">
                              <td className="py-2 pr-4 font-medium">{funnelStageTitleIn(funnels, funnelId, row.stage_id)}</td>
                              <td className="py-2 pr-4">{row.current_count}</td>
                              <td className="py-2 pr-4">{row.entered_in_period}</td>
                              <td className="py-2 pr-4">{row.conversion_pct != null ? `${row.conversion_pct}%` : "—"}</td>
                              <td className="py-2 pr-4">{v?.avg_days != null ? `${v.avg_days} d` : "—"}</td>
                              <td className="py-2 pr-4">{v?.median_days != null ? `${v.median_days} d` : "—"}</td>
                              <td className="py-2 pr-4">{row.won_in_period}</td>
                              <td className="py-2">{row.lost_in_period}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 pr-4">{funnelTotals.current_count}</td>
                          <td className="py-2 pr-4">{funnelTotals.entered_in_period}</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4">—</td>
                          <td className="py-2 pr-4">{funnelTotals.won_in_period}</td>
                          <td className="py-2">{funnelTotals.lost_in_period}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {funnelSort.sorted.map((row) => {
                      const v = funnelVelocityByStage.get(row.stage_id);
                      return (
                        <div key={row.stage_id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                          <p className="mb-2 font-medium text-foreground">{funnelStageTitleIn(funnels, funnelId, row.stage_id)}</p>
                          <dl className="grid grid-cols-2 gap-2 text-xs">
                            <div><dt className="text-muted-foreground">Atual</dt><dd>{row.current_count}</dd></div>
                            <div><dt className="text-muted-foreground">Entraram</dt><dd>{row.entered_in_period}</dd></div>
                            <div><dt className="text-muted-foreground">Conversão</dt><dd>{row.conversion_pct != null ? `${row.conversion_pct}%` : "—"}</dd></div>
                            <div><dt className="text-muted-foreground">Média</dt><dd>{v?.avg_days != null ? `${v.avg_days} d` : "—"}</dd></div>
                            <div><dt className="text-muted-foreground">Mediana</dt><dd>{v?.median_days != null ? `${v.median_days} d` : "—"}</dd></div>
                            <div><dt className="text-muted-foreground">Vendidos</dt><dd>{row.won_in_period}</dd></div>
                            <div><dt className="text-muted-foreground">Perdidos</dt><dd>{row.lost_in_period}</dd></div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="mt-0 space-y-4">
          <ForecastReport
            funnels={funnels}
            funnelId={funnelId}
            enabled={tab === "forecast"}
            funnelSelect={
              <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
            }
          />
        </TabsContent>

        <TabsContent value="parados" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportStale} disabled={staleRows.length === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile label="Em aberto" value={staleSummary?.open_negotiations ?? "—"} />
            <MetricTile
              label={`Parados (${staleSummary?.stale_threshold_days ?? 7}+ dias)`}
              value={staleSummary?.stale_count ?? "—"}
              variant={(staleSummary?.stale_count ?? 0) > 0 ? "warning" : "default"}
            />
            <MetricTile
              label="Sem tarefa futura"
              value={staleSummary?.no_future_task_count ?? "—"}
              variant={(staleSummary?.no_future_task_count ?? 0) > 0 ? "warning" : "default"}
            />
            <MetricTile
              label="Parados no pool"
              value={staleSummary?.pool_unassigned_stale ?? "—"}
              hint="Sem responsável"
            />
          </div>
          {staleRows.length > 0 ? (
            <Card className="border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)]/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-[var(--crm-amber)]" aria-hidden />
                  Reanimar agora
                </CardTitle>
                <CardDescription>
                  Sugestões de ação para destravar o que está parado neste funil.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  disabled={staleNoTaskRows.length === 0 || staleReanimBusy}
                  onClick={() => void reanimateAllMissingTask()}
                >
                  <CalendarPlus className="h-4 w-4" />
                  {staleNoTaskRows.length === 0
                    ? "Sem follow-ups pendentes"
                    : `Criar follow-up para ${staleNoTaskRows.length} sem tarefa`}
                </Button>
                {stalePoolRows.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    asChild
                  >
                    <Link to={`/crm?owner=pool&alerts=stale&funnel=${funnelId}`}>
                      <Users className="h-4 w-4" />
                      {`Distribuir ${stalePoolRows.length} do pool no CRM`}
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Negócios que precisam de atenção</CardTitle>
              <CardDescription>
                Mesmos critérios dos alertas do Kanban: sem interação há N dias ou sem tarefa agendada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {staleQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : staleQ.isError ? (
                <ErrorState error={staleQ.error} onRetry={() => void staleQ.refetch()} />
              ) : staleRows.length === 0 ? (
                <EmptyState label="Nenhum negócio parado neste funil." />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <SortableTh k="title" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Negócio</SortableTh>
                          <SortableTh k="stage_id" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Etapa</SortableTh>
                          <SortableTh k="assignee_name" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Responsável</SortableTh>
                          <SortableTh k="days_without_touch" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Dias parado</SortableTh>
                          <SortableTh k="total_value" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Valor</SortableTh>
                          <SortableTh k="last_interaction_at" sortKey={staleSort.sortKey} sortDir={staleSort.sortDir} onSort={staleSort.toggleSort}>Última interação</SortableTh>
                          <th className="py-2 pr-0 font-normal">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staleSort.sorted.map((row) => {
                          const isPool = !row.assignee_id;
                          return (
                            <tr key={row.negotiation_id} className="border-b border-border/60">
                              <td className="py-2 pr-4">
                                <Link to={`/crm/negociacao/${row.negotiation_id}`} className="font-medium text-primary hover:underline">
                                  {row.title}
                                </Link>
                                {row.missing_future_task ? <span className="ml-2 text-[10px] font-semibold text-warning">sem tarefa</span> : null}
                              </td>
                              <td className="py-2 pr-4">{funnelStageTitleIn(funnels, row.funnel_id, row.stage_id)}</td>
                              <td className="py-2 pr-4">{row.assignee_name ?? "Pool"}</td>
                              <td className="py-2 pr-4">{row.days_without_touch}</td>
                              <td className="py-2 pr-4">{formatCurrency(row.total_value)}</td>
                              <td className="py-2 pr-4">{formatDateTime(row.last_interaction_at)}</td>
                              <td className="py-2 pr-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1.5 px-2 text-xs"
                                    disabled={createCrmTaskMut.isPending || staleReanimBusy}
                                    onClick={() =>
                                      void createReanimateTask(
                                        row.negotiation_id,
                                        row.assignee_id ?? null,
                                        "Reanimar contato",
                                        0,
                                      )
                                    }
                                  >
                                    <CalendarPlus className="h-3.5 w-3.5" />
                                    Tarefa hoje
                                  </Button>
                                  {isPool ? (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-7 gap-1.5 px-2 text-xs"
                                        disabled={
                                          claimCrmNegotiationMut.isPending || !profile?.id
                                        }
                                        onClick={() => void claimStaleNegotiation(row.negotiation_id)}
                                      >
                                        <Hand className="h-3.5 w-3.5" />
                                        Assumir
                                      </Button>
                                      <Popover
                                        open={staleAssignOpen === row.negotiation_id}
                                        onOpenChange={(o) => {
                                          setStaleAssignOpen(o ? row.negotiation_id : null);
                                          if (!o) setStaleAssignSearch("");
                                        }}
                                      >
                                        <PopoverTrigger asChild>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-7 gap-1.5 px-2 text-xs"
                                          >
                                            <Users className="h-3.5 w-3.5" />
                                            Atribuir
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="end"
                                          className="w-64 p-0"
                                        >
                                          <div className="border-b p-2">
                                            <div className="relative">
                                              <Search
                                                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                                                aria-hidden
                                              />
                                              <Input
                                                autoFocus
                                                value={staleAssignSearch}
                                                onChange={(e) =>
                                                  setStaleAssignSearch(e.target.value)
                                                }
                                                placeholder="Atribuir a..."
                                                className="h-8 pl-8 text-xs"
                                              />
                                            </div>
                                          </div>
                                          <ul className="max-h-56 overflow-y-auto py-1">
                                            {stalePool
                                              .filter((a) =>
                                                a.name
                                                  .toLowerCase()
                                                  .includes(
                                                    staleAssignSearch.trim().toLowerCase(),
                                                  ),
                                              )
                                              .map((a) => (
                                                <li key={a.id}>
                                                  <button
                                                    type="button"
                                                    className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-muted/60"
                                                    onClick={() =>
                                                      void assignStaleNegotiation(
                                                        row.negotiation_id,
                                                        a.id,
                                                      )
                                                    }
                                                  >
                                                    {a.name}
                                                  </button>
                                                </li>
                                              ))}
                                            {stalePool.length === 0 ? (
                                              <li className="px-3 py-2 text-xs text-muted-foreground">
                                                Nenhum atendente disponível.
                                              </li>
                                            ) : null}
                                          </ul>
                                        </PopoverContent>
                                      </Popover>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {staleSort.sorted.map((row) => {
                      const isPool = !row.assignee_id;
                      return (
                        <div key={row.negotiation_id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <Link to={`/crm/negociacao/${row.negotiation_id}`} className="font-medium text-primary hover:underline">
                              {row.title}
                            </Link>
                            {row.missing_future_task ? <span className="text-[10px] font-semibold text-warning">sem tarefa</span> : null}
                          </div>
                          <dl className="grid grid-cols-2 gap-2 text-xs">
                            <div><dt className="text-muted-foreground">Etapa</dt><dd>{funnelStageTitleIn(funnels, row.funnel_id, row.stage_id)}</dd></div>
                            <div><dt className="text-muted-foreground">Responsável</dt><dd>{row.assignee_name ?? "Pool"}</dd></div>
                            <div><dt className="text-muted-foreground">Dias parado</dt><dd>{row.days_without_touch}</dd></div>
                            <div><dt className="text-muted-foreground">Valor</dt><dd>{formatCurrency(row.total_value)}</dd></div>
                            <div className="col-span-2"><dt className="text-muted-foreground">Última interação</dt><dd>{formatDateTime(row.last_interaction_at)}</dd></div>
                          </dl>
                          <Separator className="my-2" />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1.5 px-2 text-xs"
                              disabled={createCrmTaskMut.isPending || staleReanimBusy}
                              onClick={() =>
                                void createReanimateTask(
                                  row.negotiation_id,
                                  row.assignee_id ?? null,
                                  "Reanimar contato",
                                  0,
                                )
                              }
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              Tarefa hoje
                            </Button>
                            {isPool ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 gap-1.5 px-2 text-xs"
                                disabled={claimCrmNegotiationMut.isPending || !profile?.id}
                                onClick={() => void claimStaleNegotiation(row.negotiation_id)}
                              >
                                <Hand className="h-3.5 w-3.5" />
                                Assumir
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Exibindo {staleRows.length} {staleRows.length === 1 ? "item" : "itens"}</span>
                    {staleRows.length >= staleLimit ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => setStaleLimit((n) => n + 50)}>
                        Carregar mais
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sla" className="mt-0 space-y-4">
          <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
          {crmSlaQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : crmSlaQ.isError ? (
            <ErrorState error={crmSlaQ.error} onRetry={() => void crmSlaQ.refetch()} />
          ) : crmSla ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricTile label="Negócios em aberto" value={crmSla.open_negotiations} delta={compare && prevSla ? { current: crmSla.open_negotiations, prev: prevSla.open_negotiations } : null} />
                <MetricTile label="Parados" value={crmSla.stale_negotiations} variant={crmSla.stale_negotiations > 0 ? "warning" : "default"} delta={compare && prevSla ? { current: crmSla.stale_negotiations, prev: prevSla.stale_negotiations, invertColor: true } : null} />
                <MetricTile label="Sem tarefa futura" value={crmSla.no_future_task_negotiations} delta={compare && prevSla ? { current: crmSla.no_future_task_negotiations, prev: prevSla.no_future_task_negotiations, invertColor: true } : null} />
                <MetricTile label="Tarefas atrasadas" value={crmSla.overdue_crm_tasks} variant={crmSla.overdue_crm_tasks > 0 ? "danger" : "default"} delta={compare && prevSla ? { current: crmSla.overdue_crm_tasks, prev: prevSla.overdue_crm_tasks, invertColor: true } : null} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">SLA de 1ª resposta (chats do CRM)</CardTitle>
                  <CardDescription>
                    Meta configurada: {crmSla.sla_first_response_minutes} minutos · chats com negócio primário vinculado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricTile label="Aguardando 1ª resposta" value={crmSla.chats_awaiting_first_response} delta={compare && prevSla ? { current: crmSla.chats_awaiting_first_response, prev: prevSla.chats_awaiting_first_response, invertColor: true } : null} />
                    <MetricTile label="SLA estourado" value={crmSla.chats_sla_breached} variant={crmSla.chats_sla_breached > 0 ? "danger" : "default"} delta={compare && prevSla ? { current: crmSla.chats_sla_breached, prev: prevSla.chats_sla_breached, invertColor: true } : null} />
                    <MetricTile label="Respondidos no período" value={crmSla.chats_first_response_in_period} delta={compare && prevSla ? { current: crmSla.chats_first_response_in_period, prev: prevSla.chats_first_response_in_period } : null} />
                    <MetricTile
                      label="Média 1ª resposta"
                      value={crmSla.avg_first_response_minutes != null ? `${crmSla.avg_first_response_minutes} min` : "—"}
                      delta={compare && prevSla && crmSla.avg_first_response_minutes != null && prevSla.avg_first_response_minutes != null ? { current: crmSla.avg_first_response_minutes, prev: prevSla.avg_first_response_minutes, invertColor: true } : null}
                    />
                  </div>
                  {crmSla.chats_sla_breached + crmSla.chats_first_response_in_period > 0 ? (
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { categoria: "Dentro do SLA", valor: Math.max(0, crmSla.chats_first_response_in_period - crmSla.chats_sla_breached) },
                            { categoria: "SLA estourado", valor: crmSla.chats_sla_breached },
                            { categoria: "Aguardando", valor: crmSla.chats_awaiting_first_response },
                          ]}
                          layout="vertical"
                        >
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="categoria" tick={{ fontSize: 11 }} width={140} />
                          <RechartsTooltip />
                          <Bar dataKey="valor">
                            {[CHART_COLORS[2], CHART_COLORS[4], CHART_COLORS[3]].map((c, i) => (
                              <Cell key={i} fill={c} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4" />
                    Fechamentos no período
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <MetricTile label="Vendidos" value={crmSla.won_in_period} delta={compare && prevSla ? { current: crmSla.won_in_period, prev: prevSla.won_in_period } : null} />
                  <MetricTile label="Perdidos" value={crmSla.lost_in_period} delta={compare && prevSla ? { current: crmSla.lost_in_period, prev: prevSla.lost_in_period, invertColor: true } : null} />
                  <MetricTile
                    label="Média dias até venda"
                    value={crmSla.avg_days_to_close != null ? `${crmSla.avg_days_to_close} d` : "—"}
                    delta={compare && prevSla && crmSla.avg_days_to_close != null && prevSla.avg_days_to_close != null ? { current: crmSla.avg_days_to_close, prev: prevSla.avg_days_to_close, invertColor: true } : null}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState label="Sem dados de SLA para o período." />
          )}
        </TabsContent>

        <TabsContent value="crm-vendedores" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportCrmSellers} disabled={crmSellers.length === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          {!crmSellersQ.isError && sellersChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pipeline vs Faturamento (top 10)</CardTitle>
                <CardDescription>Valor em aberto e fechado por responsável.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sellersChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="vendedor" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(Number(v))} width={90} />
                      <RechartsTooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="pipeline" name="Pipeline" fill={CHART_COLORS[1]} />
                      <Bar dataKey="faturamento" name="Faturamento" fill={CHART_COLORS[2]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance por responsável (CRM)</CardTitle>
              <CardDescription>
                Pipeline aberto, ganhos e perdas no período, negócios parados e média de dias sem contato.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {crmSellersQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : crmSellersQ.isError ? (
                <ErrorState error={crmSellersQ.error} onRetry={() => void crmSellersQ.refetch()} />
              ) : crmSellers.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <SortableTh k="assignee_name" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Responsável</SortableTh>
                          <SortableTh k="open_count" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Abertos</SortableTh>
                          <SortableTh k="pipeline_value" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Pipeline</SortableTh>
                          <SortableTh k="won_count" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Vendas</SortableTh>
                          <SortableTh k="won_value" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Faturamento</SortableTh>
                          <SortableTh k="lost_count" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Perdas</SortableTh>
                          <th className="py-2 pr-4 font-normal">Win-rate</th>
                          <SortableTh k="stale_count" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort}>Parados</SortableTh>
                          <SortableTh k="avg_days_without_touch" sortKey={sellersSort.sortKey} sortDir={sellersSort.sortDir} onSort={sellersSort.toggleSort} className="pr-0">Média dias parado</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {sellersSort.sorted.map((row) => {
                          const closed = row.won_count + row.lost_count;
                          const winRate = closed > 0 ? Math.round((row.won_count / closed) * 1000) / 10 : null;
                          return (
                            <tr key={row.assignee_id} className="border-b border-border/60">
                              <td className="py-2 pr-4 font-medium">{row.assignee_name}</td>
                              <td className="py-2 pr-4">{row.open_count}</td>
                              <td className="py-2 pr-4">{formatCurrency(row.pipeline_value)}</td>
                              <td className="py-2 pr-4">{row.won_count}</td>
                              <td className="py-2 pr-4">{formatCurrency(row.won_value)}</td>
                              <td className="py-2 pr-4">{row.lost_count}</td>
                              <td className="py-2 pr-4">{winRate != null ? `${winRate}%` : "—"}</td>
                              <td className="py-2 pr-4">{row.stale_count}</td>
                              <td className="py-2">{row.avg_days_without_touch != null ? `${row.avg_days_without_touch} d` : "—"}</td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 pr-4">{sellersTotals.open_count}</td>
                          <td className="py-2 pr-4">{formatCurrency(sellersTotals.pipeline_value)}</td>
                          <td className="py-2 pr-4">{sellersTotals.won_count}</td>
                          <td className="py-2 pr-4">{formatCurrency(sellersTotals.won_value)}</td>
                          <td className="py-2 pr-4">{sellersTotals.lost_count}</td>
                          <td className="py-2 pr-4">{(() => {
                            const closed = sellersTotals.won_count + sellersTotals.lost_count;
                            return closed > 0 ? `${Math.round((sellersTotals.won_count / closed) * 1000) / 10}%` : "—";
                          })()}</td>
                          <td className="py-2 pr-4">{sellersTotals.stale_count}</td>
                          <td className="py-2">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {sellersSort.sorted.map((row) => {
                      const closed = row.won_count + row.lost_count;
                      const winRate = closed > 0 ? Math.round((row.won_count / closed) * 1000) / 10 : null;
                      return (
                        <div key={row.assignee_id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                          <p className="mb-2 font-medium text-foreground">{row.assignee_name}</p>
                          <dl className="grid grid-cols-2 gap-2 text-xs">
                            <div><dt className="text-muted-foreground">Abertos</dt><dd>{row.open_count}</dd></div>
                            <div><dt className="text-muted-foreground">Pipeline</dt><dd>{formatCurrency(row.pipeline_value)}</dd></div>
                            <div><dt className="text-muted-foreground">Vendas</dt><dd>{row.won_count}</dd></div>
                            <div><dt className="text-muted-foreground">Faturamento</dt><dd>{formatCurrency(row.won_value)}</dd></div>
                            <div><dt className="text-muted-foreground">Perdas</dt><dd>{row.lost_count}</dd></div>
                            <div><dt className="text-muted-foreground">Win-rate</dt><dd>{winRate != null ? `${winRate}%` : "—"}</dd></div>
                            <div><dt className="text-muted-foreground">Parados</dt><dd>{row.stale_count}</dd></div>
                            <div className="col-span-2"><dt className="text-muted-foreground">Média dias parado</dt><dd>{row.avg_days_without_touch != null ? `${row.avg_days_without_touch} d` : "—"}</dd></div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendas" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MonthYearSelect
              year={salesYear}
              month={salesMonth}
              onChange={({ year, month }) => {
                setSalesYear(year);
                setSalesMonth(month);
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportSales} disabled={sellerSales.length === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          {salesQ.isError ? (
            <ErrorState error={salesQ.error} onRetry={() => void salesQ.refetch()} />
          ) : null}
          {!salesQ.isError && salesChartData.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Faturamento vs Meta</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="vendedor" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(Number(v))} width={90} />
                      <RechartsTooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="meta" name="Meta" fill={CHART_COLORS[6]} />
                      <Bar dataKey="faturamento" name="Faturamento" fill={CHART_COLORS[0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vendas Trendii — {salesMonth}/{salesYear}</CardTitle>
              <CardDescription>Metas e faturamento registrados no módulo de vendas.</CardDescription>
            </CardHeader>
            <CardContent>
              {salesQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : sellerSales.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <SortableTh k="seller_name" sortKey={salesSort.sortKey} sortDir={salesSort.sortDir} onSort={salesSort.toggleSort}>Vendedor</SortableTh>
                          <SortableTh k="sales_count" sortKey={salesSort.sortKey} sortDir={salesSort.sortDir} onSort={salesSort.toggleSort}>Vendas</SortableTh>
                          <SortableTh k="sales_total" sortKey={salesSort.sortKey} sortDir={salesSort.sortDir} onSort={salesSort.toggleSort}>Faturamento</SortableTh>
                          <SortableTh k="goal_amount" sortKey={salesSort.sortKey} sortDir={salesSort.sortDir} onSort={salesSort.toggleSort}>Meta</SortableTh>
                          <SortableTh k="goal_pct" sortKey={salesSort.sortKey} sortDir={salesSort.sortDir} onSort={salesSort.toggleSort} className="pr-0">% meta</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {salesSort.sorted.map((row) => (
                          <tr key={row.seller_id} className="border-b border-border/60">
                            <td className="py-2 pr-4 font-medium">{row.seller_name}</td>
                            <td className="py-2 pr-4">{row.sales_count}</td>
                            <td className="py-2 pr-4">{formatCurrency(row.sales_total)}</td>
                            <td className="py-2 pr-4">{formatCurrency(row.goal_amount)}</td>
                            <td className="py-2">{row.goal_pct != null ? `${row.goal_pct}%` : "—"}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 pr-4">{salesTotals.sales_count}</td>
                          <td className="py-2 pr-4">{formatCurrency(salesTotals.sales_total)}</td>
                          <td className="py-2 pr-4">{formatCurrency(salesTotals.goal_amount)}</td>
                          <td className="py-2">
                            {salesTotals.goal_amount > 0
                              ? `${Math.round((salesTotals.sales_total / salesTotals.goal_amount) * 100)}%`
                              : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {salesSort.sorted.map((row) => (
                      <div key={row.seller_id} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                        <p className="mb-2 font-medium text-foreground">{row.seller_name}</p>
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <div><dt className="text-muted-foreground">Vendas</dt><dd>{row.sales_count}</dd></div>
                          <div><dt className="text-muted-foreground">% meta</dt><dd>{row.goal_pct != null ? `${row.goal_pct}%` : "—"}</dd></div>
                          <div><dt className="text-muted-foreground">Faturamento</dt><dd>{formatCurrency(row.sales_total)}</dd></div>
                          <div><dt className="text-muted-foreground">Meta</dt><dd>{formatCurrency(row.goal_amount)}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="perdas" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CrmFunnelSelect funnels={funnels} funnelId={funnelId} onFunnelIdChange={setFunnelId} />
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={exportLostReasons} disabled={lostReasons.length === 0}>
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
          {lostReasonsQ.isError ? (
            <ErrorState error={lostReasonsQ.error} onRetry={() => void lostReasonsQ.refetch()} />
          ) : null}
          {!lostReasonsQ.isError && lostReasons.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Top motivos</CardTitle>
                <CardDescription>Negocios perdidos no periodo, agrupados por motivo registrado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lostReasons.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="reason" tick={{ fontSize: 11 }} width={180} />
                      <RechartsTooltip />
                      <Bar dataKey="count" name="Negocios" fill={CHART_COLORS[4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Motivos de perda — detalhamento</CardTitle>
              <CardDescription>Quantidade de negocios perdidos e valor total acumulado por motivo.</CardDescription>
            </CardHeader>
            <CardContent>
              {lostReasonsQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : lostReasons.length === 0 ? (
                <EmptyState label="Nenhum negocio perdido no periodo." />
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4">Motivo</th>
                          <th className="pb-2 pr-4">Quantidade</th>
                          <th className="pb-2">Valor total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lostReasons.map((row) => (
                          <tr key={row.reason} className="border-b border-border/60">
                            <td className="py-2 pr-4 font-medium">{row.reason}</td>
                            <td className="py-2 pr-4">{row.count}</td>
                            <td className="py-2">{formatCurrency(row.total_value)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/50 font-semibold">
                          <td className="py-2 pr-4">Total</td>
                          <td className="py-2 pr-4">{lostReasonsTotal.count}</td>
                          <td className="py-2">{formatCurrency(lostReasonsTotal.total_value)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2 md:hidden">
                    {lostReasons.map((row) => (
                      <div key={row.reason} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                        <p className="mb-2 font-medium text-foreground">{row.reason}</p>
                        <dl className="grid grid-cols-2 gap-2 text-xs">
                          <div><dt className="text-muted-foreground">Quantidade</dt><dd>{row.count}</dd></div>
                          <div><dt className="text-muted-foreground">Valor</dt><dd>{formatCurrency(row.total_value)}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tarefas" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile label="Tarefas criadas" value={tasksTotals.total} />
            <MetricTile label="Concluídas" value={tasksTotals.done} />
            <MetricTile label="Em aberto" value={tasksTotals.open} />
            <MetricTile
              label="Atrasadas"
              value={tasksTotals.overdue}
              variant={tasksTotals.overdue > 0 ? "danger" : "default"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por tarefa pronta</CardTitle>
              <CardDescription>
                Quantas tarefas foram criadas a partir de cada modelo no período e quantas foram
                concluídas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasksReportQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : tasksReportQ.isError ? (
                <ErrorState error={tasksReportQ.error} onRetry={() => void tasksReportQ.refetch()} />
              ) : tasksByTemplate.length === 0 ? (
                <EmptyState label="Nenhuma tarefa criada no período." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Modelo</th>
                        <th className="py-2 pr-4 font-medium">Criadas</th>
                        <th className="py-2 pr-4 font-medium">Concluídas</th>
                        <th className="py-2 font-medium">% conclusão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasksByTemplate.map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2 pr-4 font-medium">{row.title}</td>
                          <td className="py-2 pr-4">{row.total}</td>
                          <td className="py-2 pr-4">{row.done}</td>
                          <td className="py-2">
                            {row.total > 0 ? `${Math.round((row.done / row.total) * 100)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por responsável</CardTitle>
              <CardDescription>Tarefas criadas no período por responsável.</CardDescription>
            </CardHeader>
            <CardContent>
              {tasksReportQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : tasksByAssignee.length === 0 ? (
                <EmptyState label="Nenhuma tarefa criada no período." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Responsável</th>
                        <th className="py-2 pr-4 font-medium">Criadas</th>
                        <th className="py-2 pr-4 font-medium">Concluídas</th>
                        <th className="py-2 font-medium">Atrasadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasksByAssignee.map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2 pr-4 font-medium">{row.name}</td>
                          <td className="py-2 pr-4">{row.total}</td>
                          <td className="py-2 pr-4">{row.done}</td>
                          <td className={cn("py-2", row.overdue > 0 && "font-semibold text-destructive")}>
                            {row.overdue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agendas" className="mt-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <Label htmlFor="sched-provider" className="text-xs">Profissional</Label>
              <Select value={schedulingProviderFilter} onValueChange={setSchedulingProviderFilter}>
                <SelectTrigger id="sched-provider" className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os profissionais</SelectItem>
                  {taskCollaborators.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome || c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={exportScheduling}
              disabled={!schedulingReport}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>

          {schedulingReportQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : schedulingReportQ.isError ? (
            <ErrorState error={schedulingReportQ.error} onRetry={() => void schedulingReportQ.refetch()} />
          ) : schedulingReport ? (
            <>
              {/* Cards de Métricas */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MetricTile
                  label="Total de agendamentos"
                  value={schedulingReport.summary.total}
                  hint={`${schedulingReport.summary.agendado} agendados · ${schedulingReport.summary.confirmado} confirmados`}
                />
                <MetricTile
                  label="Faturamento"
                  value={formatCurrency(schedulingReport.summary.receita_total)}
                  hint="Apenas concluídos"
                />
                <MetricTile
                  label="Taxa de No-show"
                  value={`${schedulingReport.summary.taxa_no_show}%`}
                  hint={`${schedulingReport.summary.nao_compareceu} no-shows`}
                  variant={schedulingReport.summary.taxa_no_show > 15 ? "danger" : "default"}
                />
                <MetricTile
                  label="Taxa de cancelamento"
                  value={`${schedulingReport.summary.taxa_cancelamento}%`}
                  hint={`${schedulingReport.summary.cancelado} cancelados`}
                  variant={schedulingReport.summary.taxa_cancelamento > 20 ? "warning" : "default"}
                />
                <MetricTile
                  label="Taxa de conclusão"
                  value={`${schedulingReport.summary.taxa_conclusao}%`}
                  hint={`${schedulingReport.summary.concluido} concluídos`}
                />
              </div>

              {/* Gráficos */}
              {schedulingChartData.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Evolução dos agendamentos</CardTitle>
                    <CardDescription>Quantidade diária de agendamentos concluídos, cancelados e no-shows.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={schedulingChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <RechartsTooltip />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="concluido" name="Concluídos" fill={CHART_COLORS[2]} />
                          <Bar dataKey="nao_compareceu" name="Não Compareceu (No-show)" fill={CHART_COLORS[3]} />
                          <Bar dataKey="cancelado" name="Cancelados" fill={CHART_COLORS[4]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {/* Tabelas de detalhamento */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Serviços mais agendados */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Serviços mais agendados</CardTitle>
                    <CardDescription>Ranking de serviços por quantidade de agendamentos.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {schedulingServices.length === 0 ? (
                      <EmptyState />
                    ) : (
                      <>
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-muted-foreground">
                                <SortableTh k="service_nome" sortKey={schedulingServicesSort.sortKey} sortDir={schedulingServicesSort.sortDir} onSort={schedulingServicesSort.toggleSort}>Serviço</SortableTh>
                                <SortableTh k="total" sortKey={schedulingServicesSort.sortKey} sortDir={schedulingServicesSort.sortDir} onSort={schedulingServicesSort.toggleSort}>Total agendados</SortableTh>
                                <SortableTh k="concluido" sortKey={schedulingServicesSort.sortKey} sortDir={schedulingServicesSort.sortDir} onSort={schedulingServicesSort.toggleSort}>Concluídos</SortableTh>
                                <SortableTh k="receita" sortKey={schedulingServicesSort.sortKey} sortDir={schedulingServicesSort.sortDir} onSort={schedulingServicesSort.toggleSort} className="pr-0">Receita</SortableTh>
                              </tr>
                            </thead>
                            <tbody>
                              {schedulingServicesSort.sorted.map((row, idx) => (
                                <tr key={idx} className="border-b border-border/60">
                                  <td className="py-2 pr-4 font-medium">{row.service_nome}</td>
                                  <td className="py-2 pr-4">{row.total}</td>
                                  <td className="py-2 pr-4">{row.concluido}</td>
                                  <td className="py-2">{formatCurrency(row.receita)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2 md:hidden">
                          {schedulingServicesSort.sorted.map((row, idx) => (
                            <div key={idx} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                              <p className="mb-2 font-medium text-foreground">{row.service_nome}</p>
                              <dl className="grid grid-cols-2 gap-2 text-xs">
                                <div><dt className="text-muted-foreground">Total agendados</dt><dd>{row.total}</dd></div>
                                <div><dt className="text-muted-foreground">Concluídos</dt><dd>{row.concluido}</dd></div>
                                <div className="col-span-2"><dt className="text-muted-foreground">Receita</dt><dd>{formatCurrency(row.receita)}</dd></div>
                              </dl>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Desempenho por Profissional (apenas visível se filtro de profissional for "all") */}
                {schedulingProviderFilter === "all" ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Desempenho por profissional</CardTitle>
                      <CardDescription>Métricas de agendamentos e faturamento por prestador.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {schedulingProviders.length === 0 ? (
                        <EmptyState />
                      ) : (
                        <>
                          <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-muted-foreground">
                                  <SortableTh k="provider_id" sortKey={schedulingProvidersSort.sortKey} sortDir={schedulingProvidersSort.sortDir} onSort={schedulingProvidersSort.toggleSort}>Profissional</SortableTh>
                                  <SortableTh k="total" sortKey={schedulingProvidersSort.sortKey} sortDir={schedulingProvidersSort.sortDir} onSort={schedulingProvidersSort.toggleSort}>Agendamentos</SortableTh>
                                  <SortableTh k="concluido" sortKey={schedulingProvidersSort.sortKey} sortDir={schedulingProvidersSort.sortDir} onSort={schedulingProvidersSort.toggleSort}>Concluídos</SortableTh>
                                  <SortableTh k="nao_compareceu" sortKey={schedulingProvidersSort.sortKey} sortDir={schedulingProvidersSort.sortDir} onSort={schedulingProvidersSort.toggleSort}>No-show</SortableTh>
                                  <SortableTh k="receita" sortKey={schedulingProvidersSort.sortKey} sortDir={schedulingProvidersSort.sortDir} onSort={schedulingProvidersSort.toggleSort} className="pr-0">Receita</SortableTh>
                                </tr>
                              </thead>
                              <tbody>
                                {schedulingProvidersSort.sorted.map((row, idx) => {
                                  const name = taskCollaborators.find((c) => c.id === row.provider_id)?.nome || "Profissional externo/removido";
                                  return (
                                    <tr key={idx} className="border-b border-border/60">
                                      <td className="py-2 pr-4 font-medium">{name}</td>
                                      <td className="py-2 pr-4">{row.total}</td>
                                      <td className="py-2 pr-4">{row.concluido}</td>
                                      <td className="py-2 pr-4">{row.nao_compareceu}</td>
                                      <td className="py-2">{formatCurrency(row.receita)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="space-y-2 md:hidden">
                            {schedulingProvidersSort.sorted.map((row, idx) => {
                              const name = taskCollaborators.find((c) => c.id === row.provider_id)?.nome || "Profissional externo/removido";
                              return (
                                <div key={idx} className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                                  <p className="mb-2 font-medium text-foreground">{name}</p>
                                  <dl className="grid grid-cols-2 gap-2 text-xs">
                                    <div><dt className="text-muted-foreground">Agendamentos</dt><dd>{row.total}</dd></div>
                                    <div><dt className="text-muted-foreground">Concluídos</dt><dd>{row.concluido}</dd></div>
                                    <div><dt className="text-muted-foreground">No-show</dt><dd>{row.nao_compareceu}</dd></div>
                                    <div><dt className="text-muted-foreground">Receita</dt><dd>{formatCurrency(row.receita)}</dd></div>
                                  </dl>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Filtro de profissional ativo</CardTitle>
                      <CardDescription>Para ver a tabela comparativa de profissionais, selecione "Todos os profissionais".</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
                      <Users className="h-6 w-6 text-muted-foreground/60" />
                      Visualizando apenas métricas individuais do profissional selecionado.
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <EmptyState label="Sem dados de agendamento para o período selecionado." />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
