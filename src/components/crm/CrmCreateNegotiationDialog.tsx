import { useEffect, useDeferredValue, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect } from "@/components/inbox/SearchSelect";
import { useToast } from "@/hooks/use-toast";
import { useCreateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { useLeadDuplicates } from "@/lib/api/crm-lead-duplicates";
import {
  useCreateCustomer,
  useCustomer,
  useCustomers,
  toCustomerUpsertInput,
  useUpdateCustomer,
} from "@/lib/api/customers";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import {
  filterCustomersByBlockedIds,
  resolveContactListAssigneeFilterId,
  useCustomerContactPickerEligibility,
} from "@/lib/crm/customer-contact-picker-eligibility";
import {
  autoAssignNegotiationToCreatorOnCreate,
  mustPickNegotiationAssigneeOnCreate,
  resolveNegotiationAssigneeOnCreate,
} from "@/lib/crm/negotiation-assignee";
import { normalizePhone } from "@/lib/phone";
import { fallbackCustomerDisplayName } from "@/lib/customer-display-name";
import type { CrmFunnel } from "@/data/crm-funnels";
import type { Customer, CustomerUpsertInput, UserRole } from "@/types/domain";

type CustomerMode = "existing" | "new";

function buildNewContactInput(
  name: string,
  phoneE164: string,
  funnelId: string,
  stageId: string,
): CustomerUpsertInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    codigo: "",
    origem: undefined,
    nome: name.trim(),
    telefone: phoneE164,
    celular: "",
    email: "",
    cnpj: "",
    endereco: "",
    perfil: "B",
    rota: "",
    status: "ativo",
    vendedor: "",
    ultimoPedido: today,
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
    canal: "crm",
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
    cadastradoEm: today,
    sourceColumns: {
      origem_cadastro: "crm_negociacao",
      [CRM_FUNNEL_ID_KEY]: funnelId,
      [CRM_PIPELINE_STAGE_KEY]: stageId,
    },
  };
}

export type CrmNegotiationAssigneeOption = { id: string; name: string };

export function CrmCreateNegotiationDialog({
  open,
  onOpenChange,
  funnels,
  defaultFunnelId,
  profileId,
  userRole,
  assigneeOptions,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnels: CrmFunnel[];
  defaultFunnelId: string;
  profileId: string | undefined;
  userRole: UserRole | undefined;
  assigneeOptions: CrmNegotiationAssigneeOption[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const createNegotiation = useCreateCrmNegotiation();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();

  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [createFunnelId, setCreateFunnelId] = useState(defaultFunnelId);
  const [createStageId, setCreateStageId] = useState("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");

  const mustPickAssignee = mustPickNegotiationAssigneeOnCreate(userRole);
  const autoAssignSelf = autoAssignNegotiationToCreatorOnCreate(userRole);

  const { data: searchCustomers = [], isLoading: customersLoading } = useCustomers(
    { search: customerSearch.trim().length >= 2 ? customerSearch.trim() : undefined },
    { enabled: open && customerMode === "existing" && customerSearch.trim().length >= 2 },
  );
  const { data: selectedCustomerRecord } = useCustomer(selectedCustomerId ?? undefined, {
    enabled: open && customerMode === "existing" && Boolean(selectedCustomerId),
  });

  const contactListFilterAssigneeId = useMemo(
    () => resolveContactListAssigneeFilterId(userRole, profileId, selectedAssigneeId),
    [profileId, selectedAssigneeId, userRole],
  );

  const searchCustomerIds = useMemo(() => searchCustomers.map((c) => c.id), [searchCustomers]);

  const { data: contactEligibility, isFetching: contactEligibilityLoading } =
    useCustomerContactPickerEligibility(searchCustomerIds, contactListFilterAssigneeId, {
      enabled:
        open &&
        customerMode === "existing" &&
        Boolean(contactListFilterAssigneeId) &&
        searchCustomerIds.length > 0,
    });

  const { data: selectedContactEligibility } = useCustomerContactPickerEligibility(
    selectedCustomerId ? [selectedCustomerId] : [],
    contactListFilterAssigneeId,
    {
      enabled:
        open &&
        customerMode === "existing" &&
        Boolean(contactListFilterAssigneeId) &&
        Boolean(selectedCustomerId),
    },
  );

  const visibleSearchCustomers = useMemo(() => {
    if (!contactListFilterAssigneeId) {
      return searchCustomers;
    }
    if (!contactEligibility) {
      return [];
    }
    return filterCustomersByBlockedIds(searchCustomers, contactEligibility);
  }, [contactEligibility, contactListFilterAssigneeId, searchCustomers]);

  const createFunnel = useMemo(
    () => funnels.find((f) => f.id === createFunnelId) ?? funnels[0],
    [createFunnelId, funnels],
  );

  const stageOptions = createFunnel?.stages ?? [];

  useEffect(() => {
    if (!open) {
      return;
    }
    setCustomerMode("existing");
    setCustomerPickerOpen(false);
    setCustomerSearch("");
    setSelectedCustomerId(null);
    setNewContactName("");
    setNewContactPhone("");
    setCreateFunnelId(defaultFunnelId);
    setSelectedAssigneeId("");
  }, [open, defaultFunnelId]);

  useEffect(() => {
    if (!open || stageOptions.length === 0) {
      return;
    }
    setCreateStageId((prev) => {
      if (prev && stageOptions.some((s) => s.id === prev)) {
        return prev;
      }
      return stageOptions[0]?.id ?? "lead";
    });
  }, [open, createFunnelId, stageOptions]);

  useEffect(() => {
    if (!selectedCustomerId || !selectedContactEligibility) {
      return;
    }
    if (selectedContactEligibility.has(selectedCustomerId)) {
      setSelectedCustomerId(null);
    }
  }, [selectedContactEligibility, selectedCustomerId, selectedAssigneeId]);

  const customerOptions = useMemo(
    () =>
      visibleSearchCustomers.map((c) => ({
        id: c.id,
        name: c.nome?.trim() || fallbackCustomerDisplayName(c.telefone, "Sem nome"),
        subtitle: c.telefone?.trim() || c.email?.trim() || c.codigo?.trim() || c.id.slice(0, 8),
      })),
    [visibleSearchCustomers],
  );

  const selectedCustomer = selectedCustomerRecord ?? null;

  // Detecção de duplicatas: roda quando há contato selecionado (existing) OU
  // quando o usuário digita um telefone novo. Debounce via useDeferredValue.
  const deferredNewPhone = useDeferredValue(newContactPhone);
  const duplicateArgs = useMemo(() => {
    if (customerMode === "existing" && selectedCustomer) {
      const phone =
        selectedCustomer.phoneE164 ||
        selectedCustomer.phoneDigits ||
        selectedCustomer.telefone ||
        null;
      return {
        phone,
        email: selectedCustomer.email || null,
        cpf: selectedCustomer.cpf || null,
        // não excluímos o próprio: queremos as negociações ABERTAS dele +
        // outros possíveis duplicatas com mesmo telefone/email/CPF.
        excludeCustomerId: null,
      };
    }
    if (customerMode === "new") {
      const digits = deferredNewPhone.replace(/\D/g, "");
      if (digits.length < 8) return null;
      return {
        phone: deferredNewPhone,
        email: null,
        cpf: null,
        excludeCustomerId: null,
      };
    }
    return null;
  }, [customerMode, deferredNewPhone, selectedCustomer]);

  const duplicatesQ = useLeadDuplicates(
    duplicateArgs ?? { phone: null, email: null, cpf: null },
    { enabled: open && duplicateArgs !== null },
  );
  const openDuplicateNegotiations = useMemo(
    () => (duplicatesQ.data ?? []).filter((d) => d.openNegotiationId),
    [duplicatesQ.data],
  );
  // Em modo "new", customers casados com o telefone digitado são duplicatas em
  // potencial mesmo sem negociação aberta — sugerimos usar o contato existente.
  const duplicateCustomersForNewMode = useMemo(() => {
    if (customerMode !== "new") return [];
    const seen = new Set<string>();
    return (duplicatesQ.data ?? []).filter((d) => {
      if (seen.has(d.customerId)) return false;
      seen.add(d.customerId);
      return true;
    });
  }, [customerMode, duplicatesQ.data]);

  const busy = createNegotiation.isPending || createCustomer.isPending || updateCustomer.isPending;

  const syncCustomerPipeline = async (customer: Customer, funnelId: string, stageId: string) => {
    await updateCustomer.mutateAsync({
      id: customer.id,
      input: {
        ...toCustomerUpsertInput(customer),
        sourceColumns: {
          ...customer.sourceColumns,
          [CRM_FUNNEL_ID_KEY]: funnelId,
          [CRM_PIPELINE_STAGE_KEY]: stageId,
        },
      },
    });
  };

  const handleSubmit = async () => {
    if (!canEdit) {
      return;
    }

    const funnelId = createFunnelId.trim();
    const stageId = createStageId.trim();
    if (!funnelId || !stageId) {
      toast({
        title: "Funil e etapa obrigatórios",
        description: "Selecione em qual CRM e etapa a negociação deve entrar.",
        variant: "destructive",
      });
      return;
    }

    let customerId: string | null = null;
    let negotiationTitle = "";

    if (customerMode === "existing") {
      if (!selectedCustomerId) {
        toast({
          title: "Selecione um contato",
          description: "Busque e escolha um cliente já cadastrado na lista de contatos.",
          variant: "destructive",
        });
        return;
      }
      if (selectedContactEligibility?.has(selectedCustomerId)) {
        toast({
          title: "Contato indisponível",
          description:
            "Este lead está vinculado a outro atendente. Escolha um contato no pool ou já sob sua responsabilidade.",
          variant: "destructive",
        });
        return;
      }
      customerId = selectedCustomerId;
      negotiationTitle =
        selectedCustomer?.nome?.trim() ||
        fallbackCustomerDisplayName(selectedCustomer?.telefone ?? "", "Negociação");
    } else {
      const name = newContactName.trim();
      const phoneRaw = newContactPhone.trim();
      if (name.length < 2) {
        toast({
          title: "Nome obrigatório",
          description: "Informe o nome do novo contato.",
          variant: "destructive",
        });
        return;
      }
      const normalized = normalizePhone(phoneRaw);
      if (!normalized.e164) {
        toast({
          title: "Telefone inválido",
          description: "Use o formato internacional, por exemplo +556299988620.",
          variant: "destructive",
        });
        return;
      }

      try {
        const created = await createCustomer.mutateAsync(
          buildNewContactInput(name, normalized.e164, funnelId, stageId),
        );
        customerId = created.id;
        negotiationTitle = created.nome?.trim() || name;
      } catch (err) {
        toast({
          title: "Não foi possível cadastrar o contato",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
        return;
      }
    }

    const { assigneeId, error: assigneeError } = resolveNegotiationAssigneeOnCreate(
      userRole,
      profileId,
      selectedAssigneeId,
    );
    if (assigneeError) {
      toast({
        title: mustPickAssignee ? "Responsável obrigatório" : "Não foi possível definir responsável",
        description: assigneeError,
        variant: "destructive",
      });
      return;
    }

    try {
      await createNegotiation.mutateAsync({
        title: negotiationTitle,
        funnelId,
        stageId,
        assigneeId,
        customerId,
      });

      if (customerMode === "existing" && selectedCustomer) {
        await syncCustomerPipeline(selectedCustomer, funnelId, stageId);
      }

      toast({
        title: "Negociação criada",
        description: negotiationTitle,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Não foi possível criar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open && canEdit}
      onOpenChange={(next) => {
        if (!canEdit) {
          onOpenChange(false);
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-[#dee2e6] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova negociação</DialogTitle>
          <DialogDescription>
            Vincule a um contato da lista ou cadastre um novo lead com telefone no formato +556299988620.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3">
            <Label>Contato</Label>
            <RadioGroup
              value={customerMode}
              onValueChange={(v) => setCustomerMode(v as CustomerMode)}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="crm-neg-existing"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--crm-border)] px-3 py-2.5 text-sm has-[:checked]:border-[var(--crm-brand)] has-[:checked]:bg-[var(--crm-brand-tint)]"
              >
                <RadioGroupItem value="existing" id="crm-neg-existing" />
                <Users className="h-4 w-4 text-[#6f7b76]" />
                Já cadastrado
              </label>
              <label
                htmlFor="crm-neg-new"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--crm-border)] px-3 py-2.5 text-sm has-[:checked]:border-[var(--crm-brand)] has-[:checked]:bg-[var(--crm-brand-tint)]"
              >
                <RadioGroupItem value="new" id="crm-neg-new" />
                <UserPlus className="h-4 w-4 text-[#6f7b76]" />
                Novo contato
              </label>
            </RadioGroup>

            {customerMode === "existing" ? (
              <div className="space-y-2">
                <SearchSelect
                  open={customerPickerOpen}
                  onOpenChange={setCustomerPickerOpen}
                  value={selectedCustomerId}
                  placeholder="Selecionar contato"
                  emptyLabel={
                    customerSearch.trim().length < 2
                      ? "Digite pelo menos 2 caracteres para buscar"
                      : customersLoading || contactEligibilityLoading
                        ? "Buscando…"
                        : contactListFilterAssigneeId &&
                            searchCustomers.length > 0 &&
                            visibleSearchCustomers.length === 0
                          ? "Nenhum contato disponível (vinculado a outro atendente)"
                          : "Nenhum contato encontrado"
                  }
                  icon={Users}
                  options={customerOptions}
                  onSelect={(id) => setSelectedCustomerId(id)}
                  filterMode="server"
                  onSearchQueryChange={setCustomerSearch}
                  searchInputPlaceholder="Nome, telefone ou código"
                  triggerClassName="h-10 w-full min-w-0 justify-between rounded-md border-[#ced4da] px-3 text-sm font-normal"
                  disabled={busy}
                />
                {selectedCustomer?.telefone ? (
                  <p className="text-xs text-[#6f7b76]">Telefone: {selectedCustomer.telefone}</p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="crm-new-contact-name">Nome</Label>
                  <Input
                    id="crm-new-contact-name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Nome do lead"
                    className="border-[#ced4da]"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="crm-new-contact-phone">Telefone (WhatsApp)</Label>
                  <Input
                    id="crm-new-contact-phone"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    onBlur={() => {
                      const trimmed = newContactPhone.trim();
                      if (!trimmed) {
                        return;
                      }
                      const normalized = normalizePhone(trimmed);
                      if (normalized.e164) {
                        setNewContactPhone(normalized.e164);
                      }
                    }}
                    placeholder="+556299988620"
                    className="border-[#ced4da]"
                    disabled={busy}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-[#6f7b76]">
                    O contato será salvo na lista de Clientes com este número para abrir o chat.
                  </p>
                </div>
              </div>
            )}
          </div>

          {openDuplicateNegotiations.length > 0 ? (
            <div className="space-y-2 rounded-md border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)]/60 p-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-[var(--crm-orange)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Este contato já tem negociação aberta
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--crm-ink-2)]">
                {openDuplicateNegotiations.slice(0, 4).map((d) => (
                  <li
                    key={`${d.customerId}-${d.openNegotiationId}`}
                    className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--crm-ink)]">
                        {d.openNegotiationTitle ?? d.customerName}
                      </div>
                      <div className="truncate text-[10px] text-[var(--crm-ink-3)]">
                        {d.customerName}
                        {d.openAssigneeName ? ` · ${d.openAssigneeName}` : " · sem responsável"}
                        {` · ${d.matchReason === "phone" ? "telefone" : d.matchReason === "email" ? "e-mail" : "CPF"}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!d.openNegotiationId) return;
                        navigate(`/crm/negociacao/${d.openNegotiationId}`);
                        onOpenChange(false);
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--crm-amber-border)] bg-card px-2 py-1 text-[11px] font-semibold text-[var(--crm-orange)] hover:bg-[var(--crm-amber-tint)]"
                    >
                      Abrir
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </li>
                ))}
                {openDuplicateNegotiations.length > 4 ? (
                  <li className="text-[10px] text-[var(--crm-ink-3)]">
                    +{openDuplicateNegotiations.length - 4} outras
                  </li>
                ) : null}
              </ul>
              <p className="text-[10px] text-[var(--crm-ink-3)]">
                Se for outro contexto, criar mesmo assim é OK. Caso contrário, retome a
                negociação existente.
              </p>
            </div>
          ) : customerMode === "new" && duplicateCustomersForNewMode.length > 0 ? (
            <div className="space-y-2 rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface)] p-3">
              <div className="flex items-start gap-2 text-sm font-semibold text-[var(--crm-ink-2)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--crm-orange)]" aria-hidden />
                Contato com esse telefone já existe
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--crm-ink-2)]">
                {duplicateCustomersForNewMode.slice(0, 3).map((d) => (
                  <li
                    key={d.customerId}
                    className="flex items-center justify-between gap-2 rounded bg-card px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--crm-ink)]">
                        {d.customerName || d.customerPhone || "(sem nome)"}
                      </div>
                      <div className="truncate text-[10px] text-[var(--crm-ink-3)]">
                        {d.customerPhone ?? d.customerEmail ?? d.customerCpf ?? ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode("existing");
                        setSelectedCustomerId(d.customerId);
                        setCustomerSearch(d.customerName ?? "");
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--crm-border-2)] bg-card px-2 py-1 text-[11px] font-semibold text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint)]"
                    >
                      Usar este
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-[var(--crm-ink-3)]">
                Você pode escolher o contato existente em vez de criar um duplicado.
              </p>
            </div>
          ) : null}

          {mustPickAssignee ? (
            <div className="space-y-1.5">
              <Label htmlFor="crm-new-assignee">Atendente responsável</Label>
              <Select
                value={selectedAssigneeId || undefined}
                onValueChange={setSelectedAssigneeId}
                disabled={busy}
              >
                <SelectTrigger id="crm-new-assignee" className="border-[#ced4da]">
                  <SelectValue placeholder="Selecione o atendente" />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assigneeOptions.length === 0 ? (
                <p className="text-xs text-amber-700">
                  Nenhum atendente ativo encontrado. Cadastre usuários com papel Atendimento.
                </p>
              ) : null}
            </div>
          ) : autoAssignSelf ? (
            <p className="rounded-md border border-[#e9ecef] bg-[#f8f9fa] px-3 py-2 text-sm text-[#495057]">
              Esta negociação será vinculada automaticamente a você como responsável.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-new-funnel">CRM / Funil</Label>
              <Select
                value={createFunnelId}
                onValueChange={setCreateFunnelId}
                disabled={busy}
              >
                <SelectTrigger id="crm-new-funnel" className="border-[#ced4da]">
                  <SelectValue placeholder="Funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.listName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-new-stage">Etapa</Label>
              <Select value={createStageId} onValueChange={setCreateStageId} disabled={busy}>
                <SelectTrigger id="crm-new-stage" className="border-[#ced4da]">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stageOptions.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-[var(--crm-brand)] text-white hover:bg-[var(--crm-brand-strong)]"
            disabled={busy}
            onClick={() => void handleSubmit()}
          >
            {busy ? "Salvando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
