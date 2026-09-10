import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Target, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTenantCollaborators } from "@/lib/api/settings";
import {
  useCrmMonthlyGoals,
  useUpsertCrmSellerGoal,
  type CrmMonthlyGoalReportRow,
} from "@/lib/api/crm-seller-goals";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1] ?? month} ${year}`;
}

function progressBarTone(pct: number | null): string {
  if (pct == null) return "bg-[var(--crm-ink-3)]/40";
  if (pct >= 100) return "bg-[var(--crm-success-strong)]";
  if (pct >= 70) return "bg-[var(--crm-brand)]";
  if (pct >= 40) return "bg-[var(--crm-orange)]";
  return "bg-[var(--crm-danger-strong)]";
}

export function PainelGoalsCard() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { profile } = useAuth();
  const isManager =
    profile?.role === "admin" ||
    profile?.role === "operacao" ||
    profile?.role === "financeiro";

  const { data: rows = [], isLoading } = useCrmMonthlyGoals(year, month);

  const totals = useMemo(() => {
    let goal = 0;
    let sold = 0;
    for (const r of rows) {
      goal += r.goalAmount;
      sold += r.soldAmount;
    }
    return {
      goal,
      sold,
      pct: goal > 0 ? Math.round((sold / goal) * 1000) / 10 : null,
    };
  }, [rows]);

  const moveMonth = useCallback(
    (delta: number) => {
      const total = year * 12 + (month - 1) + delta;
      const newYear = Math.floor(total / 12);
      const newMonth = (total % 12) + 1;
      setYear(newYear);
      setMonth(newMonth);
    },
    [year, month],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4" />
            Metas do mês
          </CardTitle>
          <CardDescription>
            Progresso de vendas vs meta — atualiza a cada deal marcado como vendido.
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => moveMonth(-1)}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-sm font-medium">
            {monthLabel(year, month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => moveMonth(1)}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {isManager ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-2 h-8 gap-2"
              onClick={() => setDialogOpen(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar metas
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {totals.goal > 0 ? (
          <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-brand-tint)]/40 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--crm-ink)]">
                <Trophy className="h-4 w-4 text-[var(--crm-brand)]" />
                Total do time
              </span>
              <span className="font-semibold tabular-nums text-[var(--crm-ink)]">
                {formatBRL(totals.sold)} /{" "}
                <span className="text-[var(--crm-ink-3)]">{formatBRL(totals.goal)}</span>
                {totals.pct != null ? (
                  <span className="ml-2 text-xs font-medium text-[var(--crm-ink-3)]">
                    ({totals.pct}%)
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--crm-surface-2)]">
              <div
                className={cn("h-full transition-all", progressBarTone(totals.pct))}
                style={{ width: `${Math.min(100, totals.pct ?? 0)}%` }}
              />
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sem metas e sem vendas neste mês.
            {isManager ? " Clique em \"Editar metas\" pra definir." : ""}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <SellerGoalRow key={r.profileId} row={r} />
            ))}
          </ul>
        )}
      </CardContent>

      {isManager ? (
        <EditGoalsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          year={year}
          month={month}
        />
      ) : null}
    </Card>
  );
}

function SellerGoalRow({ row }: { row: CrmMonthlyGoalReportRow }) {
  const pct = row.attainmentPct;
  const noGoal = row.goalAmount === 0;
  return (
    <li className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-1 text-sm">
        <span className="font-medium text-[var(--crm-ink)]">{row.profileName || "Sem nome"}</span>
        <span className="tabular-nums text-xs text-[var(--crm-ink-2)]">
          {noGoal ? (
            <>
              <span className="font-semibold text-[var(--crm-ink)]">
                {formatBRL(row.soldAmount)}
              </span>{" "}
              vendido · <span className="text-[var(--crm-ink-3)]">sem meta</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-[var(--crm-ink)]">
                {formatBRL(row.soldAmount)}
              </span>{" "}
              / <span className="text-[var(--crm-ink-3)]">{formatBRL(row.goalAmount)}</span>
              {pct != null ? (
                <span
                  className={cn(
                    "ml-2 font-medium",
                    pct >= 100
                      ? "text-[var(--crm-success-strong)]"
                      : pct >= 70
                        ? "text-[var(--crm-brand)]"
                        : pct >= 40
                          ? "text-[var(--crm-orange)]"
                          : "text-[var(--crm-danger-strong)]",
                  )}
                >
                  {pct}%
                </span>
              ) : null}
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--crm-surface-2)]">
        <div
          className={cn("h-full transition-all", progressBarTone(pct))}
          style={{ width: noGoal ? "0%" : `${Math.min(100, pct ?? 0)}%` }}
        />
      </div>
      {row.soldCount > 0 ? (
        <p className="mt-1 text-[10px] text-[var(--crm-ink-3)]">
          {row.soldCount} {row.soldCount === 1 ? "venda fechada" : "vendas fechadas"} no mês
        </p>
      ) : null}
    </li>
  );
}

function EditGoalsDialog({
  open,
  onOpenChange,
  year,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  month: number;
}) {
  const { toast } = useToast();
  const upsert = useUpsertCrmSellerGoal();
  const { data: collaborators = [] } = useTenantCollaborators({ enabled: open });
  const { data: existingGoals = [] } = useCrmMonthlyGoals(year, month, { enabled: open });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Inicializa drafts com valores existentes ao abrir.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    for (const g of existingGoals) {
      next[g.profileId] = g.goalAmount > 0 ? String(g.goalAmount) : "";
    }
    setDrafts(next);
  }, [existingGoals, open]);

  const candidates = useMemo(
    () =>
      collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({
          id: c.id,
          name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim(),
        })),
    [collaborators],
  );

  const handleSave = useCallback(async () => {
    const tasks = candidates.map(async (c) => {
      const raw = drafts[c.id] ?? "";
      const parsed = Number.parseFloat(raw.replace(",", "."));
      const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
      // Só envia upsert quando há valor (>0) — meta 0 = sem meta (linha some).
      // Para "limpar" uma meta existente o usuário ainda envia 0 explicitamente.
      if (value === 0) {
        return;
      }
      await upsert.mutateAsync({
        profileId: c.id,
        year,
        month,
        goalAmount: value,
      });
    });
    try {
      await Promise.all(tasks);
      toast({ title: "Metas salvas." });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [candidates, drafts, year, month, upsert, toast, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Editar metas — {monthLabel(year, month)}</DialogTitle>
          <DialogDescription>
            Defina a meta de faturamento de cada atendente. Deixe vazio pra remover.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum atendente ativo.</p>
          ) : (
            candidates.map((c) => (
              <div key={c.id} className="space-y-1.5">
                <Label htmlFor={`goal-${c.id}`} className="text-xs">
                  {c.name}
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--crm-ink-3)]">
                    R$
                  </span>
                  <Input
                    id={`goal-${c.id}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    placeholder="0"
                    value={drafts[c.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    className="h-9 pl-8 text-sm tabular-nums"
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={upsert.isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
