import { useMemo, useState } from "react";
import { AlertTriangle, CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  type BillingAdminTenant,
  type BillingAdminUsage,
  useBillingAdminTenants,
  useSetBillingAdminTenantPlan,
} from "@/lib/api/billing-admin";
import type { BillingPeriod, BillingStatus } from "@/lib/api/billing";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageShell } from "@/components/layout/PageShell";

const METRIC_LABEL: Record<string, string> = {
  customers: "Clientes",
  whatsapp_instances: "Canais",
  users: "Usuarios",
  marketing_flow_runs_monthly: "Automacoes",
  storage_gb: "Midias",
};

const STATUS_LABEL: Record<BillingStatus, string> = {
  trialing: "Trial",
  active: "Ativo",
  past_due: "Pagamento pendente",
  paused: "Pausado",
  canceled: "Cancelado",
  incomplete: "Incompleto",
};

const BILLING_STATUS: BillingStatus[] = ["trialing", "active", "past_due", "paused", "canceled", "incomplete"];

function nf(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value >= 10 ? 0 : 2 });
}

function usagePct(row: BillingAdminUsage): number {
  if (!row.limit_value || row.limit_value <= 0) return 0;
  return Math.min(100, Math.round((row.used / row.limit_value) * 100));
}

function isExceeded(row: BillingAdminUsage): boolean {
  return row.limit_value !== null && row.used > row.limit_value;
}

export default function AdminBilling() {
  const { data, isLoading, isError, error } = useBillingAdminTenants();
  const tenants = data?.tenants ?? [];
  const plans = data?.plans ?? [];

  const summary = useMemo(() => {
    const exceeded = tenants.filter((tenant) => tenant.exceeded_metrics.length > 0).length;
    const active = tenants.filter((tenant) => tenant.subscription?.status === "active").length;
    return { exceeded, active };
  }, [tenants]);

  return (
    <PageShell contentClassName="flex flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Assinaturas</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Atribua planos aos tenants e acompanhe uso acima do limite contratado.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-2 px-3 py-1.5">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Somente plataforma
        </Badge>
      </div>

      <AdminNav />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Tenants</p>
            <p className="mt-1 text-2xl font-semibold">{tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Assinaturas ativas</p>
            <p className="mt-1 text-2xl font-semibold">{summary.active}</p>
          </CardContent>
        </Card>
        <Card className={summary.exceeded > 0 ? "border-destructive/30 bg-destructive/5" : undefined}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Acima do limite</p>
            <p className={summary.exceeded > 0 ? "mt-1 text-2xl font-semibold text-destructive" : "mt-1 text-2xl font-semibold"}>
              {summary.exceeded}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando billing...</CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error?.message ?? "Acesso negado."}</CardContent>
        </Card>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Nenhum tenant encontrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <TenantBillingRow key={tenant.tenant_id} tenant={tenant} plans={plans} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function TenantBillingRow({ tenant, plans }: { tenant: BillingAdminTenant; plans: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  const currentPlan = tenant.subscription?.plan_id ?? "starter";
  const currentStatus = tenant.subscription?.status ?? "active";
  const currentPeriod = tenant.subscription?.billing_period ?? "monthly";

  const [planId, setPlanId] = useState(currentPlan);
  const [status, setStatus] = useState<BillingStatus>(currentStatus);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(currentPeriod);
  const [reason, setReason] = useState("");

  const save = useSetBillingAdminTenantPlan({
    onSuccess: (result) => {
      toast({
        title: result.scheduled ? "Mudanca agendada." : "Assinatura atualizada.",
        description: result.scheduled && result.effective_at
          ? `O novo plano entra em vigor em ${new Date(result.effective_at).toLocaleDateString("pt-BR")}.`
          : undefined,
      });
      setReason("");
    },
    onError: (e) => toast({ title: "Nao foi possivel salvar", description: e.message, variant: "destructive" }),
  });

  const dirty = planId !== currentPlan || status !== currentStatus || billingPeriod !== currentPeriod;
  const hasExceeded = tenant.exceeded_metrics.length > 0;
  const planOptions = plans.length > 0 ? plans : [{ id: "starter", name: "Starter" }, { id: "profissional", name: "Profissional" }, { id: "enterprise", name: "Enterprise" }];

  return (
    <Card className={hasExceeded ? "border-destructive/30" : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{tenant.nome}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{tenant.tenant_id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasExceeded ? (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Limite excedido
              </Badge>
            ) : null}
            <Badge variant={status === "active" ? "default" : "outline"}>{STATUS_LABEL[status]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr_0.8fr_1.2fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Plano</p>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {planOptions.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <Select value={status} onValueChange={(value) => setStatus(value as BillingStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_STATUS.map((item) => (
                  <SelectItem key={item} value={item}>{STATUS_LABEL[item]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Cobranca</p>
            <Select value={billingPeriod} onValueChange={(value) => setBillingPeriod(value as BillingPeriod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Motivo da alteracao</p>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: cortesia aprovada" />
          </div>
          <Button
            disabled={!dirty || reason.trim().length < 5 || save.isPending}
            onClick={() => save.mutate({ tenantId: tenant.tenant_id, planId, status, billingPeriod, reason: reason.trim() })}
          >
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tenant.usage.filter((row) => row.metric !== "ai_monthly_tokens").map((row) => (
            <div key={row.metric} className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{METRIC_LABEL[row.metric] ?? row.metric}</p>
                <p className={isExceeded(row) ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>
                  {nf(row.used)}{row.limit_value === null ? "" : ` / ${nf(row.limit_value)}`}
                </p>
              </div>
              <Progress value={usagePct(row)} className={isExceeded(row) ? "mt-3 h-2 bg-destructive/15 [&>div]:bg-destructive" : "mt-3 h-2"} />
            </div>
          ))}
        </div>

        {tenant.subscription?.gateway_subscription_id ? (
          <p className="text-xs text-muted-foreground">
            Gateway: {tenant.subscription.gateway_provider ?? "asaas"} · {tenant.subscription.gateway_status ?? "sem status"} ·{" "}
            {tenant.subscription.gateway_subscription_id}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Assinatura sem vinculo de gateway. Use para ajustes manuais de suporte.</p>
        )}
      </CardContent>
    </Card>
  );
}
