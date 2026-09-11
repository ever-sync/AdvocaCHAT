import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ClienteRdPerfilView } from "@/components/cliente/ClienteRdPerfilView";
import { formatBRL } from "@/lib/format";
import { CrmNegotiationDocumentsSection } from "@/components/crm/CrmNegotiationDocumentsSection";
import { NegotiationProductsEditor } from "@/components/crm/NegotiationProductsEditor";
import { CallButton } from "@/components/crm/CallButton";
import { CallLogsPanel } from "@/components/crm/CallLogsPanel";
import { NegotiationCommentsPanel } from "@/components/crm/NegotiationCommentsPanel";
import { NegotiationChangeHistoryPanel } from "@/components/crm/NegotiationChangeHistory";
import { buildScoringContext, computeLeadScore } from "@/lib/crm/lead-score";
import { useTenantSettings } from "@/lib/api/integrations";
import { normalizeStaleNegotiationDays } from "@/lib/crm/negotiation-alerts";
import { useNegotiationProducts } from "@/lib/api/crm-negotiation-products";
import { MarkLostDialog } from "@/components/crm/MarkLostDialog";
import { MarkWinDialog } from "@/components/crm/MarkWinDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useToast } from "@/hooks/use-toast";
import {
  type CrmNegotiationPatch,
  useClaimCrmNegotiation,
  useCrmNegotiation,
  useCrmNegotiations,
  useReleaseCrmNegotiationToPool,
  useUpdateCrmNegotiation,
} from "@/lib/api/crm-negotiations";
import {
  createStageTemplateTask,
  useCreateCrmTask,
  useCrmTasksForCustomer,
  useCrmTasksForNegotiation,
  useDeleteCrmTask,
  useUpdateCrmTask,
} from "@/lib/api/crm-tasks";
import { useCrmTaskTemplates } from "@/lib/api/crm-task-templates";
import {
  useCreateCustomer,
  useCustomer,
  useUpdateCustomer,
  toCustomerUpsertInput,
} from "@/lib/api/customers";
import { useTenantCollaborators } from "@/lib/api/settings";
import { LegalCustomerCaseLink } from "@/components/legal/LegalCustomerCaseLink";
import {
  crmNegotiationRecordToCard,
  isPersistedCrmNegotiationId,
} from "@/lib/crm/negotiation-model";
import {
  mergeCompletedCrmTasksForNegotiationView,
  mergeOpenCrmTasksForNegotiationView,
} from "@/lib/crm/negotiation-task-view";
import {
  CRM_FUNNEL_ID_KEY,
  CRM_PIPELINE_STAGE_KEY,
  getPipelineStateForCustomer,
} from "@/lib/crm-pipeline";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { useInboxChats } from "@/lib/api/whatsapp";
import { resolveConfiguredLostStageId, resolveConfiguredSaleStageId } from "@/data/crm-funnels";
import {
  negotiationHasCompletedSale,
  saleAttendantBlockedMessage,
  validateMarkWinLines,
} from "@/lib/crm/sale-rules";
import { invalidateSalesQueries, persistMarkWinSale } from "@/lib/crm/persist-mark-win-sale";
import { isE2eMockAuth } from "@/lib/e2e";
import { isNegotiationUnassigned } from "@/lib/crm/negotiation-alerts";
import {
  canAtendimentoModifyNegotiation,
  canReleaseCrmNegotiationToPool,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import {
  customerStatusForNegotiationPause,
  negotiationCanPause,
  negotiationCanResume,
} from "@/lib/crm/negotiation-status";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type {
  CrmNegotiation,
  CrmTask,
  Customer,
  CustomerProfile,
  CustomerStatus,
  CustomerUpsertInput,
  InboxChat,
} from "@/types/domain";
import { MOCK_NEGOTIATIONS } from "@/data/crm-mock-negotiations";

const CRM_TASK_FORM_ASSIGNEE_NONE = "__none__";
const CRM_TASK_FORM_TEMPLATE_NONE = "__none__";

/** Formata um Date para o valor de um input datetime-local (hora local). */
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function daysSinceCreated(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function negotiationToPlaceholderCustomer(n: CrmNegotiation): Customer {
  let status: CustomerStatus = "ativo";
  if (n.status === "perdido") {
    status = "bloqueado";
  } else if (n.status === "pausado") {
    status = "inativo";
  }

  let perfil: CustomerProfile = "C";
  if (n.qualification >= 4) {
    perfil = "A";
  } else if (n.qualification >= 2) {
    perfil = "B";
  }

  return {
    id: `__crm_negotiation__${n.id}`,
    nome: n.title,
    telefone: "",
    perfil,
    rota: "",
    ultimoPedido: new Date().toISOString().slice(0, 10),
    status,
    email: "",
    cnpj: "",
    endereco: "",
    vendedor: "",
    ticketMedio: 0,
    frequenciaCompra: "—",
    totalGasto: n.totalValue,
    cadastradoEm: n.createdAt.slice(0, 10),
  };
}

function normalizeDigits(value?: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function digitsMatch(left?: string | null, right?: string | null) {
  const a = normalizeDigits(left);
  const b = normalizeDigits(right);
  if (!a || !b) {
    return false;
  }
  return (
    a === b ||
    a === b.replace(/^55/, "") ||
    b === a.replace(/^55/, "") ||
    a.endsWith(b) ||
    b.endsWith(a)
  );
}

function findCustomerChat(chats: InboxChat[] | undefined, customer?: Customer | null) {
  if (!customer || !chats?.length) {
    return null;
  }
  return (
    chats.find((c) => c.customerId === customer.id) ??
    chats.find((c) => c.remoteJid === customer.phoneJid) ??
    chats.find((c) => digitsMatch(c.remotePhoneDigits, customer.phoneDigits)) ??
    chats.find((c) => digitsMatch(c.remotePhoneE164, customer.phoneE164)) ??
    null
  );
}

function buildCustomerUpsertFromNegotiationLink(
  negotiation: CrmNegotiation,
  phone: string,
  email: string,
): CustomerUpsertInput {
  const today = new Date().toISOString().slice(0, 10);
  return {
    nome: negotiation.title.trim(),
    telefone: phone.trim(),
    email: email.trim(),
    cnpj: "",
    endereco: "",
    perfil: negotiation.qualification >= 4 ? "A" : negotiation.qualification >= 2 ? "B" : "C",
    rota: "",
    status: "ativo",
    vendedor: "",
    ultimoPedido: today,
    ticketMedio: 0,
    frequenciaCompra: "Quinzenal",
    totalGasto: negotiation.totalValue,
    cadastradoEm: today,
    sourceColumns: {
      [CRM_PIPELINE_STAGE_KEY]: negotiation.stageId,
      [CRM_FUNNEL_ID_KEY]: negotiation.funnelId,
    },
  };
}

function CrmNegotiationDetailContent({
  negotiation,
  isPersistedRow,
  sourceChatId,
}: {
  negotiation: CrmNegotiation;
  isPersistedRow: boolean;
  sourceChatId?: string | null;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const profileId = profile?.id;
  const canEditCrm = can("crm", "edit");
  const canDeleteCrm = can("crm", "delete");
  const queryClient = useQueryClient();
  const updateNegotiation = useUpdateCrmNegotiation();
  const claimCrmNegotiation = useClaimCrmNegotiation();
  const releaseCrmNegotiation = useReleaseCrmNegotiationToPool();
  const canReleaseToPool = canReleaseCrmNegotiationToPool(profile?.role);
  const updateCustomer = useUpdateCustomer();
  const createCustomer = useCreateCustomer();
  const createCrmTask = useCreateCrmTask();
  const updateCrmTask = useUpdateCrmTask();
  const deleteCrmTask = useDeleteCrmTask();
  const { data: crmTaskTemplates = [] } = useCrmTaskTemplates();

  const { data: effectiveCrmFunnels } = useEffectiveCrmFunnels();

  // Funil real da negociação (mesma fonte do Kanban) — o stepper deve refletir
  // as etapas configuradas, não um funil fixo legado.
  const negotiationFunnel = useMemo(
    () =>
      (effectiveCrmFunnels ?? []).find((f) => f.id === negotiation.funnelId) ??
      (effectiveCrmFunnels ?? [])[0],
    [effectiveCrmFunnels, negotiation.funnelId],
  );

  const pipelineStages = useMemo(
    () => (negotiationFunnel?.stages ?? []).map((s) => ({ key: s.id, label: s.title })),
    [negotiationFunnel],
  );

  // Lead score com contexto do funil real (mediana + probabilidade da etapa).
  // Mesma cache do Kanban — geralmente já está aquecida ao chegar no detalhe.
  const { data: funnelNegData } = useCrmNegotiations(
    { funnelId: negotiation.funnelId },
    { enabled: isPersistedRow && isSupabaseConfigured },
  );

  const funnelNegRecords = useMemo(() => {
    return funnelNegData?.pages.flatMap((p) => p.data) ?? [];
  }, [funnelNegData]);
  const leadScoreResult = useMemo(() => {
    const stages = negotiationFunnel?.stages ?? [];
    const ctx = buildScoringContext(
      funnelNegRecords.map((r) => ({ totalValue: r.totalValue, status: r.status })),
      stages,
    );
    return computeLeadScore(negotiation, {
      funnelMedianValue: ctx.funnelMedianValue,
      stageProbabilityPct: ctx.stageProbabilities.get(negotiation.stageId) ?? null,
    });
  }, [funnelNegRecords, negotiation, negotiationFunnel]);

  const resolvedPipelineIndex = useMemo(() => {
    const stages = negotiationFunnel?.stages ?? [];
    if (!stages.length) {
      return 0;
    }
    const idx = stages.findIndex((s) => s.id === negotiation.stageId);
    if (idx >= 0) {
      return idx;
    }
    if (negotiation.status === "perdido") {
      const lostIdx = stages.findIndex((s) => s.isLostStage || s.id === "perdido");
      if (lostIdx >= 0) {
        return lostIdx;
      }
    }
    return 0;
  }, [negotiationFunnel, negotiation]);

  const taskIntegration = isPersistedRow && isSupabaseConfigured;
  const { data: crmTasksByNegotiation = [], isLoading: crmTasksNegLoading } = useCrmTasksForNegotiation(
    negotiation.id,
    {
      enabled: taskIntegration,
    },
  );
  const { data: crmTasksCustomerUnlinked = [], isLoading: crmTasksOrphansLoading } = useCrmTasksForCustomer(
    negotiation.customerId ?? undefined,
    {
      enabled: taskIntegration && Boolean(negotiation.customerId),
      negotiationUnlinkedOnly: true,
    },
  );
  const crmTasksLoading = crmTasksNegLoading || crmTasksOrphansLoading;
  const crmOpenTasksList = useMemo(
    () => mergeOpenCrmTasksForNegotiationView(crmTasksByNegotiation, crmTasksCustomerUnlinked),
    [crmTasksByNegotiation, crmTasksCustomerUnlinked],
  );

  const crmCompletedTasksList = useMemo(
    () => mergeCompletedCrmTasksForNegotiationView(crmTasksByNegotiation, crmTasksCustomerUnlinked),
    [crmTasksByNegotiation, crmTasksCustomerUnlinked],
  );

  const { data: tenantCollaborators = [] } = useTenantCollaborators({
    enabled: taskIntegration,
  });
  const crmTaskAssignees = useMemo(
    () =>
      tenantCollaborators.map((p) => ({
        id: p.id,
        nome: (p.nome?.trim() || p.email?.trim() || "Sem nome").trim(),
      })),
    [tenantCollaborators],
  );

  const commentMentionAttendants = useMemo(
    () =>
      tenantCollaborators
        .filter((p) => p.status === "active")
        .map((p) => ({
          id: p.id,
          name: (p.nome?.trim() || p.email?.trim() || "Sem nome").trim(),
        })),
    [tenantCollaborators],
  );

  const canModifyNegotiation = canAtendimentoModifyNegotiation(
    profile?.role,
    negotiation.assigneeId,
    profileId,
  );
  const canManageCrm = canEditCrm && canModifyNegotiation;

  const showClaimNegotiation =
    isPersistedRow && isSupabaseConfigured && Boolean(profileId) && isNegotiationUnassigned(negotiation.assigneeId);

  const showReleaseNegotiation =
    isPersistedRow &&
    isSupabaseConfigured &&
    canReleaseToPool &&
    negotiation.status === "em_andamento" &&
    !isNegotiationUnassigned(negotiation.assigneeId);

  const negotiationAssigneeLabel = useMemo(() => {
    if (isNegotiationUnassigned(negotiation.assigneeId)) {
      return "Pool (sem responsável)";
    }
    const id = negotiation.assigneeId?.trim();
    if (!id) {
      return "Pool (sem responsável)";
    }
    return crmTaskAssignees.find((a) => a.id === id)?.nome ?? id;
  }, [crmTaskAssignees, negotiation.assigneeId]);

  const handleClaimNegotiation = async () => {
    if (!profileId || !isPersistedCrmNegotiationId(negotiation.id)) {
      return;
    }
    try {
      await claimCrmNegotiation.mutateAsync(negotiation.id);
      toast({
        title: "Negócio assumido",
        description: `Você é o responsável por "${negotiation.title}".`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível assumir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleReleaseNegotiation = async () => {
    if (!canReleaseToPool || !isPersistedCrmNegotiationId(negotiation.id)) {
      return;
    }
    if (isNegotiationUnassigned(negotiation.assigneeId)) {
      return;
    }
    try {
      await releaseCrmNegotiation.mutateAsync(negotiation.id);
      toast({
        title: "Devolvido ao pool",
        description: `"${negotiation.title}" está sem responsável.`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível devolver",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const { data: linkedCustomer } = useCustomer(negotiation.customerId, {
    enabled: Boolean(negotiation.customerId) && isPersistedRow,
  });

  // Só a(s) conversa(s) deste cliente — antes carregava o inbox inteiro (até 500).
  const { data: chats = [] } = useInboxChats(
    { customerId: negotiation.customerId ?? undefined, limit: 10 },
    { enabled: Boolean(linkedCustomer) && Boolean(negotiation.customerId) && isPersistedRow },
  );

  const [pipelineActiveIndex, setPipelineActiveIndex] = useState(resolvedPipelineIndex);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkPhone, setLinkPhone] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDueLocal, setTaskDueLocal] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState("");
  const [taskClientOnly, setTaskClientOnly] = useState(false);
  const [taskTemplateId, setTaskTemplateId] = useState("");
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostDialogBlockCustomer, setLostDialogBlockCustomer] = useState(false);
  const [winDialogOpen, setWinDialogOpen] = useState(false);
  const taskAssigneeDefaultSeededRef = useRef(false);

  const { data: negotiationProductsForSale = [] } = useNegotiationProducts(
    isPersistedCrmNegotiationId(negotiation.id) ? negotiation.id : null,
  );
  const markWinInitialLines = useMemo(
    () =>
      negotiationProductsForSale
        .filter((p) => p.productId)
        .map((p) => ({ productId: p.productId as string, quantity: p.quantity, unitValue: p.unitPrice })),
    [negotiationProductsForSale],
  );

  useEffect(() => {
    setPipelineActiveIndex(resolvedPipelineIndex);
  }, [resolvedPipelineIndex]);

  useEffect(() => {
    if (searchParams.get("criarTarefa") !== "1") {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete("criarTarefa");
    setSearchParams(next, { replace: true });
    if (!canManageCrm) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    setTaskDialogOpen(true);
  }, [canManageCrm, searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (taskDialogOpen) {
      return;
    }
    setTaskTitle("");
    setTaskDueLocal("");
    setTaskNotes("");
    setTaskAssigneeId("");
    setTaskClientOnly(false);
    setTaskTemplateId("");
  }, [taskDialogOpen]);

  useEffect(() => {
    if (!taskDialogOpen) {
      taskAssigneeDefaultSeededRef.current = false;
      return;
    }
    if (taskAssigneeDefaultSeededRef.current || !crmTaskAssignees.length) {
      return;
    }
    taskAssigneeDefaultSeededRef.current = true;
    const fromCard = negotiation.assigneeId?.trim();
    if (fromCard && crmTaskAssignees.some((a) => a.id === fromCard)) {
      setTaskAssigneeId(fromCard);
    } else {
      setTaskAssigneeId("");
    }
  }, [taskDialogOpen, negotiation.assigneeId, crmTaskAssignees]);

  const placeholder = useMemo(() => negotiationToPlaceholderCustomer(negotiation), [negotiation]);

  const displayCustomer = useMemo(() => {
    if (linkedCustomer) {
      return linkedCustomer;
    }
    const base = placeholder;
    if (negotiation.status === "perdido") {
      return { ...base, status: "bloqueado" as const };
    }
    if (base.status === "bloqueado") {
      return { ...base, status: "ativo" as const };
    }
    return base;
  }, [linkedCustomer, negotiation.status, placeholder]);

  const daysContact = linkedCustomer
    ? getPipelineStateForCustomer(linkedCustomer).daysContact
    : daysSinceCreated(negotiation.createdAt);

  const qualificationStars = Math.min(5, Math.max(1, negotiation.qualification));

  const openCustomerInbox = () => {
    if (sourceChatId) {
      navigate(`/inbox?chatId=${encodeURIComponent(sourceChatId)}`);
      return;
    }
    if (!linkedCustomer) {
      navigate("/inbox");
      return;
    }
    const chat = findCustomerChat(chats, linkedCustomer);
    const params = new URLSearchParams();
    if (chat?.id) {
      params.set("chatId", chat.id);
    }
    params.set("customerId", linkedCustomer.id);
    const phone = linkedCustomer.phoneDigits ?? linkedCustomer.telefone;
    if (phone) {
      params.set("search", phone);
    }
    navigate({ pathname: "/inbox", search: params.toString() });
  };

  const handleTogglePauseNegotiation = async () => {
    if (!canManageCrm) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!isPersistedRow && !isE2eMockAuth) {
      toast({
        title: "Pausar negócio",
        description: "Vincule a um cliente na base para persistir no CRM.",
      });
      return;
    }
    const nextStatus =
      negotiationCanResume(negotiation.status) ? "em_andamento" : "pausado";
    if (!negotiationCanPause(negotiation.status) && !negotiationCanResume(negotiation.status)) {
      return;
    }
    try {
      await updateNegotiation.mutateAsync({
        id: negotiation.id,
        patch: { status: nextStatus },
      });
      if (linkedCustomer) {
        const customerStatus = customerStatusForNegotiationPause(
          nextStatus,
          linkedCustomer.status,
        );
        await syncLinkedCustomer(linkedCustomer, {
          ...(customerStatus !== undefined ? { status: customerStatus } : {}),
          stageKey: negotiation.stageId,
          funnelId: negotiation.funnelId,
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

  const syncLinkedCustomer = async (
    customer: Customer,
    next: { status?: CustomerStatus; stageKey: string; funnelId: string },
  ) => {
    await updateCustomer.mutateAsync({
      id: customer.id,
      input: {
        ...toCustomerUpsertInput(customer),
        ...(next.status !== undefined ? { status: next.status } : {}),
        sourceColumns: {
          ...customer.sourceColumns,
          [CRM_PIPELINE_STAGE_KEY]: next.stageKey,
          [CRM_FUNNEL_ID_KEY]: next.funnelId,
        },
      },
    });
  };

  const heroStageTitle = useMemo(() => {
    const stages = negotiationFunnel?.stages ?? [];
    const direct = stages.find((s) => s.id === negotiation.stageId)?.title;
    if (direct) return direct;
    if (negotiation.status === "perdido") {
      const lost = stages.find((s) => s.isLostStage || s.id === "perdido");
      if (lost) return lost.title;
    }
    if (negotiation.status === "vendido") {
      const sale = stages.find((s) => s.isSaleStage || s.id === "venda");
      if (sale) return sale.title;
    }
    return negotiation.stageId;
  }, [negotiation.stageId, negotiation.status, negotiationFunnel]);

  const { data: tenantSettingsForHero } = useTenantSettings();
  const heroStaleDays = useMemo(
    () => normalizeStaleNegotiationDays(tenantSettingsForHero?.staleNegotiationDays),
    [tenantSettingsForHero?.staleNegotiationDays],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {negotiation.customerId ? <LegalCustomerCaseLink customerId={negotiation.customerId} negotiationId={isPersistedRow ? negotiation.id : undefined} /> : null}
      <ClienteRdPerfilView
        cliente={displayCustomer}
        daysContact={daysContact}
        pipelineActiveIndex={pipelineActiveIndex}
        pipelineStages={pipelineStages.length ? pipelineStages : undefined}
        funnelLabel={negotiationFunnel?.listName}
        negotiationStatus={isPersistedRow ? negotiation.status : undefined}
        onTogglePauseNegotiation={
          isPersistedRow || isE2eMockAuth ? () => void handleTogglePauseNegotiation() : undefined
        }
        pauseTogglePending={updateNegotiation.isPending || updateCustomer.isPending}
        qualificationStars={qualificationStars}
        negotiationPanelSnapshot={
          taskIntegration && isPersistedCrmNegotiationId(negotiation.id)
            ? {
                assigneeId: negotiation.assigneeId ?? "",
                qualification: negotiation.qualification,
                totalValue: negotiation.totalValue,
                closingForecast: negotiation.closingForecast ?? null,
                createdAt: negotiation.createdAt,
                otherInfo: negotiation.otherInfo ?? {},
              }
            : undefined
        }
        onSaveNegotiationPanel={
          taskIntegration && isPersistedCrmNegotiationId(negotiation.id)
            ? async (payload) => {
                try {
                  const closingIso =
                    payload.closingForecastLocal.trim() &&
                    !Number.isNaN(new Date(payload.closingForecastLocal).getTime())
                      ? new Date(payload.closingForecastLocal).toISOString()
                      : null;
                  await updateNegotiation.mutateAsync({
                    id: negotiation.id,
                    patch: {
                      title: payload.nome.trim(),
                      assigneeId: payload.assigneeId,
                      qualification: payload.qualification,
                      totalValue: payload.totalValue,
                      closingForecast: closingIso,
                    },
                  });
                  if (linkedCustomer) {
                    await updateCustomer.mutateAsync({
                      id: linkedCustomer.id,
                      input: {
                        ...toCustomerUpsertInput(linkedCustomer),
                        nome: payload.nome.trim(),
                        telefone: payload.telefone.trim(),
                        email: payload.email.trim(),
                        origem: payload.origem === "" ? undefined : payload.origem,
                        totalGasto: payload.totalValue,
                        sourceColumns: {
                          ...linkedCustomer.sourceColumns,
                          campanha: payload.campanha,
                        },
                      },
                    });
                  }
                  toast({ title: "Negociação", description: "Dados salvos." });
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
        negotiationPanelCustomerLinked={Boolean(linkedCustomer)}
        negotiationPanelSavePending={updateNegotiation.isPending || updateCustomer.isPending}
        negotiationReadOnly={!canManageCrm}
        customerActionsDisabled={!canManageCrm}
        crmActionsDisabled={!canManageCrm}
        mainTabDefault={searchParams.get("criarTarefa") === "1" ? "tarefas" : "historico"}
        onBack={() => navigate("/crm")}
        onRefresh={() => {
          if (isPersistedRow) {
            void queryClient.invalidateQueries({ queryKey: ["crm-negotiations", negotiation.id] });
            void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
            void queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
          }
          if (negotiation.customerId) {
            void queryClient.invalidateQueries({ queryKey: ["customers", negotiation.customerId] });
          }
          toast({
            title: "Atualizado",
            description: isPersistedRow ? "Negociação e cliente sincronizados." : "Dados de demonstração do quadro CRM.",
          });
        }}
        crmOpenTasks={taskIntegration ? crmOpenTasksList : undefined}
        crmCompletedTasks={taskIntegration ? crmCompletedTasksList : undefined}
        crmTaskScopeLabelMode={taskIntegration ? "negotiation-merge" : undefined}
        crmTasksLoading={taskIntegration ? crmTasksLoading : false}
        crmTaskAssignees={taskIntegration ? crmTaskAssignees : undefined}
        onCompleteCrmTask={(taskId) => {
          if (!taskIntegration || !canManageCrm) {
            if (!canManageCrm) {
              toast({
                title: "Assuma o negócio",
                description: negotiationAssigneeBlockedMessage(),
                variant: "destructive",
              });
            }
            return;
          }
          void (async () => {
            const merged = [...crmTasksByNegotiation, ...crmTasksCustomerUnlinked];
            const t = merged.find((x) => x.id === taskId);
            try {
              await updateCrmTask.mutateAsync({
                id: taskId,
                patch: { status: "concluida" },
                negotiationId: t?.negotiationId ?? null,
                customerId: t?.customerId ?? negotiation.customerId ?? null,
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
        }}
        onReopenCrmTask={
          taskIntegration && canManageCrm
            ? (taskId) => {
                void (async () => {
                  const merged = [...crmTasksByNegotiation, ...crmTasksCustomerUnlinked];
                  const t = merged.find((x) => x.id === taskId);
                  try {
                    await updateCrmTask.mutateAsync({
                      id: taskId,
                      patch: { status: "aberta" },
                      negotiationId: t?.negotiationId ?? null,
                      customerId: t?.customerId ?? negotiation.customerId ?? null,
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
          taskIntegration && canManageCrm && canDeleteCrm
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
          taskIntegration && canManageCrm
            ? async ({ id: taskId, patch }) => {
                const merged = [...crmTasksByNegotiation, ...crmTasksCustomerUnlinked];
                const t = merged.find((x) => x.id === taskId);
                try {
                  await updateCrmTask.mutateAsync({
                    id: taskId,
                    patch,
                    negotiationId: t?.negotiationId ?? null,
                    customerId: t?.customerId ?? negotiation.customerId ?? null,
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
        onMarkLoss={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (!isPersistedRow && !isE2eMockAuth) {
            toast({
              title: "Marcar perda",
              description: "Vincule a um cliente na base para registrar a perda no CRM.",
            });
            return;
          }
          if (linkedCustomer?.status === "bloqueado") {
            toast({
              title: "Negociação",
              description: "O cliente já está bloqueado.",
            });
            return;
          }
          setLostDialogBlockCustomer(false);
          setLostDialogOpen(true);
        }}
        onMarkWin={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (!isPersistedRow && !isE2eMockAuth) {
            toast({
              title: "Marcar venda",
              description: "Registre a venda na área CRM ao expandir o cadastro ou crie o cliente em Clientes.",
            });
            return;
          }
          if (isNegotiationUnassigned(negotiation.assigneeId)) {
            toast({
              title: "Sem responsável",
              description: saleAttendantBlockedMessage("crm"),
              variant: "destructive",
            });
            return;
          }
          setWinDialogOpen(true);
        }}
        onEdit={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (linkedCustomer) {
            navigate(`/clientes/${linkedCustomer.id}`);
            return;
          }
          if (isPersistedRow && isSupabaseConfigured && !negotiation.customerId) {
            setLinkDialogOpen(true);
            return;
          }
          navigate("/clientes");
        }}
        onOpenInbox={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          openCustomerInbox();
        }}
        onBlock={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (!isPersistedRow || !linkedCustomer) {
            toast({
              title: "Bloquear",
              description: "Crie e vincule um cliente para bloquear o cadastro a partir desta negociação.",
            });
            return;
          }
          if (linkedCustomer.status === "bloqueado") {
            toast({ title: "Cliente", description: "Já está bloqueado." });
            return;
          }
          setLostDialogBlockCustomer(true);
          setLostDialogOpen(true);
        }}
        onCreateNote={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (linkedCustomer) {
            navigate(`/clientes/${linkedCustomer.id}`);
            return;
          }
          toast({
            title: "Anotação",
            description: "Crie e vincule um cliente para editar observações no cadastro.",
          });
        }}
        onCreateTask={() => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (taskIntegration) {
            setTaskDialogOpen(true);
            return;
          }
          toast({
            title: "Tarefas",
            description: "Salve a negociação no Supabase para criar tarefas vinculadas.",
          });
        }}
        negotiationAssigneeLabel={negotiationAssigneeLabel}
        showClaimNegotiation={showClaimNegotiation}
        onClaimNegotiation={() => void handleClaimNegotiation()}
        claimNegotiationPending={claimCrmNegotiation.isPending}
        showReleaseNegotiation={showReleaseNegotiation}
        onReleaseNegotiation={() => void handleReleaseNegotiation()}
        releaseNegotiationPending={releaseCrmNegotiation.isPending}
        negotiationDocumentsSlot={
          isPersistedRow && isSupabaseConfigured && isPersistedCrmNegotiationId(negotiation.id) ? (
            <CrmNegotiationDocumentsSection
              negotiationId={negotiation.id}
              enabled={taskIntegration}
              readOnly={!canManageCrm}
            />
          ) : undefined
        }
        negotiationProductsSlot={
          isPersistedRow && isSupabaseConfigured && isPersistedCrmNegotiationId(negotiation.id) ? (
            <NegotiationProductsEditor
              negotiationId={negotiation.id}
              readOnly={!canManageCrm}
              negotiationTotalValue={negotiation.totalValue}
            />
          ) : undefined
        }
        negotiationCallsSlot={
          isPersistedRow && isSupabaseConfigured ? (
            <div className="space-y-3">
              <div className="flex justify-end">
                <CallButton
                  phone={
                    linkedCustomer?.phoneE164 ||
                    linkedCustomer?.phoneDigits ||
                    linkedCustomer?.telefone ||
                    null
                  }
                  customerId={negotiation.customerId}
                  chatId={sourceChatId ?? null}
                  negotiationId={isPersistedCrmNegotiationId(negotiation.id) ? negotiation.id : null}
                  disabled={!canManageCrm}
                  variant="default"
                />
              </div>
              <CallLogsPanel
                scope={{
                  customerId: negotiation.customerId,
                  negotiationId: isPersistedCrmNegotiationId(negotiation.id) ? negotiation.id : null,
                  chatId: sourceChatId ?? null,
                }}
              />
            </div>
          ) : undefined
        }
        negotiationCommentsSlot={
          isPersistedRow && isSupabaseConfigured ? (
            <NegotiationCommentsPanel
              negotiationId={negotiation.id}
              attendants={commentMentionAttendants}
              leadScore={leadScoreResult}
              changeHistorySlot={
                <NegotiationChangeHistoryPanel
                  negotiationId={negotiation.id}
                  attendants={commentMentionAttendants}
                  customers={
                    linkedCustomer
                      ? [{ id: linkedCustomer.id, nome: linkedCustomer.nome ?? "" }]
                      : []
                  }
                  stages={(negotiationFunnel?.stages ?? []).map((s) => ({
                    id: s.id,
                    title: s.title,
                  }))}
                />
              }
            />
          ) : undefined
        }
        onPipelineStageChange={(idx) => {
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          const stage = negotiationFunnel?.stages[idx];
          if (!stage) {
            return;
          }
          const isSaleStage = stage.isSaleStage || stage.id === "venda";
          const isLostStage = stage.isLostStage || stage.id === "perdido";

          if (isSaleStage) {
            if (isNegotiationUnassigned(negotiation.assigneeId)) {
              toast({
                title: "Sem responsável",
                description: saleAttendantBlockedMessage("crm"),
                variant: "destructive",
              });
              return;
            }
            if (
              !negotiationHasCompletedSale({
                status: negotiation.status,
                totalValue: negotiation.totalValue,
              })
            ) {
              setWinDialogOpen(true);
              return;
            }
          }

          if (isLostStage) {
            if (negotiation.status === "perdido") {
              setPipelineActiveIndex(idx);
              return;
            }
            if (!isPersistedRow && !isE2eMockAuth) {
              toast({
                title: "Marcar perda",
                description: "Vincule a um cliente na base para registrar a perda no CRM.",
              });
              return;
            }
            setLostDialogBlockCustomer(false);
            setLostDialogOpen(true);
            return;
          }

          setPipelineActiveIndex(idx);
          const label = stage.title;
          if (isPersistedRow) {
            void (async () => {
              try {
                const patch: CrmNegotiationPatch = { stageId: stage.id };
                if (negotiation.status === "perdido") {
                  patch.status = "em_andamento";
                  patch.lostReason = null;
                } else if (negotiation.status === "pausado") {
                  patch.status = "em_andamento";
                }

                // Tarefa pronta vinculada à etapa de destino (não duplica se já houver aberta do mesmo modelo).
                if (stage.taskTemplateId) {
                  const tpl = crmTaskTemplates.find((t) => t.id === stage.taskTemplateId);
                  if (tpl) {
                    const created = await createStageTemplateTask({
                      negotiationId: negotiation.id,
                      customerId: negotiation.customerId ?? null,
                      assigneeId: negotiation.assigneeId ?? null,
                      template: {
                        id: tpl.id,
                        title: tpl.title,
                        notes: tpl.notes,
                        defaultDueDays: tpl.defaultDueDays,
                      },
                    });
                    if (created) {
                      void queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
                      void queryClient.invalidateQueries({ queryKey: ["crm-negotiations", negotiation.id] });
                      void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
                    }
                  }
                }

                await updateNegotiation.mutateAsync({ id: negotiation.id, patch });
                if (linkedCustomer) {
                  const nextStatus: CustomerStatus =
                    linkedCustomer.status === "bloqueado" ? "ativo" : linkedCustomer.status;
                  await syncLinkedCustomer(linkedCustomer, {
                    status: nextStatus,
                    stageKey: stage.id,
                    funnelId: negotiation.funnelId,
                  });
                }
                toast({ title: "Funil atualizado", description: `Etapa: ${label}` });
              } catch (e) {
                toast({
                  title: "Não foi possível salvar",
                  description: e instanceof Error ? e.message : "Tente novamente.",
                  variant: "destructive",
                });
              }
            })();
            return;
          }
          toast({
            title: "Funil (demonstração)",
            description: `Etapa: ${label}. Abra um cliente em Clientes para persistir.`,
          });
        }}
      />

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent className="border-[var(--crm-border-2)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>
              {taskClientOnly && negotiation.customerId
                ? "Tarefa global do cliente: vale para o prazo de todas as negociações deste cadastro."
                : `A tarefa fica vinculada a esta negociação${
                    negotiation.customerId ? " e ao cliente associado" : ""
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {crmTaskTemplates.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="crm-task-template">Tarefa pronta (opcional)</Label>
                <Select
                  value={taskTemplateId.trim() ? taskTemplateId : CRM_TASK_FORM_TEMPLATE_NONE}
                  onValueChange={(v) => {
                    if (v === CRM_TASK_FORM_TEMPLATE_NONE) {
                      setTaskTemplateId("");
                      return;
                    }
                    const tpl = crmTaskTemplates.find((t) => t.id === v);
                    if (!tpl) {
                      return;
                    }
                    setTaskTemplateId(tpl.id);
                    setTaskTitle(tpl.title);
                    setTaskNotes(tpl.notes ?? "");
                    if (tpl.defaultDueDays != null) {
                      const due = new Date();
                      due.setDate(due.getDate() + tpl.defaultDueDays);
                      setTaskDueLocal(toDateTimeLocalValue(due));
                    }
                  }}
                >
                  <SelectTrigger id="crm-task-template" className="border-[var(--crm-border-2)]">
                    <SelectValue placeholder="Escolher um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CRM_TASK_FORM_TEMPLATE_NONE}>Sem modelo</SelectItem>
                    {crmTaskTemplates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="crm-task-title">Título</Label>
              <Input
                id="crm-task-title"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex.: Ligar para confirmar proposta"
                className="border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-due">Prazo (opcional)</Label>
              <Input
                id="crm-task-due"
                type="datetime-local"
                value={taskDueLocal}
                onChange={(e) => setTaskDueLocal(e.target.value)}
                className="border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-notes">Observações (opcional)</Label>
              <Textarea
                id="crm-task-notes"
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                rows={3}
                className="resize-none border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="crm-task-assignee">Responsável (opcional)</Label>
              <Select
                value={taskAssigneeId.trim() ? taskAssigneeId : CRM_TASK_FORM_ASSIGNEE_NONE}
                onValueChange={(v) => setTaskAssigneeId(v === CRM_TASK_FORM_ASSIGNEE_NONE ? "" : v)}
              >
                <SelectTrigger id="crm-task-assignee" className="border-[var(--crm-border-2)]">
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
            {negotiation.customerId ? (
              <div className="flex items-start gap-3 rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface)] p-3">
                <Checkbox
                  id="crm-task-client-only"
                  checked={taskClientOnly}
                  onCheckedChange={(c) => setTaskClientOnly(c === true)}
                  className="mt-0.5 border-[var(--crm-ink-3)]"
                />
                <label htmlFor="crm-task-client-only" className="cursor-pointer text-sm leading-snug text-[var(--crm-ink-2)]">
                  Somente cliente (sem vínculo com esta negociação). O prazo entra no rollup de todas as negociações
                  deste cadastro.
                </label>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setTaskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[var(--crm-brand)] hover:bg-[var(--crm-brand-strong)]"
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
                  try {
                    const clientOnly = Boolean(taskClientOnly && negotiation.customerId);
                    await createCrmTask.mutateAsync({
                      title,
                      negotiationId: clientOnly ? null : negotiation.id,
                      customerId: negotiation.customerId ?? null,
                      assigneeId: taskAssigneeId.trim() || null,
                      dueAt: taskDueLocal ? new Date(taskDueLocal).toISOString() : null,
                      notes: taskNotes.trim(),
                      templateId: taskTemplateId.trim() || null,
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

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="border-[var(--crm-border-2)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar e vincular cliente</DialogTitle>
            <DialogDescription>
              Será criado um cadastro com o nome da negociação ({negotiation.title}) e vinculado a este card. O telefone
              é obrigatório.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="link-phone">Telefone (WhatsApp)</Label>
              <Input
                id="link-phone"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                placeholder="5511999990000"
                className="border-[var(--crm-border-2)]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="link-email">E-mail (opcional)</Label>
              <Input
                id="link-email"
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="contato@empresa.com"
                className="border-[var(--crm-border-2)]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-[var(--crm-brand)] hover:bg-[var(--crm-brand-strong)]"
              disabled={createCustomer.isPending || updateNegotiation.isPending}
              onClick={() => {
                if (!canManageCrm) {
                  toast({
                    title: "Assuma o negócio",
                    description: negotiationAssigneeBlockedMessage(),
                    variant: "destructive",
                  });
                  return;
                }
                void (async () => {
                  const phone = linkPhone.trim();
                  if (!phone) {
                    toast({
                      title: "Telefone obrigatório",
                      description: "Informe o telefone para criar o cliente.",
                      variant: "destructive",
                    });
                    return;
                  }
                  try {
                    const input = buildCustomerUpsertFromNegotiationLink(negotiation, phone, linkEmail.trim());
                    const created = await createCustomer.mutateAsync(input);
                    await updateNegotiation.mutateAsync({
                      id: negotiation.id,
                      patch: { customerId: created.id },
                    });
                    setLinkPhone("");
                    setLinkEmail("");
                    setLinkDialogOpen(false);
                    toast({
                      title: "Cliente vinculado",
                      description: `${created.nome} foi criado e associado à negociação.`,
                    });
                  } catch (e) {
                    toast({
                      title: "Não foi possível concluir",
                      description: e instanceof Error ? e.message : "Tente novamente.",
                      variant: "destructive",
                    });
                  }
                })();
              }}
            >
              {createCustomer.isPending || updateNegotiation.isPending ? "Salvando…" : "Criar e vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MarkWinDialog
        open={winDialogOpen}
        onOpenChange={setWinDialogOpen}
        initialValue={negotiation.totalValue}
        initialLines={markWinInitialLines}
        pending={updateNegotiation.isPending || updateCustomer.isPending}
        onConfirm={async ({ lines, totalValue, paymentMethod }) => {
          const lineError = validateMarkWinLines(lines);
          if (lineError) {
            toast({ title: "Venda incompleta", description: lineError, variant: "destructive" });
            return;
          }
          if (!canManageCrm) {
            toast({
              title: "Assuma o negócio",
              description: negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (isNegotiationUnassigned(negotiation.assigneeId)) {
            toast({
              title: "Sem responsável",
              description: saleAttendantBlockedMessage("crm"),
              variant: "destructive",
            });
            return;
          }
          try {
            if (isE2eMockAuth && !isPersistedRow) {
              setPipelineActiveIndex(4);
              toast({ title: "Marcar venda", description: "Negociação atualizada." });
              return;
            }
            const saleStageId = resolveConfiguredSaleStageId(
              effectiveCrmFunnels,
              negotiation.funnelId,
            );
            await updateNegotiation.mutateAsync({
              id: negotiation.id,
              patch: { status: "vendido", stageId: saleStageId, totalValue },
            });
            if (isSupabaseConfigured) {
              const soldBy = negotiation.assigneeId?.trim() || profileId;
              if (soldBy) {
                await persistMarkWinSale({
                  chatId: sourceChatId ?? null,
                  customerId: negotiation.customerId ?? null,
                  soldBy,
                  lines,
                  paymentMethod,
                });
                invalidateSalesQueries(queryClient, negotiation.customerId);
              }
            }
            setPipelineActiveIndex(4);
            if (linkedCustomer) {
              const nextStatus: CustomerStatus =
                linkedCustomer.status === "bloqueado" ? "ativo" : linkedCustomer.status;
              await syncLinkedCustomer(linkedCustomer, {
                status: nextStatus,
                stageKey: saleStageId,
                funnelId: negotiation.funnelId,
              });
            }
            const money = formatBRL(totalValue);
            const itemsLabel =
              lines.length === 1 ? lines[0]?.productName : `${lines.length} itens`;
            toast({
              title: "Marcar venda",
              description: itemsLabel
                ? `${itemsLabel} — ${money}. ${
                    linkedCustomer ? "Funil do cliente atualizado." : "Negociação marcada como vendida."
                  }`
                : linkedCustomer
                  ? "Negociação e funil do cliente atualizados."
                  : "Negociação marcada como vendida.",
            });
          } catch (e) {
            toast({
              title: "Não foi possível salvar",
              description: e instanceof Error ? e.message : "Tente novamente.",
              variant: "destructive",
            });
            throw e;
          }
        }}
      />

      <MarkLostDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        title={lostDialogBlockCustomer ? "Bloquear cliente e marcar perda" : "Marcar como perdido"}
        pending={updateNegotiation.isPending || updateCustomer.isPending}
        onConfirm={async (lostReason) => {
          try {
            if (isE2eMockAuth && !isPersistedRow) {
              setPipelineActiveIndex(5);
              toast({ title: "Marcar perda", description: "Negociação atualizada." });
              return;
            }
            const lostStageId = resolveConfiguredLostStageId(
              effectiveCrmFunnels,
              negotiation.funnelId,
            );
            await updateNegotiation.mutateAsync({
              id: negotiation.id,
              patch: { status: "perdido", stageId: lostStageId, lostReason },
            });
            const lostIdx = (negotiationFunnel?.stages ?? []).findIndex((s) => s.id === lostStageId);
            setPipelineActiveIndex(lostIdx >= 0 ? lostIdx : 5);
            if (linkedCustomer) {
              await syncLinkedCustomer(linkedCustomer, {
                ...(lostDialogBlockCustomer ? { status: "bloqueado" as const } : {}),
                stageKey: lostStageId,
                funnelId: negotiation.funnelId,
              });
            }
            if (lostDialogBlockCustomer && linkedCustomer) {
              useAppStore.getState().addNotification({
                tipo: "aviso",
                titulo: "Cliente bloqueado",
                descricao: `${linkedCustomer.nome} foi bloqueado.`,
              });
              toast({ title: "Bloqueado", description: `${linkedCustomer.nome} foi bloqueado.` });
            } else {
              toast({
                title: "Marcar perda",
                description: linkedCustomer
                  ? "Negociação e funil do cliente atualizados."
                  : "Negociação atualizada.",
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
        }}
      />
    </div>
  );
}

export default function CrmNegotiationDetail() {
  const { negotiationId } = useParams<{ negotiationId: string }>();
  const navigate = useNavigate();
  const decoded = negotiationId ? decodeURIComponent(negotiationId) : "";
  const persisted = isPersistedCrmNegotiationId(decoded);

  const { data: dbRow, isLoading: dbLoading } = useCrmNegotiation(decoded || undefined, {
    enabled: persisted,
  });

  const mockNegotiation = useMemo(() => {
    if (!decoded) {
      return undefined;
    }
    return MOCK_NEGOTIATIONS.find((x) => x.id === decoded);
  }, [decoded]);

  const negotiation = useMemo(() => {
    if (dbRow) {
      return crmNegotiationRecordToCard(dbRow);
    }
    return mockNegotiation;
  }, [dbRow, mockNegotiation]);

  if (!negotiationId || !decoded) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        <p className="text-sm text-[var(--crm-ink-3)]">Negociação não encontrada.</p>
        <Button type="button" variant="outline" className="border-[var(--crm-border-2)]" onClick={() => navigate("/crm")}>
          Voltar ao CRM
        </Button>
      </div>
    );
  }

  if (persisted && dbLoading) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 items-center justify-center text-sm text-[var(--crm-ink-3)]"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        Carregando negociação…
      </div>
    );
  }

  if (!negotiation) {
    return (
      <div
        className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ backgroundColor: "var(--crm-surface-2)" }}
      >
        <p className="text-sm text-[var(--crm-ink-3)]">Negociação não encontrada.</p>
        <Button type="button" variant="outline" className="border-[var(--crm-border-2)]" onClick={() => navigate("/crm")}>
          Voltar ao CRM
        </Button>
      </div>
    );
  }

  return (
    <CrmNegotiationDetailContent
      negotiation={negotiation}
      isPersistedRow={persisted && Boolean(dbRow)}
      sourceChatId={dbRow?.sourceChatId}
    />
  );
}
