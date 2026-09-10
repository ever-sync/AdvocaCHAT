import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addWeeks, format, parseISO } from "date-fns";
import {
  Loader2,
  MessageCircle,
  Trash2,
  UserRound,
  Sparkles,
  Calendar,
  DoorOpen,
  CreditCard,
  RefreshCw,
  Clock,
  User,
  Search,
  Phone,
  FileText,
  CheckCircle2,
  MapPin,
  CheckSquare,
  AlertCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/lib/api/products";
import { useCustomers } from "@/lib/api/customers";
import { useRooms } from "@/lib/api/scheduling-rooms";
import { useSchedulingServices } from "@/lib/api/scheduling-services";
import { useAvailability } from "@/lib/api/scheduling-availability";
import {
  AppointmentOverlapError,
  useCreateAppointment,
  useUpdateAppointment,
  useUpdateAppointmentSeries,
  useCancelAppointmentSeries,
  useCustomerAppointments,
  type AppointmentPatch,
} from "@/lib/api/scheduling-appointments";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { FreedSlot } from "./FitInDialog";
import type { Appointment, AppointmentStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Faltou",
};

function waLink(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d && !d.startsWith("55") && d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

type Provider = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: Provider[];
  /** Pré-seleção ao clicar num horário/coluna da grade. */
  initial?: {
    providerId?: string;
    date?: string;
    startsAt?: string;
    customerId?: string;
    customerNome?: string;
    customerTelefone?: string;
  };
  /** Quando presente, edita em vez de criar. */
  editing?: Appointment | null;
  /** Chamado ao cancelar — recebe o horário que vagou (para sugerir encaixe). */
  onCancelled?: (freed: FreedSlot) => void;
};

function todayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export function AppointmentDialog({ open, onOpenChange, providers, initial, editing, onCancelled }: Props) {
  const { toast } = useToast();
  const isEdit = Boolean(editing);

  const [providerId, setProviderId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [date, setDate] = useState(todayStr());
  const [selectedSlot, setSelectedSlot] = useState<string>(""); // startsAt ISO
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerNome, setCustomerNome] = useState("");
  const [customerTelefone, setCustomerTelefone] = useState("");
  const [notes, setNotes] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [convenio, setConvenio] = useState("");
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [cancelMode, setCancelMode] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [seriesUpdateMode, setSeriesUpdateMode] = useState<"only_this" | "following" | "all">("only_this");
  const [seriesCancelMode, setSeriesCancelMode] = useState<"only_this" | "following" | "all">("only_this");
  const [clinicalNotes, setClinicalNotes] = useState("");

  // (Re)inicializa ao abrir.
  useEffect(() => {
    if (!open) return;
    setCancelMode(false);
    setCancelReasonInput("");
    setRepeatWeeks(1);
    setSeriesUpdateMode("only_this");
    setSeriesCancelMode("only_this");
    if (editing) {
      setProviderId(editing.providerId);
      const ids = editing.stackedServices
        ? editing.stackedServices.map((service) => service.id)
        : (editing.serviceId ? [editing.serviceId] : []);
      setSelectedServiceIds(ids);
      setDate(format(parseISO(editing.startsAt), "yyyy-MM-dd"));
      setSelectedSlot(editing.startsAt);
      setCustomerId(editing.customerId);
      setCustomerNome(editing.customerNome ?? "");
      setCustomerTelefone(editing.customerTelefone ?? "");
      setNotes(editing.notes ?? "");
      setCustomerSearch(editing.customerNome ?? "");
      setRoomId(editing.roomId ?? "");
      setConvenio(editing.convenio ?? "");
      setClinicalNotes(editing.clinicalNotes ?? "");
    } else {
      setProviderId(initial?.providerId ?? providers[0]?.id ?? "");
      setSelectedServiceIds([]);
      setDate(initial?.date ?? (initial?.startsAt ? format(parseISO(initial.startsAt), "yyyy-MM-dd") : todayStr()));
      setSelectedSlot(initial?.startsAt ?? "");
      setCustomerId(initial?.customerId ?? null);
      setCustomerNome(initial?.customerNome ?? "");
      setCustomerTelefone(initial?.customerTelefone ?? "");
      setNotes("");
      setCustomerSearch(initial?.customerNome ?? "");
      setRoomId("");
      setConvenio("");
      setClinicalNotes("");
    }
  }, [open, editing, initial, providers]);

  // Serviços agendáveis (produtos tipo=servico marcados como agendável).
  const { data: products = [] } = useProducts({}, { enabled: open });
  const bookableServices = useMemo(
    () => products.filter((p) => p.tipo === "servico" && p.agendavel),
    [products],
  );

  // Quais prestadores fazem o serviço escolhido.
  const { data: serviceLinks = [] } = useSchedulingServices(
    { activeOnly: true },
    { enabled: open },
  );

  // Providers eligible for ALL selected services
  const eligibleProviderIds = useMemo(() => {
    if (selectedServiceIds.length === 0) return new Set<string>();
    const providersPerService = selectedServiceIds.map((sId) => {
      const links = serviceLinks.filter((l) => l.productId === sId);
      return new Set(links.map((l) => l.providerId));
    });
    if (providersPerService.length === 0) return new Set<string>();
    const intersection = new Set(providersPerService[0]);
    for (let i = 1; i < providersPerService.length; i++) {
      const currentSet = providersPerService[i];
      for (const id of intersection) {
        if (!currentSet.has(id)) {
          intersection.delete(id);
        }
      }
    }
    return intersection;
  }, [serviceLinks, selectedServiceIds]);

  const visibleProviders = useMemo(() => {
    if (selectedServiceIds.length === 0) return providers;
    return providers.filter((p) => eligibleProviderIds.has(p.id));
  }, [providers, selectedServiceIds, eligibleProviderIds]);

  const { data: rooms = [] } = useRooms(true, { enabled: open });

  // Disponibilidade do prestador para a data (considera a sala, se escolhida).
  const availabilityReq = providerId && date
    ? {
        providerId,
        serviceId: selectedServiceIds[0] || null,
        serviceIds: selectedServiceIds.length > 0 ? selectedServiceIds : null,
        roomId: roomId || null,
        from: date,
        to: date,
      }
    : null;
  const { data: availability, isFetching: loadingSlots } = useAvailability(availabilityReq, {
    enabled: open && Boolean(providerId) && !isEdit,
  });
  const slots = availability?.days?.[0]?.slots ?? [];

  // Clientes para busca.
  const { data: allCustomers = [] } = useCustomers(
    { search: customerSearch },
    { enabled: open && customerSearch.trim().length >= 2 },
  );
  const customers = useMemo(() => allCustomers.slice(0, 8), [allCustomers]);

  // Histórico de agendamentos/prontuários do cliente selecionado.
  const { data: customerAppointments = [], isFetching: loadingHistory } = useCustomerAppointments(
    customerId,
    { enabled: open && Boolean(customerId) },
  );

  const pastNotes = useMemo(() => {
    return customerAppointments
      .filter((appt) => appt.id !== editing?.id && appt.clinicalNotes && appt.clinicalNotes.trim() !== "")
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  }, [customerAppointments, editing?.id]);

  const createMut = useCreateAppointment();
  const updateMut = useUpdateAppointment();
  const updateSeriesMut = useUpdateAppointmentSeries();
  const cancelSeriesMut = useCancelAppointmentSeries();
  const saving = createMut.isPending || updateMut.isPending || updateSeriesMut.isPending || cancelSeriesMut.isPending;

  const selectedServices = useMemo(() => {
    return selectedServiceIds
      .map((id) => bookableServices.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s);
  }, [selectedServiceIds, bookableServices]);

  const totalDuration = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + (s.duracaoMin ?? 0), 0);
  }, [selectedServices]);

  const totalPrice = useMemo(() => {
    if (selectedServices.length === 0) return null;
    return selectedServices.reduce((acc, s) => acc + (s.precoVenda ?? 0), 0);
  }, [selectedServices]);

  const concatenatedNames = useMemo(() => {
    return selectedServices.map((s) => s.nome).join(" + ");
  }, [selectedServices]);

  const handleSelectCustomer = (c: { id: string; nome: string; telefone?: string; celular?: string }) => {
    setCustomerId(c.id);
    setCustomerNome(c.nome);
    setCustomerTelefone(c.telefone || c.celular || "");
    setCustomerSearch(c.nome);
  };

  const handleSubmit = async () => {
    if (!providerId) {
      toast({ title: "Escolha o prestador", variant: "destructive" });
      return;
    }
    if (!isEdit && !selectedSlot) {
      toast({ title: "Escolha um horário livre", variant: "destructive" });
      return;
    }
    if (!customerNome.trim()) {
      toast({ title: "Informe o nome do cliente", variant: "destructive" });
      return;
    }

    try {
      if (isEdit && editing) {
        if (editing.seriesId && seriesUpdateMode !== "only_this") {
          await updateSeriesMut.mutateAsync({
            seriesId: editing.seriesId,
            patch: {
              providerId,
              serviceId: selectedServiceIds[0] || null,
              customerId,
              customerNome: customerNome.trim(),
              customerTelefone: customerTelefone.trim() || null,
              serviceNome: concatenatedNames || editing.serviceNome,
              preco: totalPrice,
              notes: notes.trim(),
              roomId: roomId || null,
              convenio: convenio.trim() || null,
              stackedServices: selectedServices.length > 0
                ? selectedServices.map((s) => ({
                    id: s.id,
                    nome: s.nome,
                    duracaoMin: s.duracaoMin ?? 30,
                    preco: s.precoVenda ?? null,
                  }))
                : null,
            },
            mode: seriesUpdateMode === "all" ? "all" : "following",
            currentStartsAt: editing.startsAt,
          });
          // Se a nota clínica foi alterada, salva individualmente para este agendamento específico
          if (clinicalNotes.trim() !== (editing.clinicalNotes || "").trim()) {
            await updateMut.mutateAsync({
              id: editing.id,
              patch: {
                clinicalNotes: clinicalNotes.trim() || null,
              },
            });
          }
          toast({ title: "Série de agendamentos atualizada" });
        } else {
          await updateMut.mutateAsync({
            id: editing.id,
            patch: {
              providerId,
              serviceId: selectedServiceIds[0] || null,
              customerId,
              customerNome: customerNome.trim(),
              customerTelefone: customerTelefone.trim() || null,
              serviceNome: concatenatedNames || editing.serviceNome,
              preco: totalPrice,
              notes: notes.trim(),
              roomId: roomId || null,
              convenio: convenio.trim() || null,
              clinicalNotes: clinicalNotes.trim() || null,
              endsAt: editing.startsAt
                ? new Date(new Date(editing.startsAt).getTime() + (totalDuration || 30) * 60 * 1000).toISOString()
                : undefined,
              stackedServices: selectedServices.length > 0
                ? selectedServices.map((s) => ({
                    id: s.id,
                    nome: s.nome,
                    duracaoMin: s.duracaoMin ?? 30,
                    preco: s.precoVenda ?? null,
                  }))
                : null,
            },
          });
          toast({ title: "Agendamento atualizado" });
        }
      } else {
        const slot = slots.find((s) => s.startsAt === selectedSlot);
        if (!slot) {
          toast({ title: "Horário indisponível", description: "Recarregue os horários.", variant: "destructive" });
          return;
        }
        const repeat = Math.max(1, repeatWeeks);
        const seriesId = repeat > 1 ? crypto.randomUUID() : null;
        const baseInput = {
          providerId,
          serviceId: selectedServiceIds[0] || null,
          customerId,
          customerNome: customerNome.trim(),
          customerTelefone: customerTelefone.trim() || null,
          serviceNome: concatenatedNames || null,
          preco: totalPrice,
          notes: notes.trim(),
          roomId: roomId || null,
          convenio: convenio.trim() || null,
          seriesId,
          stackedServices: selectedServices.length > 0
            ? selectedServices.map((s) => ({
                id: s.id,
                nome: s.nome,
                duracaoMin: s.duracaoMin ?? 30,
                preco: s.precoVenda ?? null,
              }))
            : null,
        };
        let created = 0;
        let skipped = 0;
        for (let i = 0; i < repeat; i++) {
          const startsAt = addWeeks(parseISO(slot.startsAt), i).toISOString();
          const endsAt = addWeeks(parseISO(slot.endsAt), i).toISOString();
          try {
            await createMut.mutateAsync({ ...baseInput, startsAt, endsAt });
            created++;
          } catch (err) {
            if (err instanceof AppointmentOverlapError) {
              skipped++;
              continue;
            }
            throw err;
          }
        }
        if (created === 0) {
          toast({ title: "Horário ocupado", description: "Nenhuma ocorrência pôde ser criada.", variant: "destructive" });
          return;
        }
        toast({
          title: repeat > 1 ? `${created} agendamento(s) criado(s)` : "Agendamento criado",
          description: skipped > 0 ? `${skipped} ocorrência(s) pulada(s) por conflito.` : undefined,
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof AppointmentOverlapError) {
        toast({ title: "Horário ocupado", description: err.message, variant: "destructive" });
        return;
      }
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async () => {
    if (!editing) return;
    try {
      if (editing.seriesId && seriesCancelMode !== "only_this") {
        await cancelSeriesMut.mutateAsync({
          seriesId: editing.seriesId,
          mode: seriesCancelMode === "all" ? "all" : "following",
          currentStartsAt: editing.startsAt,
          cancelReason: cancelReasonInput.trim() || null,
        });
        toast({ title: "Série de agendamentos cancelada" });
      } else {
        await updateMut.mutateAsync({
          id: editing.id,
          patch: { status: "cancelado", cancelReason: cancelReasonInput.trim() || null },
        });
        toast({ title: "Agendamento cancelado" });
      }
      onOpenChange(false);
      onCancelled?.({
        providerId: editing.providerId,
        serviceId: editing.serviceId,
        serviceNome: editing.serviceNome,
        preco: editing.preco,
        startsAt: editing.startsAt,
        endsAt: editing.endsAt,
      });
    } catch (err) {
      toast({
        title: "Não foi possível cancelar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const changeStatus = async (patch: AppointmentPatch, successMsg: string) => {
    if (!editing) return;
    try {
      const mergedPatch = { ...patch };
      if (clinicalNotes.trim() !== (editing.clinicalNotes || "").trim()) {
        mergedPatch.clinicalNotes = clinicalNotes.trim() || null;
      }
      await updateMut.mutateAsync({ id: editing.id, patch: mergedPatch });
      toast({ title: successMsg });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Não foi possível atualizar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const renderFields = () => (
    <>
      {/* List of selected services in sequence */}
      {selectedServiceIds.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary/70" />
            Serviços selecionados (sequência)
          </Label>
          <div className="space-y-2">
            {selectedServiceIds.map((id, index) => {
              const service = bookableServices.find((s) => s.id === id);
              if (!service) return null;
              return (
                <div
                  key={`${id}-${index}`}
                  className="flex items-center justify-between rounded-xl border border-primary/10 bg-primary/5 p-3 text-sm transition-all hover:bg-primary/10"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                        {index + 1}
                      </span>
                      {service.nome}
                    </span>
                    <div className="flex items-center gap-2 mt-1 ml-6">
                      <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                        {service.duracaoMin} min
                      </span>
                      {service.precoVenda ? (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          R$ {service.precoVenda.toFixed(2)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
                    onClick={() => {
                      setSelectedServiceIds((prev) => prev.filter((_, idx) => idx !== index));
                      setSelectedSlot("");
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary/70" />
          Adicionar serviço
        </Label>
        <Select
          value="none"
          onValueChange={(v) => {
            if (v && v !== "none") {
              setSelectedServiceIds((prev) => [...prev, v]);
              setSelectedSlot("");
            }
          }}
        >
          <SelectTrigger className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary">
            <SelectValue placeholder="+ Adicionar serviço à sequência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>Selecione um serviço para adicionar</SelectItem>
            {bookableServices.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nome} {s.duracaoMin ? ` · ${s.duracaoMin}min` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedServiceIds.length > 1 && (
        <div className="rounded-xl border border-secondary bg-secondary/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground/80" />
          <span>
            Total da sequência: <span className="font-semibold text-foreground">{totalDuration} min</span>
            {totalPrice !== null && (
              <> · Preço total: <span className="font-semibold text-foreground">R$ {totalPrice.toFixed(2)}</span></>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 text-primary/70" />
            Prestador
          </Label>
          <Select value={providerId} onValueChange={(v) => { setProviderId(v); setSelectedSlot(""); }}>
            <SelectTrigger className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {visibleProviders.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary/70" />
            Data
          </Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setSelectedSlot(""); }}
            disabled={isEdit}
            className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5 text-primary/70" />
            Sala (opcional)
          </Label>
          <Select value={roomId || "none"} onValueChange={(v) => { setRoomId(v === "none" ? "" : v); setSelectedSlot(""); }}>
            <SelectTrigger className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary">
              <SelectValue placeholder="Sem sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem sala</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-primary/70" />
            Convênio (opcional)
          </Label>
          <Input
            placeholder="Particular / plano"
            value={convenio}
            onChange={(e) => setConvenio(e.target.value)}
            className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary"
          />
        </div>
      </div>

      {!isEdit ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 text-primary/70" />
            Repetir
          </Label>
          <Select value={String(repeatWeeks)} onValueChange={(v) => setRepeatWeeks(Number(v))}>
            <SelectTrigger className="h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Não repetir</SelectItem>
              {[2, 3, 4, 6, 8, 10, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>Semanalmente · {n} sessões</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {!isEdit ? (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary/70" />
            Horários livres
          </Label>
          {loadingSlots ? (
            <div className="flex items-center gap-2 py-3.5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Buscando horários…
            </div>
          ) : slots.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">
              Nenhum horário livre nesse dia. Confira o expediente do prestador.
            </p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
              {slots.map((s) => {
                const active = selectedSlot === s.startsAt;
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    onClick={() => setSelectedSlot(s.startsAt)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold font-mono tracking-wide transition-all duration-200 transform hover:scale-[1.02]",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-[1.02]"
                        : "border-slate-200 bg-card hover:border-primary/50 hover:bg-primary/5 text-foreground"
                    )}
                  >
                    {format(parseISO(s.startsAt), "HH:mm")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm font-medium text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>
            Horário: <span className="font-semibold">{format(parseISO(editing!.startsAt), "dd/MM HH:mm")}</span> – <span className="font-semibold">{format(parseISO(editing!.endsAt), "HH:mm")}</span>
          </span>
        </div>
      )}

      {isEdit && editing ? (
        <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Status atual
            </span>
            <span className="text-xs font-semibold text-foreground">
              {STATUS_LABEL[editing.status]}
              {editing.checkedInAt ? (
                <span className="ml-1 text-emerald-600">
                  · chegou {format(parseISO(editing.checkedInAt), "HH:mm")}
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void changeStatus({ status: "confirmado" }, "Confirmado")}
              className="h-8 gap-1 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void changeStatus({ checkedInAt: new Date().toISOString() }, "Check-in feito")}
              className="h-8 gap-1 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-950/20"
            >
              <MapPin className="h-3.5 w-3.5" />
              Cheguei
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void changeStatus({ status: "concluido" }, "Concluído")}
              className="h-8 gap-1 rounded-lg border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-950/20"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Concluir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => void changeStatus({ status: "nao_compareceu" }, "Marcado como falta")}
              className="h-8 gap-1 rounded-lg border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-950/20"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              Faltou
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setCancelMode((v) => !v)}
              className="h-8 gap-1 rounded-lg border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-950/20"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
          {cancelMode ? (
            <div className="space-y-2 pt-2 border-t border-border mt-2">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Motivo do cancelamento (opcional)"
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  className="h-9 rounded-lg text-xs"
                />
              </div>
              {editing?.seriesId && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold">Excluir/Cancelar recorrência:</Label>
                  <Select
                    value={seriesCancelMode}
                    onValueChange={(value) => setSeriesCancelMode(value as typeof seriesCancelMode)}
                  >
                    <SelectTrigger className="h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="only_this">Apenas este agendamento</SelectItem>
                      <SelectItem value="following">Este e os próximos da série</SelectItem>
                      <SelectItem value="all">Todos os agendamentos da série</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="button" size="sm" variant="destructive" className="w-full h-8 rounded-lg" disabled={saving}
                onClick={() => void handleCancel()}>
                Confirmar cancelamento
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isEdit && editing?.seriesId && (
        <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <span>🔁 Agendamento Recorrente</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Este agendamento faz parte de um pacote ou série recorrente. Como deseja aplicar as edições feitas ao salvar?
          </p>
          <Select
            value={seriesUpdateMode}
            onValueChange={(value) => setSeriesUpdateMode(value as typeof seriesUpdateMode)}
          >
            <SelectTrigger className="h-9 text-xs bg-transparent rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="only_this">Apenas este agendamento</SelectItem>
              <SelectItem value="following">Este e os próximos da série</SelectItem>
              <SelectItem value="all">Todos os agendamentos da série</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5 relative">
        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <User className="h-3.5 w-3.5 text-primary/70" />
          Cliente
        </Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar ou digitar nome"
            value={customerSearch}
            className="pl-9 h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary"
            onChange={(e) => {
              setCustomerSearch(e.target.value);
              setCustomerNome(e.target.value);
              setCustomerId(null);
            }}
          />
        </div>
        {customerSearch.trim().length >= 2 && customers.length > 0 && !customerId ? (
          <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto z-50 bg-popover border border-border rounded-lg shadow-xl divide-y divide-border">
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCustomer(c)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <span className="font-medium">{c.nome}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{c.telefone || c.celular}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5 text-primary/70" />
          Telefone
        </Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="(opcional)"
            value={customerTelefone}
            className="pl-9 h-10 rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary"
            onChange={(e) => setCustomerTelefone(e.target.value)}
          />
        </div>
        {customerTelefone.trim() || customerId ? (
          <div className="flex flex-wrap gap-2 pt-1.5">
            {customerTelefone.trim() ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-300 rounded-lg px-3"
              >
                <a href={waLink(customerTelefone)} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>WhatsApp</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </Button>
            ) : null}
            {customerId ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg px-3"
              >
                <Link to={`/clientes/${customerId}`}>
                  <UserRound className="h-3.5 w-3.5" />
                  <span>Perfil do Cliente</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary/70" />
          Observações
        </Label>
        <Textarea
          rows={2}
          placeholder="(opcional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-xl transition-all border-slate-200 hover:border-slate-300 focus:ring-primary focus:border-primary"
        />
      </div>
    </>
  );

  const renderClinicalTab = () => {
    if (!customerId) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
          <UserRound className="h-8 w-8 text-muted-foreground/45 mb-2" />
          <span>Associe um cliente para visualizar o prontuário.</span>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Evolução desta consulta</Label>
          <Textarea
            rows={4}
            placeholder="Descreva a evolução do cliente nesta sessão (conduta, anamnese, tratamentos aplicados)..."
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
          />
        </div>

        <div className="border-t border-border pt-4">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Prontuário</Label>
          <div className="mt-3 max-h-[250px] overflow-y-auto space-y-4 pr-1">
            {loadingHistory ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
              </div>
            ) : pastNotes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum prontuário registrado anteriormente para este cliente.
              </p>
            ) : (
              <div className="relative border-l border-muted-foreground/20 ml-2 pl-4 space-y-4">
                {pastNotes.map((appt) => {
                  const pName = providers.find((p) => p.id === appt.providerId)?.name || "Profissional";
                  return (
                    <div key={appt.id} className="relative group">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[21.5px] top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background border border-muted-foreground/30 group-hover:bg-primary group-hover:border-primary transition-colors" />

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {format(parseISO(appt.startsAt), "dd/MM/yyyy HH:mm")}
                          </span>
                          <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium">
                            {appt.serviceNome || "Serviço"}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Profissional: {pName}
                        </p>
                        <div className="rounded-md border border-border bg-card/60 p-2 text-xs text-foreground whitespace-pre-wrap leading-relaxed shadow-sm">
                          {appt.clinicalNotes}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar agendamento" : "Novo agendamento"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize os dados do agendamento."
              : "Escolha serviço, prestador, horário livre e cliente."}
          </DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Ficha</TabsTrigger>
              <TabsTrigger value="clinical">Prontuário</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-3 mt-4">
              {renderFields()}
            </TabsContent>
            <TabsContent value="clinical" className="space-y-4 mt-4">
              {renderClinicalTab()}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3">
            {renderFields()}
          </div>
        )}

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-xl h-10 px-4">
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving} className="rounded-xl h-10 px-5 bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
            {saving ? "Salvando…" : isEdit ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
