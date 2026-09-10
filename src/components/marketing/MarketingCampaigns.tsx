// Aba Campanhas do Marketing — relatório com dados internos.
// Sem integração com APIs de anúncio: agrega o que já temos no banco (leads de
// formulário, conversões ganhas no CRM e receita) por origem e por formulário.
import { useMemo, useState } from "react";
import { BarChart3, DollarSign, Loader2, Target, TrendingUp, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCampaignFormReport,
  useCampaignSourceReport,
} from "@/lib/api/marketing-campaign-report";
import { cn } from "@/lib/utils";

const RANGES: { label: string; days: number | null }[] = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
  { label: "Tudo", days: null },
];

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function pct(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-xl font-bold tabular-nums text-foreground">{value}</span>
        {hint ? (
          <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

export function MarketingCampaigns() {
  const [rangeIdx, setRangeIdx] = useState(1); // 30 dias por padrão
  const days = RANGES[rangeIdx].days;

  const sourceQuery = useCampaignSourceReport(days);
  const formQuery = useCampaignFormReport(days);

  const sourceData = sourceQuery.data;
  const forms = formQuery.data ?? [];

  const totals = useMemo(() => {
    const rows = sourceData ?? [];
    const leads = rows.reduce((s, r) => s + r.leads, 0);
    const won = rows.reduce((s, r) => s + r.won, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    return { leads, won, revenue };
  }, [sourceData]);

  const sources = sourceData ?? [];

  const isLoading = sourceQuery.isLoading || formQuery.isLoading;
  const error = sourceQuery.error ?? formQuery.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-foreground">Campanhas</h2>
          <p className="text-sm text-muted-foreground">
            Desempenho das suas origens e formulários — leads, conversões e receita do CRM.
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {RANGES.map((range, idx) => (
            <button
              key={range.label}
              type="button"
              onClick={() => setRangeIdx(idx)}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                rangeIdx === idx
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Não foi possível carregar o relatório. {error.message}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads" value={formatNumber(totals.leads)} icon={Users} />
        <StatCard
          label="Convertidos"
          value={formatNumber(totals.won)}
          icon={Target}
          hint={`Taxa ${pct(totals.won, totals.leads)}`}
        />
        <StatCard label="Receita" value={formatCurrency(totals.revenue)} icon={DollarSign} />
        <StatCard
          label="Ticket médio"
          value={totals.won > 0 ? formatCurrency(totals.revenue / totals.won) : "—"}
          icon={TrendingUp}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Carregando relatório…
        </div>
      ) : (
        <>
          {/* Por origem */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">Por origem</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Origem
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Leads
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Convertidos
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Conversão
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Receita
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum lead de formulário no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  sources.map((row) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium text-foreground">{row.source}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.leads)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.won)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {pct(row.won, row.leads)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.revenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Por formulário */}
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">Por formulário</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Formulário
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Visitas
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Envios
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Leads
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Convertidos
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Receita
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum formulário criado ainda.
                    </TableCell>
                  </TableRow>
                ) : (
                  forms.map((row) => (
                    <TableRow key={row.formId}>
                      <TableCell className="font-medium text-foreground">{row.formName}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.views)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.submits)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.leads)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.won)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(row.revenue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Dados internos do CRM (sem gasto de anúncio). Visitas e envios são totais do formulário;
            leads, convertidos e receita respeitam o período selecionado.
          </p>
        </>
      )}
    </div>
  );
}
