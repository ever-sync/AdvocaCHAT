// Cartoes e coluna do quadro de CRM, extraidos de Crm.tsx (monolito). Recebem
// tudo por props (sao memo-friendly) e dependem apenas de helpers/UI importados.
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Info,
  MessageCircle,
  RefreshCw,
  Search,
  Star,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import type { KanbanTaskPreview } from "@/lib/api/crm-kanban-tasks";
import { resolveCrmKanbanCardAccent } from "@/lib/crm/crm-kanban-card-accent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { LeadScoreBadge } from "@/components/crm/LeadScoreBadge";
import { NegotiationScoreCard } from "@/components/crm/NegotiationScoreCard";
import { CrmKanbanCardTaskBadge } from "@/components/crm/CrmKanbanCardTaskBadge";
import { CrmNegotiationAlertBadges } from "@/components/crm/CrmNegotiationAlertBadges";
import { type LeadScoreResult } from "@/lib/crm/lead-score";
import {
  isPersistedCrmNegotiationId,
  isSyntheticCustomerCardId,
} from "@/lib/crm/negotiation-model";
import {
  getNegotiationAlerts,
  isNegotiationUnassigned,
} from "@/lib/crm/negotiation-alerts";
import { canAtendimentoModifyNegotiation } from "@/lib/crm/negotiation-assignee";
import type { CrmStageDef } from "@/data/crm-funnels";
import type { CrmNegotiation, Customer } from "@/types/domain";
import { type CardDensity, statusLabel } from "./board-helpers";

export function CrmPoolBadge({ className }: { className?: string }) {
  return (
    <span
      data-testid="crm-pool-badge"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-[var(--crm-brand)]",
        className,
      )}
      title="Negócio no pool — sem vendedor atribuído"
    >
      <Users className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
      Sem responsável
    </span>
  );
}

/**
 * 5 estrelas clicáveis para `qualification` (0–5). Hover destaca preview até o
 * índice; clique grava. Clicar na estrela atual zera (toggle off).
 */
function InlineQualificationStars({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const displayValue = hover ?? value;
  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="group"
      aria-label={`Qualificação ${value} de 5`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= displayValue;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`Definir qualificação ${n}`}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-transform",
              disabled ? "cursor-not-allowed opacity-50" : "hover:scale-110",
            )}
            onMouseEnter={() => !disabled && setHover(n)}
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              onChange(value === n ? 0 : n);
            }}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                filled
                  ? "fill-[var(--crm-amber)] text-[var(--crm-amber)]"
                  : "text-[var(--crm-ink-3)]",
              )}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Valor total do negócio editável por click. Mostra `formatBRL(value)`; ao
 * clicar abre input numérico inline. Enter salva, Esc/blur cancela.
 */
function InlineValueEditor({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(() => String(value ?? 0));

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setDraft(value ? String(value) : "");
    setEditing(true);
  };

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) {
      onChange(parsed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        autoFocus
        value={draft}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        className="h-6 w-20 rounded border border-[var(--crm-brand-border)] bg-card px-1.5 text-xs font-semibold text-[var(--crm-ink)] outline-none focus:ring-1 focus:ring-[var(--crm-brand-2)]"
        aria-label="Valor do negócio"
      />
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={startEdit}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`Editar valor: ${formatBRL(value || 0)}`}
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--crm-ink-2)] transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:bg-[var(--crm-brand-tint)] hover:text-[var(--crm-brand)]",
      )}
    >
      {value > 0 ? formatBRL(value) : "R$ —"}
    </button>
  );
}

const DraggableNegotiationCard = memo(function DraggableNegotiationCard({
  card,
  stage,
  customer,
  phoneIndex,
  taskPreview,
  onContextMenu,
  staleNegotiationDays,
  canClaim,
  isClaimPending,
  canReleaseToPool,
  isReleasePending,
  canDelete,
  onClaimNegotiation,
  onReleaseNegotiation,
  onDeleteNegotiation,
  onOpenNegotiation,
  onOpenCustomer,
  onOpenWhatsapp,
  onUpdateInline,
  resolveAssigneeName,
  attendantsForReassign,
  canReassign,
  density,
  leadScore,
}: {
  card: CrmNegotiation;
  stage?: CrmStageDef;
  customer?: Customer | null;
  phoneIndex?: Map<string, Set<string>>;
  taskPreview?: KanbanTaskPreview;
  onContextMenu?: (card: CrmNegotiation, event: React.MouseEvent) => void;
  staleNegotiationDays: number;
  canClaim: boolean;
  isClaimPending: boolean;
  canReleaseToPool: boolean;
  isReleasePending: boolean;
  canDelete: boolean;
  onClaimNegotiation: (card: CrmNegotiation) => void;
  onReleaseNegotiation: (card: CrmNegotiation) => void;
  onDeleteNegotiation: (card: CrmNegotiation) => void;
  onOpenNegotiation: (card: CrmNegotiation) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenWhatsapp?: (card: CrmNegotiation) => void;
  onUpdateInline?: (
    card: CrmNegotiation,
    patch: { qualification?: number; totalValue?: number; assigneeId?: string },
  ) => void;
  resolveAssigneeName?: (assigneeId: string) => string | null;
  attendantsForReassign?: { id: string; name: string }[];
  canReassign?: boolean;
  density?: CardDensity;
  leadScore?: LeadScoreResult;
}) {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const canDrag =
    isSyntheticCustomerCardId(card.id) ||
    canAtendimentoModifyNegotiation(profile?.role, card.assigneeId, profileId);
  const densityMode: CardDensity = density ?? "cozy";
  const isCompact = densityMode === "compact";
  const isExpanded = densityMode === "expanded";
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignSearch, setReassignSearch] = useState("");
  const [scoreInfoOpen, setScoreInfoOpen] = useState(false);
  const canReassignChip =
    Boolean(canReassign) &&
    Boolean(onUpdateInline) &&
    Boolean(attendantsForReassign?.length) &&
    isPersistedCrmNegotiationId(card.id);
  const filteredReassign = useMemo(() => {
    if (!attendantsForReassign) return [] as { id: string; name: string }[];
    const q = reassignSearch.trim().toLowerCase();
    if (!q) return attendantsForReassign;
    return attendantsForReassign.filter((a) => a.name.toLowerCase().includes(q));
  }, [attendantsForReassign, reassignSearch]);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `neg-${card.id}`,
    disabled: !canDrag,
  });
  const alerts = useMemo(
    () => getNegotiationAlerts(card, undefined, staleNegotiationDays),
    [card, staleNegotiationDays],
  );
  const isInPool = isNegotiationUnassigned(card.assigneeId);
  const showClaim =
    canClaim && isPersistedCrmNegotiationId(card.id) && isInPool;
  const showRelease =
    canReleaseToPool && isPersistedCrmNegotiationId(card.id) && !isInPool;
  const showWhatsappAction = Boolean(onOpenWhatsapp);
  const showDelete = canDelete && isPersistedCrmNegotiationId(card.id);
  const assigneeBusy = isClaimPending || isReleasePending;
  const cardAccent = useMemo(
    () =>
      phoneIndex
        ? resolveCrmKanbanCardAccent({
            card,
            customer: customer ?? null,
            stage,
            phoneIndex,
          })
        : ({ accents: [] } as ReturnType<typeof resolveCrmKanbanCardAccent>),
    [card, customer, phoneIndex, stage],
  );

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <article
      ref={setNodeRef}
      data-testid={`crm-card-${card.id}`}
      style={style}
      className={cn(
        "cursor-grab rounded-lg border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-shadow active:cursor-grabbing",
        cardAccent.className ?? "border-[var(--crm-surface-2)]",
        isCompact ? "p-2" : isExpanded ? "p-4" : "p-3",
        isDragging ? "opacity-90 shadow-lg ring-2 ring-[var(--crm-brand-2)]/40" : "hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
      )}
      {...listeners}
      {...attributes}
      title={cardAccent.title}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(card, event);
      }}
      onClick={() => onOpenNegotiation(card)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenNegotiation(card);
        }
      }}
    >
      {isCompact ? null : (
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--crm-ink-2)]">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--crm-brand-2)]" aria-hidden />
        <span className="font-medium">{statusLabel(card.status)}</span>
        {isSyntheticCustomerCardId(card.id) ? (
          <span
            className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
            title="Lead só no cadastro — arraste para criar a negociação no CRM"
          >
            Cadastro
          </span>
        ) : null}
        {isInPool ? (
          canReassignChip ? (
            <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded px-1 py-0.5 hover:bg-[var(--crm-brand-tint)]"
                  aria-label="Atribuir responsável"
                >
                  <CrmPoolBadge />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-[var(--crm-border)] p-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--crm-ink-3)]"
                      aria-hidden
                    />
                    <Input
                      autoFocus
                      value={reassignSearch}
                      onChange={(e) => setReassignSearch(e.target.value)}
                      placeholder="Atribuir a..."
                      className="h-8 border-[var(--crm-border-2)] pl-8 text-xs"
                    />
                  </div>
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredReassign.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-[var(--crm-ink-3)]">
                      Nenhum atendente encontrado.
                    </li>
                  ) : (
                    filteredReassign.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateInline?.(card, { assigneeId: a.id });
                            setReassignOpen(false);
                            setReassignSearch("");
                          }}
                          className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--crm-surface)]"
                        >
                          {a.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          ) : (
            <CrmPoolBadge />
          )
        ) : null}
        {!isInPool && card.assigneeId && resolveAssigneeName?.(card.assigneeId) ? (
          canReassignChip ? (
            <Popover open={reassignOpen} onOpenChange={setReassignOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[7rem] truncate rounded px-1 py-0.5 text-[10px] font-medium text-[var(--crm-ink-2)] hover:bg-[var(--crm-brand-tint)] hover:text-[var(--crm-brand)]"
                  title={`Responsável: ${resolveAssigneeName(card.assigneeId)} — clique para trocar`}
                >
                  {resolveAssigneeName(card.assigneeId)}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-64 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-[var(--crm-border)] p-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--crm-ink-3)]"
                      aria-hidden
                    />
                    <Input
                      autoFocus
                      value={reassignSearch}
                      onChange={(e) => setReassignSearch(e.target.value)}
                      placeholder="Trocar responsável..."
                      className="h-8 border-[var(--crm-border-2)] pl-8 text-xs"
                    />
                  </div>
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredReassign.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-[var(--crm-ink-3)]">
                      Nenhum atendente encontrado.
                    </li>
                  ) : (
                    filteredReassign.map((a) => {
                      const current = a.id === card.assigneeId;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            disabled={current}
                            onClick={() => {
                              onUpdateInline?.(card, { assigneeId: a.id });
                              setReassignOpen(false);
                              setReassignSearch("");
                            }}
                            className={cn(
                              "flex w-full px-3 py-1.5 text-left text-xs",
                              current
                                ? "cursor-default font-semibold text-[var(--crm-brand)]"
                                : "hover:bg-[var(--crm-surface)]",
                            )}
                          >
                            {a.name}
                            {current ? " (atual)" : ""}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          ) : (
            <span
              className="max-w-[7rem] truncate text-[10px] font-medium text-[var(--crm-ink-2)]"
              title={`Responsável: ${resolveAssigneeName(card.assigneeId)}`}
            >
              {resolveAssigneeName(card.assigneeId)}
            </span>
          )
        ) : null}
        <Info className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--crm-ink-3)]" aria-hidden />
      </div>
      )}
      <p
        className={cn(
          "font-bold leading-snug text-[var(--crm-ink)]",
          isCompact ? "mb-1.5 text-sm" : isExpanded ? "mb-2 text-base" : "mb-2 text-[15px]",
        )}
      >
        {card.title}
      </p>
      {isCompact ? null : (
        <CrmNegotiationAlertBadges alerts={alerts} className="mb-2" nextTaskAt={card.nextTaskAt} />
      )}
      {!isCompact && leadScore ? (
        <div className="mb-2">
          <Popover open={scoreInfoOpen} onOpenChange={setScoreInfoOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Lead score ${leadScore.total} de 100 — abrir detalhes`}
                className="rounded transition-opacity hover:opacity-80"
              >
                <LeadScoreBadge score={leadScore} variant="compact" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[340px] border-[var(--crm-border)] bg-card p-0 shadow-lg"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <NegotiationScoreCard score={leadScore} className="border-0 shadow-none" />
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
      <div className="mb-2 flex items-center justify-between gap-2 text-[var(--crm-ink-3)]">
        <InlineQualificationStars
          value={card.qualification ?? 0}
          disabled={!canDrag || !onUpdateInline || !isPersistedCrmNegotiationId(card.id)}
          onChange={(next) => onUpdateInline?.(card, { qualification: next })}
        />
        <InlineValueEditor
          value={card.totalValue ?? 0}
          disabled={!canDrag || !onUpdateInline || !isPersistedCrmNegotiationId(card.id)}
          onChange={(next) => onUpdateInline?.(card, { totalValue: next })}
        />
      </div>
      {isCompact ? null : (
        <div className="mb-3 space-y-2">
          <div className="flex min-h-8 items-center gap-2 rounded-md bg-[var(--crm-surface)] px-2.5 py-1.5 text-xs text-[var(--crm-ink-3)]">
            <span className="inline-flex min-w-0 items-center gap-2">
              {card.starCount > 0 ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--crm-ink-2)]"
                  title={`Pontos: ${card.starCount}`}
                >
                  <Star className="h-3.5 w-3.5 fill-[var(--crm-amber)] text-[var(--crm-amber)]" aria-hidden />
                  {card.starCount}
                </span>
              ) : null}
              <CrmKanbanCardTaskBadge card={card} taskPreview={taskPreview} />
            </span>
          </div>
        </div>
      )}
      {isExpanded ? (
        <div className="mb-3 flex flex-col gap-0.5 border-t border-[var(--crm-surface-2)] pt-2 text-[10px] text-[var(--crm-ink-3)]">
          <span>
            Criada{" "}
            {new Date(card.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
            })}
          </span>
          {card.nextTaskAt ? (
            <span>
              Próx. tarefa{" "}
              {new Date(card.nextTaskAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className={cn("flex flex-col border-t border-[var(--crm-surface-2)] pt-2", isCompact ? "gap-1" : "gap-2")}>
        {showClaim ? (
          <Button
            type="button"
            className={cn(
              "w-full gap-2 bg-primary font-medium text-primary-foreground shadow-none hover:bg-primary/90",
              isCompact ? "h-8 text-xs" : "h-9 text-sm",
            )}
            disabled={assigneeBusy}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`crm-claim-${card.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onClaimNegotiation(card);
            }}
          >
            <Hand className="h-4 w-4 shrink-0" aria-hidden />
            ASSUMIR
          </Button>
        ) : null}
        {showWhatsappAction || showRelease ? (
          <div
            className={cn(
              "grid gap-2 overflow-visible",
              showWhatsappAction && showRelease ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {showWhatsappAction ? (
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "relative w-full min-w-0 justify-center gap-1 border-[var(--crm-success-border)] bg-card px-2 font-medium text-[var(--crm-wa-teal)] shadow-none hover:bg-[var(--crm-success-tint)]",
                  (card.sourceChatUnread ?? 0) > 0 && "overflow-visible",
                  isCompact ? "h-8 text-[11px]" : "h-9 text-xs sm:text-sm",
                )}
                onPointerDown={(e) => e.stopPropagation()}
                data-testid={`crm-whatsapp-${card.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWhatsapp?.(card);
                }}
              >
                <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">WhatsApp</span>
                {(card.sourceChatUnread ?? 0) > 0 ? (
                  <span
                    className="pointer-events-none absolute -right-1 -top-1 z-[1] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--crm-wa-green)] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card"
                    aria-label={`${card.sourceChatUnread} mensagem(ns) não lida(s)`}
                  >
                    {(card.sourceChatUnread ?? 0) > 99 ? "99+" : card.sourceChatUnread}
                  </span>
                ) : null}
              </Button>
            ) : null}
            {showRelease ? (
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full min-w-0 justify-center gap-1 border-[var(--crm-brand-border)] bg-card px-2 font-medium text-[var(--crm-brand)] shadow-none hover:bg-[var(--crm-brand-tint)]",
                  isCompact ? "h-8 text-[11px]" : "h-9 text-xs sm:text-sm",
                )}
                disabled={assigneeBusy}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onReleaseNegotiation(card);
                }}
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">DEVOLVER</span>
              </Button>
            ) : null}
          </div>
        ) : null}
        {showDelete && !isCompact ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 w-full gap-2 text-sm font-medium text-[var(--crm-danger)] shadow-none hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger-strong)]"
            disabled={assigneeBusy}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid={`crm-delete-${card.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNegotiation(card);
            }}
          >
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
            Excluir negociação
          </Button>
        ) : null}
      </div>
    </article>
  );
});

export function KanbanColumn({
  stage,
  phoneIndex,
  customers,
  kanbanTaskPreviews,
  onCardContextMenu,
  onMoveStageLeft,
  onMoveStageRight,
  canMoveStageLeft,
  canMoveStageRight,
  staleNegotiationDays,
  canClaim,
  isClaimPending,
  canReleaseToPool,
  isReleasePending,
  canDelete,
  onClaimNegotiation,
  onReleaseNegotiation,
  onDeleteNegotiation,
  onOpenNegotiation,
  onOpenCustomer,
  onOpenWhatsapp,
  onUpdateInline,
  onColumnRefresh,
  onColumnValueSort,
  resolveAssigneeName,
  attendantsForReassign,
  canReassign,
  density,
  scoresByNegId,
}: {
  stage: CrmStageDef & { cards: CrmNegotiation[] };
  phoneIndex: Map<string, Set<string>>;
  customers: Customer[];
  kanbanTaskPreviews: Map<string, KanbanTaskPreview>;
  onCardContextMenu?: (card: CrmNegotiation, event: React.MouseEvent) => void;
  onMoveStageLeft?: () => void;
  onMoveStageRight?: () => void;
  canMoveStageLeft?: boolean;
  canMoveStageRight?: boolean;
  staleNegotiationDays: number;
  canClaim: boolean;
  isClaimPending: boolean;
  canReleaseToPool: boolean;
  isReleasePending: boolean;
  canDelete: boolean;
  onClaimNegotiation: (card: CrmNegotiation) => void;
  onReleaseNegotiation: (card: CrmNegotiation) => void;
  onDeleteNegotiation: (card: CrmNegotiation) => void;
  onOpenNegotiation: (card: CrmNegotiation) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenWhatsapp?: (card: CrmNegotiation) => void;
  onUpdateInline?: (
    card: CrmNegotiation,
    patch: { qualification?: number; totalValue?: number; assigneeId?: string },
  ) => void;
  onColumnRefresh?: () => void;
  onColumnValueSort?: () => void;
  resolveAssigneeName?: (assigneeId: string) => string | null;
  attendantsForReassign?: { id: string; name: string }[];
  canReassign?: boolean;
  density?: CardDensity;
  scoresByNegId?: Map<string, LeadScoreResult>;
}) {
  const count = stage.cards.length;
  const columnValue = stage.cards.reduce((acc, c) => acc + c.totalValue, 0);
  const displayValue =
    columnValue > 0
      ? formatBRL(columnValue)
      : "R$ 0,00";

  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
  });

  // O container de scroll da coluna é também o droppable do dnd-kit: compõe os
  // dois refs (virtualizer + setNodeRef) no mesmo nó.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setColumnRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      setNodeRef(node);
    },
    [setNodeRef],
  );
  const estimatedCardHeight = density === "compact" ? 72 : density === "expanded" ? 200 : 120;
  const cardVirtualizer = useVirtualizer({
    count: stage.cards.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedCardHeight,
    getItemKey: (index) => stage.cards[index]?.id ?? index,
    overscan: 6,
  });

  return (
    <div className="flex h-full min-h-0 w-[min(100vw-1.5rem,340px)] shrink-0 flex-col rounded-lg bg-[var(--crm-surface-2)] p-2.5 shadow-sm sm:w-[320px] md:w-[300px] md:p-3">
      <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
        <div>
          <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-[var(--crm-ink-2)]">
            {stage.title}{" "}
            <span className="font-semibold text-[var(--crm-ink-3)]">({count})</span>
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {canMoveStageLeft ? (
            <button
              type="button"
              className="rounded p-1 text-[var(--crm-ink-3)] transition-colors hover:bg-[var(--crm-border)]/80"
              aria-label="Mover coluna para esquerda"
              onClick={() => onMoveStageLeft?.()}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {canMoveStageRight ? (
            <button
              type="button"
              className="rounded p-1 text-[var(--crm-ink-3)] transition-colors hover:bg-[var(--crm-border)]/80"
              aria-label="Mover coluna para direita"
              onClick={() => onMoveStageRight?.()}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span className="rounded bg-[var(--crm-border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--crm-ink-2)]">{displayValue}</span>
          <button
            type="button"
            className="rounded p-1 text-[var(--crm-ink-3)] transition-colors hover:bg-[var(--crm-border)]/80"
            aria-label="Atualizar coluna"
            onClick={() => onColumnRefresh?.()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-[var(--crm-ink-3)] transition-colors hover:bg-[var(--crm-border)]/80"
            aria-label="Ordenar por valor"
            onClick={() => onColumnValueSort?.()}
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={setColumnRef}
        data-testid={`crm-column-${stage.id}`}
        style={{ touchAction: "pan-y" }}
        className={cn(
          "scrollbar-hide min-h-0 flex-1 overflow-y-scroll overscroll-y-contain rounded-md transition-colors",
          isOver && "bg-[var(--crm-info-tint)]/90 ring-2 ring-[var(--crm-brand-2)] ring-inset",
        )}
      >
        {/* Virtualizado: renderiza só os cards visíveis (+overscan). Gap via pb-2. */}
        <div className="relative w-full" style={{ height: cardVirtualizer.getTotalSize() }}>
          {cardVirtualizer.getVirtualItems().map((virtualRow) => {
            const card = stage.cards[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={cardVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-2"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <DraggableNegotiationCard
                  card={card}
                  stage={stage}
                  customer={
                    customers.find((c) => c.id === card.customerId) ??
                    customers.find(
                      (c) =>
                        c.nome.trim().toLowerCase() === card.title.trim().toLowerCase(),
                    ) ??
                    null
                  }
                  phoneIndex={phoneIndex}
                  taskPreview={kanbanTaskPreviews.get(card.id)}
                  onContextMenu={onCardContextMenu}
                  staleNegotiationDays={staleNegotiationDays}
                  canClaim={canClaim}
                  isClaimPending={isClaimPending}
                  canReleaseToPool={canReleaseToPool}
                  isReleasePending={isReleasePending}
                  canDelete={canDelete}
                  onClaimNegotiation={onClaimNegotiation}
                  onReleaseNegotiation={onReleaseNegotiation}
                  onDeleteNegotiation={onDeleteNegotiation}
                  onOpenNegotiation={onOpenNegotiation}
                  onOpenCustomer={onOpenCustomer}
                  onOpenWhatsapp={onOpenWhatsapp}
                  onUpdateInline={onUpdateInline}
                  resolveAssigneeName={resolveAssigneeName}
                  attendantsForReassign={attendantsForReassign}
                  canReassign={canReassign}
                  density={density}
                  leadScore={scoresByNegId?.get(card.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
