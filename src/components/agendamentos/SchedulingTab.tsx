import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantCollaborators } from "@/lib/api/settings";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useSchedulingRealtime } from "@/hooks/useSchedulingRealtime";
import { cn } from "@/lib/utils";
import { SchedulingBoard } from "./SchedulingBoard";
import { ScheduleAgendaList } from "./ScheduleAgendaList";
import { SchedulingMonth } from "./SchedulingMonth";
import { AppointmentDialog } from "./AppointmentDialog";
import { FitInDialog, type FreedSlot } from "./FitInDialog";
import type { Appointment } from "@/types/domain";

type BoardView = "day" | "week" | "month" | "list";
const HIDDEN_KEY = "agenda-hidden-providers";

function readHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export function SchedulingTab() {
  const { can } = useRolePermissions();
  const canConfig = can("configuracoes", "view");
  useSchedulingRealtime();

  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<BoardView>("day");
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => readHidden());
  const [weekProviderId, setWeekProviderId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<{ providerId?: string; date?: string; startsAt?: string }>();
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [fitInOpen, setFitInOpen] = useState(false);
  const [freedSlot, setFreedSlot] = useState<FreedSlot | null>(null);

  const { data: collaborators = [] } = useTenantCollaborators({ enabled: isSupabaseConfigured });
  const allProviders = useMemo(
    () =>
      collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim() })),
    [collaborators],
  );

  const visibleProviders = useMemo(
    () => allProviders.filter((p) => !hiddenIds.has(p.id)),
    [allProviders, hiddenIds],
  );

  // Garante um prestador selecionado no modo semana.
  useEffect(() => {
    if (!weekProviderId && allProviders[0]) setWeekProviderId(allProviders[0].id);
  }, [allProviders, weekProviderId]);

  const persistHidden = (next: Set<string>) => {
    setHiddenIds(new Set(next));
    try {
      window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  };
  const toggleProvider = (id: string) => {
    const next = new Set(hiddenIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistHidden(next);
  };

  const boardProviders =
    view === "week"
      ? allProviders.filter((p) => p.id === weekProviderId)
      : visibleProviders;

  const step = (dir: 1 | -1) =>
    setDate((d) => (view === "month" ? addMonths(d, dir) : addDays(d, view === "week" ? dir * 7 : dir)));

  const openCreate = (initial: { providerId: string; date: string; startsAt?: string }) => {
    setEditing(null);
    setDialogInitial(initial);
    setDialogOpen(true);
  };
  const openEdit = (appt: Appointment) => {
    setEditing(appt);
    setDialogInitial(undefined);
    setDialogOpen(true);
  };

  const rangeLabel =
    view === "week"
      ? `${format(startOfWeek(date, { weekStartsOn: 0 }), "dd/MM")} – ${format(endOfWeek(date, { weekStartsOn: 0 }), "dd/MM")}`
      : view === "month"
        ? format(date, "MMMM 'de' yyyy", { locale: ptBR })
        : format(date, "EEEE, d 'de' MMMM", { locale: ptBR });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--crm-border-2)] bg-card px-4 py-2 md:px-6">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
            aria-label="Anterior"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
            aria-label="Próximo"
            onClick={() => step(1)}
          >
            <ChevronRight className="h-[18px] w-[18px]" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 border-[var(--crm-border-2)] bg-card text-sm text-[var(--crm-brand)]"
            onClick={() => setDate(new Date())}
          >
            Hoje
          </Button>
        </div>

        <Input
          type="date"
          className="h-9 w-[150px] border-[var(--crm-border-2)]"
          value={format(date, "yyyy-MM-dd")}
          onChange={(e) => e.target.value && setDate(new Date(`${e.target.value}T12:00:00`))}
        />

        {/* Toggle Dia/Semana/Lista */}
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)]">
          {(["day", "week", "month", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "h-9 px-3 text-sm font-medium transition-colors",
                view === v
                  ? "bg-[var(--crm-brand)] text-white"
                  : "bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
              )}
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : v === "month" ? "Mês" : "Lista"}
            </button>
          ))}
        </div>

        <span className="hidden text-sm font-medium capitalize text-[var(--crm-ink-2)] lg:inline">
          {rangeLabel}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Modo semana: escolher 1 prestador. Modo dia: filtrar colunas. */}
          {view === "week" ? (
            <Select value={weekProviderId} onValueChange={setWeekProviderId}>
              <SelectTrigger className="h-9 w-[180px] border-[var(--crm-border-2)]">
                <SelectValue placeholder="Prestador" />
              </SelectTrigger>
              <SelectContent>
                {allProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 gap-2 border-[var(--crm-border-2)] bg-card text-sm text-[var(--crm-ink-2)]"
                >
                  <Users className="h-4 w-4" />
                  Prestadores ({visibleProviders.length}/{allProviders.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-0">
                <div className="flex items-center justify-between border-b border-[var(--crm-border-2)] px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                    Mostrar prestadores
                  </span>
                  {hiddenIds.size > 0 ? (
                    <button
                      type="button"
                      className="text-xs text-[var(--crm-brand)] hover:underline"
                      onClick={() => persistHidden(new Set())}
                    >
                      Todos
                    </button>
                  ) : null}
                </div>
                <div className="max-h-72 overflow-y-auto p-1">
                  {allProviders.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--crm-surface)]"
                    >
                      <Checkbox checked={!hiddenIds.has(p.id)} onCheckedChange={() => toggleProvider(p.id)} />
                      <span className="truncate">{p.name}</span>
                    </label>
                  ))}
                  {allProviders.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-[var(--crm-ink-3)]">Nenhum prestador ativo.</p>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {canConfig ? (
            <Button
              asChild
              type="button"
              variant="outline"
              className="h-9 gap-2 border-[var(--crm-border-2)] bg-card text-sm text-[var(--crm-ink-2)]"
            >
              <Link to="/agenda/configuracoes">
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">Configurar</span>
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            className="h-9 gap-1.5 bg-[var(--crm-brand)] text-white hover:bg-[var(--crm-brand-strong)]"
            onClick={() => openCreate({ providerId: boardProviders[0]?.id ?? "", date: format(date, "yyyy-MM-dd") })}
            disabled={allProviders.length === 0}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Agendar</span>
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <ScheduleAgendaList date={date} providers={visibleProviders} onEdit={openEdit} />
      ) : view === "month" ? (
        <SchedulingMonth
          date={date}
          providers={visibleProviders}
          onCreate={openCreate}
          onEdit={openEdit}
        />
      ) : (
        <SchedulingBoard
          view={view === "day" ? "day" : "week"}
          date={date}
          providers={boardProviders}
          onCreate={openCreate}
          onEdit={openEdit}
        />
      )}

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        providers={allProviders}
        initial={dialogInitial}
        editing={editing}
        onCancelled={(freed) => {
          setFreedSlot(freed);
          setFitInOpen(true);
        }}
      />

      <FitInDialog open={fitInOpen} onOpenChange={setFitInOpen} freed={freedSlot} />
    </div>
  );
}
