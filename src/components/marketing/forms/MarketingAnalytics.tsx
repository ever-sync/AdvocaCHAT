import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useMarketingAnalytics } from "@/lib/api/marketing-analytics";

const PERIODS: { label: string; days: number }[] = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

const PIE_COLORS = ["#6d28d9", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#64748b"];

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deltaLabel(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR")}`;
}

function deltaTone(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-red-600";
  return "text-muted-foreground";
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  );
}

function SectionTitle({
  title,
  description,
  right,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

function AttentionBadge({ level }: { level: "ok" | "warning" | "critical" }) {
  if (level === "critical") {
    return <Badge className="border-red-200 bg-red-50 text-red-700">Crítico</Badge>;
  }
  if (level === "warning") {
    return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Atenção</Badge>;
  }
  return <Badge variant="secondary">OK</Badge>;
}

interface MarketingAnalyticsProps {
  onBack: () => void;
}

export function MarketingAnalytics({ onBack }: MarketingAnalyticsProps) {
  const [periodDays, setPeriodDays] = useState(30);
  const { data, isLoading, isFetching, refetch, error } = useMarketingAnalytics(periodDays);

  const dashboard = useMemo(() => {
    const analytics = data;
    if (!analytics) return null;

    const formsWithWebhook = analytics.perForm.filter((form) => form.hasWebhook).length;
    const formsWithRedirect = analytics.perForm.filter((form) => form.hasRedirect).length;
    const formsWithActivity = analytics.perForm.filter((form) => form.hasActivity).length;
    const formsWithTags = analytics.perForm.filter((form) => form.hasCustomerTags).length;
    const formsWithAutoWinner = analytics.perForm.filter((form) => form.hasAutoWinner).length;
    const formsBlockingDuplicates = analytics.perForm.filter((form) => !form.allowDuplicates).length;
    const attentionForms = analytics.perForm
      .slice()
      .sort((a, b) => {
        const level = { critical: 0, warning: 1, ok: 2 } as const;
        return level[a.attentionLevel] - level[b.attentionLevel] || a.conversion - b.conversion || b.views - a.views;
      })
      .slice(0, 6);
    const abandonedForms = analytics.perForm
      .slice()
      .sort((a, b) => b.abandonment - a.abandonment || a.conversion - b.conversion || b.views - a.views)
      .slice(0, 6);
    const lowConversionForms = analytics.perForm
      .slice()
      .sort((a, b) => a.conversion - b.conversion || b.views - a.views)
      .slice(0, 6);
    const recentUpdates = analytics.recentUpdates;
    const abandonmentByStep = analytics.abandonmentByStep.slice(0, 6);
    const abandonmentByField = analytics.abandonmentByField.slice(0, 6);
    const abandonmentTrends = analytics.abandonmentTrends.slice(0, 6);
    const actionInsights = (() => {
      const items: Array<{
        title: string;
        description: string;
        impact: string;
        level: "critical" | "warning" | "ok";
      }> = [];

      const topStep = abandonmentByStep[0];
      if (topStep && topStep.abandons >= 3 && topStep.abandonmentRate >= 35) {
        items.push({
          title: `Etapa "${topStep.stepTitle}" está derrubando conversão`,
          description: `${topStep.abandons} abandonos em ${topStep.stepViews} visualizações da etapa.`,
          impact: "Revise o texto, reduza campos ou crie salto condicional antes desse bloco.",
          level: topStep.abandonmentRate >= 50 ? "critical" : "warning",
        });
      }

      const topField = abandonmentByField[0];
      if (topField && topField.abandons >= 3 && topField.abandonmentRate >= 35) {
        items.push({
          title: `Campo "${topField.fieldLabel}" precisa de ajuste`,
          description: `${topField.abandons} abandonos com ${topField.interactions} interações registradas.`,
          impact: "Considere quebrar em linha menor, trocar o tipo do campo ou transformar em etapa própria.",
          level: topField.abandonmentRate >= 50 ? "critical" : "warning",
        });
      }

      const worstForm = abandonedForms[0];
      if (worstForm && worstForm.abandonment >= 50) {
        items.push({
          title: `Formulário "${worstForm.formName}" está acima do ideal`,
          description: `${formatPercent(worstForm.abandonment)} de abandono com ${formatNumber(worstForm.views)} views.`,
          impact: "Use a matriz para revisar conteúdo, layout e destino antes de mexer em escala.",
          level: worstForm.attentionLevel,
        });
      }

      if (items.length === 0) {
        items.push({
          title: "Nenhum alerta crítico no momento",
          description: "A operação está estável dentro da janela analisada.",
          impact: "Continue monitorando os blocos com maior volume para pegar quedas cedo.",
          level: "ok",
        });
      }

      return items.slice(0, 3);
    })();

    return {
      analytics,
      formsWithWebhook,
      formsWithRedirect,
      formsWithActivity,
      formsWithTags,
      formsWithAutoWinner,
      formsBlockingDuplicates,
      attentionForms,
      abandonedForms,
      lowConversionForms,
      recentUpdates,
      abandonmentByStep,
      abandonmentByField,
      abandonmentTrends,
      actionInsights,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Gestão e análise</h2>
            <p className="text-sm text-muted-foreground">
              Visão de performance, qualidade e saúde dos formulários nos últimos {periodDays} dias.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {PERIODS.map((period) => (
              <button
                key={period.days}
                type="button"
                onClick={() => setPeriodDays(period.days)}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  periodDays === period.days
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {period.label}
              </button>
            ))}
          </div>
          <Button variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching ? "animate-spin" : "")} />
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Não foi possível carregar os dados: {(error as Error).message}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Sem dados de formulário neste ambiente</p>
              <p className="text-sm text-muted-foreground">
                A estrutura da visão de gestão está pronta; conecte o banco para ver métricas, rankings e envios.
              </p>
            </div>
            <Button variant="outline" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Formulários" value={formatNumber(dashboard.analytics.totals.forms)} icon={BarChart3} />
            <KpiCard
              label="Ativos"
              value={formatNumber(dashboard.analytics.totals.activeForms)}
              icon={CheckCircle2}
              hint={`${formatNumber(dashboard.formsWithWebhook)} com webhook · ${formatNumber(dashboard.formsWithAutoWinner)} com A/B`}
            />
            <KpiCard
              label="Envios / views"
              value={`${formatNumber(dashboard.analytics.totals.submissions)} / ${formatNumber(dashboard.analytics.totals.views)}`}
              icon={Target}
              hint={`Conversão ${formatPercent(dashboard.analytics.totals.conversionRate)} · abandono ${formatPercent(dashboard.analytics.totals.abandonmentRate)}`}
            />
            <KpiCard
              label="Leads no período"
              value={formatNumber(dashboard.analytics.totals.leads)}
              icon={Users}
              hint={`Score médio ${dashboard.analytics.totals.avgScore}`}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Vendido / Receita</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatNumber(dashboard.analytics.totals.won)} · {formatCurrency(dashboard.analytics.totals.revenue)}
                </p>
                <p className="text-xs text-muted-foreground">Conversões ganhas no período selecionado.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Duplicados</p>
                <p className="mt-1 text-xl font-semibold">{formatPercent(dashboard.analytics.totals.duplicateRate)}</p>
                <p className="text-xs text-muted-foreground">Leads duplicados sobre o volume analisado.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Com integração</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatNumber(dashboard.formsWithRedirect + dashboard.formsWithActivity + dashboard.formsWithTags)}
                </p>
                <p className="text-xs text-muted-foreground">Redirecionamento, atividade e tags automáticas.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Bloqueio de duplicados</p>
                <p className="mt-1 text-xl font-semibold">{formatNumber(dashboard.formsBlockingDuplicates)}</p>
                <p className="text-xs text-muted-foreground">Formulários que já recusam cadastro repetido.</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Sessões rastreadas</p>
                <p className="mt-1 text-xl font-semibold">{formatNumber(dashboard.analytics.trackedSessions)}</p>
                <p className="text-xs text-muted-foreground">Fluxos de formulário acompanhados por evento.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <SectionTitle
                title="Alertas acionáveis"
                description="O que merece ajuste primeiro para melhorar a conversão do formulário."
              />
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {dashboard.actionInsights.map((item) => (
                <div key={item.title} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <AttentionBadge level={item.level} />
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{item.impact}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SectionTitle
                title="Tendência do abandono"
                description="Comparação com o período anterior para enxergar melhora ou piora."
              />
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {dashboard.abandonmentTrends.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  Sem eventos suficientes para comparar tendência.
                </div>
              ) : (
                dashboard.abandonmentTrends.map((item) => (
                  <div key={`${item.kind}:${item.formId}:${item.title}`} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.formName} · {item.subtitle}
                        </p>
                      </div>
                      <AttentionBadge level={item.severity} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground">{formatNumber(item.current)}</p>
                        <p>atual</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{formatNumber(item.previous)}</p>
                        <p>anterior</p>
                      </div>
                      <div>
                        <p className={cn("font-medium", item.delta >= 0 ? "text-red-600" : "text-emerald-600")}>
                          {item.delta >= 0 ? "+" : ""}
                          {formatPercent(Math.abs(item.delta))}
                        </p>
                        <p>variação</p>
                      </div>
                    </div>
                    <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                      Taxa atual {formatPercent(item.currentRate)} · período anterior {formatPercent(item.previousRate)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Envios por dia" description="Volume dos envios feitos no período atual.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard.analytics.byDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="count" stroke="#6d28d9" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Score dos leads" description="Distribuição de qualidade dos leads captados.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.analytics.scoreBuckets}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Origem (UTM)" description="Onde os leads começaram.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard.analytics.byUtmSource} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={90} />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Dispositivo" description="Como as pessoas estão preenchendo.">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dashboard.analytics.byDevice} dataKey="count" nameKey="device" cx="50%" cy="50%" outerRadius={80} label>
                    {dashboard.analytics.byDevice.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Abandono e retenção"
                  description="Onde as pessoas estão saindo antes de concluir o formulário."
                  right={
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <TrendingDown className="h-3.5 w-3.5" />
                        {formatPercent(dashboard.analytics.totals.abandonmentRate)} de abandono
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {formatNumber(dashboard.formsBlockingDuplicates)} bloqueiam duplicados
                      </span>
                    </div>
                  }
                />
              </CardHeader>
              <CardContent className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Formulário</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                      <TableHead className="text-right">Abandono</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.abandonedForms.map((form) => (
                      <TableRow key={form.formId}>
                        <TableCell>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{form.formName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {form.hasWebhook ? "Webhook" : "Sem webhook"} · {form.hasRedirect ? "Redirect" : "Sem redirect"} ·{" "}
                              {form.allowDuplicates ? "aceita duplicados" : "bloqueia duplicados"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(form.conversion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(form.abandonment)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(form.views)}</TableCell>
                        <TableCell className="text-right">
                          <AttentionBadge level={form.attentionLevel} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Formulários que pedem atenção"
                  description="Ordenados por criticidade e sinal de coleta."
                  right={
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {formatNumber(dashboard.formsWithWebhook)} com webhook
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatNumber(dashboard.formsWithRedirect)} com redirect
                      </span>
                    </div>
                  }
                />
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.attentionForms.map((form) => (
                  <div key={form.formId} className="rounded-xl border bg-card p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{form.formName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatNumber(form.views)} views · {formatNumber(form.submissions)} envios · {formatNumber(form.leads)} leads
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatPercent(form.conversion)}</Badge>
                        <AttentionBadge level={form.attentionLevel} />
                      </div>
                    </div>
                    {form.attentionReasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {form.attentionReasons.slice(0, 3).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Abandono por etapa"
                  description="Etapas onde a pessoa começou a interagir e saiu antes do envio."
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.abandonmentByStep.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Ainda não temos eventos de etapa para analisar.
                  </div>
                ) : (
                  dashboard.abandonmentByStep.map((item) => (
                    <div key={`${item.formId}:${item.stepId}`} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.stepTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.formName}</p>
                        </div>
                        <Badge variant="outline">{formatPercent(item.abandonmentRate)}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">{formatNumber(item.abandons)}</p>
                          <p>abandons</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{formatNumber(item.stepViews)}</p>
                          <p>views da etapa</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{formatPercent(item.abandonmentRate)}</p>
                          <p>taxa</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Campos que travam"
                  description="Campos que mais aparecem no ponto onde a pessoa desistiu."
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.abandonmentByField.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Ainda não temos eventos de campo para analisar.
                  </div>
                ) : (
                  dashboard.abandonmentByField.map((item) => (
                    <div key={`${item.formId}:${item.fieldName}`} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.fieldLabel}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.formName}</p>
                        </div>
                        <Badge variant="outline">{formatPercent(item.abandonmentRate)}</Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <div>
                          <p className="font-medium text-foreground">{formatNumber(item.abandons)}</p>
                          <p>abandons</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{formatNumber(item.interactions)}</p>
                          <p>interações</p>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{formatPercent(item.abandonmentRate)}</p>
                          <p>taxa</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <SectionTitle title="Últimos envios" description="Um retrato rápido do que acabou de entrar na operação." />
            </CardHeader>
            <CardContent>
              {dashboard.analytics.recentSubmissions.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Nenhum envio recente no período.
                </div>
              ) : (
                <div className="space-y-2">
                  {dashboard.analytics.recentSubmissions.map((submission) => (
                    <div key={submission.id} className="rounded-xl border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{submission.negotiationTitle}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {submission.formName} · {submission.utmSource} · {submission.deviceType}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="rounded-full">
                              Score {submission.score}
                            </Badge>
                            {submission.duplicate ? (
                              <Badge className="border-red-200 bg-red-50 text-red-700">Duplicado</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDate(submission.createdAt)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                        <span>{submission.status}</span>
                        <span>{formatCurrency(submission.totalValue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Matriz de saúde dos formulários"
                  description="Onde a operação está bem amarrada e onde vale agir primeiro."
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.lowConversionForms.map((form) => (
                  <div key={form.formId} className="rounded-xl border bg-card p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{form.formName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatNumber(form.views)} views · {formatNumber(form.submissions)} envios · {formatNumber(form.won)} ganhos
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatPercent(form.conversion)}</Badge>
                        <AttentionBadge level={form.attentionLevel} />
                      </div>
                    </div>
                    {form.attentionReasons.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                        {form.attentionReasons.slice(0, 3).map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <SectionTitle
                  title="Mudanças recentes"
                  description="Formulários atualizados recentemente, para priorizar revisão."
                />
              </CardHeader>
              <CardContent className="space-y-2">
                {dashboard.recentUpdates.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                    Nenhuma alteração recente encontrada.
                  </div>
                ) : (
                  dashboard.recentUpdates.map((entry) => (
                    <div key={entry.formId} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{entry.formName}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</p>
                      </div>
                      <AttentionBadge level={entry.attentionLevel} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <SectionTitle
                title="Comparação com o período anterior"
                description={`Janelas de ${periodDays} dias comparadas automaticamente.`}
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(dashboard.analytics.comparison.leads)}</p>
                  <div className={cn("mt-1 flex items-center gap-1 text-xs", deltaTone(dashboard.analytics.comparison.delta.leads))}>
                    {dashboard.analytics.comparison.delta.leads >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    <span>{deltaLabel(dashboard.analytics.comparison.delta.leads)} vs. período anterior</span>
                  </div>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Vendido</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(dashboard.analytics.comparison.won)}</p>
                  <div className={cn("mt-1 flex items-center gap-1 text-xs", deltaTone(dashboard.analytics.comparison.delta.won))}>
                    {dashboard.analytics.comparison.delta.won >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    <span>{deltaLabel(dashboard.analytics.comparison.delta.won)} vendas</span>
                  </div>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Receita</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(dashboard.analytics.comparison.revenue)}</p>
                  <div className={cn("mt-1 flex items-center gap-1 text-xs", deltaTone(dashboard.analytics.comparison.delta.revenue))}>
                    {dashboard.analytics.comparison.delta.revenue >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    <span>{deltaLabel(dashboard.analytics.comparison.delta.revenue)} de receita</span>
                  </div>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Score médio</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{dashboard.analytics.comparison.avgScore}</p>
                  <div className={cn("mt-1 flex items-center gap-1 text-xs", deltaTone(dashboard.analytics.comparison.delta.avgScore))}>
                    {dashboard.analytics.comparison.delta.avgScore >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    )}
                    <span>{deltaLabel(dashboard.analytics.comparison.delta.avgScore)} pontos</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
