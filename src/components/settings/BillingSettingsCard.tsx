import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, CheckCircle2, CreditCard, Infinity as InfinityIcon, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  createAbacatePayCheckout,
  cancelAbacatePaySubscription,
  useBillingPlansCatalog,
  useTenantBillingSnapshot,
  type BillingPlanCatalogItem,
  type BillingStatus,
  type BillingUsageCounter,
} from "@/lib/api/billing";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";

const STATUS_LABEL: Record<BillingStatus, string> = {
  trialing: "Teste",
  active: "Ativo",
  past_due: "Pagamento pendente",
  paused: "Pausado",
  canceled: "Cancelado",
  incomplete: "Incompleto",
};

const STATUS_CLASS: Record<BillingStatus, string> = {
  trialing: "bg-warning/20 text-warning",
  active: "bg-success/20 text-success",
  past_due: "bg-destructive/15 text-destructive",
  paused: "bg-muted text-muted-foreground",
  canceled: "bg-destructive/15 text-destructive",
  incomplete: "bg-warning/20 text-warning",
};

const METRIC_LABEL: Record<string, string> = {
  customers: "Clientes",
  whatsapp_instances: "Canais WhatsApp",
  users: "Usuarios",
  marketing_flow_runs_monthly: "Execucoes de automacao",
  storage_gb: "Armazenamento (GB)",
};

const ENTITLEMENT_LABEL: Record<string, string> = {
  users: "Usuarios",
  whatsapp_instances: "Canais WhatsApp",
  customers: "Clientes",
  marketing_flow_runs_monthly: "Automacoes",
  storage_gb: "Armazenamento",
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "Nao definido";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value: number | null) {
  if (value === null) return "Ilimitado";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function usagePercent(counter: BillingUsageCounter) {
  if (!counter.limit_value || counter.limit_value <= 0) return 0;
  return Math.min(100, Math.round((counter.used / counter.limit_value) * 100));
}

function usageState(counter: BillingUsageCounter) {
  if (counter.limit_value === null || counter.limit_value <= 0) return "unlimited";
  const percent = usagePercent(counter);
  if (counter.used >= counter.limit_value) return "blocked";
  if (percent >= 80) return "warning";
  return "ok";
}

function usageBadge(counter: BillingUsageCounter) {
  const state = usageState(counter);
  if (state === "blocked") return { label: "Limite atingido", className: "bg-destructive/15 text-destructive" };
  if (state === "warning") return { label: "Atenção", className: "bg-warning/20 text-warning" };
  if (state === "unlimited") return { label: "Ilimitado", className: "bg-success/15 text-success" };
  return { label: "Ok", className: "bg-success/15 text-success" };
}

export function BillingSettingsCard() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useTenantBillingSnapshot();
  const { data: plans = [] } = useBillingPlansCatalog();
  const subscription = data?.subscription ?? null;
  const usage = (data?.usage ?? []).filter((counter) => counter.metric !== "ai_monthly_tokens");
  const price = subscription?.price;
  const blockedUsage = usage.filter((counter) => usageState(counter) === "blocked");
  const warningUsage = usage.filter((counter) => usageState(counter) === "warning");
  const billingState = searchParams.get("billing");

  useEffect(() => {
    if (billingState === "success") {
      void refetch();
    }
  }, [billingState, refetch]);

  const billingNotice =
    billingState === "success"
      ? {
          title: "Pagamento recebido",
          description: "Atualizamos a leitura da assinatura com o status mais recente.",
          tone: "success" as const,
        }
      : billingState === "cancel"
        ? {
            title: "Checkout cancelado",
            description: "Nenhuma alteração foi aplicada. Voce pode tentar novamente quando quiser.",
            tone: "warning" as const,
          }
        : billingState === "expired"
          ? {
              title: "Checkout expirado",
              description: "O link da AbacatePay expirou. Gere um novo checkout para continuar.",
              tone: "warning" as const,
            }
          : null;

  function clearBillingState() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("billing");
      return next;
    }, { replace: true });
  }

  const planComparison = useMemo(
    () =>
      [...plans]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((plan) => ({
          ...plan,
          price: plan.prices[subscription?.billing_period ?? "monthly"],
        })),
    [plans, subscription?.billing_period],
  );

  function formatEntitlement(value: unknown) {
    if (value === null || value === undefined || value === "") return "Ilimitado";
    if (typeof value === "boolean") return value ? "Sim" : "Nao";
    if (typeof value === "number") return new Intl.NumberFormat("pt-BR").format(value);
    return String(value);
  }

  function planFeatures(plan: BillingPlanCatalogItem) {
    return Object.entries(plan.entitlements)
      .filter(([key]) => ENTITLEMENT_LABEL[key])
      .map(([key, value]) => `${ENTITLEMENT_LABEL[key]}: ${formatEntitlement(value)}`)
      .slice(0, 4);
  }

  async function openCheckout(planId: string, billingPeriod = subscription?.billing_period ?? "monthly") {
    setCheckoutLoading(planId);
    try {
      const result = await createAbacatePayCheckout({
        planId,
        billingPeriod,
      });
      if (result.mode === "scheduled_change") {
        await refetch();
        toast({
          title: "Mudanca de plano agendada",
          description: result.effectiveAt
            ? `O novo plano entra em vigor em ${formatDate(result.effectiveAt)}.`
            : "O novo plano entra em vigor no proximo ciclo.",
        });
        setCompareOpen(false);
        return;
      }
      if (!result.checkoutUrl) {
        throw new Error("A AbacatePay nao retornou o link do checkout.");
      }
      window.location.assign(result.checkoutUrl);
    } catch (checkoutError) {
      toast({
        title: "Nao foi possivel abrir o checkout",
        description: checkoutError instanceof Error ? checkoutError.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function cancelSubscription() {
    if (!window.confirm("Cancelar a assinatura agora? O acesso sera bloqueado imediatamente e nao havera novas cobrancas.")) return;
    setCanceling(true);
    try {
      await cancelAbacatePaySubscription();
      await refetch();
      toast({ title: "Assinatura cancelada", description: "O acesso e as cobrancas recorrentes foram encerrados." });
    } catch (cancelError) {
      toast({
        title: "Nao foi possivel cancelar",
        description: cancelError instanceof Error ? cancelError.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCanceling(false);
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border/60 bg-card/80">
        <CardContent className="flex min-h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando assinatura...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-card/80">
        <CardContent className="flex min-h-64 items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Nao foi possivel carregar os dados de assinatura: {error.message}
        </CardContent>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5 text-accent" />
            Plano e assinatura
          </CardTitle>
          <CardDescription>Este tenant ainda nao tem uma assinatura criada.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {billingNotice ? (
        <Alert className={billingNotice.tone === "success" ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>{billingNotice.title}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{billingNotice.description}</span>
            <Button variant="outline" size="sm" onClick={clearBillingState} disabled={isFetching}>
              {isFetching ? "Atualizando..." : "Fechar aviso"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-accent" />
                Plano e assinatura
              </CardTitle>
              <CardDescription>Visao operacional do plano contratado e ciclo atual.</CardDescription>
            </div>
            <Badge className={STATUS_CLASS[subscription.status]}>
              {STATUS_LABEL[subscription.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-2xl border border-border bg-secondary/35 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plano atual</p>
                <h2 className="mt-2 text-3xl font-bold text-foreground">{subscription.plan.name}</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subscription.plan.description}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {subscription.billing_period === "yearly" ? "Anual" : "Mensal"}
                </p>
                <p className="mt-2 text-2xl font-bold text-foreground">
                  {price ? formatCurrency(price.amount_cents, price.currency) : "Valor manual"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Pagamento processado pela AbacatePay em ambiente seguro.
              </p>
              {subscription.status !== "active" ? (
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={checkoutLoading !== null || !price}
                  onClick={() => void openCheckout(subscription.plan_id, subscription.billing_period)}
                >
                  {checkoutLoading === subscription.plan_id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {subscription.status === "trialing" ? "Ativar assinatura" : "Regularizar assinatura"}
                </Button>
              ) : <Badge className="bg-success/20 text-success">Assinatura ativa</Badge>}
            </div>
          </div>

          {subscription.pending_plan ? (
            <Alert className="border-warning/40 bg-warning/10 text-warning">
              <TrendingUp className="h-4 w-4" />
              <AlertTitle>Mudanca de plano agendada</AlertTitle>
              <AlertDescription>
                O plano {subscription.pending_plan.name} entra em vigor {subscription.pending_effective_at
                  ? `em ${formatDate(subscription.pending_effective_at)}`
                  : "no proximo ciclo de cobranca"}.
              </AlertDescription>
            </Alert>
          ) : null}

          {blockedUsage.length > 0 || warningUsage.length > 0 ? (
            <Alert
              variant={blockedUsage.length > 0 ? "destructive" : "default"}
              className={blockedUsage.length > 0 ? "" : "border-warning/40 bg-warning/10 text-warning"}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {blockedUsage.length > 0 ? "Limite de plano atingido" : "Uso perto do limite"}
              </AlertTitle>
              <AlertDescription>
                {blockedUsage.length > 0
                  ? `Recursos bloqueados: ${blockedUsage.map((item) => METRIC_LABEL[item.metric] ?? item.metric).join(", ")}.`
                  : `Atenção em: ${warningUsage.map((item) => METRIC_LABEL[item.metric] ?? item.metric).join(", ")}.`}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Inicio do ciclo</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatDate(subscription.current_period_start)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Renovacao</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {formatDate(subscription.current_period_end)}
              </p>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cancelamento</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {subscription.cancel_at_period_end ? "Cancela no fim do ciclo" : "Renova automaticamente"}
              </p>
            </div>
          </div>

          {subscription.status === "active" ? (
            <div className="flex justify-end">
              <Button variant="destructive" disabled={canceling} onClick={() => void cancelSubscription()}>
                {canceling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Cancelar assinatura
              </Button>
            </div>
          ) : null}

          <Separator />

          <div className="space-y-3 rounded-2xl border border-border bg-secondary/25 p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Upgrade de plano</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Se algum recurso estiver no limite, escolha outro plano. A mudanca sera agendada para o proximo ciclo.
            </p>
            <div className="flex flex-wrap gap-2">
              {planComparison.filter((plan) => plan.id !== subscription.plan_id && plan.price).map((plan, index) => (
                <Button
                  key={plan.id}
                  variant={index === 0 ? "default" : "outline"}
                  className={index === 0 ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                  disabled={checkoutLoading !== null}
                  onClick={() => void openCheckout(plan.id, subscription.billing_period)}
                >
                  {checkoutLoading === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Ir para {plan.name}
                </Button>
              ))}
              <Button variant="outline" onClick={() => setCompareOpen(true)}>
                Comparar planos
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold text-foreground">Recursos inclusos</h3>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {subscription.plan.features.map((feature) => (
                <div key={feature} className="flex items-start gap-2 rounded-xl border border-border/70 p-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg">Limites de uso</CardTitle>
          <CardDescription>Acompanhamento mensal do tenant atual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.length === 0 ? (
            <p className="rounded-2xl border border-border bg-secondary/35 p-4 text-sm text-muted-foreground">
              Nenhum contador de uso foi criado para este ciclo.
            </p>
          ) : (
            usage.map((counter) => {
              const percent = usagePercent(counter);
              const badge = usageBadge(counter);
              const state = usageState(counter);
              return (
                <div
                  key={counter.metric}
                  className={[
                    "space-y-2 rounded-2xl border p-4",
                    state === "blocked"
                      ? "border-destructive/40 bg-destructive/5"
                      : state === "warning"
                        ? "border-warning/40 bg-warning/5"
                        : "border-border",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {METRIC_LABEL[counter.metric] ?? counter.metric}
                      </p>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatNumber(counter.used)}</span>
                      <span>/</span>
                      {counter.limit_value === null ? (
                        <span className="inline-flex items-center gap-1">
                          <InfinityIcon className="h-4 w-4" />
                          ilimitado
                        </span>
                      ) : (
                        <span>{formatNumber(counter.limit_value)}</span>
                      )}
                    </div>
                  </div>
                  <Progress value={percent} className="h-2" />
                  {counter.limit_value !== null ? (
                    <p
                      className={[
                        "text-xs",
                        state === "blocked"
                          ? "text-destructive"
                          : state === "warning"
                            ? "text-warning"
                            : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {percent}% usado
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Ciclo: {formatDate(counter.period_start)} ate {formatDate(counter.period_end)}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      </div>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Comparar planos</DialogTitle>
            <DialogDescription>
              Compare os planos ativos lado a lado no periodo{" "}
              {subscription.billing_period === "yearly" ? "anual" : "mensal"} antes de abrir o checkout.
            </DialogDescription>
          </DialogHeader>

          {planComparison.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              Nenhum plano ativo encontrado para comparar.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {planComparison.map((plan) => {
                const active = plan.id === subscription.plan_id;
                const features = planFeatures(plan);
                return (
                  <div
                    key={plan.id}
                    className={[
                      "rounded-2xl border p-4",
                      active ? "border-accent bg-accent/5" : "border-border bg-background",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Plano</p>
                        <h3 className="mt-1 text-xl font-semibold text-foreground">{plan.name}</h3>
                      </div>
                      {active ? <Badge className="bg-success/20 text-success">Atual</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    <div className="mt-4 flex items-end justify-between gap-3 border-t pt-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {subscription.billing_period === "yearly" ? "Anual" : "Mensal"}
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">
                          {plan.price ? formatCurrency(plan.price.amount_cents, plan.price.currency) : "Sob consulta"}
                        </p>
                      </div>
                      {!active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={checkoutLoading !== null}
                          onClick={() => void openCheckout(plan.id, subscription.billing_period)}
                        >
                          {checkoutLoading === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Escolher
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-2">
                      {features.length > 0 ? (
                        features.map((feature) => (
                          <div key={feature} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            <span className="text-muted-foreground">{feature}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Sem limites detalhados cadastrados.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
