import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuditLogs, type AuditLog } from "@/lib/api/audit-logs";

const ACTION_LABELS: Record<string, string> = {
  create: "Criação",
  update: "Alteração",
  delete: "Exclusão",
  login: "Login",
  export: "Exportação",
  permission_change: "Permissões",
};

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200",
  delete: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200",
  login: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200",
  export: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200",
  permission_change: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200",
};

const ENTITY_LABELS: Record<string, string> = {
  crm_negotiation: "Negociação",
  customer: "Cliente",
  product: "Produto",
  profile: "Usuário",
  tenant_settings: "Configurações",
  whatsapp_instance: "Instância",
  session: "Sessão",
};

const FIELD_LABELS: Record<string, string> = {
  nome: "Nome",
  email: "E-mail",
  role: "Papel",
  status: "Status",
  stage_id: "Etapa",
  funnel_id: "Funil",
  total_value: "Valor",
  qualification: "Qualificação",
  closing_forecast: "Previsão de fechamento",
  assignee_id: "Responsável",
  next_task_at: "Próxima tarefa",
  phone: "Telefone",
  telefone: "Telefone",
  call_phone: "Telefone p/ ligações",
  role_permissions: "Matriz de permissões",
  business_hours: "Horário de atendimento",
  sla_first_response_minutes: "SLA (min)",
  tipo: "Tipo",
  price: "Preço",
  stock_quantity: "Estoque",
};

const ENTITY_ORDER = [
  "all",
  "crm_negotiation",
  "customer",
  "product",
  "profile",
  "tenant_settings",
] as const;

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}

function entityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? entityType;
}

function fieldLabel(field: string) {
  return (
    FIELD_LABELS[field] ??
    field.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "sim" : "não";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 119)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 120 ? `${json.slice(0, 119)}…` : json;
  } catch {
    return String(value);
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AuditEntryCard({ entry }: { entry: AuditLog }) {
  const [open, setOpen] = useState(false);
  const changeKeys = Object.keys(entry.changes);
  const hasChanges = changeKeys.length > 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={() => hasChanges && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start justify-between gap-3 text-left",
          hasChanges ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", ACTION_STYLES[entry.action] ?? "bg-muted text-foreground")}>
              {actionLabel(entry.action)}
            </Badge>
            <span className="text-sm font-semibold text-foreground">{entityLabel(entry.entityType)}</span>
            {entry.summary ? <span className="text-sm text-muted-foreground">— {entry.summary}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDate(entry.createdAt)}</span>
            <span className="rounded-full bg-muted px-2 py-0.5">{entry.actorName}</span>
            {entry.actorRole ? <span className="rounded-full bg-muted px-2 py-0.5">{entry.actorRole}</span> : null}
            {hasChanges ? (
              <span className="rounded-full bg-muted px-2 py-0.5">{changeKeys.length} campo(s)</span>
            ) : null}
            {entry.entityId ? (
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">{entry.entityId.slice(0, 8)}</span>
            ) : null}
          </div>
        </div>
        {hasChanges ? (
          open ? <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : null}
      </button>

      {open && hasChanges ? (
        <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {changeKeys.map((field) => (
            <div key={field} className="grid grid-cols-[minmax(0,9rem)_1fr] items-start gap-2 text-xs">
              <span className="font-medium text-foreground">{fieldLabel(field)}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through dark:bg-rose-950/30 dark:text-rose-300">
                  {formatValue(entry.changes[field].from)}
                </span>
                <ChevronRight className="h-3 w-3" />
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {formatValue(entry.changes[field].to)}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AuditLogSection() {
  const [entityFilter, setEntityFilter] = useState<(typeof ENTITY_ORDER)[number]>("all");
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading, isFetching, refetch, error } = useAuditLogs({
    entityType: entityFilter === "all" ? null : entityFilter,
    limit: 300,
  });

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((entry) =>
      [entry.actorName, entry.summary ?? "", entityLabel(entry.entityType), actionLabel(entry.action), entry.entityId ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [logs, search]);

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Auditoria
            </CardTitle>
            <CardDescription>
              Quem alterou o quê, quando — com o antes/depois de cada campo. Cobre negociações, clientes,
              produtos, usuários e configurações. Apenas administradores veem esta trilha.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void refetch()}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching ? "animate-spin" : "")} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por usuário, campo, ID…"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {ENTITY_ORDER.map((entity) => {
              const active = entityFilter === entity;
              const label = entity === "all" ? "Tudo" : entityLabel(entity);
              return (
                <button
                  key={entity}
                  type="button"
                  onClick={() => setEntityFilter(entity)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-background text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Não foi possível carregar a auditoria: {(error as Error).message}</span>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando trilha de auditoria…</p>
        ) : filteredLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Nenhum evento de auditoria para os filtros atuais.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((entry) => (
              <AuditEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
