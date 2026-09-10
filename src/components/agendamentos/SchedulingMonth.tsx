import { useMemo } from "react";
import {
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
import { Loader2, Plus } from "lucide-react";
import { useAppointmentsRange } from "@/lib/api/scheduling-appointments";
import { providerColor } from "@/lib/agendamentos/provider-colors";
import type { Appointment } from "@/types/domain";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string };

type Props = {
  date: Date;
  providers: Provider[];
  onCreate: (initial: { providerId: string; date: string; startsAt?: string }) => void;
  onEdit: (appt: Appointment) => void;
};

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const STATUS_STYLES: Record<Appointment["status"], string> = {
  agendado: "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
  confirmado: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  concluido: "bg-[var(--crm-surface-2)] text-[var(--crm-ink-3)]",
  cancelado: "bg-red-500/10 text-red-600 line-through",
  nao_compareceu: "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
};

export function SchedulingMonth({ date, providers, onCreate, onEdit }: Props) {
  // Intervalo da grade do mês
  const rangeStart = useMemo(
    () => startOfWeek(startOfMonth(date), { weekStartsOn: 0 }),
    [date],
  );
  const rangeEnd = useMemo(
    () => endOfWeek(endOfMonth(date), { weekStartsOn: 0 }),
    [date],
  );
  const gridDays = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  // Busca todos os agendamentos do intervalo
  const { data: appointments = [], isLoading } = useAppointmentsRange(rangeStart, rangeEnd);

  // Mapeia agendamentos por dia formatado (YYYY-MM-DD), filtrando apenas pelos prestadores ativos/selecionados
  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    const providerIds = new Set(providers.map((p) => p.id));

    for (const a of appointments) {
      if (a.status === "cancelado") continue;
      if (!providerIds.has(a.providerId)) continue;

      const key = format(parseISO(a.startsAt), "yyyy-MM-dd");
      const list = map.get(key);
      if (list) {
        list.push(a);
      } else {
        map.set(key, [a]);
      }
    }

    // Ordena por horário de início dentro de cada dia
    for (const list of map.values()) {
      list.sort((x, y) => x.startsAt.localeCompare(y.startsAt));
    }

    return map;
  }, [appointments, providers]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:p-6 bg-[var(--crm-surface)]">
      {isLoading && (
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--crm-ink-3)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando agendamentos…
        </div>
      )}

      {/* Dias da semana */}
      <div className="grid grid-cols-7 gap-px mb-2">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--crm-ink-3)]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid de dias do mês */}
      <div className="grid flex-1 grid-cols-7 gap-1.5 overflow-y-auto">
        {gridDays.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayAppts = apptsByDay.get(dayStr) ?? [];
          const inMonth = isSameMonth(day, date);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "group relative flex min-h-[110px] flex-col gap-1 rounded-lg border p-1.5 text-left bg-card border-[var(--crm-border-2)] hover:border-muted-foreground/30 transition-colors",
                !inMonth && "opacity-45 bg-[var(--crm-surface-2)]/30",
              )}
            >
              {/* Header do dia */}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    today
                      ? "bg-[var(--crm-brand)] text-white"
                      : "text-[var(--crm-ink-2)]",
                  )}
                >
                  {format(day, "d")}
                </span>

                {/* Botão de adicionar agendamento rápido */}
                <button
                  type="button"
                  onClick={() => onCreate({ providerId: providers[0]?.id ?? "", date: dayStr })}
                  disabled={providers.length === 0}
                  className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint)]"
                  title="Novo agendamento para este dia"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Lista de agendamentos */}
              <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px]">
                {dayAppts.slice(0, 3).map((appt) => {
                  const pColor = providerColor(appt.providerId);
                  return (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={() => onEdit(appt)}
                      className={cn(
                        "w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-shadow hover:shadow-sm border-l-2",
                        STATUS_STYLES[appt.status],
                      )}
                      style={{ borderLeftColor: pColor.dot }}
                      title={`${format(parseISO(appt.startsAt), "HH:mm")} · ${appt.customerNome ?? "Sem cliente"} (${appt.serviceNome ?? "Sem serviço"})`}
                    >
                      <span className="font-semibold mr-1">{format(parseISO(appt.startsAt), "HH:mm")}</span>
                      <span>{appt.customerNome ?? "Sem cliente"}</span>
                    </button>
                  );
                })}

                {dayAppts.length > 3 && (
                  <span className="px-1 text-[10px] font-bold text-[var(--crm-ink-3)]">
                    + {dayAppts.length - 3} outros
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
