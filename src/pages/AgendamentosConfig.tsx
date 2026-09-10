import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  CalendarCog,
  Clock,
  Globe,
  Layers,
  MessageSquare,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenantCollaborators } from "@/lib/api/settings";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  useCreateException,
  useCreateWorkingHour,
  useDeleteException,
  useDeleteWorkingHour,
  useExceptions,
  useProviderSettings,
  useUpsertProviderSettings,
  useWorkingHours,
} from "@/lib/api/scheduling-providers";
import {
  usePublicBookingConfig,
  useUpsertPublicBookingConfig,
} from "@/lib/api/scheduling-public-config";
import { RoomsManager } from "@/components/agendamentos/RoomsManager";
import { WaitlistManager } from "@/components/agendamentos/WaitlistManager";
import {
  getGoogleConnectUrl,
  useDisconnectGoogle,
  useGoogleConnections,
} from "@/lib/api/scheduling-google";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

type TabId = "prestador" | "publica" | "lembretes" | "salas";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "prestador", label: "Prestador", icon: Clock },
  { id: "publica", label: "Página pública", icon: Globe },
  { id: "lembretes", label: "Lembretes", icon: MessageSquare },
  { id: "salas", label: "Salas & Espera", icon: Layers },
];

export default function AgendamentosConfig() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("prestador");

  const { data: collaborators = [] } = useTenantCollaborators({ enabled: isSupabaseConfigured });
  const providers = useMemo(
    () =>
      collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim() })),
    [collaborators],
  );

  const [providerId, setProviderId] = useState("");
  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id);
  }, [providers, providerId]);

  const { data: allSettings = [] } = useProviderSettings();
  const settings = allSettings.find((s) => s.providerId === providerId);
  const upsertSettings = useUpsertProviderSettings({
    onError: (e) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
    onSuccess: () => toast({ title: "Configuração salva" }),
  });

  const { data: workingHours = [] } = useWorkingHours(providerId || undefined);
  const createWh = useCreateWorkingHour({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteWh = useDeleteWorkingHour();

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { data: exceptions = [] } = useExceptions({ providerId: providerId || undefined, from: todayStart });
  const createExc = useCreateException({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const deleteExc = useDeleteException();

  // Form local de settings.
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [granularity, setGranularity] = useState(15);
  const [minLead, setMinLead] = useState(60);
  const [maxAdvance, setMaxAdvance] = useState(60);
  const [acceptsOnline, setAcceptsOnline] = useState(true);
  useEffect(() => {
    setTz(settings?.timezone ?? "America/Sao_Paulo");
    setGranularity(settings?.slotGranularityMin ?? 15);
    setMinLead(settings?.minLeadTimeMin ?? 60);
    setMaxAdvance(settings?.maxAdvanceDays ?? 60);
    setAcceptsOnline(settings?.acceptsOnlineBooking ?? true);
  }, [settings, providerId]);

  // Google Calendar (por prestador).
  const { data: googleConnections = [] } = useGoogleConnections();
  const googleConn = googleConnections.find((c) => c.providerId === providerId);
  const disconnectGoogle = useDisconnectGoogle({
    onSuccess: () => toast({ title: "Google desconectado" }),
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const g = searchParams.get("google");
    if (!g) return;
    if (g === "ok") {
      toast({ title: "Google Calendar conectado" });
    } else if (g === "erro") {
      toast({
        title: "Falha ao conectar o Google",
        description: searchParams.get("google_msg") ?? undefined,
        variant: "destructive",
      });
    }
    setSearchParams(
      (prev) => { prev.delete("google"); prev.delete("google_msg"); return prev; },
      { replace: true },
    );
  }, [searchParams, setSearchParams, toast]);

  const connectGoogle = async () => {
    if (!providerId) return;
    setConnectingGoogle(true);
    try {
      const url = await getGoogleConnectUrl(providerId);
      window.location.href = url;
    } catch (e) {
      toast({
        title: "Não foi possível iniciar a conexão",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
      setConnectingGoogle(false);
    }
  };

  // Página pública (por tenant).
  const { data: publicConfig } = usePublicBookingConfig();
  const upsertPublic = useUpsertPublicBookingConfig({
    onError: (e) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    onSuccess: () => toast({ title: "Página pública salva" }),
  });
  const [slug, setSlug] = useState("");
  const [publicActive, setPublicActive] = useState(false);
  const [publicTitulo, setPublicTitulo] = useState("");
  const [publicDescricao, setPublicDescricao] = useState("");
  const [msgConfirmacao, setMsgConfirmacao] = useState("");
  const [msgLembrete24h, setMsgLembrete24h] = useState("");
  const [msgLembrete1h, setMsgLembrete1h] = useState("");
  useEffect(() => {
    setSlug(publicConfig?.slug ?? "");
    setPublicActive(publicConfig?.isActive ?? false);
    setPublicTitulo(publicConfig?.titulo ?? "");
    setPublicDescricao(publicConfig?.descricao ?? "");
    setMsgConfirmacao(publicConfig?.msgConfirmacao ?? "");
    setMsgLembrete24h(publicConfig?.msgLembrete24h ?? "");
    setMsgLembrete1h(publicConfig?.msgLembrete1h ?? "");
  }, [publicConfig]);
  const publicUrl = slug ? `${window.location.origin}/agendar/${slug}` : "";

  // Form de novo horário.
  const [whWeekday, setWhWeekday] = useState(1);
  const [whStart, setWhStart] = useState("08:00");
  const [whEnd, setWhEnd] = useState("12:00");

  // Form de nova exceção.
  const [excStart, setExcStart] = useState("");
  const [excEnd, setExcEnd] = useState("");
  const [excReason, setExcReason] = useState("");

  const hoursByDay = useMemo(() => {
    const map = new Map<number, typeof workingHours>();
    for (const wh of workingHours) {
      const list = map.get(wh.weekday);
      if (list) list.push(wh);
      else map.set(wh.weekday, [wh]);
    }
    return map;
  }, [workingHours]);

  const saveSettings = () => {
    if (!providerId) return;
    void upsertSettings.mutate({
      providerId,
      timezone: tz,
      slotGranularityMin: granularity,
      minLeadTimeMin: minLead,
      maxAdvanceDays: maxAdvance,
      acceptsOnlineBooking: acceptsOnline,
    });
  };

  const addWorkingHour = () => {
    if (!providerId) return;
    if (whEnd <= whStart) {
      toast({ title: "Horário inválido", description: "O fim deve ser após o início.", variant: "destructive" });
      return;
    }
    void createWh.mutate({ providerId, weekday: whWeekday, startTime: whStart, endTime: whEnd });
  };

  const addException = () => {
    if (!providerId || !excStart || !excEnd) {
      toast({ title: "Preencha início e fim", variant: "destructive" });
      return;
    }
    try {
      const start = new Date(excStart);
      const end = new Date(excEnd);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        toast({ title: "Datas inválidas", description: "Certifique-se de preencher a data e a hora corretas.", variant: "destructive" });
        return;
      }
      if (end <= start) {
        toast({ title: "Intervalo inválido", description: "O horário de término deve ser após o horário de início.", variant: "destructive" });
        return;
      }
      void createExc.mutate({
        providerId,
        kind: "block",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        reason: excReason.trim() || null,
      });
      setExcStart("");
      setExcEnd("");
      setExcReason("");
    } catch (err) {
      toast({
        title: "Erro ao processar datas",
        description: err instanceof Error ? err.message : "Verifique o formato das datas.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--crm-surface)] text-[var(--crm-ink)]">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--crm-border)] bg-card px-4 py-3 md:px-6">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <Link to="/agenda?tab=agendamentos" aria-label="Voltar">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
        </Button>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]">
          <CalendarCog className="h-5 w-5" />
        </span>
        <div className="mr-auto">
          <h1 className="text-lg font-semibold leading-tight">Configuração de Agendamento</h1>
          <p className="text-xs text-[var(--crm-ink-3)]">Expediente, exceções e Google Calendar por prestador.</p>
        </div>
        {/* Seletor de prestador — só visível na aba Prestador */}
        {activeTab === "prestador" && (
          <div className="w-[220px]">
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o prestador" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tabs internas */}
      <div className="shrink-0 border-b border-[var(--crm-border)] bg-card px-4 md:px-6">
        <nav className="flex gap-0" role="tablist" aria-label="Seções de configuração">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                type="button"
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 select-none",
                  active
                    ? "text-[var(--crm-brand)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-t-full after:bg-[var(--crm-brand)]"
                    : "text-[var(--crm-ink-3)] hover:text-[var(--crm-ink)]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo das abas */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">

        {/* ── ABA: PRESTADOR ─────────────────────────────────── */}
        {activeTab === "prestador" && (
          <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2" role="tabpanel" aria-labelledby="tab-prestador">

            {/* Preferências */}
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Preferências</h2>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fuso horário (IANA)</Label>
                  <Input value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/Sao_Paulo" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Intervalo (min)</Label>
                    <Input type="number" value={granularity} onChange={(e) => setGranularity(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Antecedência mín (min)</Label>
                    <Input type="number" value={minLead} onChange={(e) => setMinLead(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máx. dias à frente</Label>
                    <Input type="number" value={maxAdvance} onChange={(e) => setMaxAdvance(Number(e.target.value))} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Aceita agendamento online</Label>
                  <Switch checked={acceptsOnline} onCheckedChange={setAcceptsOnline} />
                </div>
                <Button type="button" onClick={saveSettings} disabled={upsertSettings.isPending || !providerId}>
                  {upsertSettings.isPending ? "Salvando…" : "Salvar preferências"}
                </Button>
              </div>
            </section>

            {/* Google Calendar */}
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
              <h2 className="mb-1 text-sm font-semibold">Google Calendar</h2>
              <p className="mb-3 text-xs text-[var(--crm-ink-3)]">
                Conecte para que a ocupação do Google bloqueie horários automaticamente.
              </p>
              {googleConn && googleConn.status === "connected" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[var(--crm-ink-2)]">
                      Conectado{googleConn.email ? ` · ${googleConn.email}` : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => disconnectGoogle.mutate(providerId)}
                    disabled={disconnectGoogle.isPending}
                  >
                    Desconectar
                  </Button>
                </div>
              ) : googleConn && googleConn.status === "revoked" ? (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--crm-orange)]">
                    Acesso revogado pelo Google. Reconecte para voltar a sincronizar.
                  </p>
                  <Button type="button" onClick={() => void connectGoogle()} disabled={connectingGoogle || !providerId}>
                    {connectingGoogle ? "Abrindo…" : "Reconectar Google"}
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={() => void connectGoogle()} disabled={connectingGoogle || !providerId}>
                  {connectingGoogle ? "Abrindo…" : "Conectar Google"}
                </Button>
              )}
            </section>

            {/* Expediente */}
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Expediente semanal</h2>
              <div className="space-y-2">
                {WEEKDAYS.map((d) => {
                  const list = hoursByDay.get(d.value) ?? [];
                  return (
                    <div key={d.value} className="flex items-start gap-2">
                      <span className="w-20 shrink-0 pt-1 text-sm text-[var(--crm-ink-2)]">{d.label}</span>
                      <div className="flex flex-1 flex-wrap gap-1">
                        {list.length === 0 ? (
                          <span className="pt-1 text-xs text-[var(--crm-ink-3)]">—</span>
                        ) : (
                          list.map((wh) => (
                            <span
                              key={wh.id}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-2 py-0.5 text-xs"
                            >
                              {wh.startTime}–{wh.endTime}
                              <button
                                type="button"
                                onClick={() => deleteWh.mutate(wh.id)}
                                className="text-[var(--crm-ink-3)] hover:text-red-500"
                                aria-label="Remover"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--crm-border-2)] pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dia</Label>
                  <Select value={String(whWeekday)} onValueChange={(v) => setWhWeekday(Number(v))}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Início</Label>
                  <Input type="time" className="w-28" value={whStart} onChange={(e) => setWhStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <Input type="time" className="w-28" value={whEnd} onChange={(e) => setWhEnd(e.target.value)} />
                </div>
                <Button type="button" variant="outline" className="gap-1" onClick={addWorkingHour} disabled={createWh.isPending}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </section>

            {/* Folgas e bloqueios */}
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Folgas e bloqueios</h2>
              <div className="space-y-2">
                {exceptions.length === 0 ? (
                  <p className="text-xs text-[var(--crm-ink-3)]">Nenhum bloqueio futuro.</p>
                ) : (
                  exceptions.map((ex) => (
                    <div
                      key={ex.id}
                      className="flex items-center justify-between rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-2 py-1 text-xs"
                    >
                      <span>
                        {format(parseISO(ex.startsAt), "dd/MM HH:mm")} – {format(parseISO(ex.endsAt), "dd/MM HH:mm")}
                        {ex.reason ? ` · ${ex.reason}` : ""}
                        {ex.source === "google" ? " · Google" : ""}
                      </span>
                      {ex.source !== "google" ? (
                        <button
                          type="button"
                          onClick={() => deleteExc.mutate(ex.id)}
                          className="text-[var(--crm-ink-3)] hover:text-red-500"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 space-y-2 border-t border-[var(--crm-border-2)] pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <Input type="datetime-local" value={excStart} onChange={(e) => setExcStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fim</Label>
                    <Input type="datetime-local" value={excEnd} onChange={(e) => setExcEnd(e.target.value)} />
                  </div>
                </div>
                <Input placeholder="Motivo (opcional)" value={excReason} onChange={(e) => setExcReason(e.target.value)} />
                <Button type="button" variant="outline" className="gap-1" onClick={addException} disabled={createExc.isPending}>
                  <Plus className="h-4 w-4" /> Adicionar bloqueio
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ── ABA: PÁGINA PÚBLICA ─────────────────────────────── */}
        {activeTab === "publica" && (
          <div className="mx-auto max-w-2xl" role="tabpanel" aria-labelledby="tab-publica">
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Página pública de agendamento</h2>
                  <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">
                    Link para clientes agendarem sozinhos (serviço → profissional → horário).
                  </p>
                </div>
                <Switch checked={publicActive} onCheckedChange={setPublicActive} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Link (slug)</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[var(--crm-ink-3)]">/agendar/</span>
                    <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="minha-clinica" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Título</Label>
                  <Input value={publicTitulo} onChange={(e) => setPublicTitulo(e.target.value)} placeholder="Agende sua consulta" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={publicDescricao} onChange={(e) => setPublicDescricao(e.target.value)} placeholder="Escolha o melhor horário para você" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() =>
                    upsertPublic.mutate({
                      slug,
                      isActive: publicActive,
                      titulo: publicTitulo.trim() || null,
                      descricao: publicDescricao.trim() || null,
                      msgConfirmacao: msgConfirmacao.trim() || null,
                      msgLembrete24h: msgLembrete24h.trim() || null,
                      msgLembrete1h: msgLembrete1h.trim() || null,
                    })
                  }
                  disabled={upsertPublic.isPending}
                >
                  {upsertPublic.isPending ? "Salvando…" : "Salvar página pública"}
                </Button>
                {publicConfig?.slug && publicUrl ? (
                  <>
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-[var(--crm-brand)] hover:underline"
                    >
                      Abrir página
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(publicUrl);
                        toast({ title: "Link copiado" });
                      }}
                      className="text-sm text-[var(--crm-ink-3)] hover:underline"
                    >
                      Copiar link
                    </button>
                  </>
                ) : null}
              </div>
              {!publicConfig?.isActive && publicActive ? (
                <p className="mt-3 text-xs text-[var(--crm-orange)]">
                  Salve para ativar. A página só funciona com prestadores que aceitam agendamento online,
                  serviços marcados como "Agendável" e expediente cadastrado.
                </p>
              ) : null}
            </section>
          </div>
        )}

        {/* ── ABA: LEMBRETES ──────────────────────────────────── */}
        {activeTab === "lembretes" && (
          <div className="mx-auto max-w-2xl" role="tabpanel" aria-labelledby="tab-lembretes">
            <section className="rounded-xl border border-[var(--crm-border-2)] bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Mensagens de lembrete WhatsApp</h2>
                <p className="mt-0.5 text-xs text-[var(--crm-ink-3)]">
                  Personalize os textos enviados ao paciente/cliente. Deixe em branco para usar o texto padrão.
                </p>
              </div>
              <p className="mb-4 text-xs text-[var(--crm-ink-3)]">
                Variáveis disponíveis:{" "}
                {["{{nome}}", "{{servico}}", "{{data}}", "{{hora}}"].map((v) => (
                  <code key={v} className="mx-0.5 rounded bg-[var(--crm-surface)] px-1 py-0.5 font-mono text-[10px]">{v}</code>
                ))}
              </p>
              <div className="space-y-5">
                {[
                  {
                    kind: "confirmacao",
                    label: "Confirmação (imediata — agendamento online)",
                    placeholder:
                      "Olá, {{nome}}! Recebemos seu agendamento de *{{servico}}* para {{data}} às {{hora}}. Responda *1* para confirmar ou *2* para cancelar.",
                    value: msgConfirmacao,
                    onChange: setMsgConfirmacao,
                  },
                  {
                    kind: "lembrete_24h",
                    label: "Lembrete 24 h antes",
                    placeholder:
                      "Olá, {{nome}}! Lembrete do seu *{{servico}}* amanhã, {{data}} às {{hora}}. Responda *1* para confirmar ou *2* para cancelar.",
                    value: msgLembrete24h,
                    onChange: setMsgLembrete24h,
                  },
                  {
                    kind: "lembrete_1h",
                    label: "Lembrete 1 h antes",
                    placeholder: "Olá, {{nome}}! Seu *{{servico}}* é hoje às {{hora}}. Até já!",
                    value: msgLembrete1h,
                    onChange: setMsgLembrete1h,
                  },
                ].map(({ kind, label, placeholder, value, onChange }) => {
                  const preview = (value.trim() || placeholder)
                    .replace(/\{\{nome\}\}/g, "Maria")
                    .replace(/\{\{servico\}\}/g, "Consulta")
                    .replace(/\{\{data\}\}/g, "25/06")
                    .replace(/\{\{hora\}\}/g, "14:00");
                  return (
                    <div key={kind} className="space-y-1.5">
                      <Label className="text-xs font-medium">{label}</Label>
                      <Textarea
                        rows={3}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        className="resize-none text-sm"
                      />
                      <div className="flex items-start gap-1.5 rounded-md border border-[var(--crm-border-2)] bg-[var(--crm-surface)] px-3 py-2">
                        <span className="mt-px shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Preview</span>
                        <p className="text-xs leading-relaxed text-[var(--crm-ink-2)]">{preview}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-[var(--crm-border-2)] pt-4">
                <p className="text-xs text-[var(--crm-ink-3)]">
                  Salvar também aplica as mensagens na página pública.
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    upsertPublic.mutate({
                      slug,
                      isActive: publicActive,
                      titulo: publicTitulo.trim() || null,
                      descricao: publicDescricao.trim() || null,
                      msgConfirmacao: msgConfirmacao.trim() || null,
                      msgLembrete24h: msgLembrete24h.trim() || null,
                      msgLembrete1h: msgLembrete1h.trim() || null,
                    })
                  }
                  disabled={upsertPublic.isPending}
                >
                  {upsertPublic.isPending ? "Salvando…" : "Salvar lembretes"}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ── ABA: SALAS & ESPERA ─────────────────────────────── */}
        {activeTab === "salas" && (
          <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2" role="tabpanel" aria-labelledby="tab-salas">
            <RoomsManager />
            <WaitlistManager />
          </div>
        )}

      </div>
    </div>
  );
}
