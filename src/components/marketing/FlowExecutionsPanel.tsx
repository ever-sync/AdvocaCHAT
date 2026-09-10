// Painel de execucoes do fluxo (Fase 6 do plano completo).
// - Tabela com participants recentes do fluxo.
// - Click em "Detalhes" abre dialog com timeline de events.
// - Botoes "Reprocessar" (re-enfileira failed/dead jobs) e "Remover" (saida manual).

import { useMemo, useState } from "react";
import { AlertCircle, Loader2, MoreVertical, Play, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useExitFlowParticipant,
  useFlowParticipants,
  useParticipantEvents,
  useParticipantFailedJobs,
  useReprocessFlowJob,
  type FlowEvent,
  type FlowParticipant,
} from "@/lib/api/marketing-flow-participants";
import { useMarketingFlow } from "@/lib/api/marketing-flows";
import type { MarketingFlowParticipantStatus } from "@/lib/marketing/flow-types";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<MarketingFlowParticipantStatus, string> = {
  active: "bg-emerald-500 text-white hover:bg-emerald-500",
  waiting: "bg-amber-500 text-white hover:bg-amber-500",
  completed: "bg-sky-500 text-white hover:bg-sky-500",
  exited: "bg-slate-500/80 text-white hover:bg-slate-500/80",
  failed: "bg-destructive text-destructive-foreground hover:bg-destructive",
  paused: "bg-muted text-muted-foreground hover:bg-muted",
};

const STATUS_LABEL: Record<MarketingFlowParticipantStatus, string> = {
  active: "Ativo",
  waiting: "Aguardando",
  completed: "Concluído",
  exited: "Removido",
  failed: "Falhou",
  paused: "Pausado",
};

function formatDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(text: string, n: number) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

// ---------------------------------------------------------------- Detail dialog

function eventTone(type: string): string {
  if (type.includes("failed")) return "text-destructive";
  if (type.includes("retry")) return "text-amber-600 dark:text-amber-400";
  if (type.includes("completed") || type === "flow_entered") return "text-emerald-600 dark:text-emerald-400";
  if (type.includes("waiting")) return "text-sky-600 dark:text-sky-400";
  return "text-muted-foreground";
}

function EventTimeline({ events }: { events: FlowEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="flex items-start gap-3">
          <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-foreground/30" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <p className={cn("text-sm font-semibold", eventTone(event.eventType))}>
              {event.eventType}
              {event.stepId ? (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  · step {event.stepId}
                </span>
              ) : null}
            </p>
            {event.message ? (
              <p className="text-sm text-foreground">{event.message}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ParticipantDetailDialog({
  participant,
  onOpenChange,
}: {
  participant: FlowParticipant | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const eventsQuery = useParticipantEvents(participant?.id);
  const failedJobsQuery = useParticipantFailedJobs(participant?.id);
  const reprocess = useReprocessFlowJob();

  const handleReprocess = (jobId: string) => {
    reprocess.mutate(jobId, {
      onSuccess: () => toast({ title: "Job reenfileirado" }),
      onError: (e) =>
        toast({ title: "Erro ao reprocessar", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={!!participant} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {participant?.customerName || participant?.customerId?.slice(0, 8) || "Participante"}
          </DialogTitle>
          <DialogDescription>
            {participant
              ? `Status: ${STATUS_LABEL[participant.status]} · Entrou em ${formatDateTime(participant.enteredAt)}`
              : null}
          </DialogDescription>
        </DialogHeader>

        {(failedJobsQuery.data ?? []).length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-semibold text-destructive">
              Falhas ({failedJobsQuery.data?.length})
            </p>
            {failedJobsQuery.data?.map((job) => (
              <div key={job.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium text-foreground">
                    Step {job.stepId} · {job.status}
                  </p>
                  {job.lastError ? (
                    <p className="text-xs text-muted-foreground">{job.lastError}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleReprocess(job.id)}
                  disabled={reprocess.isPending}
                  className="gap-1.5"
                >
                  {reprocess.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Reprocessar
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="max-h-[400px] overflow-auto">
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando histórico…</p>
          ) : eventsQuery.error ? (
            <p className="text-sm text-destructive">
              Erro ao carregar histórico: {eventsQuery.error.message}
            </p>
          ) : (
            <EventTimeline events={eventsQuery.data ?? []} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Main panel

function ExitConfirmDialog({
  participant,
  onOpenChange,
}: {
  participant: FlowParticipant | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const exit = useExitFlowParticipant();
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!participant) return;
    exit.mutate(
      { participantId: participant.id, reason: reason.trim() || null },
      {
        onSuccess: () => {
          toast({ title: "Lead removido do fluxo" });
          onOpenChange(false);
          setReason("");
        },
        onError: (e) =>
          toast({ title: "Erro ao remover", description: e.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={!!participant} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover do fluxo?</DialogTitle>
          <DialogDescription>
            O lead {participant?.customerName ? `“${participant.customerName}”` : ""} sairá do
            fluxo e os passos pendentes serão cancelados. Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="exit-reason">Motivo (opcional)</Label>
          <Input
            id="exit-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: Cliente pediu para sair"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={exit.isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={exit.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {exit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Remover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FlowExecutionsPanel({ flowId }: { flowId: string }) {
  const { data: flow } = useMarketingFlow(flowId);
  const { data: participants, isLoading, error, refetch, isFetching } = useFlowParticipants(flowId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MarketingFlowParticipantStatus | "all">("all");
  const [detail, setDetail] = useState<FlowParticipant | null>(null);
  const [exitTarget, setExitTarget] = useState<FlowParticipant | null>(null);
  const stepNameById = useMemo(() => {
    const map = new Map<string, string>();
    const steps = (flow?.publishedDefinition ?? flow?.definition)?.steps;
    if (!Array.isArray(steps)) return map;
    for (const item of steps) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : "";
      const label = typeof rec.label === "string" ? rec.label : "";
      if (id) map.set(id, label || id);
    }
    return map;
  }, [flow?.definition, flow?.publishedDefinition]);

  const filtered = useMemo<FlowParticipant[]>(() => {
    const list = participants ?? [];
    const term = search.trim().toLowerCase();
    return list.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (term) {
        const haystack = `${p.customerName ?? ""} ${p.customerId ?? ""} ${p.negotiationId ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [participants, search, statusFilter]);

  const counts = useMemo(() => {
    const c: Record<MarketingFlowParticipantStatus | "all", number> = {
      all: participants?.length ?? 0,
      active: 0,
      waiting: 0,
      completed: 0,
      exited: 0,
      failed: 0,
      paused: 0,
    };
    for (const p of participants ?? []) c[p.status]++;
    return c;
  }, [participants]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Execuções</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe quem entrou no fluxo, onde está e o que falhou.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "active", "waiting", "completed", "failed", "exited"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === s
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {s === "all" ? "Todos" : STATUS_LABEL[s]}
            <span className="rounded-full bg-background/20 px-1.5 text-[10px] font-semibold">
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome ou id"
          className="h-10 rounded-full pl-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lead
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Passo atual
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entrou em
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Próxima ação
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Carregando participantes…
                  </span>
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                  <span className="inline-flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    {error.message}
                  </span>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {(participants ?? []).length === 0
                    ? "Nenhum lead percorreu este fluxo ainda."
                    : "Nenhum participante encontrado para os filtros aplicados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setDetail(p)}
                      className="text-left font-medium text-primary hover:underline"
                    >
                      {p.customerName ?? (p.customerId ? truncate(p.customerId, 8) : "—")}
                    </button>
                    {p.customerId ? (
                      <p className="text-xs text-muted-foreground">{p.customerId.slice(0, 8)}…</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                        STATUS_BADGE[p.status],
                      )}
                    >
                      {STATUS_LABEL[p.status]}
                    </Badge>
                    {p.exitReason ? (
                      <p className="mt-1 text-xs text-muted-foreground">{p.exitReason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {p.currentStepId ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {stepNameById.get(p.currentStepId) ?? p.currentStepId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {stepNameById.has(p.currentStepId) ? p.currentStepId.slice(0, 8) : "id bruto"}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(p.enteredAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {p.nextRunAt ? formatDateTime(p.nextRunAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Ações do participante"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setDetail(p)}>
                          Ver detalhes
                        </DropdownMenuItem>
                        {p.status === "active" || p.status === "waiting" || p.status === "paused" ? (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={(event) => {
                              event.preventDefault();
                              setExitTarget(p);
                            }}
                          >
                            <X className="mr-2 h-4 w-4" aria-hidden />
                            Remover do fluxo
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ParticipantDetailDialog
        participant={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
      <ExitConfirmDialog
        participant={exitTarget}
        onOpenChange={(open) => {
          if (!open) setExitTarget(null);
        }}
      />
    </div>
  );
}
