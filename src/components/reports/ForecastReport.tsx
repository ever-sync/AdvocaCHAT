import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CrmFunnel } from "@/data/crm-funnels";
import { buildForecast } from "@/lib/crm/forecast";
import { useForecastData } from "@/lib/api/forecast";

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ForecastReport({
  funnels,
  funnelId,
  funnelSelect,
  enabled,
}: {
  funnels: CrmFunnel[];
  funnelId: string;
  funnelSelect: React.ReactNode;
  enabled: boolean;
}) {
  const { data, isLoading, error, refetch, isFetching } = useForecastData(funnelId, { enabled });

  const summary = useMemo(() => {
    if (!data) return null;
    const sellerName = (id: string | null) => (id ? data.sellers[id] ?? "—" : "Sem responsável");
    return buildForecast(data.deals, funnels, sellerName);
  }, [data, funnels]);

  const chartData = useMemo(
    () =>
      (summary?.byMonth ?? []).map((m) => ({
        name: m.label,
        Ponderado: Math.round(m.weighted),
        Total: Math.round(m.total),
      })),
    [summary],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Previsão de vendas</h2>
            <p className="text-xs text-muted-foreground">
              Pipeline aberto ponderado pela probabilidade de cada etapa. Defina as probabilidades em
              Configurações → Funis CRM.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {funnelSelect}
          <Button variant="outline" size="icon" onClick={() => void refetch()}>
            <RefreshCcw className={cn("h-4 w-4", isFetching ? "animate-spin" : "")} />
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar a previsão: {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {isLoading || !summary ? (
        <p className="text-sm text-muted-foreground">Calculando previsão…</p>
      ) : summary.openCount === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma negociação aberta neste funil.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Negociações abertas" value={String(summary.openCount)} />
            <SummaryCard label="Pipeline total" value={formatBRL(summary.pipelineTotal)} hint="Soma dos valores em aberto" />
            <SummaryCard
              label="Previsão ponderada"
              value={formatBRL(summary.weightedTotal)}
              hint="Valor × probabilidade da etapa"
            />
          </div>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">Previsão por mês de fechamento</CardTitle>
              <CardDescription>Baseada na data prevista de fechamento de cada negociação.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatBRL(Number(v))} width={90} />
                    <RechartsTooltip formatter={(v) => formatBRL(Number(v))} />
                    <Legend />
                    <Bar dataKey="Total" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Ponderado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Por etapa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {summary.byStage.map((s) => (
                  <div key={s.title} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{s.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {s.count} · {s.probability}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-foreground">{formatBRL(s.weighted)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">de {formatBRL(s.total)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle className="text-base">Por vendedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {summary.bySeller.map((s) => (
                  <div key={s.assigneeId ?? "none"} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="truncate font-medium text-foreground">{s.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-foreground">{formatBRL(s.weighted)}</span>
                      <span className="ml-2 text-xs text-muted-foreground">de {formatBRL(s.total)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
