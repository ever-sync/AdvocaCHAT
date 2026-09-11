import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, LockKeyhole, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  billingSnapshotQueryKey,
  createAbacatePayCheckout,
  useBillingPlansCatalog,
  useBillingAddons,
  useTenantBillingSnapshot,
  verifyAbacatePayCheckout,
  type BillingPeriod,
} from "@/lib/api/billing";
import { isBillingAccessAllowed } from "@/lib/billing-access";
import { usePlatformAdminAccess } from "@/lib/api/platform-admin";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function TrialActivationGate() {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading } = useTenantBillingSnapshot();
  const { data: plans = [] } = useBillingPlansCatalog();
  const { data: addons = [] } = useBillingAddons();
  const { data: platformAccess, isLoading: adminLoading } = usePlatformAdminAccess();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (searchParams.get("billing") !== "success" || verificationStarted.current) return;
    verificationStarted.current = true;
    setVerifying(true);
    void verifyAbacatePayCheckout()
      .then(async (result) => {
        if (result.active) {
          await queryClient.invalidateQueries({ queryKey: billingSnapshotQueryKey });
          toast({ title: "Plano ativado", description: "Pagamento confirmado. Seu acesso foi liberado." });
          setSearchParams((current) => {
            current.delete("billing");
            return current;
          }, { replace: true });
        } else {
          toast({ title: "Pagamento em processamento", description: "Assim que a AbacatePay confirmar, o acesso sera liberado." });
        }
      })
      .catch((error) => toast({ title: "Nao foi possivel confirmar o pagamento", description: error.message, variant: "destructive" }))
      .finally(() => setVerifying(false));
  }, [queryClient, searchParams, setSearchParams, toast]);

  const subscription = data?.subscription;
  const blocked = data?.access ? !data.access.allowed : !isBillingAccessAllowed(subscription);
  const availablePlans = useMemo(() => plans.filter((plan) => plan.prices[period]), [period, plans]);
  const aiAddon = addons.find((addon) => addon.id === "ia");

  if (isLoading || adminLoading || platformAccess?.isPlatformAdmin || !blocked) return null;

  async function openCheckout(planId: string) {
    setCheckoutLoading(planId);
    try {
      const result = await createAbacatePayCheckout({ planId, billingPeriod: period });
      if (result.mode === "scheduled_change") {
        await queryClient.invalidateQueries({ queryKey: billingSnapshotQueryKey });
        toast({ title: "Mudanca agendada", description: "O novo plano entra em vigor no proximo ciclo." });
        return;
      }
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast({ title: "Nao foi possivel abrir o checkout", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
      setCheckoutLoading(null);
    }
  }

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="max-w-3xl [&>button]:hidden" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-2xl">Seu periodo gratuito terminou</DialogTitle>
          <DialogDescription className="text-center">
            Ative o Sistema para continuar usando o AdvocaCHAT. A IA e um modulo separado e nao esta inclusa nesta assinatura.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto flex rounded-lg border p-1">
          <Button size="sm" variant={period === "monthly" ? "default" : "ghost"} onClick={() => setPeriod("monthly")}>Mensal</Button>
          <Button size="sm" variant={period === "yearly" ? "default" : "ghost"} onClick={() => setPeriod("yearly")}>Anual</Button>
        </div>

        {verifying ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Confirmando pagamento...</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {availablePlans.map((plan) => (
              <Card key={plan.id} className="border-primary/30">
                <CardContent className="space-y-4 p-5">
                  <div><Badge>Sistema</Badge><h3 className="mt-2 text-xl font-semibold">{plan.name}</h3><p className="text-sm text-muted-foreground">{plan.description}</p></div>
                  <p className="text-3xl font-bold">{money(plan.prices[period]!.amount_cents)}<span className="text-sm font-normal text-muted-foreground">/{period === "monthly" ? "mes" : "ano"}</span></p>
                  <ul className="space-y-2 text-sm">{plan.features.slice(0, 5).map((feature) => <li key={feature} className="flex gap-2"><Check className="h-4 w-4 text-primary" />{feature}</li>)}</ul>
                  <Button className="w-full" disabled={checkoutLoading !== null} onClick={() => void openCheckout(plan.id)}>{checkoutLoading === plan.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Ativar Sistema</Button>
                </CardContent>
              </Card>
            ))}
            <Card className="border-violet-500/30 bg-violet-500/5">
              <CardContent className="space-y-4 p-5">
                <div><Badge variant="outline" className="gap-1"><Sparkles className="h-3 w-3" />Add-on separado</Badge><h3 className="mt-2 text-xl font-semibold">Inteligencia Artificial</h3><p className="text-sm text-muted-foreground">Automacoes e agente inteligente, contratados separadamente do Sistema.</p></div>
                <p className="text-3xl font-bold">{money(aiAddon?.amount_cents ?? 44700)}<span className="text-sm font-normal text-muted-foreground">/mes</span></p>
                <p className="text-sm text-muted-foreground">Disponivel depois da ativacao do Sistema. O superadmin gerencia liberacao e cota.</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Button variant="ghost" className="mx-auto" onClick={() => void signOut()}>Sair da conta</Button>
      </DialogContent>
    </Dialog>
  );
}
