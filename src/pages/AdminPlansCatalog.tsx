import { useMemo, useState } from "react";
import { Layers, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { PageShell } from "@/components/layout/PageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  type BillingAdminCatalogPlan,
  type BillingAdminUpsertPlanInput,
  useBillingAdminCatalog,
  useDeleteBillingAdminPlan,
  useUpsertBillingAdminPlan,
} from "@/lib/api/billing-admin";

const LIMIT_FIELDS = [
  { key: "customers", label: "Clientes" },
  { key: "whatsapp_instances", label: "Canais WhatsApp" },
  { key: "users", label: "Usuarios" },
  { key: "marketing_flow_runs_monthly", label: "Automacoes / mes" },
  { key: "storage_gb", label: "Armazenamento (GB)" },
] as const;

type PlanFormState = {
  id: string;
  name: string;
  description: string;
  sort_order: string;
  status: "active" | "archived";
  custom_api: boolean;
  support: string;
  featuresText: string;
  monthlyReais: string;
  yearlyReais: string;
  limits: Record<string, string>;
};

function emptyForm(): PlanFormState {
  return {
    id: "",
    name: "",
    description: "",
    sort_order: "10",
    status: "active",
    custom_api: false,
    support: "email",
    featuresText: "",
    monthlyReais: "",
    yearlyReais: "",
    limits: Object.fromEntries(LIMIT_FIELDS.map((field) => [field.key, ""])),
  };
}

function planToForm(plan: BillingAdminCatalogPlan): PlanFormState {
  const ent = plan.entitlements ?? {};
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? "",
    sort_order: String(plan.sort_order ?? 0),
    status: plan.status === "archived" ? "archived" : "active",
    custom_api: ent.custom_api === true,
    support: typeof ent.support === "string" ? ent.support : "email",
    featuresText: (plan.features ?? []).join("\n"),
    monthlyReais: plan.prices.monthly ? String(plan.prices.monthly.amount_cents / 100) : "",
    yearlyReais: plan.prices.yearly ? String(plan.prices.yearly.amount_cents / 100) : "",
    limits: Object.fromEntries(
      LIMIT_FIELDS.map((field) => {
        const raw = ent[field.key];
        return [field.key, raw === null || raw === undefined ? "" : String(raw)];
      }),
    ),
  };
}

function planToInput(plan: BillingAdminCatalogPlan): BillingAdminUpsertPlanInput | null {
  if (!plan.prices.monthly || !plan.prices.yearly) return null;
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description ?? "",
    sort_order: plan.sort_order,
    status: plan.status,
    entitlements: plan.entitlements,
    features: plan.features,
    prices: {
      monthly: plan.prices.monthly.amount_cents,
      yearly: plan.prices.yearly.amount_cents,
    },
  };
}

function parseLimitInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

function reaisToCents(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
}

function formatLimit(value: unknown) {
  if (value === null || value === undefined) return "Ilimitado";
  return Number(value).toLocaleString("pt-BR");
}

export default function AdminPlansCatalog() {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useBillingAdminCatalog();
  const plans = useMemo(() => data?.plans ?? [], [data?.plans]);
  const abacatePayConfigured = data?.abacatepay_configured === true;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<BillingAdminCatalogPlan | null>(null);
  const [form, setForm] = useState<PlanFormState>(emptyForm);

  const save = useUpsertBillingAdminPlan({
    onSuccess: () => {
      toast({ title: editingId ? "Plano atualizado." : "Plano criado." });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (e) => toast({ title: "Nao foi possivel salvar", description: e.message, variant: "destructive" }),
  });
  const remove = useDeleteBillingAdminPlan({
    onSuccess: () => {
      toast({ title: "Plano excluido no WChat e na AbacatePay." });
      setDeletingPlan(null);
    },
    onError: (e) => toast({ title: "Nao foi possivel excluir", description: e.message, variant: "destructive" }),
  });
  const sync = useUpsertBillingAdminPlan({
    onSuccess: () => toast({ title: "Plano sincronizado com a AbacatePay." }),
    onError: (e) => toast({ title: "Nao foi possivel sincronizar", description: e.message, variant: "destructive" }),
  });

  const activeCount = useMemo(() => plans.filter((plan) => plan.status === "active").length, [plans]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(plan: BillingAdminCatalogPlan) {
    setEditingId(plan.id);
    setForm(planToForm(plan));
    setDialogOpen(true);
  }

  function submitPlan() {
    const monthly = reaisToCents(form.monthlyReais);
    const yearly = reaisToCents(form.yearlyReais);
    if (!form.name.trim()) {
      toast({ title: "Informe o nome do plano.", variant: "destructive" });
      return;
    }
    if (!editingId && !form.id.trim()) {
      toast({ title: "Informe o ID do plano.", variant: "destructive" });
      return;
    }
    if (monthly === null || yearly === null) {
      toast({ title: "Informe os precos mensal e anual.", variant: "destructive" });
      return;
    }

    const entitlements: Record<string, unknown> = {
      support: form.support.trim() || "email",
      custom_api: form.custom_api,
    };
    for (const field of LIMIT_FIELDS) {
      entitlements[field.key] = parseLimitInput(form.limits[field.key] ?? "");
    }

    const payload: BillingAdminUpsertPlanInput = {
      id: editingId ?? form.id.trim().toLowerCase(),
      name: form.name.trim(),
      description: form.description.trim(),
      sort_order: Number(form.sort_order) || 0,
      status: form.status,
      entitlements,
      features: form.featuresText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      prices: { monthly, yearly },
    };

    save.mutate(payload);
  }

  return (
    <PageShell contentClassName="flex flex-col space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Layers className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Catalogo de planos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Defina limites, precos e beneficios exibidos na assinatura.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Somente plataforma
          </Badge>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Criar plano
          </Button>
        </div>
      </div>

      <AdminNav />

      <Card className={abacatePayConfigured ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">AbacatePay</p>
            <p className="text-xs text-muted-foreground">
              {abacatePayConfigured
                ? "Conectada. Novos planos criam produtos recorrentes mensal e anual automaticamente."
                : "Nao configurada. Adicione ABACATEPAY_API_KEY aos secrets das Edge Functions."}
            </p>
          </div>
          <Badge variant="outline">{abacatePayConfigured ? "Conectada" : "Configuracao pendente"}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Planos no catalogo</p>
            <p className="mt-1 text-2xl font-semibold">{plans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ativos</p>
            <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Arquivados</p>
            <p className="mt-1 text-2xl font-semibold">{plans.length - activeCount}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando catalogo...</CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{error?.message ?? "Acesso negado."}</CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
            <Button onClick={openCreate}>Criar primeiro plano</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.id} className={plan.status === "archived" ? "opacity-75" : undefined}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{plan.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={plan.status === "active" ? "default" : "outline"}>
                      {plan.status === "active" ? "Ativo" : "Arquivado"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openEdit(plan)}>
                      Editar
                    </Button>
                    {!plan.prices.monthly?.gateway_product_id || !plan.prices.yearly?.gateway_product_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!abacatePayConfigured || sync.isPending || !planToInput(plan)}
                        onClick={() => {
                          const input = planToInput(plan);
                          if (input) sync.mutate(input);
                        }}
                      >
                        {sync.isPending ? "Sincronizando..." : "Sincronizar"}
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Excluir plano ${plan.name}`}
                      onClick={() => setDeletingPlan(plan)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.description ? <p className="text-sm text-muted-foreground">{plan.description}</p> : null}
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="secondary">
                    Mensal: {plan.prices.monthly ? formatCurrency(plan.prices.monthly.amount_cents) : "—"}
                  </Badge>
                  <Badge variant="secondary">
                    Anual: {plan.prices.yearly ? formatCurrency(plan.prices.yearly.amount_cents) : "—"}
                  </Badge>
                  <Badge variant="outline">
                    {plan.prices.monthly?.gateway_product_id && plan.prices.yearly?.gateway_product_id
                      ? "Sincronizado com AbacatePay"
                      : "Pendente de sincronizacao"}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {LIMIT_FIELDS.map((field) => (
                    <div key={field.key} className="rounded-md border bg-background px-3 py-2 text-sm">
                      <p className="text-xs text-muted-foreground">{field.label}</p>
                      <p className="font-medium">{formatLimit(plan.entitlements?.[field.key])}</p>
                    </div>
                  ))}
                </div>
                {(plan.features ?? []).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar plano" : "Criar plano"}</DialogTitle>
            <DialogDescription>
              Limites vazios significam ilimitado. Precos em reais (ex.: 497 para R$ 497/mes).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="plan-id">ID (slug)</Label>
                <Input
                  id="plan-id"
                  value={form.id}
                  disabled={Boolean(editingId)}
                  placeholder="ex.: agencia"
                  onChange={(e) => setForm((prev) => ({ ...prev, id: e.target.value.toLowerCase() }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-name">Nome</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-description">Descricao</Label>
              <Textarea
                id="plan-description"
                value={form.description}
                rows={2}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="plan-sort">Ordem</Label>
                <Input
                  id="plan-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as "active" | "archived" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-support">Suporte</Label>
                <Input
                  id="plan-support"
                  value={form.support}
                  placeholder="email, whatsapp, priority"
                  onChange={(e) => setForm((prev) => ({ ...prev, support: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="plan-monthly">Preco mensal (R$)</Label>
                <Input
                  id="plan-monthly"
                  inputMode="decimal"
                  value={form.monthlyReais}
                  onChange={(e) => setForm((prev) => ({ ...prev, monthlyReais: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-yearly">Preco anual total (R$)</Label>
                <Input
                  id="plan-yearly"
                  inputMode="decimal"
                  value={form.yearlyReais}
                  onChange={(e) => setForm((prev) => ({ ...prev, yearlyReais: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">API customizada</p>
                <p className="text-xs text-muted-foreground">Habilita entitlements.custom_api</p>
              </div>
              <Switch checked={form.custom_api} onCheckedChange={(checked) => setForm((prev) => ({ ...prev, custom_api: checked }))} />
            </div>

            <div className="space-y-2">
              <Label>Limites</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {LIMIT_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`limit-${field.key}`} className="text-xs text-muted-foreground">
                      {field.label}
                    </Label>
                    <Input
                      id={`limit-${field.key}`}
                      inputMode="numeric"
                      placeholder="Vazio = ilimitado"
                      value={form.limits[field.key] ?? ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          limits: { ...prev.limits, [field.key]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-features">Beneficios (um por linha)</Label>
              <Textarea
                id="plan-features"
                rows={4}
                value={form.featuresText}
                onChange={(e) => setForm((prev) => ({ ...prev, featuresText: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitPlan} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : editingId ? "Salvar alteracoes" : "Criar plano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingPlan)} onOpenChange={(open) => !open && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o plano {deletingPlan?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao exclui o plano local e os dois produtos recorrentes na AbacatePay. Ela e irreversivel e sera bloqueada se houver assinaturas vinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending || !deletingPlan}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deletingPlan) remove.mutate(deletingPlan.id);
              }}
            >
              {remove.isPending ? "Excluindo..." : "Excluir plano"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
