import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { type AiTenantRow, useAiAddonCatalog, useAiTenants, useSetAiTenantSubscription, useUpdateAiAddonCatalog } from "@/lib/api/ai-agent";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageShell } from "@/components/layout/PageShell";

function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

const TRIAL_DAYS = 7;
const TRIAL_QUOTA = 1_000_000;

/** Painel super-admin: provisiona o add-on de IA por tenant (ativar/desativar + cota). */
export default function AdminIA() {
  const { toast } = useToast();
  const { data: tenants = [], isLoading, isError, error } = useAiTenants();
  const { data: addon } = useAiAddonCatalog();
  const [addonPrice, setAddonPrice] = useState("447");
  const saveAddon = useUpdateAiAddonCatalog({
    onSuccess: () => toast({ title: "Preco do add-on atualizado." }),
    onError: (e) => toast({ title: "Nao foi possivel salvar", description: e.message, variant: "destructive" }),
  });
  useEffect(() => {
    if (addon) setAddonPrice(String(addon.amount_cents / 100));
  }, [addon]);

  return (
    <PageShell contentClassName="flex flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Provisionamento da IA</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ative o add-on de IA e defina a cota mensal de cada cliente. Só administradores da plataforma.
            </p>
          </div>
        </div>
      </div>

      <AdminNav />

      <Card>
        <CardHeader><CardTitle className="text-base">Preco do modulo de IA</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>Valor mensal (R$)</Label><Input className="w-48" inputMode="decimal" value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} /></div>
          <Button disabled={saveAddon.isPending} onClick={() => saveAddon.mutate({ amountCents: Math.round(Number(addonPrice.replace(",", ".")) * 100), active: true })}>{saveAddon.isPending ? "Salvando..." : "Salvar preco"}</Button>
          <p className="text-xs text-muted-foreground">Produto separado da assinatura do Sistema.</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando…</CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {error?.message ?? "Acesso negado."}
          </CardContent>
        </Card>
      ) : tenants.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Nenhum tenant encontrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => (
            <TenantRow key={tenant.tenant_id} row={tenant} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function TenantRow({ row }: { row: AiTenantRow }) {
  const { toast } = useToast();
  const [active, setActive] = useState(row.active);
  const [quota, setQuota] = useState(row.monthly_token_quota);
  const [overage, setOverage] = useState(row.overage_allowed);

  const save = useSetAiTenantSubscription({
    onSuccess: () => toast({ title: "Provisionamento salvo." }),
    onError: (e) => toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" }),
  });

  const dirty = active !== row.active || quota !== row.monthly_token_quota || overage !== row.overage_allowed;
  const usagePct = quota > 0 ? Math.round((row.tokens_used / quota) * 100) : null;

  const trialDate = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  const trialActive = trialDate ? trialDate > new Date() : false;
  const trialExpired = trialDate ? trialDate <= new Date() : false;

  function startTrial() {
    const ends = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    save.mutate({ tenantId: row.tenant_id, active: true, monthlyTokenQuota: TRIAL_QUOTA, overageAllowed: false, trialEndsAt: ends });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{row.nome}</CardTitle>
          {trialActive ? (
            <Badge variant="secondary" className="font-normal">
              trial até {trialDate!.toLocaleDateString("pt-BR")}
            </Badge>
          ) : trialExpired ? (
            <Badge variant="outline" className="font-normal text-destructive">trial expirado</Badge>
          ) : (
            <Badge variant={active ? "default" : "outline"} className="font-normal">
              {active ? "ativo" : "inativo"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Add-on ativo</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <div className="grid gap-1.5">
            <Label className="text-xs">Cota mensal (tokens)</Label>
            <Input
              type="number"
              min={0}
              value={quota}
              onChange={(e) => setQuota(Math.max(0, Number(e.target.value)))}
              className="w-48"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Permitir overage</span>
            <Switch checked={overage} onCheckedChange={setOverage} />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Uso no mês: <strong className="text-foreground">{nf(row.tokens_used)}</strong> tokens
          {quota > 0 ? ` de ${nf(quota)} (${usagePct}%)` : " (sem cota definida)"}
        </p>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={save.isPending} onClick={startTrial}>
            Iniciar trial ({TRIAL_DAYS}d)
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate({
                tenantId: row.tenant_id,
                active,
                monthlyTokenQuota: quota,
                overageAllowed: overage,
                trialEndsAt: null,
              })
            }
            title="Salva como plano permanente (encerra o trial)"
          >
            {save.isPending ? "Salvando…" : "Salvar (permanente)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
