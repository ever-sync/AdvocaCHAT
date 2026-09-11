import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { formatBRL } from "@/lib/format";
import {
  ArrowDownLeft,
  Calendar,
  Mail,
  MessageSquare,
  ScanText,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteRdPerfilView } from "@/components/cliente/ClienteRdPerfilView";
import { LegalCustomerCaseLink } from "@/components/legal/LegalCustomerCaseLink";
import { CustomerCrmPipelineForm } from "@/components/cliente/CustomerCrmPipelineForm";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { MarkLostDialog } from "@/components/crm/MarkLostDialog";
import { CrmSaleItemsPreview } from "@/components/crm/CrmSaleItemsPreview";
import { useCustomer, useUpdateCustomer } from "@/lib/api/customers";
import {
  useCreateCrmNegotiation,
  useCrmNegotiationsForCustomer,
  useUpdateCrmNegotiation,
} from "@/lib/api/crm-negotiations";
import {
  isClientePerfilCrmLocked,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import {
  customerStatusForNegotiationPause,
  negotiationCanPause,
  negotiationCanResume,
} from "@/lib/crm/negotiation-status";
import { isPersistedCrmNegotiationId } from "@/lib/crm/negotiation-model";
import { useCrmActivitiesForCustomer } from "@/lib/api/crm-activities";
import {
  useCreateCrmTask,
  useCrmTasksForCustomer,
  useDeleteCrmTask,
  useUpdateCrmTask,
} from "@/lib/api/crm-tasks";
import {
  CRM_FUNNEL_ID_KEY,
  CRM_PIPELINE_STAGE_KEY,
  resolveCustomerPipelineView,
} from "@/lib/crm-pipeline";
import { resolveConfiguredLostStageId } from "@/data/crm-funnels";
import {
  isLostDestinationStage,
  isSaleDestinationStage,
} from "@/lib/crm/sale-rules";
import {
  useCustomerCredits,
  useCustomerCreditSummary,
  useCustomerSales,
  useReturns,
} from "@/lib/api/sales";
import { useTenantCollaborators } from "@/lib/api/settings";
import { fetchAllInboxMessages, useInboxChats } from "@/lib/api/whatsapp";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/store/useAppStore";
import type { Customer, InboxChat, ReturnRecord, WhatsappMessage } from "@/types/domain";
import { SALE_PAYMENT_METHOD_LABELS } from "@/types/domain";

const CRM_TASK_FORM_ASSIGNEE_NONE = "__none__";

function formatMoney(value: number) {
  return formatBRL(value);
}

function formatDate(value?: string) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function creditMovementLabel(type: "credit_from_return" | "debit_usage") {
  return type === "credit_from_return" ? "Entrada (devolucao)" : "Saida (uso em venda)";
}

function returnSourceLabel(source: ReturnRecord["source"]) {
  return source === "existing_sale" ? "Venda vinculada" : "Outra venda";
}

function returnResolutionLabel(resolution: ReturnRecord["resolution"]) {
  return resolution === "credito" ? "Credito futuro" : "Troca";
}

function infoValue(value?: string | null) {
  return value?.trim() ? value : "Nao informado";
}

function customerTypeLabel(value?: string) {
  if (value === "pf") return "Pessoa fisica";
  if (value === "pj") return "Pessoa juridica";
  return "Nao informado";
}

function customerOriginLabel(value?: string) {
  if (value === "organico") return "Organico";
  if (value === "pago") return "Pago";
  return "Nao informado";
}

function normalizeDigits(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function digitsMatch(left?: string | null, right?: string | null) {
  const leftDigits = normalizeDigits(left);
  const rightDigits = normalizeDigits(right);

  if (!leftDigits || !rightDigits) {
    return false;
  }

  return (
    leftDigits === rightDigits ||
    leftDigits === rightDigits.replace(/^55/, "") ||
    rightDigits === leftDigits.replace(/^55/, "") ||
    leftDigits.endsWith(rightDigits) ||
    rightDigits.endsWith(leftDigits)
  );
}

function findCustomerChat(chats: InboxChat[] | undefined, customer?: Customer | null) {
  if (!customer || !chats?.length) {
    return null;
  }

  return (
    chats.find((chat) => chat.customerId === customer.id) ??
    chats.find((chat) => chat.remoteJid === customer.phoneJid) ??
    chats.find((chat) => digitsMatch(chat.remotePhoneDigits, customer.phoneDigits)) ??
    chats.find((chat) => digitsMatch(chat.remotePhoneE164, customer.phoneE164)) ??
    null
  );
}

function qualificationFromPerfil(perfil: string) {
  if (perfil === "A") return 3;
  if (perfil === "B") return 2;
  return 1;
}

function countMonthlyConversationStarts(messages: WhatsappMessage[]) {
  if (messages.length === 0) {
    return 0;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const firstMessageByDay = new Map<string, { direction: string; timestamp: number }>();

  for (const message of messages) {
    const sourceDate = message.receivedAt ?? message.sentAt ?? message.createdAt;
    const timestamp = new Date(sourceDate ?? "").getTime();
    if (Number.isNaN(timestamp)) {
      continue;
    }

    const messageDate = new Date(timestamp);
    if (messageDate.getFullYear() !== currentYear || messageDate.getMonth() !== currentMonth) {
      continue;
    }

    const dayKey = messageDate.toISOString().slice(0, 10);
    const current = firstMessageByDay.get(dayKey);

    if (!current || timestamp < current.timestamp) {
      firstMessageByDay.set(dayKey, {
        direction: message.direction,
        timestamp,
      });
    }
  }

  return Array.from(firstMessageByDay.values()).filter((entry) => entry.direction === "inbound").length;
}

function InfoGridCard({
  title,
  items,
  className = "",
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden border-border/60 bg-card/80 shadow-sm ${className}`}>
      <CardHeader className="border-b border-border/60 bg-secondary/30 pb-3">
        <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/50 bg-background/70 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{item.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function toCustomerInput(customer: Customer, status = customer.status) {
  return {
    codigo: customer.codigo,
    origem: customer.origem,
    nome: customer.nome,
    telefone: customer.telefone,
    celular: customer.celular,
    email: customer.email,
    cnpj: customer.cnpj,
    endereco: customer.endereco,
    perfil: customer.perfil,
    rota: customer.rota,
    status,
    vendedor: customer.vendedor,
    ultimoPedido: customer.ultimoPedido,
    ticketMedio: customer.ticketMedio,
    frequenciaCompra: customer.frequenciaCompra,
    totalGasto: customer.totalGasto,
    tipo: customer.tipo,
    razaoSocial: customer.razaoSocial,
    inscricaoEstadual: customer.inscricaoEstadual,
    inscricaoMunicipal: customer.inscricaoMunicipal,
    cpf: customer.cpf,
    rg: customer.rg,
    nascimento: customer.nascimento,
    nomeSocial: customer.nomeSocial,
    fax: customer.fax,
    canal: customer.canal,
    cep: customer.cep,
    logradouro: customer.logradouro,
    numero: customer.numero,
    bairro: customer.bairro,
    zone: customer.zone,
    complemento: customer.complemento,
    cidade: customer.cidade,
    estado: customer.estado,
    ativo: customer.ativo,
    observacoes: customer.observacoes,
    cadastradoEm: customer.cadastradoEm,
    sourceColumns: customer.sourceColumns,
  };
}

export function ClientePerfilContent({
  customerId,
  onBack,
}: {
  customerId: string;
  onBack: () => void;
}) {
  const id = customerId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueLocal, setTaskDueLocal] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostDialogBlockCustomer, setLostDialogBlockCustomer] = useState(false);
  const taskAssigneeDefaultSeededRef = useRef(false);
  const { data: cliente, isLoading, error } = useCustomer(id);

  useEffect(() => {
    if (!cliente || searchParams.get("copoPersonalizado") !== "1" || !can("clientes", "edit")) {
      return;
    }
    setDialogOpen(true);
    toast({
      title: "Copo personalizado",
      description: "Use o cadastro para anotar detalhes do pedido ou fale com o cliente pelo WhatsApp.",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("copoPersonalizado");
    setSearchParams(next, { replace: true });
  }, [can, cliente, searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (taskDialogOpen) {
      return;
    }
    setTaskTitle("");
    setTaskDueLocal("");
    setTaskNotes("");
    setTaskAssigneeId("");
  }, [taskDialogOpen]);

  const crmEnabled = Boolean(id && isSupabaseConfigured);
  const canEditCustomer = can("clientes", "edit");
  const canEditCrm = can("crm", "edit");
  const canDeleteCrm = can("crm", "delete");
  const profileId = profile?.id;
  const { data: customerNegotiations = [] } = useCrmNegotiationsForCustomer(id, {
    enabled: crmEnabled,
  });
  const clientePerfilCrmLocked = isClientePerfilCrmLocked(
    profile?.role,
    profileId,
    customerNegotiations,
  );
  const { data: tenantCollaborators = [] } = useTenantCollaborators({ enabled: crmEnabled });
  const { data: effectiveCrmFunnels = [] } = useEffectiveCrmFunnels();
  const crmTaskAssignees = useMemo(
    () => tenantCollaborators.map((p) => ({ id: p.id, nome: p.nome })),
    [tenantCollaborators],
  );

  useEffect(() => {
    if (!taskDialogOpen) {
      taskAssigneeDefaultSeededRef.current = false;
      return;
    }
    if (taskAssigneeDefaultSeededRef.current || !crmTaskAssignees.length) {
      return;
    }
    taskAssigneeDefaultSeededRef.current = true;
    const me = profile?.id?.trim();
    if (me && crmTaskAssignees.some((a) => a.id === me)) {
      setTaskAssigneeId(me);
    } else {
      setTaskAssigneeId("");
    }
  }, [taskDialogOpen, profile?.id, crmTaskAssignees]);
  const { data: crmTasksRaw = [], isLoading: crmTasksLoading } = useCrmTasksForCustomer(id, {
    enabled: crmEnabled,
  });
  const { data: crmActivities = [], isLoading: crmActivitiesLoading } = useCrmActivitiesForCustomer(id);
  const crmOpenTasksList = useMemo(
    () => crmTasksRaw.filter((t) => t.status === "aberta"),
    [crmTasksRaw],
  );
  const crmCompletedTasksList = useMemo(() => {
    return [...crmTasksRaw]
      .filter((t) => t.status === "concluida")
      .sort((a, b) => {
        const ua = new Date(a.updatedAt).getTime();
        const ub = new Date(b.updatedAt).getTime();
        return (Number.isNaN(ub) ? 0 : ub) - (Number.isNaN(ua) ? 0 : ua);
      });
  }, [crmTasksRaw]);
  const createCrmTask = useCreateCrmTask();
  const updateCrmTask = useUpdateCrmTask();
  const deleteCrmTask = useDeleteCrmTask();
  const { data: crmSales = [], isLoading: crmSalesLoading } = useCustomerSales(id, { limit: 40 }, {
    enabled: crmEnabled,
  });
  const { data: crmReturns = [], isLoading: crmReturnsLoading } = useReturns(
    { customerId: id, limit: 50 },
    { enabled: crmEnabled },
  );
  const { data: crmCredits = [], isLoading: crmCreditsLoading } = useCustomerCredits(
    { customerId: id, limit: 50 },
    { enabled: crmEnabled },
  );
  const { data: creditSummary } = useCustomerCreditSummary(id, { enabled: crmEnabled });

  const updateCustomer = useUpdateCustomer();
  const updateNegotiation = useUpdateCrmNegotiation();
  const createNegotiation = useCreateCrmNegotiation();
  const customerPipelineView = useMemo(() => {
    if (!cliente) {
      return null;
    }
    return resolveCustomerPipelineView(
      cliente,
      effectiveCrmFunnels,
      customerNegotiations.map((n) => ({
        funnelId: n.funnelId,
        stageId: n.stageId,
        status: n.status,
      })),
    );
  }, [cliente, customerNegotiations, effectiveCrmFunnels]);
  const { data: chats = [] } = useInboxChats(
    { status: "all" },
    { enabled: Boolean(cliente) },
  );

  const customerChat = useMemo(() => findCustomerChat(chats, cliente), [chats, cliente]);
  const { data: messages = [] } = useQuery({
    queryKey: ["inbox-messages-all", customerChat?.id],
    queryFn: () => fetchAllInboxMessages(customerChat!.id),
    enabled: Boolean(customerChat?.id),
    staleTime: 60_000,
  });
  const totalMessages = messages.length;
  const conversationStartsThisMonth = useMemo(() => countMonthlyConversationStarts(messages), [messages]);
  const pipelineActiveIndex = customerPipelineView?.pipelineActiveIndex ?? 0;
  const daysContact = customerPipelineView?.daysContact ?? 0;
  const pipelineStages = customerPipelineView?.pipelineStages;
  const customerFunnelLabel = customerPipelineView?.funnelLabel;
  const customerFunnelId = customerPipelineView?.funnelId ?? effectiveCrmFunnels[0]?.id ?? "comercial";

  /** Negociação ativa do funil atual — habilita Pausar/Retomar na ficha. */
  const pausableNegotiation = useMemo(() => {
    const inFunnel = customerNegotiations.filter(
      (n) => n.funnelId === customerFunnelId && isPersistedCrmNegotiationId(n.id),
    );
    return (
      inFunnel.find((n) => n.status === "em_andamento" || n.status === "nao_pausado") ??
      inFunnel.find((n) => n.status === "pausado") ??
      null
    );
  }, [customerFunnelId, customerNegotiations]);

  if (isLoading) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 items-center justify-center text-sm text-[var(--crm-ink-3)]"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        Carregando cliente...
      </div>
    );
  }

  if (!cliente) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 text-center"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        <p className="text-sm text-[var(--crm-ink-3)]">{error?.message || "Cliente nao encontrado."}</p>
        <Button variant="outline" className="border-[var(--crm-border-2)]" onClick={onBack}>
          Voltar para clientes
        </Button>
      </div>
    );
  }

  function openCustomerInbox() {
    if (!cliente) {
      return;
    }

    const params = new URLSearchParams();

    if (customerChat?.id) {
      params.set("chatId", customerChat.id);
    }

    if (cliente.id) {
      params.set("customerId", cliente.id);
    }

    if (cliente.phoneDigits ?? cliente.telefone) {
      params.set("search", cliente.phoneDigits ?? cliente.telefone);
    }

    navigate({
      pathname: "/inbox",
      search: params.toString(),
    });
  }

  const handleTogglePauseNegotiation = async () => {
    if (clientePerfilCrmLocked) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!pausableNegotiation || !cliente) {
      return;
    }
    const nextStatus = negotiationCanResume(pausableNegotiation.status)
      ? "em_andamento"
      : "pausado";
    if (
      !negotiationCanPause(pausableNegotiation.status) &&
      !negotiationCanResume(pausableNegotiation.status)
    ) {
      return;
    }
    try {
      await updateNegotiation.mutateAsync({
        id: pausableNegotiation.id,
        patch: { status: nextStatus },
      });
      const customerStatus = customerStatusForNegotiationPause(nextStatus, cliente.status);
      if (customerStatus !== undefined) {
        await updateCustomer.mutateAsync({
          id: cliente.id,
          input: {
            ...toCustomerInput(cliente, customerStatus),
            sourceColumns: {
              ...(cliente.sourceColumns ?? {}),
              [CRM_FUNNEL_ID_KEY]: pausableNegotiation.funnelId,
              [CRM_PIPELINE_STAGE_KEY]: pausableNegotiation.stageId,
            },
          },
        });
      }
      toast({
        title: nextStatus === "pausado" ? "Negócio pausado" : "Negócio retomado",
        description:
          nextStatus === "pausado"
            ? "Alertas de follow-up ficam suspensos até retomar."
            : "O negócio voltou para em andamento.",
      });
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handlePipelineStageChange = async (stageIndex: number) => {
    if (clientePerfilCrmLocked) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    const funnel = effectiveCrmFunnels.find((f) => f.id === customerFunnelId) ?? effectiveCrmFunnels[0];
    const stage = funnel?.stages[stageIndex];
    if (!stage || !funnel) {
      return;
    }
    if (
      stage.isLostStage ||
      isLostDestinationStage(effectiveCrmFunnels, funnel.id, stage.id)
    ) {
      openMarkLossDialog(false);
      return;
    }
    if (isSaleDestinationStage(effectiveCrmFunnels, funnel.id, stage.id)) {
      toast({
        title: "Marcar venda",
        description: "Registre a venda na aba CRM ou pelo Inbox.",
      });
      return;
    }

    const activeNegotiations = customerNegotiations.filter(
      (n) =>
        n.status === "em_andamento" ||
        n.status === "pausado" ||
        n.status === "nao_pausado",
    );
    if (activeNegotiations.length === 0 && crmEnabled) {
      await createNegotiation.mutateAsync({
        title: cliente.nome?.trim() || "Nova negociação",
        funnelId: funnel.id,
        stageId: stage.id,
        customerId: cliente.id,
      });
    } else {
      for (const n of activeNegotiations) {
        if (n.funnelId !== funnel.id || n.stageId !== stage.id || n.status === "pausado") {
          await updateNegotiation.mutateAsync({
            id: n.id,
            patch: {
              funnelId: funnel.id,
              stageId: stage.id,
              ...(n.status === "pausado" ? { status: "em_andamento" as const } : {}),
            },
          });
        }
      }
    }

    let nextStatus = cliente.status;
    if (cliente.status === "bloqueado") {
      nextStatus = "ativo";
    }
    await updateCustomer.mutateAsync({
      id: cliente.id,
      input: {
        ...toCustomerInput(cliente, nextStatus),
        sourceColumns: {
          ...(cliente.sourceColumns ?? {}),
          [CRM_FUNNEL_ID_KEY]: funnel.id,
          [CRM_PIPELINE_STAGE_KEY]: stage.id,
        },
      },
    });
    toast({
      title: "Funil atualizado",
      description: `Etapa: ${stage.title}`,
    });
  };

  const openMarkLossDialog = (blockCustomer: boolean) => {
    if (clientePerfilCrmLocked) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (cliente.status === "bloqueado") {
      toast({
        title: "Negociação",
        description: "Este cliente já está marcado como perda (bloqueado).",
      });
      return;
    }
    setLostDialogBlockCustomer(blockCustomer);
    setLostDialogOpen(true);
  };

  const confirmMarkLoss = async (lostReason: string) => {
    const lostStageId = resolveConfiguredLostStageId(effectiveCrmFunnels, customerFunnelId);
    const activeNegotiations = customerNegotiations.filter(
      (n) => n.status === "em_andamento" || n.status === "pausado" || n.status === "nao_pausado",
    );

    try {
      if (activeNegotiations.length === 0 && crmEnabled) {
        const created = await createNegotiation.mutateAsync({
          title: cliente.nome?.trim() || "Nova negociação",
          funnelId: customerFunnelId,
          stageId: lostStageId,
          status: "perdido",
          customerId: cliente.id,
        });
        await updateNegotiation.mutateAsync({
          id: created.id,
          patch: { lostReason },
        });
      } else {
        for (const n of activeNegotiations) {
          await updateNegotiation.mutateAsync({
            id: n.id,
            patch: { status: "perdido", stageId: lostStageId, lostReason },
          });
        }
      }

      const nextSource = {
        ...(cliente.sourceColumns ?? {}),
        [CRM_FUNNEL_ID_KEY]: customerFunnelId,
        [CRM_PIPELINE_STAGE_KEY]: lostStageId,
      };
      const nextCustomerStatus = lostDialogBlockCustomer ? "bloqueado" : cliente.status;
      await updateCustomer.mutateAsync({
        id: cliente.id,
        input: {
          ...toCustomerInput(cliente, nextCustomerStatus),
          sourceColumns: nextSource,
        },
      });

      if (lostDialogBlockCustomer) {
        const descricao = `${cliente.nome} foi bloqueado.`;
        useAppStore.getState().addNotification({
          tipo: "aviso",
          titulo: "Cliente bloqueado",
          descricao,
        });
        toast({ title: "Bloqueado", description: descricao });
      } else {
        toast({
          title: "Marcar perda",
          description: "Negociação e funil do cliente atualizados.",
        });
      }
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
      throw e;
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <LegalCustomerCaseLink customerId={cliente.id} />
      {crmEnabled && effectiveCrmFunnels.length > 0 ? (
        <div className="border-b border-border bg-muted/30 px-4 py-3 md:px-6">
          <CustomerCrmPipelineForm
            customer={cliente}
            funnels={effectiveCrmFunnels}
            readOnly={clientePerfilCrmLocked || !canEditCrm}
          />
        </div>
      ) : null}
      <ClienteRdPerfilView
        cliente={cliente}
        negotiationReadOnly={clientePerfilCrmLocked}
        customerActionsDisabled={!canEditCustomer}
        crmActionsDisabled={!canEditCrm}
        daysContact={daysContact}
        pipelineActiveIndex={pipelineActiveIndex}
        pipelineStages={pipelineStages?.length ? pipelineStages : undefined}
        funnelLabel={customerFunnelLabel}
        qualificationStars={qualificationFromPerfil(cliente.perfil)}
        onBack={onBack}
        onRefresh={() => {
          void queryClient.invalidateQueries({ queryKey: ["customers", id] });
          if (crmEnabled) {
            void queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
          }
        }}
        crmOpenTasks={crmEnabled ? crmOpenTasksList : undefined}
        crmCompletedTasks={crmEnabled ? crmCompletedTasksList : undefined}
        crmTaskScopeLabelMode={crmEnabled ? "customer-linked" : undefined}
        crmTasksLoading={crmEnabled ? crmTasksLoading : false}
        crmTaskAssignees={crmEnabled ? crmTaskAssignees : undefined}
        onCompleteCrmTask={
          crmEnabled && canEditCrm
            ? (taskId) => {
                if (!id) {
                  return;
                }
                void (async () => {
                  const t = crmTasksRaw.find((x) => x.id === taskId);
                  try {
                    await updateCrmTask.mutateAsync({
                      id: taskId,
                      patch: { status: "concluida" },
                      customerId: id,
                      negotiationId: t?.negotiationId ?? null,
                    });
                    toast({ title: "Tarefa", description: "Marcada como concluída." });
                  } catch (e) {
                    toast({
                      title: "Não foi possível salvar",
                      description: e instanceof Error ? e.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }
            : undefined
        }
        onReopenCrmTask={
          crmEnabled && canEditCrm
            ? (taskId) => {
                if (!id) {
                  return;
                }
                void (async () => {
                  const t = crmTasksRaw.find((x) => x.id === taskId);
                  try {
                    await updateCrmTask.mutateAsync({
                      id: taskId,
                      patch: { status: "aberta" },
                      customerId: id,
                      negotiationId: t?.negotiationId ?? null,
                    });
                    toast({ title: "Tarefa", description: "Tarefa reaberta." });
                  } catch (e) {
                    toast({
                      title: "Não foi possível salvar",
                      description: e instanceof Error ? e.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }
            : undefined
        }
        crmCompleteTaskPending={updateCrmTask.isPending}
        crmDeleteTaskPending={deleteCrmTask.isPending}
        onDeleteCrmTask={
          crmEnabled && canDeleteCrm
            ? (taskId) => {
                void (async () => {
                  try {
                    await deleteCrmTask.mutateAsync(taskId);
                    toast({ title: "Tarefa", description: "Tarefa excluída." });
                  } catch (e) {
                    toast({
                      title: "Não foi possível excluir",
                      description: e instanceof Error ? e.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }
            : undefined
        }
        crmEditTaskPending={updateCrmTask.isPending}
        onSaveCrmTaskEdit={
          crmEnabled && canEditCrm
            ? async ({ id: taskId, patch }) => {
                if (!id) {
                  return;
                }
                const t = crmTasksRaw.find((x) => x.id === taskId);
                try {
                  await updateCrmTask.mutateAsync({
                    id: taskId,
                    patch,
                    customerId: id,
                    negotiationId: t?.negotiationId ?? null,
                  });
                  toast({ title: "Tarefa", description: "Alterações salvas." });
                } catch (e) {
                  toast({
                    title: "Não foi possível salvar",
                    description: e instanceof Error ? e.message : "Tente novamente.",
                    variant: "destructive",
                  });
                  throw e;
                }
              }
            : undefined
        }
        onMarkLoss={canEditCrm ? () => openMarkLossDialog(false) : () => {
          toast({
            title: "Ação indisponível",
            description: "Seu papel nao tem permissao para marcar perda.",
            variant: "destructive",
          });
        }}
        onMarkWin={
          canEditCrm
            ? () => {
                toast({
                  title: "Marcar venda",
                  description: "Registre a venda na aba CRM (área expandida) ou pelo Inbox.",
                });
              }
            : () => {
                toast({
                  title: "Ação indisponível",
                  description: "Seu papel nao tem permissao para marcar venda.",
                  variant: "destructive",
                });
              }
        }
        negotiationStatus={pausableNegotiation?.status}
        onTogglePauseNegotiation={
          crmEnabled && canEditCrm && pausableNegotiation
            ? () => void handleTogglePauseNegotiation()
            : undefined
        }
        pauseTogglePending={updateNegotiation.isPending || updateCustomer.isPending}
        onEdit={() => {
          if (!canEditCustomer) {
            toast({
              title: "Ação indisponível",
              description: "Seu papel nao tem permissao para editar este cadastro.",
              variant: "destructive",
            });
            return;
          }
          if (clientePerfilCrmLocked) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          setDialogOpen(true);
        }}
        onOpenInbox={openCustomerInbox}
        onBlock={canEditCustomer ? () => openMarkLossDialog(true) : () => {
          toast({
            title: "Ação indisponível",
            description: "Seu papel nao tem permissao para bloquear este cliente.",
            variant: "destructive",
          });
        }}
        onCreateNote={() => {
          if (!canEditCustomer) {
            toast({
              title: "Ação indisponível",
              description: "Seu papel nao tem permissao para criar anotação.",
              variant: "destructive",
            });
            return;
          }
          setDialogOpen(true);
        }}
        onCreateTask={() => {
          if (!canEditCrm) {
            toast({
              title: "Ação indisponível",
              description: "Seu papel nao tem permissao para criar tarefas.",
              variant: "destructive",
            });
            return;
          }
          if (clientePerfilCrmLocked) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (crmEnabled) {
            setTaskDialogOpen(true);
            return;
          }
          toast({
            title: "Tarefas",
            description: "Configure o Supabase para criar tarefas neste cadastro.",
          });
        }}
        onPipelineStageChange={(idx) => void handlePipelineStageChange(idx)}
      />

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>A tarefa fica vinculada a este cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cliente-crm-task-title">Título</Label>
              <Input
                id="cliente-crm-task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex.: Enviar proposta atualizada"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente-crm-task-due">Prazo (opcional)</Label>
              <Input
                id="cliente-crm-task-due"
                type="datetime-local"
                value={taskDueLocal}
                onChange={(e) => setTaskDueLocal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente-crm-task-notes">Observações (opcional)</Label>
              <Textarea
                id="cliente-crm-task-notes"
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cliente-crm-task-assignee">Responsável (opcional)</Label>
              <Select
                value={taskAssigneeId.trim() ? taskAssigneeId : CRM_TASK_FORM_ASSIGNEE_NONE}
                onValueChange={(v) => setTaskAssigneeId(v === CRM_TASK_FORM_ASSIGNEE_NONE ? "" : v)}
              >
                <SelectTrigger id="cliente-crm-task-assignee">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CRM_TASK_FORM_ASSIGNEE_NONE}>Sem responsável</SelectItem>
                  {crmTaskAssignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome?.trim() || a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={createCrmTask.isPending}
              onClick={() => {
                void (async () => {
                  const title = taskTitle.trim();
                  if (!title) {
                    toast({
                      title: "Título obrigatório",
                      description: "Informe um título para a tarefa.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (!id) {
                    return;
                  }
                  try {
                    await createCrmTask.mutateAsync({
                      title,
                      customerId: id,
                      assigneeId: taskAssigneeId.trim() || null,
                      dueAt: taskDueLocal ? new Date(taskDueLocal).toISOString() : null,
                      notes: taskNotes.trim(),
                    });
                    setTaskDialogOpen(false);
                    toast({ title: "Tarefa criada", description: "A lista foi atualizada." });
                  } catch (e) {
                    toast({
                      title: "Não foi possível salvar",
                      description: e instanceof Error ? e.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }}
            >
              {createCrmTask.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkLostDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        title={
          lostDialogBlockCustomer ? "Bloquear cliente e marcar perda" : "Marcar como perdido"
        }
        pending={updateNegotiation.isPending || updateCustomer.isPending || createNegotiation.isPending}
        onConfirm={confirmMarkLoss}
      />

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={cliente}
        loading={updateCustomer.isPending}
        onSubmit={async (input) => {
          await updateCustomer.mutateAsync({ id: cliente.id, input });
          const atualizadoDesc = `${input.nome} foi atualizado com sucesso.`;
          toast({
            title: "Cliente atualizado",
            description: atualizadoDesc,
          });
          useAppStore.getState().addNotification({
            tipo: "sucesso",
            titulo: "Cliente atualizado",
            descricao: atualizadoDesc,
          });
          return cliente.id;
        }}
      />
    </div>
  );
}

export default function ClientePerfil() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 text-center"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        <p className="text-sm text-[var(--crm-ink-3)]">Cliente não informado.</p>
        <Button variant="outline" className="border-[var(--crm-border-2)]" onClick={() => navigate("/clientes")}>
          Voltar para clientes
        </Button>
      </div>
    );
  }

  return <ClientePerfilContent customerId={id} onBack={() => navigate("/clientes")} />;
}
