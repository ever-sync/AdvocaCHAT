import { useMemo } from "react";
import {
  addDays,
  endOfDay,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Loader2, Plus } from "lucide-react";
import {
  AppointmentOverlapError,
  useAppointmentsRange,
  useUpdateAppointment,
} from "@/lib/api/scheduling-appointments";
import { useAllExceptions, useAllWorkingHours } from "@/lib/api/scheduling-providers";
import { useToast } from "@/hooks/use-toast";
import {
  BODY_HEIGHT,
  DAY_END_MIN,
  DAY_START_MIN,
  PX_PER_MIN,
  hourMarks,
  localMinutesOfDay,
  minutesToY,
  snapMinutes,
  yToMinutes,
} from "@/lib/agendamentos/board-geometry";
import { providerColor } from "@/lib/agendamentos/provider-colors";
import type { Appointment, SchedulingException, WorkingHour } from "@/types/domain";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string };

type BoardColumn = {
  key: string;
  label: string;
  sublabel?: string;
  providerId: string;
  providerName: string;
  date: Date;
  dateStr: string;
  weekday: number;
};

type Props = {
  view: "day" | "week";
  date: Date;
  providers: Provider[];
  onCreate: (initial: { providerId: string; date: string; startsAt?: string }) => void;
  onEdit: (appt: Appointment) => void;
};

const STATUS_STYLES: Record<Appointment["status"], string> = {
  agendado: "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
  confirmado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  concluido: "bg-[var(--crm-surface-2)] text-[var(--crm-ink-3)]",
  cancelado: "bg-red-500/10 text-red-600 line-through",
  nao_compareceu: "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
};

function toIsoLocal(dateStr: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`).toISOString();
}

/** Recorta uma exceção ao dia da coluna; null se não intersecta. */
function clampExceptionToDay(
  ex: SchedulingException,
  dayStart: Date,
  dayEnd: Date,
): { startMin: number; endMin: number } | null {
  const s = parseISO(ex.startsAt);
  const e = parseISO(ex.endsAt);
  if (e <= dayStart || s >= dayEnd) return null;
  const startMin = s <= dayStart ? DAY_START_MIN : localMinutesOfDay(ex.startsAt);
  const endMin = e >= dayEnd ? DAY_END_MIN : localMinutesOfDay(ex.endsAt);
  if (endMin <= startMin) return null;
  return { startMin: Math.max(DAY_START_MIN, startMin), endMin: Math.min(DAY_END_MIN, endMin) };
}

function DraggableAppointment({
  appt,
  color,
  onEdit,
}: {
  appt: Appointment;
  color: ReturnType<typeof providerColor>;
  onEdit: (a: Appointment) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: appt.id,
    data: { durationMin: localMinutesOfDay(appt.endsAt) - localMinutesOfDay(appt.startsAt) },
  });
  const start = parseISO(appt.startsAt);
  const startMin = localMinutesOfDay(appt.startsAt);
  const endMin = localMinutesOfDay(appt.endsAt);
  const top = minutesToY(startMin);
  const height = Math.max(20, (endMin - startMin) * PX_PER_MIN);
  const done = appt.status === "concluido" || appt.status === "cancelado";

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={() => onEdit(appt)}
      className={cn(
        "absolute left-1 right-1 z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-[11px] shadow-sm transition-shadow hover:shadow-md",
        STATUS_STYLES[appt.status],
        isDragging && "opacity-70 ring-2 ring-[var(--crm-brand)]",
      )}
      style={{
        top,
        height,
        borderLeftColor: done ? undefined : color.border,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      title={`${format(start, "HH:mm")} · ${appt.customerNome ?? "Sem cliente"}${appt.serviceNome ? ` · ${appt.serviceNome}` : ""}`}
    >
      <span className="block font-semibold leading-tight">
        {appt.checkedInAt ? "✓ " : ""}
        {format(start, "HH:mm")} {appt.customerNome ?? "Sem cliente"}
      </span>
      {appt.serviceNome ? (
        <span className="block truncate leading-tight opacity-80">{appt.serviceNome}</span>
      ) : null}
    </button>
  );
}

function ColumnBody({
  column,
  appts,
  workingIntervals,
  blocks,
  onCreate,
  onEdit,
}: {
  column: BoardColumn;
  appts: Appointment[];
  workingIntervals: { startMin: number; endMin: number }[];
  blocks: { startMin: number; endMin: number }[];
  onCreate: Props["onCreate"];
  onEdit: Props["onEdit"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { column } });
  const color = providerColor(column.providerId);

  return (
    <div
      ref={setNodeRef}
      className={cn("relative cursor-pointer", isOver && "bg-[var(--crm-brand-tint)]/40")}
      style={{ height: BODY_HEIGHT }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const minutes = snapMinutes(yToMinutes(e.clientY - rect.top), 15);
        onCreate({ providerId: column.providerId, date: column.dateStr, startsAt: toIsoLocal(column.dateStr, minutes) });
      }}
    >
      {/* Fundo "fora do expediente" (cinza) com janelas de trabalho recortadas em claro */}
      <div className="pointer-events-none absolute inset-0 bg-[var(--crm-surface-2)]/50" />
      {workingIntervals.map((w, i) => (
        <div
          key={`wh-${i}`}
          className="pointer-events-none absolute left-0 right-0 bg-card"
          style={{ top: minutesToY(w.startMin), height: (w.endMin - w.startMin) * PX_PER_MIN }}
        />
      ))}
      {/* Bloqueios/folgas */}
      {blocks.map((b, i) => (
        <div
          key={`blk-${i}`}
          className="pointer-events-none absolute left-0 right-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--crm-surface-2)_6px,var(--crm-surface-2)_12px)] opacity-70"
          style={{ top: minutesToY(b.startMin), height: (b.endMin - b.startMin) * PX_PER_MIN }}
        />
      ))}
      {/* Linhas de hora */}
      {hourMarks().map((h) => (
        <div
          key={h}
          className="pointer-events-none absolute left-0 right-0 border-t border-[var(--crm-surface-2)]"
          style={{ top: minutesToY(h * 60) }}
        />
      ))}
      {/* Agendamentos */}
      {appts.map((a) => (
        <DraggableAppointment key={a.id} appt={a} color={color} onEdit={onEdit} />
      ))}
    </div>
  );
}

export function SchedulingBoard({ view, date, providers, onCreate, onEdit }: Props) {
  const { toast } = useToast();
  const updateAppt = useUpdateAppointment();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const rangeStart = view === "week" ? startOfWeek(date, { weekStartsOn: 0 }) : startOfDay(date);
  const rangeEnd = view === "week" ? endOfWeek(date, { weekStartsOn: 0 }) : endOfDay(date);

  const { data: appointments = [], isLoading } = useAppointmentsRange(rangeStart, rangeEnd);
  const { data: workingHours = [] } = useAllWorkingHours();
  const { data: exceptions = [] } = useAllExceptions(rangeStart, rangeEnd);

  // Colunas: dia = um prestador por coluna; semana = um dia por coluna (1 prestador).
  const columns = useMemo<BoardColumn[]>(() => {
    if (view === "week") {
      const provider = providers[0];
      if (!provider) return [];
      return Array.from({ length: 7 }, (_, i) => {
        const d = addDays(rangeStart, i);
        return {
          key: `${provider.id}|${format(d, "yyyy-MM-dd")}`,
          label: format(d, "EEE", { locale: ptBR }),
          sublabel: format(d, "dd/MM"),
          providerId: provider.id,
          providerName: provider.name,
          date: d,
          dateStr: format(d, "yyyy-MM-dd"),
          weekday: d.getDay(),
        };
      });
    }
    const d = startOfDay(date);
    const dateStr = format(d, "yyyy-MM-dd");
    return providers.map((p) => ({
      key: `${p.id}|${dateStr}`,
      label: p.name,
      providerId: p.id,
      providerName: p.name,
      date: d,
      dateStr,
      weekday: d.getDay(),
    }));
  }, [view, providers, date, rangeStart]);

  const apptsByColumn = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      if (a.status === "cancelado") continue;
      const key = `${a.providerId}|${format(parseISO(a.startsAt), "yyyy-MM-dd")}`;
      const list = map.get(key);
      if (list) list.push(a);
      else map.set(key, [a]);
    }
    return map;
  }, [appointments]);

  // Expediente por (prestador, weekday) e exceções por prestador.
  const whByProviderWeekday = useMemo(() => {
    const map = new Map<string, WorkingHour[]>();
    for (const wh of workingHours) {
      const k = `${wh.providerId}|${wh.weekday}`;
      const list = map.get(k);
      if (list) list.push(wh);
      else map.set(k, [wh]);
    }
    return map;
  }, [workingHours]);

  const excByProvider = useMemo(() => {
    const map = new Map<string, SchedulingException[]>();
    for (const ex of exceptions) {
      const list = map.get(ex.providerId);
      if (list) list.push(ex);
      else map.set(ex.providerId, [ex]);
    }
    return map;
  }, [exceptions]);

  const shadingFor = (column: BoardColumn) => {
    const whs = whByProviderWeekday.get(`${column.providerId}|${column.weekday}`) ?? [];
    const working = whs
      .map((w) => ({
        startMin: Math.max(DAY_START_MIN, hmToMin(w.startTime)),
        endMin: Math.min(DAY_END_MIN, hmToMin(w.endTime)),
      }))
      .filter((w) => w.endMin > w.startMin);
    const blocks: { startMin: number; endMin: number }[] = [];
    const dayStart = startOfDay(column.date);
    const dayEnd = endOfDay(column.date);
    for (const ex of excByProvider.get(column.providerId) ?? []) {
      const clamped = clampExceptionToDay(ex, dayStart, dayEnd);
      if (!clamped) continue;
      if (ex.kind === "extra") working.push(clamped);
      else blocks.push(clamped);
    }
    return { working, blocks };
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over, delta } = event;
    if (!over) return;
    const appt = appointments.find((a) => a.id === String(active.id));
    if (!appt) return;
    const targetColumn = (over.data.current?.column as BoardColumn | undefined) ?? null;
    if (!targetColumn) return;

    const durationMin = (active.data.current?.durationMin as number) ?? 30;
    const oldStartMin = localMinutesOfDay(appt.startsAt);
    let newStartMin = snapMinutes(oldStartMin + Math.round(delta.y / PX_PER_MIN), 15);
    newStartMin = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - durationMin, newStartMin));

    const sameColumn = `${appt.providerId}|${format(parseISO(appt.startsAt), "yyyy-MM-dd")}` === targetColumn.key;
    if (sameColumn && newStartMin === oldStartMin) return;

    const startsAt = toIsoLocal(targetColumn.dateStr, newStartMin);
    const endsAt = toIsoLocal(targetColumn.dateStr, newStartMin + durationMin);

    try {
      await updateAppt.mutateAsync({
        id: appt.id,
        patch: { providerId: targetColumn.providerId, startsAt, endsAt },
      });
      toast({ title: "Agendamento remarcado" });
    } catch (err) {
      if (err instanceof AppointmentOverlapError) {
        toast({ title: "Horário ocupado", description: err.message, variant: "destructive" });
      } else {
        toast({
          title: "Não foi possível remarcar",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    }
  };

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--crm-ink-3)]">
        {view === "week"
          ? "Selecione um prestador para ver a semana."
          : "Nenhum prestador selecionado. Ajuste o filtro de prestadores."}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-[var(--crm-ink-3)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando agendamentos…
        </div>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Gutter de horas */}
            <div className="sticky left-0 z-20 w-14 shrink-0 bg-card">
              <div className="h-10 border-b border-[var(--crm-border-2)]" />
              <div className="relative" style={{ height: BODY_HEIGHT }}>
                {hourMarks().map((h) => (
                  <div
                    key={h}
                    className="absolute right-1 -translate-y-1/2 text-[11px] text-[var(--crm-ink-3)]"
                    style={{ top: minutesToY(h * 60) }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
            </div>

            {/* Colunas */}
            {columns.map((column) => {
              const appts = apptsByColumn.get(column.key) ?? [];
              const { working, blocks } = shadingFor(column);
              const color = providerColor(column.providerId);
              return (
                <div
                  key={column.key}
                  className="shrink-0 border-l border-[var(--crm-border-2)]"
                  style={{ width: view === "week" ? 168 : 224 }}
                >
                  <div className="flex h-10 items-center justify-between gap-1 border-b border-[var(--crm-border-2)] bg-card px-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color.dot }}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-semibold capitalize text-[var(--crm-ink)]">
                        {column.label}
                        {column.sublabel ? <span className="ml-1 text-xs font-normal text-[var(--crm-ink-3)]">{column.sublabel}</span> : null}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onCreate({ providerId: column.providerId, date: column.dateStr })}
                      className="rounded p-1 text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint)]"
                      aria-label="Novo agendamento"
                      title="Novo agendamento"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <ColumnBody
                    column={column}
                    appts={appts}
                    workingIntervals={working}
                    blocks={blocks}
                    onCreate={onCreate}
                    onEdit={onEdit}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":");
  return Number(h) * 60 + Number(m);
}
