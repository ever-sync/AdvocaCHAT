// Visao de LISTA (tabela) do quadro de CRM + barra de acoes em massa, extraida
// de Crm.tsx. Recebe dados e handlers por props; nao detem estado proprio.
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDownUp,
  CheckSquare,
  ClipboardCheck,
  Download,
  Hand,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import { CrmNegotiationAlertBadges } from "@/components/crm/CrmNegotiationAlertBadges";
import {
  getNegotiationAlerts,
  isNegotiationUnassigned,
} from "@/lib/crm/negotiation-alerts";
import { isPersistedCrmNegotiationId } from "@/lib/crm/negotiation-model";
import { isLostDestinationStage, isSaleDestinationStage } from "@/lib/crm/sale-rules";
import type { CrmFunnel } from "@/data/crm-funnels";
import type { CrmNegotiation, CrmNegotiationStatus } from "@/types/domain";
import {
  negotiationNextTaskDueMeta,
  stageTitleForNegotiation,
  statusLabel,
  STATUS_OPTIONS,
  type SortId,
} from "./board-helpers";
import { CrmPoolBadge } from "./board-cards";

type BulkPatch = {
  assigneeId?: string;
  funnelId?: string;
  stageId?: string;
  status?: CrmNegotiationStatus;
};

type CrmListViewProps = {
  filteredNegotiations: CrmNegotiation[];
  funnels: CrmFunnel[];
  funnel: CrmFunnel;
  staleNegotiationDays: number;
  profileId: string | undefined;
  canReleaseToPool: boolean;
  isClaimPending: boolean;
  isReleasePending: boolean;
  sortId: SortId;
  setSortId: Dispatch<SetStateAction<SortId>>;
  sortTriggerLabel?: string;
  attendants: { id: string; name: string }[];
  openNegotiationCard: (card: CrmNegotiation) => void;
  onOpenCustomer: (customerId: string) => void;
  handleClaimNegotiation: (card: CrmNegotiation) => void | Promise<void>;
  handleReleaseNegotiation: (card: CrmNegotiation) => void | Promise<void>;
  canBulkAct: boolean;
  bulkSelected: Set<string>;
  selectableBulkRows: CrmNegotiation[];
  allBulkSelected: boolean;
  someBulkSelected: boolean;
  toggleBulkAll: (checked: boolean) => void;
  toggleBulkRow: (id: string, checked: boolean) => void;
  clearBulkSelection: () => void;
  bulkBusy: boolean;
  bulkAssignOpen: boolean;
  setBulkAssignOpen: Dispatch<SetStateAction<boolean>>;
  bulkAssignSearch: string;
  setBulkAssignSearch: Dispatch<SetStateAction<string>>;
  bulkStageOpen: boolean;
  setBulkStageOpen: Dispatch<SetStateAction<boolean>>;
  bulkStatusOpen: boolean;
  setBulkStatusOpen: Dispatch<SetStateAction<boolean>>;
  runBulkPatch: (label: string, patch: BulkPatch) => void | Promise<void>;
  handleBulkExport: () => void | Promise<void>;
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
};

export function CrmListView({
  filteredNegotiations,
  funnels,
  funnel,
  staleNegotiationDays,
  profileId,
  canReleaseToPool,
  isClaimPending,
  isReleasePending,
  sortId,
  setSortId,
  sortTriggerLabel = "Ordenar",
  hasNextPage,
  fetchNextPage,
  isFetchingNextPage,
  attendants,
  openNegotiationCard,
  onOpenCustomer,
  handleClaimNegotiation,
  handleReleaseNegotiation,
  canBulkAct,
  bulkSelected,
  selectableBulkRows,
  allBulkSelected,
  someBulkSelected,
  toggleBulkAll,
  toggleBulkRow,
  clearBulkSelection,
  bulkBusy,
  bulkAssignOpen,
  setBulkAssignOpen,
  bulkAssignSearch,
  setBulkAssignSearch,
  bulkStageOpen,
  setBulkStageOpen,
  bulkStatusOpen,
  setBulkStatusOpen,
  runBulkPatch,
  handleBulkExport,
}: CrmListViewProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <div className="mx-auto max-w-[1400px] rounded-lg border border-[var(--crm-border)] bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-[var(--crm-surface)] hover:bg-[var(--crm-surface)]">
                  {canBulkAct ? (
                    <TableHead className="w-[40px] pr-0">
                      <Checkbox
                        aria-label={allBulkSelected ? "Limpar seleção" : "Selecionar todas"}
                        checked={allBulkSelected ? true : someBulkSelected ? "indeterminate" : false}
                        onCheckedChange={(c) => toggleBulkAll(Boolean(c))}
                        disabled={selectableBulkRows.length === 0}
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="w-[28%] font-semibold text-[var(--crm-ink-2)]">
                    <button
                      type="button"
                      className={cn(
                        "text-left hover:text-[var(--crm-brand)]",
                        sortId === "alpha_az" || sortId === "alpha_za" ? "text-[var(--crm-brand)]" : "",
                      )}
                      onClick={() => setSortId((s) => (s === "alpha_az" ? "alpha_za" : "alpha_az"))}
                    >
                      Título
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">Etapa</TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">Status</TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">
                    <button
                      type="button"
                      className={cn("hover:text-[var(--crm-brand)]", sortId === "value_desc" ? "text-[var(--crm-brand)]" : "")}
                      onClick={() => setSortId("value_desc")}
                    >
                      Valor
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">
                    <button
                      type="button"
                      className={cn("hover:text-[var(--crm-brand)]", sortId === "next_task" ? "text-[var(--crm-brand)]" : "")}
                      onClick={() => setSortId("next_task")}
                    >
                      Próx. tarefa
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">
                    <button
                      type="button"
                      className={cn("hover:text-[var(--crm-brand)]", sortId === "created_desc" ? "text-[var(--crm-brand)]" : "")}
                      onClick={() => setSortId("created_desc")}
                    >
                      Criada em
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">
                    <button
                      type="button"
                      className={cn("hover:text-[var(--crm-brand)]", sortId === "qualified_desc" ? "text-[var(--crm-brand)]" : "")}
                      onClick={() => setSortId("qualified_desc")}
                    >
                      Qualif.
                    </button>
                  </TableHead>
                  <TableHead className="font-semibold text-[var(--crm-ink-2)]">Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNegotiations.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canBulkAct ? 9 : 8}
                      className="py-12 text-center text-sm text-[var(--crm-ink-3)]"
                    >
                      Nenhuma negociação neste funil com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNegotiations.map((row) => {
                    const nextTask = negotiationNextTaskDueMeta(row.nextTaskAt);
                    const rowAlerts = getNegotiationAlerts(row, undefined, staleNegotiationDays);
                    const showClaimRow =
                      isSupabaseConfigured &&
                      Boolean(profileId) &&
                      isPersistedCrmNegotiationId(row.id) &&
                      isNegotiationUnassigned(row.assigneeId);
                    const showReleaseRow =
                      canReleaseToPool &&
                      isPersistedCrmNegotiationId(row.id) &&
                      !isNegotiationUnassigned(row.assigneeId);
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => openNegotiationCard(row)}
                      >
                        {canBulkAct ? (
                          <TableCell
                            className="w-[40px] pr-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={`Selecionar ${row.title}`}
                              checked={bulkSelected.has(row.id)}
                              disabled={!isPersistedCrmNegotiationId(row.id)}
                              onCheckedChange={(c) => toggleBulkRow(row.id, Boolean(c))}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="font-medium text-[var(--crm-ink)]">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="min-w-0">{row.title}</span>
                              {isNegotiationUnassigned(row.assigneeId) ? <CrmPoolBadge /> : null}
                              {isPersistedCrmNegotiationId(row.id) && row.customerId ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 shrink-0 gap-1 border-[var(--crm-border-2)] px-2 text-xs font-medium text-[var(--crm-brand)] shadow-none hover:bg-[var(--crm-brand-tint)]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCustomer(row.customerId ?? "");
                                  }}
                                >
                                  <User className="h-3.5 w-3.5" aria-hidden />
                                  Cliente
                                </Button>
                              ) : null}
                            </div>
                            <CrmNegotiationAlertBadges alerts={rowAlerts} compact nextTaskAt={row.nextTaskAt} />
                          </div>
                        </TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">{stageTitleForNegotiation(row, funnels)}</TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">{statusLabel(row.status)}</TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">
                          {row.totalValue > 0
                            ? formatBRL(row.totalValue)
                            : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-[var(--crm-ink-2)]",
                            nextTask.overdue && nextTask.label ? "font-medium text-[var(--crm-danger)]" : "",
                          )}
                        >
                          {nextTask.label || "—"}
                        </TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">
                          {new Date(row.createdAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">{row.qualification}</TableCell>
                        <TableCell className="text-[var(--crm-ink-2)]">
                          <div className="flex flex-col items-start gap-1.5">
                            <span>
                              {attendants.find((a) => a.id === row.assigneeId)?.name?.trim() ||
                                (isNegotiationUnassigned(row.assigneeId) ? "Pool" : row.assigneeId) ||
                                "—"}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {showClaimRow ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 gap-1 bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
                                  disabled={isClaimPending || isReleasePending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleClaimNegotiation(row);
                                  }}
                                >
                                  <Hand className="h-3.5 w-3.5" aria-hidden />
                                  Assumir
                                </Button>
                              ) : null}
                              {showReleaseRow ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 border-[var(--crm-brand-border)] px-2 text-xs text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint)]"
                                  disabled={isReleasePending || isClaimPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleReleaseNegotiation(row);
                                  }}
                                >
                                  <Users className="h-3.5 w-3.5" aria-hidden />
                                  Pool
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {hasNextPage && fetchNextPage ? (
              <div className="flex justify-center p-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-[240px] text-[var(--crm-brand)] border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-tint)]"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Carregando..." : "Carregar mais antigas"}
                </Button>
              </div>
            ) : null}
          </div>
          <p className="mt-3 text-center text-xs text-[var(--crm-ink-3)]">
            Ordenação ativa: {sortTriggerLabel}. Arraste cards apenas na visualização em quadro.
          </p>
          {canBulkAct && bulkSelected.size > 0 ? (
            <div
              className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center"
              role="region"
              aria-label="Ações em lote"
            >
              <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-[var(--crm-border)] bg-card px-4 py-2 shadow-lg">
                <span className="inline-flex items-center gap-2 pr-2 text-sm font-semibold text-[var(--crm-ink)]">
                  <CheckSquare className="h-4 w-4 text-[var(--crm-brand)]" aria-hidden />
                  {bulkSelected.size} selecionada{bulkSelected.size === 1 ? "" : "s"}
                </span>
                <Separator orientation="vertical" className="h-6" />
                <Popover open={bulkAssignOpen} onOpenChange={setBulkAssignOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      className="h-8 gap-2 border-[var(--crm-border-2)] text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]"
                    >
                      <Users className="h-4 w-4" aria-hidden />
                      Atribuir
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="top"
                    className="w-64 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
                  >
                    <div className="border-b border-[var(--crm-border)] p-2">
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--crm-ink-3)]"
                          aria-hidden
                        />
                        <Input
                          autoFocus
                          value={bulkAssignSearch}
                          onChange={(e) => setBulkAssignSearch(e.target.value)}
                          placeholder="Atribuir a..."
                          className="h-8 border-[var(--crm-border-2)] pl-8 text-xs"
                        />
                      </div>
                    </div>
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {attendants
                        .filter((a) =>
                          a.name.toLowerCase().includes(bulkAssignSearch.trim().toLowerCase()),
                        )
                        .map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--crm-surface)]"
                              onClick={() =>
                                void runBulkPatch("Atribuir", { assigneeId: a.id })
                              }
                            >
                              {a.name}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </PopoverContent>
                </Popover>
                <Popover open={bulkStageOpen} onOpenChange={setBulkStageOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      className="h-8 gap-2 border-[var(--crm-border-2)] text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]"
                    >
                      <ArrowDownUp className="h-4 w-4" aria-hidden />
                      Mudar etapa
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="top"
                    className="w-64 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
                  >
                    <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                      Etapas de {funnel.listName}
                    </div>
                    <Separator />
                    <ul className="max-h-64 overflow-y-auto py-1">
                      {funnel.stages
                        .filter(
                          (s) =>
                            !s.isLostStage &&
                            !s.isSaleStage &&
                            !isLostDestinationStage(funnels, funnel.id, s.id) &&
                            !isSaleDestinationStage(funnels, funnel.id, s.id),
                        )
                        .map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--crm-surface)]"
                              onClick={() =>
                                void runBulkPatch("Mudar etapa", {
                                  funnelId: funnel.id,
                                  stageId: s.id,
                                })
                              }
                            >
                              {s.title}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </PopoverContent>
                </Popover>
                <Popover open={bulkStatusOpen} onOpenChange={setBulkStatusOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      className="h-8 gap-2 border-[var(--crm-border-2)] text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]"
                    >
                      <ClipboardCheck className="h-4 w-4" aria-hidden />
                      Status
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    side="top"
                    className="w-56 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
                  >
                    <ul className="py-1">
                      {/* Em vendido/perdido em lote é arriscado (precisa motivo, items, etc) — fica fora */}
                      {STATUS_OPTIONS.filter(
                        (s) =>
                          s.id !== "all" && s.id !== "vendido" && s.id !== "perdido",
                      ).map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="flex w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--crm-surface)]"
                            onClick={() =>
                              void runBulkPatch("Mudar status", {
                                status: s.id as CrmNegotiationStatus,
                              })
                            }
                          >
                            {s.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-[var(--crm-border)] px-3 py-2 text-[10px] text-[var(--crm-ink-3)]">
                      Marcar venda/perda em lote não é permitido — exige confirmação por negócio.
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bulkBusy}
                  className="h-8 gap-2 border-[var(--crm-border-2)] text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]"
                  onClick={handleBulkExport}
                >
                  <Download className="h-4 w-4" aria-hidden />
                  CSV
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={bulkBusy}
                  className="h-8 gap-1 text-[var(--crm-ink-3)] hover:text-[var(--crm-ink)]"
                  onClick={clearBulkSelection}
                >
                  <X className="h-4 w-4" aria-hidden />
                  Limpar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
  );
}
