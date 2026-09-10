import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  WEBHOOK_EVENTS,
  generateWebhookSecret,
  testWebhook,
  useCreateWebhook,
  useDeleteWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
  type Webhook,
} from "@/lib/api/webhooks";

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENTS.map((e) => [e.id, e.label]),
);

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function WebhookForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: Webhook;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const create = useCreateWebhook();
  const update = useUpdateWebhook();
  const isEdit = Boolean(initial);

  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? ["deal.won"]);
  const [secret, setSecret] = useState(initial?.secret ?? generateWebhookSecret());
  const [copied, setCopied] = useState(false);

  const toggleEvent = (id: string) =>
    setEvents((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = async () => {
    if (!/^https?:\/\/.+/.test(url.trim())) {
      toast({ title: "URL inválida", description: "Informe uma URL http(s) válida.", variant: "destructive" });
      return;
    }
    if (events.length === 0) {
      toast({ title: "Selecione eventos", description: "Escolha ao menos um evento.", variant: "destructive" });
      return;
    }
    try {
      if (isEdit && initial) {
        await update.mutateAsync({ id: initial.id, patch: { url, description, events } });
      } else {
        await create.mutateAsync({ url, description, events, secret });
      }
      toast({ title: isEdit ? "Webhook atualizado" : "Webhook criado" });
      onSaved();
    } catch (e) {
      toast({ title: "Erro ao salvar", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Card className="border-primary/30 bg-card/80">
      <CardHeader>
        <CardTitle className="text-base">{isEdit ? "Editar webhook" : "Novo webhook"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>URL de destino</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seu-endpoint.com/webhook" />
        </div>
        <div className="space-y-1.5">
          <Label>Descrição (opcional)</Label>
          <Input value={description ?? ""} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Integração com o ERP" />
        </div>
        <div className="space-y-2">
          <Label>Eventos</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEBHOOK_EVENTS.map((event) => (
              <label key={event.id} className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                <Checkbox checked={events.includes(event.id)} onCheckedChange={() => toggleEvent(event.id)} />
                <span>{event.label}</span>
              </label>
            ))}
          </div>
        </div>
        {!isEdit ? (
          <div className="space-y-1.5">
            <Label>Segredo de assinatura (HMAC)</Label>
            <div className="flex gap-2">
              <Input value={secret} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => void copySecret()}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSecret(generateWebhookSecret())}>
                Gerar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Usamos este segredo p/ assinar cada entrega no header <code>X-CaleoCRM-Signature: sha256=…</code>. Guarde-o
              com segurança — ele não é exibido depois.
            </p>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={create.isPending || update.isPending}>
            {isEdit ? "Salvar" : "Criar webhook"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeliveriesPanel({ webhookId }: { webhookId: string }) {
  const { data: deliveries = [], isLoading, refetch, isFetching } = useWebhookDeliveries(webhookId);
  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Entregas recentes</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", isFetching ? "animate-spin" : "")} />
          Atualizar
        </Button>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : deliveries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma entrega ainda.</p>
      ) : (
        <div className="space-y-1">
          {deliveries.slice(0, 10).map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
              <span className="font-medium">{EVENT_LABELS[d.event] ?? d.event}</span>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{formatDate(d.createdAt)}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "rounded-full px-2 py-0 text-[10px]",
                    d.status === "success" && "border-emerald-300 text-emerald-700 dark:text-emerald-300",
                    d.status === "error" && "border-rose-300 text-rose-700 dark:text-rose-300",
                    d.status === "pending" && "border-amber-300 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {d.status === "success" ? "ok" : d.status === "error" ? `falha${d.responseStatus ? ` ${d.responseStatus}` : ""}` : "na fila"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookRow({ webhook, canEdit, onEdit }: { webhook: Webhook; canEdit: boolean; onEdit: (w: Webhook) => void }) {
  const { toast } = useToast();
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testWebhook(webhook.id);
      if (res.ok) {
        toast({ title: "Teste enviado", description: `Endpoint respondeu ${res.status}.` });
      } else {
        toast({ title: "Falha no teste", description: res.error ?? "Sem resposta válida.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro ao testar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm text-foreground">{webhook.url}</span>
            {!webhook.active ? <Badge variant="outline" className="rounded-full text-[10px]">inativo</Badge> : null}
          </div>
          {webhook.description ? <p className="text-xs text-muted-foreground">{webhook.description}</p> : null}
          <div className="flex flex-wrap gap-1">
            {webhook.events.map((e) => (
              <Badge key={e} variant="secondary" className="rounded-full text-[10px]">
                {EVENT_LABELS[e] ?? e}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit ? (
            <Switch
              checked={webhook.active}
              onCheckedChange={(v) => update.mutate({ id: webhook.id, patch: { active: v } })}
              aria-label="Ativar webhook"
            />
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleTest()} disabled={testing}>
            <Send className={cn("mr-1 h-3.5 w-3.5", testing ? "animate-pulse" : "")} />
            Testar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowDeliveries((v) => !v)}>
            {showDeliveries ? "Ocultar" : "Entregas"}
          </Button>
          {canEdit ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(webhook)}>
                Editar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => {
                  if (confirm("Remover este webhook?")) del.mutate(webhook.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {showDeliveries ? <DeliveriesPanel webhookId={webhook.id} /> : null}
    </div>
  );
}

const DIRECTORY = [
  {
    name: "n8n",
    desc: "Orquestre fluxos com o nó Webhook recebendo os eventos do CaleoCRM (já há integração de IA via n8n).",
    href: "https://n8n.io",
  },
  {
    name: "Zapier",
    desc: "Use o trigger 'Catch Hook' e conecte a 7.000+ apps (planilhas, e-mail, ERPs).",
    href: "https://zapier.com",
  },
  {
    name: "Make (Integromat)",
    desc: "Crie cenários visuais a partir do módulo 'Custom webhook'.",
    href: "https://www.make.com",
  },
  {
    name: "Google Sheets",
    desc: "Receba cada negociação/contato numa planilha via Zapier/Make ou Apps Script.",
    href: "https://workspace.google.com/products/sheets/",
  },
];

export function WebhooksSettingsSection({ canEdit }: { canEdit: boolean }) {
  const { data: webhooks = [], isLoading, error, refetch, isFetching } = useWebhooks();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Webhook | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (w: Webhook) => {
    setEditing(w);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <WebhookIcon className="h-5 w-5 text-primary" />
                Webhooks de saída
              </CardTitle>
              <CardDescription>
                Envie eventos do CRM, contatos e mensagens para qualquer sistema, em tempo real. Cada entrega é
                assinada (HMAC) e tem retry automático.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refetch()}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isFetching ? "animate-spin" : "")} />
                Atualizar
              </Button>
              {canEdit ? (
                <Button type="button" className="rounded-xl" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo webhook
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {formOpen ? (
            <WebhookForm initial={editing ?? undefined} onCancel={closeForm} onSaved={closeForm} />
          ) : null}

          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Não foi possível carregar os webhooks: {(error as Error).message}</span>
            </div>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : webhooks.length === 0 && !formOpen ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nenhum webhook configurado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {webhooks.map((w) => (
                <WebhookRow key={w.id} webhook={w} canEdit={canEdit} onEdit={openEdit} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle className="text-lg">Diretório de integrações</CardTitle>
          <CardDescription>
            Conecte o CaleoCRM a outras ferramentas via webhooks e a{" "}
            <Link to="/configuracoes/api-docs" className="text-primary underline-offset-2 hover:underline">
              API pública
            </Link>
            . Sem código, use n8n/Zapier/Make apontando para os eventos acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {DIRECTORY.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 transition-colors hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">{item.name}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
