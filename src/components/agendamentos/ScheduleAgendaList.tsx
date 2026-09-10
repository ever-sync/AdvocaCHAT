import { useMemo } from "react";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppointmentsRange } from "@/lib/api/scheduling-appointments";
import { providerColor } from "@/lib/agendamentos/provider-colors";
import type { Appointment } from "@/types/domain";
import { cn } from "@/lib/utils";

type Provider = { id: string; name: string };

type Props = {
  date: Date;
  providers: Provider[];
  onEdit: (appt: Appointment) => void;
};

const STATUS_BADGE: Record<Appointment["status"], string> = {
  agendado: "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]",
  confirmado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  concluido: "bg-[var(--crm-surface-2)] text-[var(--crm-ink-3)]",
  cancelado: "bg-red-500/15 text-red-600",
  nao_compareceu: "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Faltou",
};

export function ScheduleAgendaList({ date, providers, onEdit }: Props) {
  const { data: appointments = [], isLoading } = useAppointmentsRange(startOfDay(date), endOfDay(date));
  const providerName = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [providers]);
  const visibleIds = useMemo(() => new Set(providers.map((p) => p.id)), [providers]);

  const rows = useMemo(
    () =>
      appointments
        .filter((a) => a.status !== "cancelado" && visibleIds.has(a.providerId))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [appointments, visibleIds],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between px-4 py-2 md:px-6 print:hidden">
        <span className="text-sm font-medium capitalize text-[var(--crm-ink-2)]">
          {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })} · {rows.length} agendamento{rows.length === 1 ? "" : "s"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 border-[var(--crm-border-2)]"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 md:px-6">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--crm-ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--crm-ink-3)]">Nenhum agendamento neste dia.</p>
        ) : (
          <ul className="mx-auto max-w-3xl divide-y divide-[var(--crm-border-2)] rounded-lg border border-[var(--crm-border-2)] bg-card">
            {rows.map((a) => {
              const color = providerColor(a.providerId);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(a)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--crm-surface)]"
                  >
                    <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-[var(--crm-ink)]">
                      {format(parseISO(a.startsAt), "HH:mm")}–{format(parseISO(a.endsAt), "HH:mm")}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.dot }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--crm-ink)]">
                        {a.customerNome ?? "Sem cliente"}
                        {a.checkedInAt ? <span className="ml-1 text-xs text-emerald-600">✓ chegou</span> : null}
                      </span>
                      <span className="block truncate text-xs text-[var(--crm-ink-3)]">
                        {providerName(a.providerId)}
                        {a.serviceNome ? ` · ${a.serviceNome}` : ""}
                        {a.customerTelefone ? ` · ${a.customerTelefone}` : ""}
                      </span>
                    </span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_BADGE[a.status])}>
                      {STATUS_LABEL[a.status]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
