import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AppointmentOverlapError,
  useCreateAppointment,
} from "@/lib/api/scheduling-appointments";
import { useSetWaitlistStatus, useWaitlist } from "@/lib/api/scheduling-waitlist";

export type FreedSlot = {
  providerId: string;
  serviceId: string | null;
  serviceNome: string | null;
  preco: number | null;
  startsAt: string;
  endsAt: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freed: FreedSlot | null;
};

/** Sugere encaixar pacientes da lista de espera no horário que acabou de vagar. */
export function FitInDialog({ open, onOpenChange, freed }: Props) {
  const { toast } = useToast();
  const { data: waitlist = [], isLoading } = useWaitlist(undefined, { enabled: open });
  const createAppt = useCreateAppointment();
  const setStatus = useSetWaitlistStatus();

  // Compatíveis: serviço/prestador batem ou são "qualquer" (null) na espera.
  const matches = useMemo(() => {
    if (!freed) return [];
    return waitlist.filter(
      (w) =>
        (w.serviceId == null || w.serviceId === freed.serviceId) &&
        (w.providerId == null || w.providerId === freed.providerId),
    );
  }, [waitlist, freed]);

  const fit = async (entryId: string, nome: string, telefone: string | null, customerId: string | null) => {
    if (!freed) return;
    try {
      await createAppt.mutateAsync({
        providerId: freed.providerId,
        serviceId: freed.serviceId,
        startsAt: freed.startsAt,
        endsAt: freed.endsAt,
        customerId,
        customerNome: nome,
        customerTelefone: telefone,
        serviceNome: freed.serviceNome,
        preco: freed.preco,
      });
      await setStatus.mutateAsync({ id: entryId, status: "agendado" });
      toast({ title: "Encaixe feito", description: `${nome} agendado(a) no horário vago.` });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof AppointmentOverlapError) {
        toast({ title: "Horário já foi ocupado", variant: "destructive" });
      } else {
        toast({
          title: "Não foi possível encaixar",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Encaixar na lista de espera?</DialogTitle>
          <DialogDescription>
            {freed
              ? `Vagou ${format(parseISO(freed.startsAt), "dd/MM 'às' HH:mm")}. Pacientes esperando:`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando lista de espera…
          </div>
        ) : matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ninguém compatível na lista de espera.
          </p>
        ) : (
          <ul className="flex max-h-[50dvh] flex-col gap-2 overflow-y-auto">
            {matches.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{w.customerNome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {w.customerTelefone ?? ""}
                    {w.preferencia ? ` · ${w.preferencia}` : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={createAppt.isPending || setStatus.isPending}
                  onClick={() => void fit(w.id, w.customerNome, w.customerTelefone, w.customerId)}
                >
                  <CalendarPlus className="h-4 w-4" /> Encaixar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
