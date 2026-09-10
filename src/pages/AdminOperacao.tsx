import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, CreditCard, RadioTower, RefreshCw, ServerCog, ShieldCheck, Webhook, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  type OperationAdminAction,
  type OperationAdminAuditEntry,
  type OperationSeverity,
  type OperationTenant,
  type OperationWorkerAlert,
  type OperationWorkerRun,
  type OperationWorker,
  useOperationAdminAction,
  useOperationAdminAuditLogs,
  useOperationAdminWorkerRecheck,
  useOperationAdminSnapshot,
} from "@/lib/api/operation-admin";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageShell } from "@/components/layout/PageShell";

const SEVERITY_LABEL: Record<OperationSeverity | "all", string> = {
  all: "Todos",
  ok: "Saudavel",
  warning: "Atencao",
  critical: "Critico",
};

const SEVERITY_CLASS: Record<OperationSeverity, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
};

const METRIC_LABEL: Record<string, string> = {
  customers: "clientes",
  whatsapp_instances: "canais",
  users: "usuarios",
  ai_monthly_tokens: "tokens IA",
  marketing_flow_runs_monthly: "automacoes",
  storage_gb: "midias",
};

const AUDIT_TYPE_LABEL: Record<string, string> = {
  billing_subscription: "Assinaturas",
  billing_plan: "Catalogo",
  tenant_ai_subscription: "IA",
  operation_job: "Operacao",
};

function nf(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value >= 10 ? 0 : 2 });
}

export default function AdminOperacao() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<OperationSeverity | "all">("all");
  const [auditTenantId, setAuditTenantId] = useState("all");
  const [auditEntityType, setAuditEntityType] = useState("all");
  const { data, isLoading, isError, error, refetch, isFetching } = useOperationAdminSnapshot();
  const workerRecheck = useOperationAdminWorkerRecheck({
    onSuccess: (result) => {
      toast({
        title: "Rechecagem concluida.",
        description: result.message ?? `${result.affected} worker(s) avaliados.`,
      });
      void refetch();
    },
    onError: (error) => toast({ title: "Nao foi possivel rechecar os workers", description: error.message, variant: "destructive" }),
  });
  const tenants = data?.tenants ?? [];
  const audit = useOperationAdminAuditLogs({
    tenantId: auditTenantId === "all" ? null : auditTenantId,
    entityType: auditEntityType === "all" ? null : auditEntityType,
    limit: 80,
  }, { enabled: Boolean(data) });

  const filteredTenants = useMemo(() => {
    if (filter === "all") return tenants;
    return tenants.filter((tenant) => tenant.severity === filter);
  }, [filter, tenants]);

  return (
    <PageShell contentClassName="flex flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Activity className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Operacao da plataforma</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Saude dos tenants, canais, IA, automacoes, webhooks e billing.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Somente plataforma
          </Badge>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => workerRecheck.mutate()} disabled={workerRecheck.isPending}>
            <ServerCog className={workerRecheck.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {workerRecheck.isPending ? "Rechecando..." : "Rechecar workers"}
          </Button>
        </div>
      </div>

      <AdminNav />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando operacao...</CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error?.message ?? "Acesso negado."}</CardContent>
        </Card>
      ) : data ? (
        <>
          <SummaryGrid summary={data.summary} />
          <WorkersSection workers={data.workers ?? []} alerts={data.workerAlerts ?? []} />
          <WorkerAlertsSection alerts={data.workerAlerts ?? []} />
          <WorkerRunsSection runs={data.workerRuns ?? []} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Atualizado em {new Date(data.generated_at).toLocaleString("pt-BR")}
            </p>
            <div className="w-48">
              <Select value={filter} onValueChange={(value) => setFilter(value as OperationSeverity | "all")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="critical">Criticos</SelectItem>
                  <SelectItem value="warning">Atencao</SelectItem>
                  <SelectItem value="ok">Saudaveis</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTenants.map((tenant) => (
              <TenantOperationCard key={tenant.tenant_id} tenant={tenant} />
            ))}
            {filteredTenants.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">Nenhum tenant neste filtro.</CardContent>
              </Card>
            ) : null}
          </div>

          <AuditSection
            tenants={tenants}
            entries={audit.data?.entries ?? []}
            isLoading={audit.isLoading || audit.isFetching}
            tenantFilter={auditTenantId}
            entityTypeFilter={auditEntityType}
            onTenantFilterChange={setAuditTenantId}
            onEntityTypeFilterChange={setAuditEntityType}
          />
        </>
      ) : null}
    </PageShell>
  );
}

function SummaryGrid({ summary }: { summary: NonNullable<ReturnType<typeof useOperationAdminSnapshot>["data"]>["summary"] }) {
  const items = [
    { label: "Tenants", value: summary.tenants, icon: Activity },
    { label: "Criticos", value: summary.critical, icon: AlertTriangle, danger: summary.critical > 0 },
    { label: "Canais conectados", value: `${summary.channels_connected}/${summary.channels_total}`, icon: RadioTower },
    { label: "IA pendente", value: summary.ai_pending, icon: Bot, danger: summary.ai_errors_24h > 0 },
    { label: "Automacoes vencidas", value: summary.automations_due, icon: Workflow, danger: summary.automations_failed_24h > 0 },
    { label: "Webhooks erro 24h", value: summary.webhook_errors_24h, icon: Webhook, danger: summary.webhook_errors_24h > 0 },
    { label: "Billing bloqueado", value: summary.billing_blocked, icon: CreditCard, danger: summary.billing_blocked > 0 },
    { label: "Workers alerta", value: summary.workers_critical + summary.workers_warning, icon: ServerCog, danger: summary.workers_critical > 0 },
    { label: "Workers alertas 24h", value: summary.workers_alerts_24h, icon: AlertTriangle, danger: summary.workers_alerts_24h > 0 },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className={item.danger ? "border-destructive/30 bg-destructive/5" : undefined}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <Icon className={item.danger ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"} />
              </div>
              <p className={item.danger ? "mt-2 text-2xl font-semibold text-destructive" : "mt-2 text-2xl font-semibold"}>
                {item.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function WorkersSection({ workers, alerts }: { workers: OperationWorker[]; alerts: OperationWorkerAlert[] }) {
  const latestAlertByWorker = useMemo(() => {
    const map = new Map<string, OperationWorkerAlert>();
    for (const alert of alerts) {
      const current = map.get(alert.worker_key);
      if (!current || new Date(alert.created_at).getTime() > new Date(current.created_at).getTime()) {
        map.set(alert.worker_key, alert);
      }
    }
    return map;
  }, [alerts]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Workers e filas</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Execucao automatica, filas pendentes e sinais de falha dos processos internos.
            </p>
          </div>
          <Badge variant="outline" className="gap-2">
            <ServerCog className="h-4 w-4" aria-hidden />
            Cron VPS
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {workers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum worker monitorado.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workers.map((worker) => (
              <WorkerCard key={worker.id} worker={worker} alert={latestAlertByWorker.get(worker.id) ?? null} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkerCard({ worker, alert }: { worker: OperationWorker; alert: OperationWorkerAlert | null }) {
  const lastSeen = worker.last_seen
    ? new Date(worker.last_seen).toLocaleString("pt-BR")
    : "Sem registro";

  return (
    <div
      className={
        worker.severity === "critical"
          ? "rounded-md border border-destructive/30 bg-destructive/5 p-3"
          : worker.severity === "warning"
            ? "rounded-md border border-amber-200 bg-amber-50/60 p-3"
            : "rounded-md border bg-background p-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{worker.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{worker.id}</p>
        </div>
        <Badge variant="outline" className={SEVERITY_CLASS[worker.severity]}>
          {worker.status}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Fila</p>
          <p className="mt-1 font-semibold">{nf(worker.pending)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Rodando</p>
          <p className="mt-1 font-semibold">{nf(worker.running)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Erros</p>
          <p className={worker.errors_24h > 0 ? "mt-1 font-semibold text-destructive" : "mt-1 font-semibold"}>
            {nf(worker.errors_24h)}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <p>Agenda: {worker.schedule}</p>
        <p>Ultimo sinal: {lastSeen}</p>
        {worker.details.slice(0, 2).map((detail) => (
          <p key={detail}>{detail}</p>
        ))}
        {alert ? (
          <p className={alert.severity === "critical" ? "font-medium text-destructive" : "font-medium text-amber-700"}>
            Ultimo alerta: {alert.alert_type} · {new Date(alert.created_at).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WorkerAlertsSection({ alerts }: { alerts: OperationWorkerAlert[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Alertas de workers</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Registros recentes quando um worker fica sem heartbeat ou entra em falha repetida.
            </p>
          </div>
          <Badge variant="outline">{alerts.length} recentes</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta registrado nas ultimas execucoes.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={alert.severity === "critical"
                  ? "rounded-md border border-destructive/30 bg-destructive/5 p-3"
                  : "rounded-md border border-amber-200 bg-amber-50/60 p-3"}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{alert.worker_label ?? alert.worker_key}</p>
                      <Badge variant="outline">{alert.alert_type}</Badge>
                      <Badge variant="outline" className={alert.severity === "critical" ? "border-destructive/30 text-destructive" : "border-amber-200 text-amber-700"}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(alert.created_at).toLocaleString("pt-BR")} · periodo {alert.period}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    HTTP {alert.last_http_status ?? "n/a"} · {alert.consecutive_failures} falha(s)
                  </p>
                </div>
                <p className="mt-2 text-sm">{alert.summary}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkerRunsSection({ runs }: { runs: OperationWorkerRun[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Historico recente</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ultimas execucoes registradas pelos workers com tempo, status e falhas.
            </p>
          </div>
          <Badge variant="outline">{runs.length} execucoes</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execucao registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{run.worker_label ?? run.worker_key}</p>
                      <Badge variant={run.ok ? "secondary" : "destructive"}>{run.ok ? "ok" : "erro"}</Badge>
                      <Badge variant="outline">{run.schedule ?? "sem agenda"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Iniciou {new Date(run.started_at).toLocaleString("pt-BR")} · terminou{" "}
                      {new Date(run.finished_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    HTTP {run.http_status ?? "n/a"} · {run.duration_ms ?? 0}ms
                  </p>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <RunSnippet title="Resposta" value={run.response_excerpt} />
                  <RunSnippet title="Erro" value={run.error_excerpt} error />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunSnippet({ title, value, error = false }: { title: string; value: string | null; error?: boolean }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {value?.trim() ? value : "Sem detalhe"}
      </p>
    </div>
  );
}

function TenantOperationCard({ tenant }: { tenant: OperationTenant }) {
  const { toast } = useToast();
  const action = useOperationAdminAction({
    onSuccess: (result) => {
      toast({
        title: "Acao executada.",
        description: `${ACTION_LABEL[result.action]} afetou ${nf(result.affected)} item(ns).`,
      });
    },
    onError: (error) => toast({ title: "Nao foi possivel executar", description: error.message, variant: "destructive" }),
  });
  const exceeded = tenant.usage.filter((row) => row.exceeded);
  const runningAction = action.variables?.tenantId === tenant.tenant_id ? action.variables.action : null;

  function run(nextAction: OperationAdminAction) {
    action.mutate({ tenantId: tenant.tenant_id, action: nextAction });
  }

  return (
    <Card className={tenant.severity === "critical" ? "border-destructive/30" : tenant.severity === "warning" ? "border-amber-200" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{tenant.nome}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{tenant.tenant_id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={SEVERITY_CLASS[tenant.severity]}>
              {SEVERITY_LABEL[tenant.severity]}
            </Badge>
            <Badge variant="outline">
              {tenant.billing.plan_id ?? "sem plano"} · {tenant.billing.status ?? "sem assinatura"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {tenant.issues.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tenant.issues.map((issue) => (
              <Badge key={issue} variant={tenant.severity === "critical" ? "destructive" : "secondary"}>
                {issue}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum sinal critico neste momento.</p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricBox
            icon={RadioTower}
            title="Canais"
            lines={[
              `${tenant.channels.connected}/${tenant.channels.total} conectados`,
              `${tenant.channels.error} erro · ${tenant.channels.disconnected} off`,
            ]}
          />
          <MetricBox
            icon={Bot}
            title="IA"
            lines={[
              `${tenant.ai.pending} pendente · ${tenant.ai.processing} processando`,
              `${tenant.ai.errors_24h} erro 24h · ${tenant.ai.stale_processing} travado`,
            ]}
          />
          <MetricBox
            icon={Workflow}
            title="Automacoes"
            lines={[
              `${tenant.automations.queued_due} vencidas · ${tenant.automations.running} rodando`,
              `${tenant.automations.failed_24h + tenant.automations.dead_24h} falhas 24h`,
            ]}
          />
          <MetricBox
            icon={Webhook}
            title="Webhooks"
            lines={[
              `${tenant.webhooks.pending_due} pendentes`,
              `${tenant.webhooks.errors_24h} erro 24h · ${tenant.webhooks.success_24h} ok`,
            ]}
          />
          <MetricBox
            icon={CreditCard}
            title="Limites"
            lines={[
              exceeded.length > 0 ? `${exceeded.length} excedido(s)` : "dentro do plano",
              exceeded.map((row) => METRIC_LABEL[row.metric] ?? row.metric).slice(0, 2).join(", ") || `${tenant.usage.length} metricas`,
            ]}
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => run("refresh_usage")}
          >
            {runningAction === "refresh_usage" ? "Atualizando..." : "Atualizar uso"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending || tenant.webhooks.errors_24h === 0}
            onClick={() => run("retry_webhooks")}
          >
            {runningAction === "retry_webhooks" ? "Reabrindo..." : "Reabrir webhooks"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending || tenant.ai.stale_processing === 0}
            onClick={() => run("unlock_ai_jobs")}
          >
            {runningAction === "unlock_ai_jobs" ? "Destravando..." : "Destravar IA"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending || tenant.automations.stale_running === 0}
            onClick={() => run("unlock_automation_jobs")}
          >
            {runningAction === "unlock_automation_jobs" ? "Destravando..." : "Destravar automacoes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const ACTION_LABEL: Record<OperationAdminAction, string> = {
  refresh_usage: "Atualizar uso",
  retry_webhooks: "Reabrir webhooks",
  unlock_ai_jobs: "Destravar IA",
  unlock_automation_jobs: "Destravar automacoes",
  recheck_workers: "Rechecar workers",
};

function MetricBox({ icon: Icon, title, lines }: { icon: typeof Activity; title: string; lines: string[] }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">{line}</p>
        ))}
      </div>
    </div>
  );
}

function AuditSection({
  tenants,
  entries,
  isLoading,
  tenantFilter,
  entityTypeFilter,
  onTenantFilterChange,
  onEntityTypeFilterChange,
}: {
  tenants: OperationTenant[];
  entries: OperationAdminAuditEntry[];
  isLoading: boolean;
  tenantFilter: string;
  entityTypeFilter: string;
  onTenantFilterChange: (value: string) => void;
  onEntityTypeFilterChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Auditoria master</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Acoes sensiveis executadas pelos administradores da plataforma.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select value={tenantFilter} onValueChange={onTenantFilterChange}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tenants</SelectItem>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entityTypeFilter} onValueChange={onEntityTypeFilterChange}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as acoes</SelectItem>
                <SelectItem value="billing_subscription">Planos</SelectItem>
                <SelectItem value="tenant_ai_subscription">IA</SelectItem>
                <SelectItem value="operation_job">Operacao</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando auditoria...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
        ) : (
          entries.map((entry) => <AuditEntryRow key={entry.id} entry={entry} />)
        )}
      </CardContent>
    </Card>
  );
}

function AuditEntryRow({ entry }: { entry: OperationAdminAuditEntry }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{entry.summary ?? "Acao administrativa"}</p>
            <Badge variant="outline">{AUDIT_TYPE_LABEL[entry.entity_type] ?? entry.entity_type}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.actor_name ?? "Admin da plataforma"} · {entry.tenant_name} ·{" "}
            {new Date(entry.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <p className="max-w-full truncate text-xs text-muted-foreground sm:max-w-[280px]">
          {entry.entity_id ?? entry.entity_type}
        </p>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <AuditJson title="Mudancas" value={entry.changes} />
        <AuditJson title="Metadata" value={entry.metadata} />
      </div>
    </div>
  );
}

function AuditJson({ title, value }: { title: string; value: Record<string, unknown> }) {
  const text = JSON.stringify(value ?? {}, null, 2);
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {text === "{}" ? "Sem detalhes" : text}
      </pre>
    </div>
  );
}
