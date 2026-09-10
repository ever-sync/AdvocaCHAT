import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  Loader2,
  User2,
} from "lucide-react";
import { SchedulingTab } from "@/components/agendamentos/SchedulingTab";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCrmAgendaTasks, useUpdateCrmTask } from "@/lib/api/crm-tasks";
import { useTenantCollaborators } from "@/lib/api/settings";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CrmTask } from "@/types/domain";

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function isOverdue(task: CrmTask) {
  if (task.status === "concluida" || !task.dueAt) {
    return false;
  }
  return parseISO(task.dueAt).getTime() < Date.now();
}

function TasksTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const profileId = profile?.id ?? null;

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [onlyMine, setOnlyMine] = useState(false);

  // Intervalo da grade do calendário (semanas completas que cobrem o mês).
  const gridStart = useMemo(
    () => startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 }),
    [viewMonth],
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 }),
    [viewMonth],
  );
  const gridDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  const { data: allTasks = [], isLoading } = useCrmAgendaTasks(gridStart, gridEnd);
  const { data: collaborators = [] } = useTenantCollaborators({
    enabled: isSupabaseConfigured,
  });
  const updateTask = useUpdateCrmTask({
    onError: (error) =>
      toast({
        title: "Não foi possível atualizar a tarefa",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      }),
  });

  const assigneeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of collaborators) {
      map.set(c.id, (c.nome?.trim() || c.email?.trim() || "Sem nome").trim());
    }
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [collaborators]);

  const tasks = useMemo(
    () => (onlyMine && profileId ? allTasks.filter((t) => t.assigneeId === profileId) : allTasks),
    [allTasks, onlyMine, profileId],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CrmTask[]>();
    for (const task of tasks) {
      if (!task.dueAt) continue;
      const key = dayKey(parseISO(task.dueAt));
      const list = map.get(key);
      if (list) {
        list.push(task);
      } else {
        map.set(key, [task]);
      }
    }
    return map;
  }, [tasks]);

  const selectedTasks = useMemo(
    () => tasksByDay.get(dayKey(selectedDay)) ?? [],
    [tasksByDay, selectedDay],
  );

  const monthStats = useMemo(() => {
    const inMonth = tasks.filter((t) => t.dueAt && isSameMonth(parseISO(t.dueAt), viewMonth));
    return {
      total: inMonth.length,
      overdue: inMonth.filter(isOverdue).length,
    };
  }, [tasks, viewMonth]);

  const toggleDone = (task: CrmTask) => {
    void updateTask.mutate({
      id: task.id,
      patch: { status: task.status === "concluida" ? "aberta" : "concluida" },
      negotiationId: task.negotiationId,
      customerId: task.customerId,
    });
  };

  const goToday = () => {
    const now = new Date();
    setViewMonth(startOfMonth(now));
    setSelectedDay(now);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--crm-surface)] text-[var(--crm-ink)]">
      {/* Cabeçalho */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--crm-border)] bg-card px-4 py-3 md:px-6">
        <div className="mr-auto flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight text-[var(--crm-ink)]">Agenda</h1>
            <p className="text-xs text-[var(--crm-ink-3)]">
              {monthStats.total} tarefa{monthStats.total === 1 ? "" : "s"} no mês
              {monthStats.overdue > 0 ? ` · ${monthStats.overdue} atrasada${monthStats.overdue === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOnlyMine((v) => !v)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
            onlyMine
              ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
              : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
          )}
          title="Mostrar apenas tarefas atribuídas a mim"
        >
          <User2 className="h-4 w-4" aria-hidden />
          Minhas tarefas
        </button>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
            aria-label="Mês anterior"
            onClick={() => setViewMonth((m) => addMonths(m, -1))}
          >
            <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-[var(--crm-ink)]">
            {format(viewMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
            aria-label="Próximo mês"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="h-9 border-[var(--crm-border-2)] bg-card text-sm font-medium text-[var(--crm-brand)] hover:bg-[var(--crm-surface)]"
          onClick={goToday}
        >
          Hoje
        </Button>
      </div>

      {/* Corpo */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Calendário */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7 gap-1.5">
            {gridDays.map((day) => {
              const dayTasks = tasksByDay.get(dayKey(day)) ?? [];
              const inMonth = isSameMonth(day, viewMonth);
              const selected = isSameDay(day, selectedDay);
              const today = isToday(day);
              const overdueCount = dayTasks.filter(isOverdue).length;

              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "flex min-h-[88px] flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors",
                    selected
                      ? "border-[var(--crm-brand)] bg-[var(--crm-brand-tint)]"
                      : "border-[var(--crm-border-2)] bg-card hover:bg-[var(--crm-surface)]",
                    !inMonth && "opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold",
                      today
                        ? "bg-[var(--crm-brand)] text-white"
                        : "text-[var(--crm-ink-2)]",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {dayTasks.slice(0, 3).map((task) => (
                      <span
                        key={task.id}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-[11px] font-medium",
                          task.status === "concluida"
                            ? "bg-[var(--crm-surface-2)] text-[var(--crm-ink-3)] line-through"
                            : isOverdue(task)
                              ? "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]"
                              : "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
                        )}
                        title={task.title}
                      >
                        {task.dueAt ? `${format(parseISO(task.dueAt), "HH:mm")} ` : ""}
                        {task.title}
                      </span>
                    ))}
                    {dayTasks.length > 3 ? (
                      <span className="px-1.5 text-[11px] font-medium text-[var(--crm-ink-3)]">
                        +{dayTasks.length - 3}
                        {overdueCount > 0 ? " ⚠" : ""}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel do dia */}
        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-[var(--crm-border)] bg-card lg:w-[360px] lg:border-l lg:border-t-0">
          <div className="shrink-0 border-b border-[var(--crm-border-2)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
              {format(selectedDay, "EEEE", { locale: ptBR })}
            </p>
            <p className="text-base font-semibold capitalize text-[var(--crm-ink)]">
              {format(selectedDay, "d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-[var(--crm-ink-3)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : selectedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-[var(--crm-ink-3)]">
                <CalendarDays className="h-8 w-8 opacity-40" aria-hidden />
                Nenhuma tarefa neste dia.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedTasks.map((task) => {
                  const overdue = isOverdue(task);
                  const done = task.status === "concluida";
                  const assignee = assigneeName(task.assigneeId);
                  const linkTo = task.negotiationId
                    ? `/crm/negociacao/${task.negotiationId}`
                    : task.customerId
                      ? `/clientes/${task.customerId}`
                      : null;

                  return (
                    <li
                      key={task.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors",
                        done
                          ? "border-[var(--crm-border-2)] bg-[var(--crm-surface)]"
                          : overdue
                            ? "border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)]"
                            : "border-[var(--crm-border-2)] bg-card",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleDone(task)}
                          disabled={updateTask.isPending}
                          className="mt-0.5 shrink-0 text-[var(--crm-brand)] disabled:opacity-50"
                          aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                          title={done ? "Reabrir tarefa" : "Concluir tarefa"}
                        >
                          {done ? (
                            <CheckCircle2 className="h-5 w-5" aria-hidden />
                          ) : (
                            <Circle className="h-5 w-5 text-[var(--crm-ink-3)]" aria-hidden />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-sm font-medium text-[var(--crm-ink)]",
                              done && "text-[var(--crm-ink-3)] line-through",
                            )}
                          >
                            {task.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--crm-ink-3)]">
                            {task.dueAt ? (
                              <span className={cn(overdue && !done && "font-semibold text-[var(--crm-orange)]")}>
                                {format(parseISO(task.dueAt), "HH:mm")}
                                {overdue && !done ? " · atrasada" : ""}
                              </span>
                            ) : null}
                            {assignee ? (
                              <span className="inline-flex items-center gap-1">
                                <User2 className="h-3 w-3" aria-hidden />
                                {assignee}
                              </span>
                            ) : null}
                          </div>
                          {task.notes ? (
                            <p className="mt-1 line-clamp-2 text-xs text-[var(--crm-ink-3)]">{task.notes}</p>
                          ) : null}
                          {linkTo ? (
                            <Link
                              to={linkTo}
                              className="mt-1.5 inline-block text-xs font-medium text-[var(--crm-brand)] hover:underline"
                            >
                              {task.negotiationId ? "Abrir negociação" : "Abrir cliente"} →
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!isSupabaseConfigured ? (
            <div className="shrink-0 border-t border-[var(--crm-border-2)] px-4 py-3 text-xs text-[var(--crm-ink-3)]">
              Configure o Supabase para carregar tarefas reais.
            </div>
          ) : (
            <div className="shrink-0 border-t border-[var(--crm-border-2)] px-4 py-3 text-xs text-[var(--crm-ink-3)]">
              As tarefas vêm do CRM. Crie tarefas dentro de uma negociação para vê-las aqui.{" "}
              <button
                type="button"
                onClick={() => navigate("/crm")}
                className="font-medium text-[var(--crm-brand)] hover:underline"
              >
                Ir para o CRM
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

const AGENDA_TABS = [
  { id: "agendamentos", label: "Agendamentos", icon: CalendarRange },
  { id: "tarefas", label: "Tarefas", icon: ListTodo },
] as const;

export default function Agenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "tarefas" ? "tarefas" : "agendamentos";

  const setTab = (next: string) => {
    setSearchParams(
      (prev) => {
        prev.set("tab", next);
        return prev;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--crm-surface)] text-[var(--crm-ink)]">
      <div className="flex shrink-0 items-center gap-1 border-b border-[var(--crm-border)] bg-card px-4 md:px-6">
        {AGENDA_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-[var(--crm-brand)] text-[var(--crm-brand)]"
                  : "border-transparent text-[var(--crm-ink-3)] hover:text-[var(--crm-ink-2)]",
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "agendamentos" ? <SchedulingTab /> : <TasksTab />}
      </div>
    </div>
  );
}
