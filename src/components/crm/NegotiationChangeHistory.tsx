import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History, User as UserIcon } from "lucide-react";
import {
  useAuditLogs,
  type AuditLog,
  type AuditLogChange,
} from "@/lib/api/audit-logs";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

type AttendantOption = { id: string; name: string };
type CustomerOption = { id: string; nome: string };
type StageOption = { id: string; title: string };

/** Tradução PT-BR e formatação dos campos do crm_negotiations. */
const FIELD_LABEL: Record<string, string> = {
  title: "Título",
  status: "Status",
  funnel_id: "Funil",
  stage_id: "Etapa",
  assignee_id: "Responsável",
  customer_id: "Cliente vinculado",
  total_value: "Valor total",
  qualification: "Qualificação",
  star_count: "Pontos de interação",
  next_task_at: "Próxima tarefa",
  closing_forecast: "Previsão de fechamento",
  last_contact_at: "Último contato",
  last_interaction_at: "Última interação",
  source_chat_id: "Conversa vinculada",
  lost_reason: "Motivo da perda",
  other_info: "Outras informações",
};

const STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  vendido: "Vendido",
  perdido: "Perdido",
  pausado: "Pausado",
  nao_pausado: "Não pausado",
};

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h atrás`;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renderiza um valor do diff usando o contexto (lookups por FK). */
function renderValue(
  field: string,
  value: unknown,
  ctx: {
    attendantsById: Map<string, string>;
    customersById: Map<string, string>;
    stagesById: Map<string, string>;
  },
): string {
  if (value === null || value === undefined || value === "") return "vazio";
  if (field === "assignee_id" || field === "created_by") {
    const id = String(value);
    return ctx.attendantsById.get(id) ?? id.slice(0, 8);
  }
  if (field === "customer_id") {
    const id = String(value);
    return ctx.customersById.get(id) ?? id.slice(0, 8);
  }
  if (field === "stage_id") {
    const id = String(value);
    return ctx.stagesById.get(id) ?? id;
  }
  if (field === "status") {
    return STATUS_LABEL[String(value)] ?? String(value);
  }
  if (field === "total_value") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? formatBRL(n) : String(value);
  }
  if (
    field === "next_task_at" ||
    field === "closing_forecast" ||
    field === "last_contact_at" ||
    field === "last_interaction_at"
  ) {
    return fmtIsoDate(typeof value === "string" ? value : null);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function ChangeRow({
  field,
  change,
  ctx,
}: {
  field: string;
  change: AuditLogChange;
  ctx: Parameters<typeof renderValue>[2];
}) {
  const label = FIELD_LABEL[field] ?? field;
  const from = renderValue(field, change.from, ctx);
  const to = renderValue(field, change.to, ctx);
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="font-medium text-[var(--crm-ink-2)]">{label}</span>
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="rounded bg-[var(--crm-surface-2)] px-1.5 py-0.5 text-[var(--crm-ink-3)] line-through">
          {from}
        </span>
        <ChevronRight className="h-3 w-3 text-[var(--crm-ink-3)]" aria-hidden />
        <span className="rounded bg-[var(--crm-brand-tint)] px-1.5 py-0.5 font-medium text-[var(--crm-brand)]">
          {to}
        </span>
      </div>
    </div>
  );
}

function LogCard({
  log,
  ctx,
}: {
  log: AuditLog;
  ctx: Parameters<typeof renderValue>[2];
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(log.changes);
  const hasChanges = entries.length > 0;
  const actionLabel =
    log.action === "create"
      ? "Negociação criada"
      : log.action === "delete"
        ? "Negociação removida"
        : entries.length > 0
          ? `${entries.length} ${entries.length === 1 ? "alteração" : "alterações"}`
          : "Atualização sem mudança";

  return (
    <li className="rounded-md border border-[var(--crm-border)] bg-card p-2.5 text-xs shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        disabled={!hasChanges}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--crm-surface-2)]">
          <UserIcon className="h-3 w-3 text-[var(--crm-ink-2)]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-semibold text-[var(--crm-ink)]">{log.actorName}</span>
            <span className="text-[10px] text-[var(--crm-ink-3)]">
              · {actionLabel}
            </span>
          </div>
          <span
            className="text-[10px] text-[var(--crm-ink-3)]"
            title={new Date(log.createdAt).toLocaleString("pt-BR")}
          >
            {fmtRelative(log.createdAt)}
          </span>
        </div>
        {hasChanges ? (
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-[var(--crm-ink-3)] transition-transform",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden
          />
        ) : null}
      </button>
      {expanded && hasChanges ? (
        <div className="mt-2 grid gap-2 border-t border-[var(--crm-surface-2)] pt-2 sm:grid-cols-2">
          {entries.map(([field, change]) => (
            <ChangeRow key={field} field={field} change={change} ctx={ctx} />
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function NegotiationChangeHistoryPanel({
  negotiationId,
  attendants,
  customers,
  stages,
}: {
  negotiationId: string;
  attendants: AttendantOption[];
  customers: CustomerOption[];
  stages: StageOption[];
}) {
  const { data: logs = [], isLoading, isError } = useAuditLogs(
    { entityType: "crm_negotiation", entityId: negotiationId, limit: 100 },
    { enabled: Boolean(negotiationId) },
  );

  const ctx = useMemo(
    () => ({
      attendantsById: new Map(attendants.map((a) => [a.id, a.name])),
      customersById: new Map(customers.map((c) => [c.id, c.nome])),
      stagesById: new Map(stages.map((s) => [s.id, s.title])),
    }),
    [attendants, customers, stages],
  );

  return (
    <section className="space-y-3 rounded-lg border border-[var(--crm-border)] bg-card/40 p-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--crm-ink)]">
          <History className="h-4 w-4 text-[var(--crm-brand)]" aria-hidden />
          Histórico de mudanças
        </div>
        <span className="text-xs text-[var(--crm-ink-3)]">
          {logs.length} {logs.length === 1 ? "evento" : "eventos"}
        </span>
      </header>

      {isLoading ? (
        <p className="text-xs text-[var(--crm-ink-3)]">Carregando…</p>
      ) : isError ? (
        <p className="text-xs text-[var(--crm-danger-strong)]">Não foi possível carregar o histórico.</p>
      ) : logs.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--crm-border)] p-3 text-center text-xs text-[var(--crm-ink-3)]">
          Sem mudanças registradas ainda. Edições do negócio aparecem aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <LogCard key={log.id} log={log} ctx={ctx} />
          ))}
        </ul>
      )}
    </section>
  );
}
