import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { negotiationAssigneeBlockedMessage } from "@/lib/crm/negotiation-assignee";
import { useCustomers } from "@/lib/api/customers";
import { useLeadDuplicates } from "@/lib/api/crm-lead-duplicates";
import { CustomerCustomFieldInput } from "@/components/customers/CustomerCustomFieldInput";
import {
  customFieldValueToString,
  listCustomFieldValuesForCustomer,
  upsertCustomerCustomFieldValues,
  useCustomerCustomFields,
} from "@/lib/api/customer-custom-fields";
import { fallbackCustomerDisplayName } from "@/lib/customer-display-name";
import { normalizePhone } from "@/lib/phone";
import type { Customer, CustomerUpsertInput } from "@/types/domain";

const sheetUi = {
  title: "text-lg font-semibold text-wchat-900",
  label: "text-sm font-semibold text-foreground",
  input:
    "h-10 rounded-[10px] border-input bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary",
  section: "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
  btnSecondary:
    "h-10 rounded-[10px] border-0 bg-wchat-100 px-5 font-semibold text-primary shadow-none hover:bg-wchat-200",
  btnPrimary:
    "h-10 rounded-[10px] border-0 bg-primary px-5 font-semibold text-primary-foreground shadow-none hover:bg-wchat-700",
} as const;

function nextCustomerCode(customers: Array<{ codigo?: string }>) {
  const highestCode = customers.reduce((highest, customer) => {
    const numericCode = Number((customer.codigo ?? "").replace(/\D/g, ""));
    if (!Number.isFinite(numericCode)) {
      return highest;
    }
    return Math.max(highest, numericCode);
  }, 0);

  return String(highestCode + 1).padStart(4, "0");
}

function baseLeadInput(): CustomerUpsertInput {
  return {
    codigo: "",
    origem: undefined,
    nome: "",
    telefone: "",
    celular: "",
    email: "",
    cnpj: "",
    endereco: "",
    perfil: "B",
    rota: "",
    status: "ativo",
    vendedor: "",
    ultimoPedido: new Date().toISOString().slice(0, 10),
    ticketMedio: 0,
    frequenciaCompra: "Quinzenal",
    totalGasto: 0,
    tipo: "pj",
    razaoSocial: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cpf: "",
    rg: "",
    nascimento: "",
    nomeSocial: "",
    fax: "",
    canal: "colagem_rapida",
    cep: "",
    logradouro: "",
    numero: "",
    bairro: "",
    zone: "",
    complemento: "",
    cidade: "",
    estado: "",
    ativo: true,
    observacoes: "",
    cadastradoEm: new Date().toISOString().slice(0, 10),
    sourceColumns: { origem_importacao: "formulario_contato" },
  };
}

function customerToUpsertInput(customer: Customer): CustomerUpsertInput {
  return {
    codigo: customer.codigo,
    tipo:
      customer.tipo === "pf" || customer.tipo === "pj"
        ? customer.tipo
        : customer.cpf && !customer.cnpj
          ? "pf"
          : "pj",
    origem: customer.origem,
    nome: customer.nome,
    telefone: customer.telefone,
    celular: customer.celular,
    email: customer.email,
    cnpj: customer.cnpj,
    endereco: customer.endereco,
    perfil: customer.perfil,
    rota: customer.rota,
    status: customer.status,
    vendedor: customer.vendedor,
    ultimoPedido: customer.ultimoPedido,
    ticketMedio: customer.ticketMedio,
    frequenciaCompra: customer.frequenciaCompra,
    totalGasto: customer.totalGasto,
    cpf: customer.cpf,
    rg: customer.rg,
    nascimento: customer.nascimento,
    nomeSocial: customer.nomeSocial,
    razaoSocial: customer.razaoSocial,
    inscricaoEstadual: customer.inscricaoEstadual,
    inscricaoMunicipal: customer.inscricaoMunicipal,
    cep: customer.cep,
    logradouro: customer.logradouro,
    numero: customer.numero,
    bairro: customer.bairro,
    zone: customer.zone,
    cidade: customer.cidade,
    estado: customer.estado,
    complemento: customer.complemento,
    ativo: customer.ativo,
    observacoes: customer.observacoes,
    cadastradoEm: customer.cadastradoEm,
    fax: customer.fax,
    canal: customer.canal,
    sourceColumns: customer.sourceColumns,
  };
}

type CustomerLeadSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Retorne o id do contato ao editar ou criar, para salvar campos personalizados. */
  onSubmit: (input: CustomerUpsertInput) => Promise<string | void> | string | void;
  customer?: Customer | null;
  initialOverrides?: Partial<CustomerUpsertInput>;
  loading?: boolean;
  disabled?: boolean;
};

export function CustomerLeadSheet({
  open,
  onOpenChange,
  onSubmit,
  customer,
  initialOverrides,
  loading = false,
  disabled = false,
}: CustomerLeadSheetProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const isEdit = Boolean(customer);
  const { data: customers = [] } = useCustomers({}, { enabled: open });
  const { data: fieldDefs = [] } = useCustomerCustomFields({ enabled: open });
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  // Dedup: roda enquanto o usuário digita telefone/email. excludeCustomerId
  // garante que, ao editar, o próprio registro não aparece como duplicata.
  const deferredPhone = useDeferredValue(telefone);
  const deferredEmail = useDeferredValue(email);
  const phoneDigitsLen = deferredPhone.replace(/\D/g, "").length;
  const dupQuery = useLeadDuplicates(
    {
      phone: phoneDigitsLen >= 8 ? deferredPhone : null,
      email: deferredEmail.trim() ? deferredEmail : null,
      cpf: null,
      excludeCustomerId: customer?.id ?? null,
    },
    { enabled: open && (phoneDigitsLen >= 8 || deferredEmail.trim().length > 0) },
  );
  const duplicateRows = dupQuery.data ?? [];
  // De-dup por customer id, mantendo o motivo já priorizado pelo RPC (cpf > email > phone).
  const uniqueDuplicates = (() => {
    const seen = new Set<string>();
    return duplicateRows.filter((d) => {
      if (seen.has(d.customerId)) return false;
      seen.add(d.customerId);
      return true;
    });
  })();
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false);
  const [savingCustomFields, setSavingCustomFields] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (customer) {
      setNome(customer.nome?.trim() ?? "");
      setTelefone(customer.telefone?.trim() ?? "");
      setEmail(customer.email?.trim() ?? "");
    } else {
      setNome(initialOverrides?.nome?.trim() ?? "");
      setTelefone(initialOverrides?.telefone?.trim() ?? "");
      setEmail(initialOverrides?.email?.trim() ?? "");
    }

    setCustomValues({});

    if (!customer?.id || fieldDefs.length === 0) {
      setCustomFieldsLoading(false);
      return;
    }

    let active = true;
    setCustomFieldsLoading(true);

    void listCustomFieldValuesForCustomer(customer.id)
      .then((rows) => {
        if (!active) {
          return;
        }
        const byField = new Map(rows.map((row) => [row.fieldId, row]));
        const next: Record<string, string> = {};
        for (const field of fieldDefs) {
          const row = byField.get(field.id);
          next[field.id] = row ? customFieldValueToString(field.kind, row) : "";
        }
        setCustomValues(next);
      })
      .catch((error) => {
        if (active) {
          toast({
            title: "Não foi possível carregar campos personalizados",
            description: error instanceof Error ? error.message : "Tente novamente.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (active) {
          setCustomFieldsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [customer, fieldDefs, initialOverrides, open, toast]);

  async function handleSubmit() {
    if (disabled) {
      toast({
        title: "Assuma a conversa",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }

    const phone = normalizePhone(telefone);
    if (!phone.jid) {
      toast({
        title: "Telefone inválido",
        description: "Informe um número de WhatsApp válido.",
        variant: "destructive",
      });
      return;
    }

    const base = customer ? customerToUpsertInput(customer) : baseLeadInput();
    const codigo = customer?.codigo?.trim()
      ? customer.codigo
      : customers.length > 0
        ? nextCustomerCode(customers)
        : (base.codigo ?? "");

    const telefoneE164 = phone.e164 ?? telefone.trim();
    const nomeTrim = nome.trim();

    const payload: CustomerUpsertInput = {
      ...base,
      codigo,
      telefone: telefoneE164,
      email: email.trim(),
      nome: fallbackCustomerDisplayName(telefoneE164, nomeTrim || null),
    };

    try {
      const submitResult = await onSubmit(payload);
      const customerId =
        customer?.id ?? (typeof submitResult === "string" ? submitResult : undefined);

      if (customerId && fieldDefs.length > 0) {
        setSavingCustomFields(true);
        try {
          await upsertCustomerCustomFieldValues(customerId, fieldDefs, customValues);
        } finally {
          setSavingCustomFields(false);
        }
      }

      onOpenChange(false);
    } catch (error) {
      toast({
        title: isEdit ? "Não foi possível salvar" : "Não foi possível criar o contato",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const isBusy = loading || savingCustomFields;
  const hasCustomFields = fieldDefs.length > 0;
  const phoneValid = Boolean(normalizePhone(telefone).jid);
  const isReadOnly = disabled || isBusy;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        disableInnerScroll
        className="flex w-full flex-col border-l border-[#e0e0e0] p-0 sm:max-w-none sm:w-[min(100vw-1rem,440px)] md:w-[40vw] md:min-w-[380px] md:max-w-[480px]"
      >
        <div className="flex min-h-0 flex-1 flex-col bg-white">
          <SheetHeader className="shrink-0 space-y-0 border-b border-[#eeeeee] px-6 pb-4 pt-6 text-left">
            <SheetTitle className={sheetUi.title}>{isEdit ? "Editar contato" : "Criar contato"}</SheetTitle>
          </SheetHeader>

          {disabled ? (
            <div className="mx-6 mt-4 rounded-xl border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-4 py-3 text-sm text-[var(--crm-amber-ink)]">
              {negotiationAssigneeBlockedMessage()}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-5">
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <Label htmlFor="lead-nome" className={sheetUi.label}>
                  Nome
                </Label>
                <Input
                  id="lead-nome"
                  className={sheetUi.input}
                  placeholder="Nome do contato"
                  value={nome}
                  disabled={isReadOnly}
                  onChange={(event) => setNome(event.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead-email" className={sheetUi.label}>
                  E-mail
                </Label>
                <Input
                  id="lead-email"
                  type="email"
                  className={sheetUi.input}
                  placeholder="email@exemplo.com"
                  value={email}
                  disabled={isReadOnly}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead-telefone" className={sheetUi.label}>
                  Telefone
                </Label>
                <Input
                  id="lead-telefone"
                  className={sheetUi.input}
                  placeholder="+55 (11) 99999-9999"
                  value={telefone}
                  disabled={isReadOnly}
                  onChange={(event) => setTelefone(event.target.value)}
                  onBlur={(event) => {
                    const v = event.target.value.trim();
                    if (!v) {
                      return;
                    }
                    const formatted = normalizePhone(v).e164;
                    if (formatted) {
                      setTelefone(formatted);
                    }
                  }}
                  autoComplete="tel"
                />
              </div>

              {uniqueDuplicates.length > 0 ? (
                <div className="space-y-2 rounded-md border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)]/60 p-3">
                  <div className="flex items-start gap-2 text-sm font-semibold text-[var(--crm-orange)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {isEdit
                      ? "Outros contatos compartilham telefone/e-mail"
                      : "Contato com esses dados já existe"}
                  </div>
                  <ul className="space-y-1.5 text-xs text-[var(--crm-ink-2)]">
                    {uniqueDuplicates.slice(0, 4).map((d) => (
                      <li
                        key={d.customerId}
                        className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-[var(--crm-ink)]">
                            {d.customerName || d.customerPhone || "(sem nome)"}
                          </div>
                          <div className="truncate text-[10px] text-[var(--crm-ink-3)]">
                            {(d.customerPhone || d.customerEmail || "—")}
                            {` · ${d.matchReason === "phone" ? "telefone" : d.matchReason === "email" ? "e-mail" : "CPF"}`}
                            {d.openNegotiationId ? " · negócio aberto" : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/clientes/${d.customerId}`);
                          }}
                          className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--crm-amber-border)] bg-card px-2 py-1 text-[11px] font-semibold text-[var(--crm-orange)] hover:bg-[var(--crm-amber-tint)]"
                        >
                          Abrir
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                    {uniqueDuplicates.length > 4 ? (
                      <li className="text-[10px] text-[var(--crm-ink-3)]">
                        +{uniqueDuplicates.length - 4} outros contatos
                      </li>
                    ) : null}
                  </ul>
                  <p className="text-[10px] text-[var(--crm-ink-3)]">
                    {isEdit
                      ? "Pode ser intencional (mesma família/empresa). Ajuste se for duplicata real."
                      : "Salve mesmo assim só se for um contato realmente diferente."}
                  </p>
                </div>
              ) : null}

              {hasCustomFields ? (
                <div className="space-y-4 border-t border-[#eeeeee] pt-4">
                  <p className={sheetUi.section}>Campos personalizados</p>
                  {customFieldsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando…
                    </div>
                  ) : (
                    fieldDefs.map((field) => (
                      <CustomerCustomFieldInput
                        key={field.id}
                        field={field}
                        value={customValues[field.id] ?? ""}
                        disabled={isReadOnly}
                        onChange={(value) =>
                          setCustomValues((current) => ({ ...current, [field.id]: value }))
                        }
                        id={`lead-custom-${field.id}`}
                        labelClassName={sheetUi.label}
                        inputClassName={sheetUi.input}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#eeeeee] bg-white px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              className={sheetUi.btnSecondary}
              disabled={isReadOnly}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className={sheetUi.btnPrimary}
              disabled={isReadOnly || !phoneValid}
              onClick={() => void handleSubmit()}
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando…
                </>
              ) : isEdit ? (
                "Salvar"
              ) : (
                "Criar contato"
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
