import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const FUNCTION_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/scheduling-public`;

type ProviderOpt = { id: string; name: string; duracaoMin: number };
type ServiceOpt = { id: string; nome: string; duracaoMin: number; preco: number | null; providers: ProviderOpt[] };
type ConfigResponse = {
  config: { titulo: string | null; descricao: string | null };
  services: ServiceOpt[];
};
type Slot = { startsAt: string; endsAt: string };

type Step = "service" | "provider" | "slot" | "contact" | "done";

// ──────────────────────────────────────────────
// Helpers de telefone
// ──────────────────────────────────────────────

/** Remove tudo que não é dígito */
function digits(s: string) {
  return s.replace(/\D/g, "");
}

/**
 * Formata dígitos brasileiros para +55 XX XXXXX-XXXX (ou +55 XX XXXX-XXXX).
 * Aceita com ou sem o +55 inicial.
 */
function formatPhone(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("+55")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("55") && digits(cleaned).length > 11) {
    cleaned = cleaned.slice(2);
  }

  const d = digits(cleaned);

  const area = d.slice(0, 2);
  const rest = d.slice(2);
  const mobile = rest.slice(0, 5);
  const final = rest.slice(5, 9);

  if (d.length === 0) return "";
  if (d.length <= 2) return `+55 ${area}`;
  if (rest.length === 0) return `+55 ${area}`;
  if (rest.length <= 4) return `+55 ${area} ${mobile}`;
  if (rest.length <= 8) return `+55 ${area} ${mobile}-${final}`;
  // 9 dígitos no número
  const mob9 = rest.slice(0, 5);
  const fin9 = rest.slice(5, 9);
  return `+55 ${area} ${mob9}-${fin9}`;
}

/** Retorna o número em formato E.164: +5511987654321 */
function toE164(formatted: string): string {
  const d = digits(formatted);
  // Se já tem 55 na frente (total 13 dígitos BR)
  if (d.startsWith("55")) return `+${d}`;
  if (d.length >= 10) return `+55${d}`;
  return formatted;
}

/** Valida número brasileiro: área (2 dígitos) + número (8 ou 9 dígitos) */
function isValidPhone(formatted: string): boolean {
  const d = digits(formatted);
  // com 55: 13 dígitos; sem: 10 ou 11
  const local = d.startsWith("55") ? d.slice(2) : d;
  return local.length === 10 || local.length === 11;
}

/** Valida e-mail simples */
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}

// ──────────────────────────────────────────────
// Componente
// ──────────────────────────────────────────────

export function BookingWidget({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConfigResponse | null>(null);

  const [step, setStep] = useState<Step>("service");
  const [selectedServices, setSelectedServices] = useState<ServiceOpt[]>([]);
  const [provider, setProvider] = useState<ProviderOpt | null>(null);
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState(""); // honeypot

  // Erros de validação (exibe após blur ou submit)
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // Carrega config.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${FUNCTION_URL}?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(json.error ?? "Não foi possível carregar.");
        } else {
          setData(json as ConfigResponse);
        }
      })
      .catch(() => !cancelled && setError("Falha de conexão."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [slug]);

  const eligibleProviders = useMemo(() => {
    if (selectedServices.length === 0) return [];
    let common = [...selectedServices[0].providers];
    for (let i = 1; i < selectedServices.length; i++) {
      const currentIds = new Set(selectedServices[i].providers.map((p) => p.id));
      common = common.filter((p) => currentIds.has(p.id));
    }

    // Filtro inteligente por slug de profissional:
    // Se o slug do link corresponder ao nome ou parte do nome de algum prestador,
    // limitamos a lista de profissionais apenas a ele(s).
    const normalizedSlug = slug.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const matchedProviders = common.filter((p) => {
      const normalizedName = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return normalizedName.includes(normalizedSlug);
    });

    if (matchedProviders.length > 0) {
      return matchedProviders;
    }

    return common;
  }, [selectedServices, slug]);

  // Busca slots quando provider + date definidos.
  useEffect(() => {
    if (step !== "slot" || !provider || selectedServices.length === 0) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    const serviceIds = selectedServices.map((s) => s.id).join(",");
    const params = new URLSearchParams({
      slug,
      providerId: provider.id,
      serviceIds,
      from: date,
      to: date,
    });
    fetch(`${FUNCTION_URL}?${params.toString()}`)
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        setSlots(r.ok ? (json.days?.[0]?.slots ?? []) : []);
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => { cancelled = true; };
  }, [step, provider, selectedServices, date, slug]);

  // Contact data is submitted only in the booking POST, never in lookup URLs.
  const handlePhoneChange = (raw: string) => {
    setTelefone(formatPhone(raw));
  };

  // Derivados de validação
  const phoneError = (phoneBlurred || submitAttempted) && telefone && !isValidPhone(telefone)
    ? "Telefone inválido. Use o formato +55 XX XXXXX-XXXX"
    : null;
  const emailError = (emailBlurred || submitAttempted) && email.trim() && !isValidEmail(email)
    ? "E-mail inválido"
    : null;
  const phoneRequired = (submitAttempted) && !telefone.trim()
    ? "Informe o telefone"
    : null;

  const submit = async () => {
    setSubmitAttempted(true);

    // Validações antes de enviar
    if (!nome.trim()) return;
    if (!telefone.trim()) return;
    if (!isValidPhone(telefone)) return;
    if (email.trim() && !isValidEmail(email)) return;
    if (selectedServices.length === 0 || !provider || !slot) return;

    setSubmitting(true);
    try {
      const r = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceIds: selectedServices.map((s) => s.id),
          providerId: provider.id,
          startsAt: slot.startsAt,
          customer: {
            nome: nome.trim(),
            telefone: toE164(telefone),
            email: email.trim() || null,
          },
          _hp: hp,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error ?? "Não foi possível agendar.");
        if (r.status === 409) {
          setStep("slot");
        }
        return;
      }
      setError(null);
      setStep("done");
    } catch {
      setError("Falha de conexão.");
    } finally {
      setSubmitting(false);
    }
  };

  const dayLabel = useMemo(
    () => format(parseISO(`${date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR }),
    [date],
  );

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-4 bg-white px-4 py-8 text-slate-900">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{data?.config.titulo || "Agende seu horário"}</h1>
        {data?.config.descricao ? (
          <p className="mt-1 text-sm text-slate-500">{data.config.descricao}</p>
        ) : null}
      </header>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Carregando…</p>
      ) : error && !data ? (
        <p className="py-12 text-center text-sm text-red-600">{error}</p>
      ) : !data ? null : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {error ? (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          {/* Resumo */}
          {selectedServices.length > 0 && step !== "service" && step !== "done" ? (
            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 border border-slate-100">
              <p className="font-semibold text-slate-700">Resumo da reserva:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {selectedServices.map((s) => (
                  <span key={s.id} className="rounded bg-slate-200/60 px-2 py-0.5 font-medium text-slate-700">
                    {s.nome} ({s.duracaoMin}m)
                  </span>
                ))}
              </div>
              <p className="mt-2 text-slate-500">
                Total: <span className="font-semibold text-slate-850">{selectedServices.reduce((acc, s) => acc + s.duracaoMin, 0)} min</span>
                {selectedServices.some((s) => s.preco != null) ? (
                  <> · Valor: <span className="font-semibold text-slate-850">
                    {selectedServices.reduce((acc, s) => acc + (s.preco ?? 0), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span></>
                ) : null}
              </p>
            </div>
          ) : null}

          {/* STEP: service */}
          {step === "service" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Escolha um ou mais serviços</p>
              {data.services.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum serviço disponível no momento.</p>
              ) : (
                <div className="space-y-2">
                  {data.services.map((s) => {
                    const isSelected = selectedServices.some((x) => x.id === s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedServices((prev) => prev.filter((x) => x.id !== s.id));
                          } else {
                            setSelectedServices((prev) => [...prev, s]);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all",
                          isSelected
                            ? "border-slate-900 bg-slate-900/5 text-slate-900"
                            : "border-slate-200 bg-white hover:border-slate-400 text-slate-700",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300",
                          )}>
                            {isSelected && <span className="text-[10px]">✓</span>}
                          </span>
                          <span>
                            <span className="block font-medium">{s.nome}</span>
                            <span className="block text-xs opacity-75">{s.duracaoMin} min</span>
                          </span>
                        </span>
                        {s.preco != null ? (
                          <span className="text-sm font-semibold">
                            {s.preco.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedServices.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (eligibleProviders.length === 1) {
                      setProvider(eligibleProviders[0]);
                      setStep("slot");
                    } else {
                      setProvider(null);
                      setStep("provider");
                    }
                  }}
                  className="w-full rounded-xl bg-slate-900 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
                >
                  Continuar ({selectedServices.length} {selectedServices.length === 1 ? "serviço" : "serviços"})
                </button>
              ) : null}
            </div>
          ) : null}

          {/* STEP: provider */}
          {step === "provider" && selectedServices.length > 0 ? (
            <div className="space-y-2">
              <button type="button" onClick={() => setStep("service")} className="text-xs text-slate-400 hover:underline">← Serviços</button>
              <p className="text-sm font-semibold">Escolha o profissional</p>
              {eligibleProviders.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Nenhum profissional disponível para todos os serviços selecionados.</p>
              ) : (
                eligibleProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProvider(p); setStep("slot"); }}
                    className="flex w-full items-center rounded-xl border border-slate-200 px-4 py-3 text-left font-medium hover:border-slate-900"
                  >
                    {p.name}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {/* STEP: slot */}
          {step === "slot" && provider ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  if (eligibleProviders.length === 1) {
                    setStep("service");
                  } else {
                    setStep("provider");
                  }
                }}
                className="text-xs text-slate-400 hover:underline"
              >
                {eligibleProviders.length === 1 ? "← Serviços" : "← Profissional"}
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDate(format(addDays(parseISO(`${date}T12:00:00`), -1), "yyyy-MM-dd"))}
                  className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                >←</button>
                <span className="text-sm font-medium capitalize">{dayLabel}</span>
                <button
                  type="button"
                  onClick={() => setDate(format(addDays(parseISO(`${date}T12:00:00`), 1), "yyyy-MM-dd"))}
                  className="rounded-md border border-slate-200 px-2 py-1 text-sm"
                >→</button>
              </div>
              {loadingSlots ? (
                <p className="py-6 text-center text-sm text-slate-400">Buscando horários…</p>
              ) : slots.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Sem horários livres neste dia.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => { setSlot(s); setStep("contact"); }}
                      className="rounded-lg border border-slate-200 py-2 text-sm hover:border-slate-900"
                    >
                      {format(parseISO(s.startsAt), "HH:mm")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* STEP: contact */}
          {step === "contact" && slot ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setStep("slot")} className="text-xs text-slate-400 hover:underline">← Horário</button>
              <p className="text-sm text-slate-600">
                Profissional: <span className="font-semibold text-slate-800">{provider?.name}</span><br />
                Horário: <span className="font-medium text-slate-800">{format(parseISO(slot.startsAt), "dd/MM 'às' HH:mm")}</span>
              </p>

              {/* Nome */}
              <div className="space-y-1">
                <input
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
                    submitAttempted && !nome.trim()
                      ? "border-red-400 bg-red-50 placeholder:text-red-400"
                      : "border-slate-300 focus:border-slate-500",
                  )}
                  placeholder="Seu nome *"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
                {submitAttempted && !nome.trim() ? (
                  <p className="text-xs text-red-600">Nome é obrigatório</p>
                ) : null}
              </div>

              {/* Telefone com máscara */}
              <div className="space-y-1">
                <input
                  type="tel"
                  inputMode="numeric"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none transition-colors tracking-wide",
                    phoneError || phoneRequired
                      ? "border-red-400 bg-red-50 placeholder:text-red-400"
                      : isValidPhone(telefone)
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-300 focus:border-slate-500",
                  )}
                  placeholder="+55 XX XXXXX-XXXX *"
                  value={telefone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  onBlur={() => setPhoneBlurred(true)}
                  maxLength={18}
                />
                {phoneRequired ? (
                  <p className="text-xs text-red-600">{phoneRequired}</p>
                ) : phoneError ? (
                  <p className="text-xs text-red-600">{phoneError}</p>
                ) : isValidPhone(telefone) ? (
                  <p className="text-xs text-emerald-600">✓ Telefone válido</p>
                ) : null}
              </div>

              {/* E-mail */}
              <div className="space-y-1">
                <input
                  type="email"
                  inputMode="email"
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors",
                    emailError
                      ? "border-red-400 bg-red-50 placeholder:text-red-400"
                      : email.trim() && isValidEmail(email)
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-300 focus:border-slate-500",
                  )}
                  placeholder="E-mail (opcional)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailBlurred(true)}
                />
                {emailError ? (
                  <p className="text-xs text-red-600">{emailError}</p>
                ) : email.trim() && isValidEmail(email) ? (
                  <p className="text-xs text-emerald-600">✓ E-mail válido</p>
                ) : null}
              </div>

              {/* honeypot */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                className="hidden"
                aria-hidden
              />

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-slate-800 transition-colors"
              >
                {submitting ? "Confirmando…" : "Confirmar agendamento"}
              </button>
            </div>
          ) : null}

          {/* STEP: done */}
          {step === "done" ? (
            <div className="space-y-2 py-6 text-center">
              <p className="text-3xl">✅</p>
              <p className="font-semibold">Agendamento confirmado!</p>
              {slot ? (
                <div className="text-sm text-slate-500">
                  <p className="font-medium text-slate-800">
                    {selectedServices.map((s) => s.nome).join(" + ")}
                  </p>
                  <p>com {provider?.name}</p>
                  <p className="mt-1 font-semibold text-slate-700">
                    {format(parseISO(slot.startsAt), "dd/MM 'às' HH:mm")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <p className="text-center text-[11px] text-slate-300">Agendamento via AdvocaCHAT</p>
    </div>
  );
}
