import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Link, useNavigate } from "react-router-dom";
import {
  AlignJustify,
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  ExternalLink,
  ClipboardCheck,
  ClipboardList,
  Footprints,
  Info,
  List,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  MessageCircle,
  TrendingUp,
  Trash2,
  Users,
  AlertTriangle,
  Bookmark,
  CalendarX2,
  Filter,
  Flame,
  Globe2,
  LayoutList,
  Lock,
  Pencil,
  Plus,
  Rows2,
  Rows3,
  Snowflake,
  Target,
  X,
} from "lucide-react";
import { CrmCreateNegotiationDialog } from "@/components/crm/CrmCreateNegotiationDialog";
import { CrmWhatsappPhoneDialog } from "@/components/crm/CrmWhatsappPhoneDialog";
import { AdvancedFilterDialog } from "@/components/crm/AdvancedFilterDialog";
import { LeadScoreBadge } from "@/components/crm/LeadScoreBadge";
import { NegotiationScoreCard } from "@/components/crm/NegotiationScoreCard";
import {
  decodeAdvancedFilter,
  encodeAdvancedFilter,
  evaluateAdvancedFilter,
  isAdvancedFilterActive,
  type AdvancedFilter,
} from "@/lib/crm/advanced-filter";
import {
  buildScoringContext,
  computeLeadScore,
  type LeadScoreResult,
} from "@/lib/crm/lead-score";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatBRL } from "@/lib/format";
import { CrmSearchInput } from "@/components/crm/CrmSearchInput";
import { CrmNegotiationAlertBadges } from "@/components/crm/CrmNegotiationAlertBadges";
import { MarkLostDialog } from "@/components/crm/MarkLostDialog";
import { MarkWinDialog, type MarkWinConfirm } from "@/components/crm/MarkWinDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { CrmNotificationsBell } from "@/components/crm/CrmNotificationsBell";
import {
  type CrmNegotiationPatch,
  type ListCrmNegotiationsFilters,
  updateCrmNegotiation as updateCrmNegotiationDirect,
  useAutoAssignPoolNegotiations,
  useClaimCrmNegotiation,
  useCreateCrmNegotiation,
  useCrmNegotiationFunnelRefs,
  useCrmNegotiations,
  useDeleteCrmNegotiation,
  useReleaseCrmNegotiationToPool,
  patchCrmNegotiationStageInCaches,
  useUpdateCrmNegotiation,
} from "@/lib/api/crm-negotiations";
import { useTenantCrmFunnelConfig } from "@/lib/api/crm-funnel-config";
import {
  type CrmSavedView,
  type CrmSavedViewFilters,
  type CrmSavedViewScope,
  useCrmSavedViews,
  useCrmSavedViewsRealtime,
  useCreateCrmSavedView,
  useDeleteCrmSavedView,
  useUpdateCrmSavedView,
} from "@/lib/api/crm-saved-views";
import { createStageTemplateTask } from "@/lib/api/crm-tasks";
import { useCrmTaskTemplates } from "@/lib/api/crm-task-templates";
import { useTenantSettings } from "@/lib/api/integrations";
import { useTenantCollaborators } from "@/lib/api/settings";
import {
  toCustomerUpsertInput,
  updateCustomer as updateCustomerDirect,

  useUpdateCustomer,
} from "@/lib/api/customers";
import { useCrmNegotiationStageOverrides, useUpsertCrmNegotiationStageOverride } from "@/lib/api/crm-kanban";
import { useKanbanTaskPreviews } from "@/lib/api/crm-kanban-tasks";
import {
  buildCustomerPhoneIndex,
  orderFunnelStages,
  readFunnelStageOrder,
  writeFunnelStageOrder,
} from "@/lib/crm/crm-kanban-card-accent";
import { canReleaseCrmNegotiationToPool } from "@/lib/crm/negotiation-assignee";
import {
  buildLinkedCustomerIdsForKanban,
  buildSyntheticCustomerNegotiationCards,
  dedupeNegotiationsForKanban,
  findNegotiationForCustomerInFunnel,
  crmNegotiationRecordToCard,
  isPersistedCrmNegotiationId,
  parseSyntheticCustomerCardId,
  resolveKanbanStageId,
} from "@/lib/crm/negotiation-model";
import {
  stageRequiredFields,
  validateNegotiationForStage,
} from "@/lib/crm/stage-requirements";
import {
  type CrmAlertsFilterMode,
  getNegotiationAlerts,
  isNegotiationUnassigned,
  negotiationMatchesAlertsFilter,
  normalizeStaleNegotiationDays,
} from "@/lib/crm/negotiation-alerts";
import {
  isLostDestinationStage,
  isSaleDestinationStage,
  negotiationHasCompletedSale,
  saleAttendantBlockedMessage,
  validateMarkWinLines,
} from "@/lib/crm/sale-rules";
import { invalidateSalesQueries, persistMarkWinSale } from "@/lib/crm/persist-mark-win-sale";
import {
  canAtendimentoModifyNegotiation,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import {
  buildInboxUrlForWhatsapp,
  openCrmWhatsappInbox,
  resolveCrmWhatsappOpenAction,
  resolveCustomerForNegotiation,
  type CrmWhatsappPhoneOption,
} from "@/lib/crm/crm-whatsapp-inbox";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { CrmFunnel, CrmStageDef } from "@/data/crm-funnels";
import {
  DEFAULT_CRM_FUNNELS,
  resolveConfiguredLostStageId,
  resolveConfiguredSaleStageId,
} from "@/data/crm-funnels";
import { E2E_POOL_NEGOTIATION } from "@/data/crm-e2e-fixtures";
import { MOCK_NEGOTIATIONS } from "@/data/crm-mock-negotiations";
import { isE2eMockAuth } from "@/lib/e2e";
import type { CrmNegotiation, CrmNegotiationStatus, Customer } from "@/types/domain";

export type { CrmNegotiation, CrmNegotiationStatus } from "@/types/domain";
export type { CrmFunnel } from "@/data/crm-funnels";

import {
  ALERTS_FILTER_IDS,
  appliedToOwnerDraft,
  type AppliedOwner,
  BASE_ATTENDANTS,
  type CardDensity,
  compareNegotiations,
  type CreationDateRangeIso,
  draftToApplied,
  formatIsoDateToBr,
  matchesOwner,
  negotiationNextTaskDueMeta,
  type OwnerDraft,
  parseDateRangeIso,
  resolveCustomerIdForNegotiation,
  SAVED_VIEWS,
  type SavedViewId,
  SCORE_FILTER_IDS,
  SCORE_FILTER_OPTIONS,
  type ScoreFilterMode,
  scoreFilterMatches,
  SORT_FILTER_IDS,
  SORT_OPTIONS,
  type SortId,
  STATUS_FILTER_IDS,
  STATUS_OPTIONS,
  statusLabel,
  stageTitleForNegotiation,
} from "./crm/board-helpers";
import { CrmPoolBadge, KanbanColumn } from "./crm/board-cards";
import { CrmListView } from "./crm/CrmListView";
import { useCrmBoardFilters } from "./crm/useCrmBoardFilters";

export default function Crm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  const profileId = profile?.id;
  const canEditCrm = can("crm", "edit");

  const { data: stageOverrides = {} } = useCrmNegotiationStageOverrides();
  const upsertStageOverride = useUpsertCrmNegotiationStageOverride();
  const updateCustomer = useUpdateCustomer();
  const updateCrmNegotiation = useUpdateCrmNegotiation();
  const createCrmNegotiation = useCreateCrmNegotiation();
  const { data: taskTemplates = [] } = useCrmTaskTemplates();
  const claimCrmNegotiation = useClaimCrmNegotiation();
  const releaseCrmNegotiation = useReleaseCrmNegotiationToPool();
  const deleteCrmNegotiation = useDeleteCrmNegotiation();
  const autoAssignPool = useAutoAssignPoolNegotiations();
  const canReleaseToPool = canReleaseCrmNegotiationToPool(profile?.role);
  const canDeleteNegotiation = profile?.role === "admin";
  const canCreateSharedView = profile?.role !== "atendimento";
  const canAutoAssignPool = canEditCrm && profile?.role !== "atendimento";

  // Vistas salvas customizadas (DB-backed) — Pacote 6.
  useCrmSavedViewsRealtime();
  const { data: dbSavedViews = [] } = useCrmSavedViews();
  const createCrmSavedView = useCreateCrmSavedView();
  const updateCrmSavedViewMut = useUpdateCrmSavedView();
  const deleteCrmSavedViewMut = useDeleteCrmSavedView();

  const tenantCrmFunnelConfigQuery = useTenantCrmFunnelConfig({
    enabled: isSupabaseConfigured,
  });
  const tenantFunnelsSaved = tenantCrmFunnelConfigQuery.data;
  const funnels = useMemo(
    () => tenantFunnelsSaved ?? DEFAULT_CRM_FUNNELS,
    [tenantFunnelsSaved],
  );
  const { data: collaborators = [] } = useTenantCollaborators({
    enabled: isSupabaseConfigured,
  });
  const { data: tenantSettings } = useTenantSettings();
  const staleNegotiationDays = useMemo(
    () => normalizeStaleNegotiationDays(tenantSettings?.staleNegotiationDays),
    [tenantSettings?.staleNegotiationDays],
  );

  const {
    funnelId,
    setFunnelId,
    funnel,
    appliedOwner,
    setAppliedOwner,
    statusFilter,
    setStatusFilter,
    alertsFilter,
    setAlertsFilter,
    scoreFilter,
    setScoreFilter,
    advancedFilter,
    setAdvancedFilter,
    creationDateFilter,
    setCreationDateFilter,
    searchQuery,
    setSearchQuery,
    searchInputResetKey,
    resetSearchInput,
    deferredSearchTerm,
    sortId,
    setSortId,
    view,
    setView,
    cardDensity,
    setCardDensity,
  } = useCrmBoardFilters(funnels);
  const handleSearchSubmit = useCallback((value: string) => {
    startTransition(() => setSearchQuery(value));
  }, [setSearchQuery]);
  const [cardContextMenu, setCardContextMenu] = useState<{
    card: CrmNegotiation;
    x: number;
    y: number;
  } | null>(null);
  const [stageOrder, setStageOrder] = useState<string[] | null>(() =>
    readFunnelStageOrder(funnelId),
  );
  useEffect(() => {
    setStageOrder(readFunnelStageOrder(funnelId));
  }, [funnelId]);
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [savedViewDialog, setSavedViewDialog] = useState<
    | { mode: "create"; name: string; scope: CrmSavedViewScope }
    | { mode: "edit"; id: string; name: string; scope: CrmSavedViewScope }
    | null
  >(null);
  const [savedViewDeleteTarget, setSavedViewDeleteTarget] = useState<CrmSavedView | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkStageOpen, setBulkStageOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkAssignSearch, setBulkAssignSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const crmListFilters = useMemo((): ListCrmNegotiationsFilters => {
    const f: ListCrmNegotiationsFilters = { funnelId };
    if (statusFilter !== "all") {
      f.status = statusFilter;
    }
    const range = creationDateFilter ? parseDateRangeIso(creationDateFilter) : null;
    if (range) {
      f.createdFromIso = range.from.toISOString();
      f.createdToIso = range.to.toISOString();
    }
    if (appliedOwner.mode === "pool") {
      f.unassignedOnly = true;
    } else if (appliedOwner.mode === "mine" && profileId) {
      f.assigneeIds = [profileId];
    } else if (appliedOwner.mode === "custom" && appliedOwner.ids.length > 0) {
      f.assigneeIds = appliedOwner.ids;
    }
    return f;
  }, [appliedOwner, creationDateFilter, funnelId, profileId, statusFilter]);

  const {
    data: negotiationsData,
    isLoading: negotiationsLoading,
    isError: negotiationsError,
    error: negotiationsErrorObj,
    refetch: refetchNegotiations,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useCrmNegotiations(crmListFilters);

  const dbRecords = useMemo(() => {
    return negotiationsData?.pages.flatMap((page) => page.data) ?? [];
  }, [negotiationsData]);

  const customers = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const record of dbRecords) {
      if (record.customer) {
        map.set(record.customer.id, record.customer);
      }
    }
    return Array.from(map.values());
  }, [dbRecords]);

  // WhatsApp do card: resolve a conversa sob demanda (sem pré-carregar o inbox).
  // Definido após `customers` porque o usa.
  const openWhatsappFromCard = useCallback(
    (card: CrmNegotiation, phone?: string) => {
      void (async () => {
        const customer = resolveCustomerForNegotiation(card, customers);

        if (phone) {
          await openCrmWhatsappInbox({ navigate, chats: undefined, card, customer, phone });
          return;
        }

        const action = resolveCrmWhatsappOpenAction({ card, customer });
        if (action.kind === "pick") {
          setWhatsappPhonePick({ card, options: action.options });
          return;
        }
        if (action.kind === "open") {
          await openCrmWhatsappInbox({ navigate, chats: undefined, card, customer, phone: action.phone });
          return;
        }
        if (action.kind === "open_chat") {
          navigate(buildInboxUrlForWhatsapp({ chatId: action.chatId }));
          return;
        }
        toast({ title: "WhatsApp indisponível", description: action.message, variant: "destructive" });
      })().catch((err) => {
        toast({
          title: "WhatsApp indisponível",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      });
    },
    [customers, navigate, toast],
  );

  const handleOpenWhatsappFromCard = useCallback(
    (card: CrmNegotiation) => {
      openWhatsappFromCard(card);
    },
    [openWhatsappFromCard],
  );
  const { data: negotiationFunnelRefs = [] } = useCrmNegotiationFunnelRefs({
    enabled: isSupabaseConfigured,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [winDialogOpen, setWinDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CrmNegotiation | null>(null);
  const [whatsappPhonePick, setWhatsappPhonePick] = useState<{
    card: CrmNegotiation;
    options: CrmWhatsappPhoneOption[];
  } | null>(null);
  const [e2eAssigneeOverrides, setE2eAssigneeOverrides] = useState<Record<string, string>>({});
  const [pendingLostDrag, setPendingLostDrag] = useState<{
    negId: string;
    card: CrmNegotiation;
    stageDropId: string;
    cid: string | null;
    stageTitle: string;
  } | null>(null);
  const [pendingWinDrag, setPendingWinDrag] = useState<{
    negId: string;
    card: CrmNegotiation;
    stageDropId: string;
    cid: string | null;
    stageTitle: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  /** Supabase: `crm_negotiations`. Sem Supabase: mocks + override local / `crm_negotiation_stages`. */
  const sourceNegotiations = useMemo(() => {
    const mergeMock = () => {
      const baseMocks = isE2eMockAuth
        ? [
            ...MOCK_NEGOTIATIONS.filter((n) => n.id !== E2E_POOL_NEGOTIATION.id),
            E2E_POOL_NEGOTIATION,
          ]
        : MOCK_NEGOTIATIONS;

      return baseMocks.map((n) => {
        let merged: CrmNegotiation = { ...n };
        if (profileId && n.id === "netoneto" && !isE2eMockAuth) {
          merged = { ...merged, assigneeId: profileId };
        }
        const e2eAssignee = e2eAssigneeOverrides[merged.id];
        if (e2eAssignee !== undefined) {
          merged = { ...merged, assigneeId: e2eAssignee };
        }
        const funnelDef = funnels.find((f) => f.id === merged.funnelId);
        const validStageIds = new Set((funnelDef?.stages ?? []).map((s) => s.id));
        const cid = resolveCustomerIdForNegotiation(merged, customers);
        const customer = cid ? customers.find((c) => c.id === cid) : undefined;
        const stageId = resolveKanbanStageId({
          base: merged,
          funnelId: merged.funnelId,
          validStageIds,
          customer,
          stageOverride: stageOverrides[merged.id],
          persisted: null,
          terminalStages: {
            lostStageId: resolveConfiguredLostStageId(funnels, merged.funnelId),
            saleStageId: resolveConfiguredSaleStageId(funnels, merged.funnelId),
          },
        });
        return { ...merged, stageId };
      });
    };

    if (!isSupabaseConfigured) {
      return mergeMock();
    }

    const persistedCards = dbRecords.map((row) => {
      const base = crmNegotiationRecordToCard(row);
      const funnelDef = funnels.find((f) => f.id === base.funnelId);
      const validStageIds = new Set((funnelDef?.stages ?? []).map((s) => s.id));
      const cid = row.customerId ?? resolveCustomerIdForNegotiation(base, customers);
      const customer = cid ? customers.find((c) => c.id === cid) : undefined;
      const stageId = resolveKanbanStageId({
        base,
        funnelId: base.funnelId,
        validStageIds,
        customer,
        stageOverride: stageOverrides[base.id],
        persisted: { funnelId: row.funnelId, stageId: row.stageId },
        terminalStages: {
          lostStageId: resolveConfiguredLostStageId(funnels, base.funnelId),
          saleStageId: resolveConfiguredSaleStageId(funnels, base.funnelId),
        },
      });
      return {
        ...base,
        stageId,
        customerId: row.customerId ?? base.customerId,
      };
    });

    return persistedCards;
  }, [customers, dbRecords, e2eAssigneeOverrides, funnelId, funnels, profileId, stageOverrides]);

  const attendants = useMemo(() => {
    if (isSupabaseConfigured) {
      return collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({
          id: c.id,
          name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim(),
        }));
    }
    const map = new Map<string, string>();
    for (const a of BASE_ATTENDANTS) {
      map.set(a.id, a.name);
    }
    if (profileId && profile?.nome) {
      map.set(profileId, profile.nome);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [collaborators, isSupabaseConfigured, profile?.nome, profileId]);

  // Callbacks estáveis p/ o card memoizado do Kanban (DraggableNegotiationCard).
  const handleOpenCustomerCard = useCallback(
    (customerId: string) => navigate(`/clientes/${customerId}`),
    [navigate],
  );
  const resolveAssigneeName = useCallback(
    (assigneeId: string) => attendants.find((a) => a.id === assigneeId)?.name?.trim() ?? null,
    [attendants],
  );

  const crmAttendantOptions = useMemo(() => {
    if (isSupabaseConfigured) {
      return collaborators
        .filter((c) => c.status === "active" && c.role === "atendimento")
        .map((c) => ({
          id: c.id,
          name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim(),
        }));
    }
    return attendants;
  }, [attendants, collaborators, isSupabaseConfigured]);

  const [funnelOpen, setFunnelOpen] = useState(false);
  const [filtersPopoverOpen, setFiltersPopoverOpen] = useState(false);
  // Toolbar mobile (md:hidden) e desktop (md:flex) montam ambas no DOM; popovers
  // controlados não podem dividir estado, senão abrem em duplicidade e brigam.
  const [funnelOpenMobile, setFunnelOpenMobile] = useState(false);
  const [filtersPopoverOpenMobile, setFiltersPopoverOpenMobile] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState<OwnerDraft>({ mode: "all", customIds: new Set() });
  const [ownerSearch, setOwnerSearch] = useState("");


  // Atalho "/" foca a busca quando o usuário não está digitando em outro input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Realtime para crm_negotiations / tenant_crm_funnel_config é tratado
  // globalmente em useCrmRealtimeSync, montado via CrmNotificationListener.

  const onOwnerOpenChange = useCallback(
    (open: boolean) => {
      setOwnerOpen(open);
      if (open) {
        setOwnerDraft(appliedToOwnerDraft(appliedOwner));
        setOwnerSearch("");
      }
    },
    [appliedOwner],
  );

  const clearAllCrmFilters = useCallback(() => {
    setCreationDateFilter(null);
    setAppliedOwner({ mode: "all" });
    setStatusFilter("all");
    setAlertsFilter("off");
    setScoreFilter("all");
    resetSearchInput("");
    setAdvancedFilter(null);
    toast({ title: "Filtros limpos", description: "Exibindo todas as negociações do funil." });
  }, [
    toast,
    setAdvancedFilter,
    setAlertsFilter,
    setAppliedOwner,
    setCreationDateFilter,
    setScoreFilter,
    resetSearchInput,
    setStatusFilter,
  ]);

  const applySavedView = useCallback(
    (viewId: SavedViewId) => {
      // Vista 1: minhas quentes — em andamento, comigo, qualif. alta primeiro.
      // Vista 2: fechando logo — em andamento, próx. data de fechamento.
      // Vista 3: negócios frios — só com alerta de "parado", contato mais antigo no topo.
      if (viewId === "hot") {
        setAppliedOwner(profileId ? { mode: "mine" } : { mode: "all" });
        setStatusFilter("em_andamento");
        setAlertsFilter("off");
        setSortId("qualified_desc");
      } else if (viewId === "closing") {
        setAppliedOwner({ mode: "all" });
        setStatusFilter("em_andamento");
        setAlertsFilter("off");
        setSortId("closing");
      } else if (viewId === "cold") {
        setAppliedOwner({ mode: "all" });
        setStatusFilter("em_andamento");
        setAlertsFilter("stale");
        setSortId("contact_oldest");
      }
      setCreationDateFilter(null);
      resetSearchInput("");
      setScoreFilter("all");
      setAdvancedFilter(null);
      setSavedViewsOpen(false);
      const label = SAVED_VIEWS.find((v) => v.id === viewId)?.label ?? "Vista salva";
      toast({ title: `Vista aplicada: ${label}` });
    },
    [
      profileId,
      toast,
      setAdvancedFilter,
      setAlertsFilter,
      setAppliedOwner,
      setCreationDateFilter,
      setScoreFilter,
      resetSearchInput,
      setSortId,
      setStatusFilter,
    ],
  );

  // Coleta o estado atual de filtros num objeto serializável (omitindo defaults).
  const getCurrentSavedFilters = useCallback((): CrmSavedViewFilters => {
    const f: CrmSavedViewFilters = {};
    if (DEFAULT_CRM_FUNNELS[0] && funnelId !== DEFAULT_CRM_FUNNELS[0].id) f.funnel = funnelId;
    if (searchQuery.trim()) f.q = searchQuery.trim();
    if (appliedOwner.mode !== "all") f.owner = appliedOwner.mode;
    if (appliedOwner.mode === "custom" && appliedOwner.ids.length > 0) {
      f.owners = appliedOwner.ids;
    }
    if (statusFilter !== "all") f.status = statusFilter;
    if (alertsFilter !== "off") f.alerts = alertsFilter;
    if (scoreFilter !== "all") f.score = scoreFilter;
    if (isAdvancedFilterActive(advancedFilter)) {
      const adv = encodeAdvancedFilter(advancedFilter);
      if (adv) f.adv = adv;
    }
    if (creationDateFilter?.from && creationDateFilter?.to) {
      f.from = creationDateFilter.from;
      f.to = creationDateFilter.to;
    }
    if (sortId !== "created_desc") f.sort = sortId;
    if (view !== "board") f.view = view;
    return f;
  }, [
    advancedFilter,
    alertsFilter,
    appliedOwner,
    creationDateFilter,
    funnelId,
    scoreFilter,
    searchQuery,
    sortId,
    statusFilter,
    view,
  ]);

  // Aplica os filtros de uma vista DB-backed (resetando o que não está definido).
  const applyDbSavedView = useCallback(
    (saved: CrmSavedView) => {
      const f = saved.filters ?? {};
      setFunnelId(f.funnel || DEFAULT_CRM_FUNNELS[0]?.id || "");
      resetSearchInput(f.q ?? "");
      if (f.owner === "mine") setAppliedOwner({ mode: "mine" });
      else if (f.owner === "pool") setAppliedOwner({ mode: "pool" });
      else if (f.owner === "custom" && f.owners && f.owners.length > 0)
        setAppliedOwner({ mode: "custom", ids: f.owners });
      else setAppliedOwner({ mode: "all" });
      setStatusFilter(
        f.status && STATUS_FILTER_IDS.has(f.status)
          ? (f.status as (typeof STATUS_OPTIONS)[number]["id"])
          : "all",
      );
      setAlertsFilter(
        f.alerts && ALERTS_FILTER_IDS.has(f.alerts as CrmAlertsFilterMode)
          ? (f.alerts as CrmAlertsFilterMode)
          : "off",
      );
      setScoreFilter(
        f.score && SCORE_FILTER_IDS.has(f.score as ScoreFilterMode)
          ? (f.score as ScoreFilterMode)
          : "all",
      );
      setAdvancedFilter(f.adv ? decodeAdvancedFilter(f.adv) : null);
      if (f.from && f.to) {
        setCreationDateFilter({ from: f.from, to: f.to });
      } else {
        setCreationDateFilter(null);
      }
      setSortId(f.sort && SORT_FILTER_IDS.has(f.sort) ? (f.sort as SortId) : "created_desc");
      setView(f.view === "list" ? "list" : "board");
      setSavedViewsOpen(false);
      toast({ title: `Vista aplicada: ${saved.name}` });
    },
    [
      toast,
      setAdvancedFilter,
      setAlertsFilter,
      setAppliedOwner,
      setCreationDateFilter,
      setFunnelId,
      setScoreFilter,
      resetSearchInput,
      setSortId,
      setStatusFilter,
      setView,
    ],
  );

  const openCreateSavedViewDialog = useCallback(() => {
    setSavedViewDialog({ mode: "create", name: "", scope: "private" });
    setSavedViewsOpen(false);
  }, []);

  const openRenameSavedViewDialog = useCallback((view: CrmSavedView) => {
    setSavedViewDialog({
      mode: "edit",
      id: view.id,
      name: view.name,
      scope: view.scope,
    });
  }, []);

  const handleSavedViewSubmit = useCallback(async () => {
    if (!savedViewDialog) return;
    const name = savedViewDialog.name.trim();
    if (!name) {
      toast({
        title: "Dê um nome para a vista",
        variant: "destructive",
      });
      return;
    }
    try {
      if (savedViewDialog.mode === "create") {
        await createCrmSavedView.mutateAsync({
          name,
          scope: savedViewDialog.scope,
          filters: getCurrentSavedFilters(),
        });
        toast({ title: `Vista "${name}" salva.` });
      } else {
        await updateCrmSavedViewMut.mutateAsync({
          id: savedViewDialog.id,
          name,
          scope: savedViewDialog.scope,
        });
        toast({ title: `Vista renomeada.` });
      }
      setSavedViewDialog(null);
    } catch (err) {
      toast({
        title: "Não foi possível salvar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [createCrmSavedView, getCurrentSavedFilters, savedViewDialog, toast, updateCrmSavedViewMut]);

  const handleConfirmDeleteSavedView = useCallback(async () => {
    const target = savedViewDeleteTarget;
    setSavedViewDeleteTarget(null);
    if (!target) return;
    try {
      await deleteCrmSavedViewMut.mutateAsync(target.id);
      toast({ title: `Vista "${target.name}" excluída.` });
    } catch (err) {
      toast({
        title: "Não foi possível excluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [deleteCrmSavedViewMut, savedViewDeleteTarget, toast]);

  const negotiationsBeforeAlertsFilter = useMemo(() => {
    let list: CrmNegotiation[];

    if (isSupabaseConfigured) {
      list = sourceNegotiations;
      if (statusFilter !== "all") {
        list = list.filter((n) => n.status === statusFilter);
      }
      list = list.filter((n) => matchesOwner(n, appliedOwner, profileId));
      const range = creationDateFilter ? parseDateRangeIso(creationDateFilter) : null;
      if (range) {
        list = list.filter((n) => {
          const d = new Date(n.createdAt);
          return d >= range.from && d <= range.to;
        });
      }
    } else {
      const range = creationDateFilter ? parseDateRangeIso(creationDateFilter) : null;
      list = sourceNegotiations.filter((n) => n.funnelId === funnelId);
      if (statusFilter !== "all") {
        list = list.filter((n) => n.status === statusFilter);
      }
      list = list.filter((n) => matchesOwner(n, appliedOwner, profileId));
      if (range) {
        list = list.filter((n) => {
          const d = new Date(n.createdAt);
          return d >= range.from && d <= range.to;
        });
      }
    }

    return list;
  }, [
    appliedOwner,
    creationDateFilter,
    funnelId,
    isSupabaseConfigured,
    profileId,
    sourceNegotiations,
    statusFilter,
  ]);

  const customerById = useMemo(() => {
    const map = new Map<string, (typeof customers)[number]>();
    for (const c of customers) {
      map.set(c.id, c);
    }
    return map;
  }, [customers]);

  // Contexto + scores de lead (recalculados quando o conjunto pré-alertas muda).
  const scoringContext = useMemo(
    () => buildScoringContext(negotiationsBeforeAlertsFilter, funnel.stages),
    [funnel.stages, negotiationsBeforeAlertsFilter],
  );
  const scoresByNegId = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, LeadScoreResult>();
    for (const n of negotiationsBeforeAlertsFilter) {
      const result = computeLeadScore(n, {
        funnelMedianValue: scoringContext.funnelMedianValue,
        stageProbabilityPct: scoringContext.stageProbabilities.get(n.stageId) ?? null,
        nowMs: now,
      });
      map.set(n.id, result);
    }
    return map;
  }, [negotiationsBeforeAlertsFilter, scoringContext]);

  const filteredNegotiations = useMemo(() => {
    let list = negotiationsBeforeAlertsFilter;
    if (alertsFilter !== "off") {
      list = list.filter((n) =>
        negotiationMatchesAlertsFilter(n, alertsFilter, undefined, staleNegotiationDays),
      );
    }
    const q = deferredSearchTerm.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, "");
      list = list.filter((n) => {
        if (n.title?.toLowerCase().includes(q)) return true;
        const cid = n.customerId;
        if (cid) {
          const c = customerById.get(cid);
          if (c) {
            if (c.nome?.toLowerCase().includes(q)) return true;
            if (c.telefone?.toLowerCase().includes(q)) return true;
            if (c.email?.toLowerCase().includes(q)) return true;
            if (digits && c.phoneDigits?.includes(digits)) return true;
          }
        }
        return false;
      });
    }
    if (scoreFilter !== "all") {
      list = list.filter((n) =>
        scoreFilterMatches(scoreFilter, scoresByNegId.get(n.id)?.total ?? 0),
      );
    }
    if (isAdvancedFilterActive(advancedFilter)) {
      list = list.filter((n) =>
        evaluateAdvancedFilter(n, advancedFilter, {
          customerById,
          scoresByNegId,
        }),
      );
    }
    return [...list].sort((a, b) => {
      if (sortId === "score_desc" || sortId === "score_asc") {
        const sa = scoresByNegId.get(a.id)?.total ?? 0;
        const sb = scoresByNegId.get(b.id)?.total ?? 0;
        return sortId === "score_desc" ? sb - sa : sa - sb;
      }
      return compareNegotiations(a, b, sortId);
    });
  }, [
    advancedFilter,
    alertsFilter,
    customerById,
    deferredSearchTerm,
    negotiationsBeforeAlertsFilter,
    scoreFilter,
    scoresByNegId,
    sortId,
    staleNegotiationDays,
  ]);

  const alertCountsInView = useMemo(() => {
    let any = 0;
    let stale = 0;
    let noFutureTask = 0;
    for (const n of negotiationsBeforeAlertsFilter) {
      const alerts = getNegotiationAlerts(n, undefined, staleNegotiationDays);
      if (alerts.length === 0) {
        continue;
      }
      any += 1;
      if (alerts.some((a) => a.kind === "stale")) {
        stale += 1;
      }
      if (alerts.some((a) => a.kind === "no_future_task")) {
        noFutureTask += 1;
      }
    }
    return { any, stale, noFutureTask };
  }, [negotiationsBeforeAlertsFilter, staleNegotiationDays]);

  const phoneIndex = useMemo(() => buildCustomerPhoneIndex(customers), [customers]);

  const persistedNegIds = useMemo(
    () => filteredNegotiations.filter((n) => isPersistedCrmNegotiationId(n.id)).map((n) => n.id),
    [filteredNegotiations],
  );
  const { data: kanbanTaskPreviews = new Map() } = useKanbanTaskPreviews(persistedNegIds, {
    enabled: view === "board",
  });

  const orderedStages = useMemo(
    () => orderFunnelStages(funnel, stageOrder),
    [funnel, stageOrder],
  );

  const moveStageOrder = useCallback(
    (stageId: string, direction: "left" | "right") => {
      const base = orderFunnelStages(funnel, stageOrder).map((s) => s.id);
      const idx = base.indexOf(stageId);
      if (idx < 0) return;
      const swapWith = direction === "left" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= base.length) return;
      const next = [...base];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      setStageOrder(next);
      writeFunnelStageOrder(funnelId, next);
    },
    [funnel, funnelId, stageOrder],
  );

  const stagesWithCards = useMemo(() => {
    const byStage = new Map<string, CrmNegotiation[]>();
    for (const s of orderedStages) {
      byStage.set(s.id, []);
    }
    for (const n of filteredNegotiations) {
      const bucket = byStage.get(n.stageId);
      if (bucket) {
        bucket.push(n);
      }
    }
    return orderedStages.map((s) => ({
      ...s,
      cards: byStage.get(s.id) ?? [],
    }));
  }, [filteredNegotiations, orderedStages]);

  const totalNegotiations = filteredNegotiations.length;

  const funnelTriggerLabel = funnel.listName;

  const poolCountInFunnel = useMemo(
    () =>
      sourceNegotiations.filter(
        (n) => n.funnelId === funnelId && isNegotiationUnassigned(n.assigneeId),
      ).length,
    [funnelId, sourceNegotiations],
  );

  const ownerTriggerLabel = useMemo(() => {
    if (appliedOwner.mode === "all") {
      return "Todas as negociações";
    }
    if (appliedOwner.mode === "pool") {
      return "Pool (sem responsável)";
    }
    if (appliedOwner.mode === "mine") {
      return "Minhas negociações";
    }
    if (appliedOwner.ids.length === 1) {
      const name = attendants.find((a) => a.id === appliedOwner.ids[0])?.name;
      return name ?? "1 responsável";
    }
    return `${appliedOwner.ids.length} responsáveis`;
  }, [appliedOwner, attendants]);


  const extraFilterCount =
    (creationDateFilter ? 1 : 0) +
    (appliedOwner.mode !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (alertsFilter !== "off" ? 1 : 0) +
    (scoreFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (isAdvancedFilterActive(advancedFilter) ? 1 : 0);

  const filteredAttendants = useMemo(() => {
    const q = ownerSearch.trim().toLowerCase();
    if (!q) {
      return attendants;
    }
    return attendants.filter((a) => a.name.toLowerCase().includes(q));
  }, [attendants, ownerSearch]);

  const openNegotiationUrl = useCallback(
    (card: CrmNegotiation) => {
      if (isPersistedCrmNegotiationId(card.id)) {
        return `/crm/negociacao/${encodeURIComponent(card.id)}`;
      }
      const cid = resolveCustomerIdForNegotiation(card, customers);
      if (cid) return `/clientes/${cid}`;
      return `/crm/negociacao/${encodeURIComponent(card.id)}`;
    },
    [customers],
  );

  const openNegotiationInNewTab = useCallback(
    (card: CrmNegotiation) => {
      window.open(openNegotiationUrl(card), "_blank", "noopener,noreferrer");
    },
    [openNegotiationUrl],
  );

  const openNegotiationCard = useCallback(
    (card: CrmNegotiation) => {
      if (isPersistedCrmNegotiationId(card.id)) {
        navigate(`/crm/negociacao/${encodeURIComponent(card.id)}`);
        return;
      }
      const cid = resolveCustomerIdForNegotiation(card, customers);
      if (cid) {
        navigate(`/clientes/${cid}`);
        return;
      }
      navigate(`/crm/negociacao/${encodeURIComponent(card.id)}`);
    },
    [customers, navigate],
  );

  const handleClaimNegotiation = useCallback(
    async (card: CrmNegotiation) => {
      if (!profileId || !isPersistedCrmNegotiationId(card.id)) {
        return;
      }
      if (isE2eMockAuth && !isSupabaseConfigured) {
        setE2eAssigneeOverrides((prev) => ({ ...prev, [card.id]: profileId }));
        toast({
          title: "Negócio assumido",
          description: `Você é o responsável por "${card.title}".`,
        });
        return;
      }
      try {
        await claimCrmNegotiation.mutateAsync(card.id);
        toast({
          title: "Negócio assumido",
          description: `Você é o responsável por "${card.title}".`,
        });
      } catch (err) {
        toast({
          title: "Não foi possível assumir",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [claimCrmNegotiation, profileId, toast],
  );

  const canClaimNegotiations = Boolean(profileId) && (isSupabaseConfigured || isE2eMockAuth);

  const handleReleaseNegotiation = useCallback(
    async (card: CrmNegotiation) => {
      if (!canReleaseToPool || !isPersistedCrmNegotiationId(card.id)) {
        return;
      }
      if (isNegotiationUnassigned(card.assigneeId)) {
        return;
      }
      try {
        await releaseCrmNegotiation.mutateAsync(card.id);
        toast({
          title: "Devolvido ao pool",
          description: `"${card.title}" está sem responsável.`,
        });
      } catch (err) {
        toast({
          title: "Não foi possível devolver",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [canReleaseToPool, releaseCrmNegotiation, toast],
  );

  const handleConfirmDeleteNegotiation = useCallback(async () => {
    const card = deleteTarget;
    setDeleteTarget(null);
    if (!card || !canDeleteNegotiation || !isPersistedCrmNegotiationId(card.id)) {
      return;
    }
    try {
      await deleteCrmNegotiation.mutateAsync(card.id);
      toast({
        title: "Negociação excluída",
        description: `"${card.title}" foi removida do CRM.`,
      });
    } catch (err) {
      toast({
        title: "Não foi possível excluir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [canDeleteNegotiation, deleteCrmNegotiation, deleteTarget, toast]);

  /** Edição inline a partir do card do Kanban (estrelas/valor/responsável). */
  const handleUpdateInlineNegotiation = useCallback(
    async (
      card: CrmNegotiation,
      patch: { qualification?: number; totalValue?: number; assigneeId?: string },
    ) => {
      if (!isPersistedCrmNegotiationId(card.id)) {
        return;
      }
      if (!canEditCrm) {
        toast({
          title: "Ação indisponível",
          description: "Seu papel não tem permissão para editar negociações.",
          variant: "destructive",
        });
        return;
      }
      try {
        await updateCrmNegotiation.mutateAsync({ id: card.id, patch });
      } catch (err) {
        toast({
          title: "Não foi possível salvar",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [canEditCrm, toast, updateCrmNegotiation],
  );

  // === Ações em lote (vista lista) ============================================
  const selectableBulkRows = useMemo(
    () => filteredNegotiations.filter((n) => isPersistedCrmNegotiationId(n.id)),
    [filteredNegotiations],
  );
  const selectableBulkIdSet = useMemo(
    () => new Set(selectableBulkRows.map((n) => n.id)),
    [selectableBulkRows],
  );
  const allBulkSelected =
    selectableBulkRows.length > 0 &&
    selectableBulkRows.every((n) => bulkSelected.has(n.id));
  const someBulkSelected = bulkSelected.size > 0 && !allBulkSelected;
  const canBulkAct = canEditCrm && profile?.role !== "atendimento";

  // Limpa seleção quando troca de funil/vista (rows visíveis mudam).
  useEffect(() => {
    setBulkSelected(new Set());
  }, [funnelId, view]);

  // Mantém na seleção só IDs ainda visíveis após filtros (evita ações fantasma).
  useEffect(() => {
    setBulkSelected((prev) => {
      if (prev.size === 0) return prev;
      let dirty = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (selectableBulkIdSet.has(id)) {
          next.add(id);
        } else {
          dirty = true;
        }
      }
      return dirty ? next : prev;
    });
  }, [selectableBulkIdSet]);

  const toggleBulkRow = useCallback((id: string, checked: boolean) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleBulkAll = useCallback(
    (checked: boolean) => {
      setBulkSelected(checked ? new Set(selectableBulkRows.map((n) => n.id)) : new Set());
    },
    [selectableBulkRows],
  );

  const clearBulkSelection = useCallback(() => {
    setBulkSelected(new Set());
    setBulkAssignOpen(false);
    setBulkStageOpen(false);
    setBulkStatusOpen(false);
    setBulkAssignSearch("");
  }, []);

  const runBulkPatch = useCallback(
    async (label: string, patch: CrmNegotiationPatch) => {
      if (bulkSelected.size === 0) return;
      if (!canBulkAct) {
        toast({
          title: "Ação indisponível",
          description: "Seu papel não pode aplicar ações em lote.",
          variant: "destructive",
        });
        return;
      }
      const bulkFunnelId = patch.funnelId ?? funnelId;
      if (
        patch.stageId &&
        (isLostDestinationStage(funnels, bulkFunnelId, patch.stageId) ||
          isSaleDestinationStage(funnels, bulkFunnelId, patch.stageId))
      ) {
        toast({
          title: "Etapa não permitida em lote",
          description: "Marque venda ou perda negócio a negócio — exige confirmação e motivo.",
          variant: "destructive",
        });
        return;
      }
      const ids = Array.from(bulkSelected);
      if (patch.stageId) {
        const required = stageRequiredFields(funnels, bulkFunnelId, patch.stageId);
        if (required.length > 0) {
          const blocked = ids.filter((negId) => {
            const row = dbRecords.find((r) => r.id === negId);
            const card = sourceNegotiations.find((n) => n.id === negId);
            return Boolean(
              validateNegotiationForStage(
                {
                  totalValue: row?.totalValue ?? card?.totalValue,
                  qualification: row?.qualification ?? card?.qualification,
                  closingForecast: row?.closingForecast ?? card?.closingForecast ?? null,
                  nextTaskAt: row?.nextTaskAt ?? card?.nextTaskAt ?? null,
                },
                required,
              ),
            );
          });
          if (blocked.length > 0) {
            toast({
              title: "Campos obrigatórios",
              description:
                blocked.length === 1
                  ? "1 negócio selecionado não atende aos requisitos da etapa."
                  : `${blocked.length} negócios selecionados não atendem aos requisitos da etapa.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
      setBulkBusy(true);
      const effectiveFunnelId = patch.funnelId ?? funnelId;
      const shouldSyncCustomer = Boolean(patch.stageId || patch.funnelId || patch.status);
      // Roda em paralelo + invalida uma vez no fim (mais barato que `mutateAsync` por linha).
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          await updateCrmNegotiationDirect(id, patch);
          if (!shouldSyncCustomer) return;
          const row = dbRecords.find((r) => r.id === id);
          const card = sourceNegotiations.find((n) => n.id === id);
          const cid =
            row?.customerId ??
            card?.customerId ??
            (card ? resolveCustomerIdForNegotiation(card, customers) : null);
          if (!cid) return;
          const customer = customers.find((c) => c.id === cid);
          if (!customer) return;
          const stageId = patch.stageId ?? row?.stageId ?? card?.stageId;
          const negFunnelId = row?.funnelId ?? card?.funnelId ?? effectiveFunnelId;
          const customerInput = toCustomerUpsertInput(customer);
          if (stageId || patch.funnelId) {
            customerInput.sourceColumns = {
              ...customer.sourceColumns,
              ...(stageId ? { [CRM_PIPELINE_STAGE_KEY]: stageId } : {}),
              [CRM_FUNNEL_ID_KEY]: negFunnelId,
            };
          }
          if (patch.status === "pausado") {
            customerInput.status = "inativo";
          } else if (patch.status === "em_andamento" || patch.status === "nao_pausado") {
            if (customer.status === "inativo") {
              customerInput.status = "ativo";
            }
          }
          await updateCustomerDirect(cid, customerInput);
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = ids.length - ok;
      await queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
      if (shouldSyncCustomer) {
        await queryClient.invalidateQueries({ queryKey: ["customers"] });
      }
      setBulkBusy(false);
      setBulkAssignOpen(false);
      setBulkStageOpen(false);
      setBulkStatusOpen(false);
      setBulkAssignSearch("");
      if (failed === 0) {
        setBulkSelected(new Set());
        toast({
          title: `${label}: ${ok} negócio${ok === 1 ? "" : "s"} atualizado${ok === 1 ? "" : "s"}.`,
        });
      } else {
        toast({
          title: `${label}: ${ok} concluído${ok === 1 ? "" : "s"}, ${failed} falharam.`,
          variant: "destructive",
        });
      }
    },
    [bulkSelected, canBulkAct, customers, dbRecords, funnelId, funnels, queryClient, sourceNegotiations, toast],
  );

  const handleBulkExport = useCallback(() => {
    if (bulkSelected.size === 0) return;
    const rows = filteredNegotiations.filter((n) => bulkSelected.has(n.id));
    if (rows.length === 0) return;
    const headers = [
      "Titulo",
      "Etapa",
      "Status",
      "Valor",
      "Qualificacao",
      "Responsavel",
      "Criada em",
      "Proxima tarefa",
    ];
    const esc = (v: string | number | null | undefined): string => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const n of rows) {
      const assignee =
        attendants.find((a) => a.id === n.assigneeId)?.name?.trim() ||
        (isNegotiationUnassigned(n.assigneeId) ? "Pool" : "");
      lines.push(
        [
          esc(n.title),
          esc(stageTitleForNegotiation(n, funnels)),
          esc(n.status),
          esc(n.totalValue),
          esc(n.qualification),
          esc(assignee),
          esc(n.createdAt),
          esc(n.nextTaskAt ?? ""),
        ].join(","),
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `negociacoes-${funnelId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `${rows.length} negociações exportadas` });
  }, [attendants, bulkSelected, filteredNegotiations, funnelId, funnels, toast]);

  const negotiationsWithAlertsCount = alertCountsInView.any;

  const materializeSyntheticNegotiation = useCallback(
    async (card: CrmNegotiation, stageId: string): Promise<string | null> => {
      const customerId = parseSyntheticCustomerCardId(card.id);
      if (!customerId) {
        return card.id;
      }
      const customer = customers.find((c) => c.id === customerId);
      if (!customer) {
        return null;
      }
      const customerName = customer.nome?.trim() || "Nova negociação";
      const existing = findNegotiationForCustomerInFunnel(dbRecords, {
        funnelId,
        customerId,
        customerName,
      });
      if (existing) {
        if (!existing.customerId?.trim()) {
          await updateCrmNegotiation.mutateAsync({
            id: existing.id,
            patch: { customerId },
          });
        }
        return existing.id;
      }
      const created = await createCrmNegotiation.mutateAsync({
        title: customerName,
        funnelId,
        stageId,
        customerId,
        status: card.status,
        assigneeId:
          profile?.role === "atendimento" && profileId ? profileId : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
      return created.id;
    },
    [
      createCrmNegotiation,
      customers,
      dbRecords,
      funnelId,
      profile?.role,
      profileId,
      queryClient,
      updateCrmNegotiation,
    ],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) {
        return;
      }
      let negId = String(active.id).startsWith("neg-") ? String(active.id).slice(4) : null;
      let stageDropId = String(over.id).startsWith("stage-") ? String(over.id).slice(6) : null;
      if (!stageDropId && String(over.id).startsWith("neg-")) {
        const overNegId = String(over.id).slice(4);
        stageDropId = sourceNegotiations.find((n) => n.id === overNegId)?.stageId ?? null;
      }
      if (!negId || !stageDropId) {
        return;
      }

      let card = sourceNegotiations.find((n) => n.id === negId);
      if (!card || card.funnelId !== funnelId) {
        return;
      }

      if (card.stageId === stageDropId) {
        return;
      }

      if (parseSyntheticCustomerCardId(negId)) {
        if (!canEditCrm) {
          toast({
            title: "Ação indisponível",
            description: "Seu papel não tem permissão para mover leads do cadastro.",
            variant: "destructive",
          });
          return;
        }
        try {
          const materializedId = await materializeSyntheticNegotiation(card, card.stageId);
          if (!materializedId) {
            return;
          }
          negId = materializedId;
          card = {
            ...card,
            id: materializedId,
            assigneeId:
              profile?.role === "atendimento" && profileId ? profileId : card.assigneeId,
          };
        } catch (e) {
          toast({
            title: "Não foi possível criar a negociação",
            description: e instanceof Error ? e.message : "Tente novamente.",
            variant: "destructive",
          });
          return;
        }
      }

      const funnelDef = funnels.find((f) => f.id === funnelId);
      if (!funnelDef?.stages.some((s) => s.id === stageDropId)) {
        return;
      }

      const dragAssigneeId = dbRecords.find((r) => r.id === negId)?.assigneeId ?? card.assigneeId;
      if (!canAtendimentoModifyNegotiation(profile?.role, dragAssigneeId, profileId)) {
        toast({
          title: "Assuma o negócio",
          description: negotiationAssigneeBlockedMessage(),
          variant: "destructive",
        });
        return;
      }

      const cid = resolveCustomerIdForNegotiation(card, customers);
      const destinationStage = funnelDef.stages.find((s) => s.id === stageDropId);
      const stageTitle = destinationStage?.title ?? stageDropId;
      const persistedRow = isPersistedCrmNegotiationId(negId);
      const destTemplateId = destinationStage?.taskTemplateId;
      const destTemplate = destTemplateId ? taskTemplates.find((t) => t.id === destTemplateId) : undefined;

      const dbRow = dbRecords.find((r) => r.id === negId);
      const required = stageRequiredFields(funnels, funnelId, stageDropId).filter(
        (field) => field !== "next_task_at" || !persistedRow || !destTemplate,
      );
      if (required.length > 0) {
        const validationError = validateNegotiationForStage(
          dbRow ?? {
            totalValue: card.totalValue,
            qualification: card.qualification,
            closingForecast: card.closingForecast ?? null,
            nextTaskAt: card.nextTaskAt ?? null,
          },
          required,
        );
        if (validationError) {
          toast({
            title: "Campos obrigatórios",
            description: validationError,
            variant: "destructive",
          });
          return;
        }
      }

      if (isLostDestinationStage(funnels, funnelId, stageDropId)) {
        if (!persistedRow) {
          toast({
            title: "Marcar perda",
            description: "Crie a negociação no banco antes de marcar como perdido.",
            variant: "destructive",
          });
          return;
        }
        setPendingLostDrag({ negId, card, stageDropId, cid, stageTitle });
        setLostDialogOpen(true);
        return;
      }

      if (isSaleDestinationStage(funnels, funnelId, stageDropId)) {
        if (!persistedRow) {
          toast({
            title: "Marcar venda",
            description: "Crie a negociação no banco antes de registrar a venda.",
            variant: "destructive",
          });
          return;
        }
        const row = dbRecords.find((r) => r.id === negId);
        const assigneeId = row?.assigneeId ?? card.assigneeId;
        if (isNegotiationUnassigned(assigneeId)) {
          toast({
            title: "Sem responsável",
            description: saleAttendantBlockedMessage("crm"),
            variant: "destructive",
          });
          return;
        }
        if (
          !negotiationHasCompletedSale({
            status: row?.status ?? card.status,
            totalValue: row?.totalValue ?? card.totalValue,
          })
        ) {
          setPendingWinDrag({ negId, card, stageDropId, cid, stageTitle });
          setWinDialogOpen(true);
          return;
        }
      }

      const dbRowForDrag = persistedRow ? dbRecords.find((r) => r.id === negId) : undefined;
      const negStatus = dbRowForDrag?.status ?? card.status;
      const dragPatch: CrmNegotiationPatch | null = persistedRow
        ? { stageId: stageDropId, funnelId }
        : null;
      if (dragPatch && negStatus === "perdido" && !isLostDestinationStage(funnels, funnelId, stageDropId)) {
        dragPatch.status = "em_andamento";
        dragPatch.lostReason = null;
      }

      if (dragPatch) {
        patchCrmNegotiationStageInCaches(queryClient, negId, dragPatch);
      } else if (!persistedRow) {
        queryClient.setQueryData<Record<string, { funnel_id: string; stage_id: string }>>(
          ["crm-negotiation-stages"],
          (prev) => ({
            ...(prev ?? {}),
            [card.id]: { funnel_id: funnelId, stage_id: stageDropId },
          }),
        );
      }

      try {
        if (persistedRow && dragPatch) {
          await updateCrmNegotiation.mutateAsync({
            id: negId,
            patch: dragPatch,
          });

          if (destTemplate) {
            void createStageTemplateTask({
              negotiationId: negId,
              customerId: cid ?? null,
              assigneeId: dragAssigneeId ?? null,
              template: {
                id: destTemplate.id,
                title: destTemplate.title,
                notes: destTemplate.notes,
                defaultDueDays: destTemplate.defaultDueDays,
              },
            })
              .then((created) => {
                if (!created) return;
                void queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
                void queryClient.invalidateQueries({ queryKey: ["crm-kanban-task-previews"] });
              })
              .catch(() => {
                // Tarefa automática é best-effort; a etapa já foi salva.
              });
          }
        } else if (!persistedRow) {
          await upsertStageOverride.mutateAsync({
            negotiationId: card.id,
            funnelId,
            stageId: stageDropId,
          });
        }

        if (cid) {
          const customer = customers.find((c) => c.id === cid);
          if (customer) {
            void updateCustomer
              .mutateAsync({
                id: cid,
                input: {
                  ...toCustomerUpsertInput(customer),
                  sourceColumns: {
                    ...customer.sourceColumns,
                    [CRM_PIPELINE_STAGE_KEY]: stageDropId,
                    [CRM_FUNNEL_ID_KEY]: funnelId,
                  },
                },
              })
              .catch(() => {
                // Sincroniza cadastro em background; o quadro já reflete a etapa.
              });
          }
        }

        toast({
          title: "Etapa salva",
          description: `${card.title} → ${stageTitle}`,
        });
      } catch (e) {
        toast({
          title: "Não foi possível salvar",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [
      canEditCrm,
      customers,
      dbRecords,
      funnelId,
      funnels,
      materializeSyntheticNegotiation,
      profile?.role,
      profileId,
      queryClient,
      sourceNegotiations,
      taskTemplates,
      toast,
      updateCrmNegotiation,
      updateCustomer,
      upsertStageOverride,
    ],
  );

  const completeWinDrag = useCallback(
    async ({ lines, totalValue, paymentMethod }: MarkWinConfirm) => {
      const pending = pendingWinDrag;
      if (!pending) {
        return;
      }
      const lineError = validateMarkWinLines(lines);
      if (lineError) {
        toast({ title: "Venda incompleta", description: lineError, variant: "destructive" });
        throw new Error(lineError);
      }
      if (
        !canAtendimentoModifyNegotiation(
          profile?.role,
          pending.card.assigneeId,
          profileId,
        )
      ) {
        toast({
          title: "Assuma o negócio",
          description: negotiationAssigneeBlockedMessage(),
          variant: "destructive",
        });
        throw new Error("negotiation_not_owned");
      }
      try {
        const saleStageId = resolveConfiguredSaleStageId(funnels, funnelId);
        await updateCrmNegotiation.mutateAsync({
          id: pending.negId,
          patch: {
            status: "vendido",
            stageId: saleStageId,
            funnelId,
            totalValue,
          },
        });
        if (isSupabaseConfigured) {
          const soldBy = pending.card.assigneeId?.trim() || profileId;
          if (soldBy) {
            await persistMarkWinSale({
              chatId: pending.card.sourceChatId ?? null,
              customerId: pending.cid,
              soldBy,
              lines,
              paymentMethod,
            });
            invalidateSalesQueries(queryClient, pending.cid);
          }
        }
        if (pending.cid) {
          const customer = customers.find((c) => c.id === pending.cid);
          if (customer) {
            await updateCustomer.mutateAsync({
              id: pending.cid,
              input: {
                ...toCustomerUpsertInput(customer),
                sourceColumns: {
                  ...customer.sourceColumns,
                  [CRM_PIPELINE_STAGE_KEY]: saleStageId,
                  [CRM_FUNNEL_ID_KEY]: funnelId,
                },
              },
            });
          }
        }
        toast({
          title: "Venda registrada",
          description: `${pending.card.title} → ${pending.stageTitle}`,
        });
        setPendingWinDrag(null);
      } catch (e) {
        toast({
          title: "Não foi possível salvar",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "destructive",
        });
        throw e;
      }
    },
    [
      customers,
      funnelId,
      funnels,
      pendingWinDrag,
      profileId,
      queryClient,
      toast,
      updateCrmNegotiation,
      updateCustomer,
    ],
  );

  const completeLostDrag = useCallback(
    async (lostReason: string) => {
      const pending = pendingLostDrag;
      if (!pending) return;
      const dragAssigneeId =
        dbRecords.find((r) => r.id === pending.negId)?.assigneeId ?? pending.card.assigneeId;
      if (!canAtendimentoModifyNegotiation(profile?.role, dragAssigneeId, profileId)) {
        toast({
          title: "Assuma o negócio",
          description: negotiationAssigneeBlockedMessage(),
          variant: "destructive",
        });
        throw new Error("negotiation_not_owned");
      }
      try {
        await updateCrmNegotiation.mutateAsync({
          id: pending.negId,
          patch: {
            status: "perdido",
            stageId: pending.stageDropId,
            funnelId,
            lostReason,
          },
        });
        if (pending.cid) {
          const customer = customers.find((c) => c.id === pending.cid);
          if (customer) {
            await updateCustomer.mutateAsync({
              id: pending.cid,
              input: {
                ...toCustomerUpsertInput(customer),
                sourceColumns: {
                  ...customer.sourceColumns,
                  [CRM_PIPELINE_STAGE_KEY]: pending.stageDropId,
                  [CRM_FUNNEL_ID_KEY]: funnelId,
                },
              },
            });
          }
        }
        toast({
          title: "Negociação perdida",
          description: `${pending.card.title} → ${pending.stageTitle}`,
        });
        setPendingLostDrag(null);
      } catch (e) {
        toast({
          title: "Não foi possível salvar",
          description: e instanceof Error ? e.message : "Tente novamente.",
          variant: "destructive",
        });
        throw e;
      }
    },
    [
      customers,
      dbRecords,
      funnelId,
      pendingLostDrag,
      profile?.role,
      profileId,
      toast,
      updateCrmNegotiation,
      updateCustomer,
    ],
  );

  if (isSupabaseConfigured && tenantCrmFunnelConfigQuery.isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--crm-surface)] p-6">
        <p className="text-sm text-[var(--crm-ink-2)]">Carregando CRM...</p>
      </div>
    );
  }

  if (funnels.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--crm-surface)] p-6 text-[var(--crm-ink)]">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--crm-brand-tint)] text-[var(--crm-brand)] mb-6 shadow-sm">
            <BarChart3 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--crm-ink)]">
            Nenhum funil criado
          </h2>
          <p className="mt-3 text-sm text-[var(--crm-ink-2)] max-w-sm">
            Você ainda não tem nenhum funil de vendas. Crie seu primeiro funil e defina suas etapas para começar a gerenciar seus negócios.
          </p>
          <div className="mt-8">
            <Button
              onClick={() => navigate("/configuracoes?aba=funis")}
              className="bg-[var(--crm-brand)] text-white hover:bg-[var(--crm-brand-2)] shadow-sm px-6 py-2 font-medium"
            >
              Criar nova pipeline
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--crm-surface)] text-[var(--crm-ink)]">
      <div className="shrink-0 border-b border-[var(--crm-border)] bg-card">
        <div className="flex items-center gap-2 px-3 py-3 md:hidden">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)] bg-card shadow-sm">
            <button
              type="button"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={cn(
                "flex h-9 w-10 items-center justify-center transition-colors",
                view === "board" ? "bg-[var(--crm-brand)] text-white" : "bg-[var(--crm-brand-tint)] text-[var(--crm-brand-2)]",
              )}
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "flex h-9 w-10 items-center justify-center transition-colors",
                view === "list" ? "bg-[var(--crm-brand)] text-white" : "bg-[var(--crm-brand-tint)] text-[var(--crm-brand-2)]",
              )}
            >
              <List className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <Popover open={funnelOpenMobile} onOpenChange={setFunnelOpenMobile}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 flex-1 items-center gap-2 rounded-md border border-[var(--crm-border)] bg-card px-3 text-left text-sm font-medium text-[var(--crm-ink-2)] shadow-sm transition-colors hover:bg-[var(--crm-surface)]"
              >
                <AlignJustify className="h-4 w-4 shrink-0 text-[var(--crm-brand-2)]" aria-hidden />
                <span className="min-w-0 truncate">{funnelTriggerLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(100vw-1rem,22rem)] border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg">
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                Funil de vendas
              </div>
              <Separator />
              <ul className="max-h-64 overflow-y-auto py-1">
                {funnels.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setFunnelId(f.id);
                        setFunnelOpenMobile(false);
                      }}
                      className={cn(
                        "flex w-full px-3 py-2 text-left text-sm font-semibold",
                        f.id === funnelId ? "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]" : "text-[var(--crm-brand)] hover:bg-[var(--crm-surface)]",
                      )}
                    >
                      {f.listName}
                    </button>
                  </li>
                ))}
              </ul>
              <Separator />
              <div className="flex flex-col py-1">
                <button
                  type="button"
                  onClick={() => {
                    setFunnelId(funnels[0]?.id ?? DEFAULT_CRM_FUNNELS[0]?.id ?? "");
                    setFunnelOpenMobile(false);
                  }}
                  className="px-3 py-2 text-left text-sm font-medium text-[var(--crm-brand-2)] hover:bg-[var(--crm-surface)]"
                >
                  Primeiro funil
                </button>
                <Link
                  to="/configuracoes?aba=funis"
                  className="px-3 py-2 text-sm font-medium text-[var(--crm-brand-2)] hover:bg-[var(--crm-surface)]"
                  onClick={() => setFunnelOpenMobile(false)}
                >
                  Configurar funis
                </Link>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            className="h-9 gap-1.5 rounded-md bg-[var(--crm-brand)] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[var(--crm-brand-strong)]"
            disabled={!canEditCrm}
            onClick={() => {
              if (!canEditCrm) {
                toast({
                  title: "Ação indisponível",
                  description: "Seu papel nao tem permissao para criar negociações.",
                  variant: "destructive",
                });
                return;
              }
              if (!isSupabaseConfigured) {
                toast({
                  title: "Supabase necessário",
                  description: "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para criar negociações.",
                  variant: "destructive",
                });
                return;
              }
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden min-[380px]:inline">Criar</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--crm-border)]/70 px-3 py-3 md:hidden">
          <CrmSearchInput
            inputRef={searchInputRef}
            initialValue={searchQuery}
            resetKey={searchInputResetKey}
            onSearch={handleSearchSubmit}
            className="ml-0 min-w-0 flex-1 max-w-none"
          />

          <Popover open={filtersPopoverOpenMobile} onOpenChange={setFiltersPopoverOpenMobile}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                className={cn(
                  "h-9 gap-2 rounded-md border-0 px-3 text-sm font-semibold shadow-none",
                  extraFilterCount > 0
                    ? "bg-[var(--crm-brand)] text-white hover:bg-[var(--crm-brand-strong)]"
                    : "bg-[var(--crm-brand-tint-hover)] text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint-hover)]",
                )}
              >
                <Filter className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Filtros</span>
                {extraFilterCount > 0 ? (
                  <span className="rounded-full bg-[var(--crm-amber-border)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--crm-orange)]">
                    {extraFilterCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(100vw-2rem,23rem)] border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Filtros</p>
                {extraFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={clearAllCrmFilters}
                    className="text-xs font-medium text-[var(--crm-brand)] hover:underline"
                  >
                    Limpar todos
                  </button>
                ) : null}
              </div>
              <Separator />
              <div className="max-h-[min(70vh,34rem)] space-y-4 overflow-y-auto px-4 py-4">
                {/* mantém o mesmo conteúdo do desktop */}
                <section className="space-y-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Status da negociação
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_OPTIONS.map((opt) => {
                      const selected = statusFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStatusFilter(opt.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                              : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                          )}
                        >
                          <opt.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Alertas do negócio
                  </p>
                  <div className="space-y-1">
                    {[
                      { id: "off" as const, label: "Todos (sem filtro de alerta)", icon: null, count: 0, danger: false },
                      { id: "any" as const, label: "Com alertas", icon: AlertTriangle, count: alertCountsInView.any, danger: false },
                      {
                        id: "stale" as const,
                        label: `Parado (${staleNegotiationDays}+ dias)`,
                        icon: AlertTriangle,
                        count: alertCountsInView.stale,
                        danger: false,
                      },
                      {
                        id: "no_future_task" as const,
                        label: "Sem tarefa futura",
                        icon: CalendarX2,
                        count: alertCountsInView.noFutureTask,
                        danger: true,
                      },
                    ].map((opt) => {
                      const selected = alertsFilter === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAlertsFilter(opt.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                            selected
                              ? "bg-[var(--crm-brand-tint)] font-medium text-[var(--crm-brand)]"
                              : "hover:bg-[var(--crm-surface)]",
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            {Icon ? (
                              <Icon
                                className={cn("h-4 w-4 shrink-0", opt.danger ? "text-[var(--crm-danger)]" : "text-[var(--crm-orange)]")}
                                aria-hidden
                              />
                            ) : null}
                            {opt.label}
                          </span>
                          {opt.count > 0 ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                opt.danger
                                  ? "bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]"
                                  : "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
                              )}
                            >
                              {opt.count}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                    <Flame className="h-3.5 w-3.5" aria-hidden /> Lead score
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SCORE_FILTER_OPTIONS.map((opt) => {
                      const selected = scoreFilter === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setScoreFilter(opt.id)}
                          title={opt.hint}
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            selected
                              ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                              : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Data de criação</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="crm-filter-from-mobile" className="text-xs text-[var(--crm-ink-2)]">
                        A partir de
                      </Label>
                      <Input
                        id="crm-filter-from-mobile"
                        type="date"
                        className="h-9 border-[var(--crm-border-2)] text-sm"
                        value={creationDateFilter?.from ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            setCreationDateFilter(null);
                            return;
                          }
                          setCreationDateFilter((prev) => ({
                            from: v,
                            to: prev?.to && prev.to >= v ? prev.to : v,
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="crm-filter-to-mobile" className="text-xs text-[var(--crm-ink-2)]">
                        Até
                      </Label>
                      <Input
                        id="crm-filter-to-mobile"
                        type="date"
                        className="h-9 border-[var(--crm-border-2)] text-sm"
                        value={creationDateFilter?.to ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!v) {
                            setCreationDateFilter(null);
                            return;
                          }
                          setCreationDateFilter((prev) => ({
                            from: prev?.from && prev.from <= v ? prev.from : v,
                            to: v,
                          }));
                        }}
                      />
                    </div>
                  </div>
                  {creationDateFilter ? (
                    <button
                      type="button"
                      onClick={() => setCreationDateFilter(null)}
                      className="text-xs font-medium text-[var(--crm-brand)] hover:underline"
                    >
                      Limpar datas
                    </button>
                  ) : null}
                </section>

                <section className="border-t border-[var(--crm-surface-2)] pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFiltersPopoverOpenMobile(false);
                      setAdvancedFilterOpen(true);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                      isAdvancedFilterActive(advancedFilter)
                        ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint-hover)]"
                        : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                    )}
                    title="Filtro avançado: combina regras com E/OU em campos como score, valor, data, cliente, etapa"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Filter className="h-4 w-4 shrink-0" aria-hidden />
                      Filtro avançado (regras E/OU)
                    </span>
                    {isAdvancedFilterActive(advancedFilter) ? (
                      <span className="rounded-full bg-[var(--crm-brand-border)] px-2 py-0.5 text-[11px] font-bold text-[var(--crm-brand)]">
                        {advancedFilter?.rules.length ?? 0}
                      </span>
                    ) : null}
                  </button>
                </section>
              </div>
            </PopoverContent>
          </Popover>

          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 border-[var(--crm-border-2)] bg-card text-[var(--crm-ink-2)]"
                aria-label="Mais ações"
              >
                <MoreVertical className="h-4 w-4" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[min(88dvh,46rem)] rounded-t-2xl border-t border-[var(--crm-border)] bg-card p-0"
              disableInnerScroll
            >
              <div className="flex h-full flex-col">
                <SheetHeader className="border-b border-[var(--crm-border)] px-4 pb-4 pt-6 text-left">
                  <SheetTitle className="text-base text-[var(--crm-ink)]">Ações do CRM</SheetTitle>
                  <SheetDescription className="text-sm text-[var(--crm-ink-3)]">
                    Ajustes rápidos sem ocupar espaço no topo.
                  </SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                  <section className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Responsável</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Todas", mode: "all" as const },
                        { label: "Minhas", mode: "mine" as const },
                        { label: "Pool", mode: "pool" as const },
                      ].map((opt) => {
                        const selected = ownerDraft.mode === opt.mode;
                        return (
                          <button
                            key={opt.mode}
                            type="button"
                            onClick={() => setOwnerDraft({ mode: opt.mode, customIds: new Set() })}
                            className={cn(
                              "rounded-md border px-3 py-2 text-sm font-medium",
                              selected
                                ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                                : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)]",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="space-y-1 pt-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--crm-ink-3)]" aria-hidden />
                        <Input
                          placeholder="Pesquisar responsável"
                          value={ownerSearch}
                          onChange={(e) => setOwnerSearch(e.target.value)}
                          className="h-9 border-[var(--crm-border-2)] pl-9 text-sm"
                        />
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-[var(--crm-border-2)] p-1">
                        {filteredAttendants.map((a) => (
                          <label
                            key={a.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-[var(--crm-surface)]"
                          >
                            <Checkbox
                              checked={ownerDraft.customIds.has(a.id)}
                              onCheckedChange={(checked) => {
                                setOwnerDraft((d) => {
                                  const next = new Set(d.customIds);
                                  if (checked === true) {
                                    next.add(a.id);
                                    return { mode: "custom", customIds: next };
                                  }
                                  next.delete(a.id);
                                  return { mode: "custom", customIds: next };
                                });
                              }}
                              className="border-[var(--crm-ink-3)] data-[state=checked]:bg-[var(--crm-brand)] data-[state=checked]:border-[var(--crm-brand)]"
                            />
                            <span className="min-w-0 truncate">{a.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="h-9 w-full bg-[var(--crm-brand)] text-white hover:bg-[var(--crm-brand-strong)]"
                      onClick={() => setAppliedOwner(draftToApplied(ownerDraft, profileId))}
                    >
                      Aplicar responsável
                    </Button>
                  </section>

                  <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Ordenação</p>
                    <div className="grid gap-2">
                      {SORT_OPTIONS.map((opt) => {
                        const selected = sortId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setSortId(opt.id)}
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-sm font-medium",
                              selected
                                ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                                : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)]",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {view === "board" ? (
                    <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Densidade dos cards</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "compact", label: "Compacto" },
                          { id: "cozy", label: "Padrão" },
                          { id: "expanded", label: "Grande" },
                        ].map((opt) => {
                          const selected = cardDensity === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setCardDensity(opt.id as typeof cardDensity)}
                              className={cn(
                                "rounded-md border px-3 py-2 text-sm font-medium",
                                selected
                                  ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                                  : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)]",
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Ações rápidas</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-start gap-2 border-[var(--crm-border-2)] text-[var(--crm-brand)]"
                      onClick={() => {
                        setSortId("priority");
                        toast({
                          title: "Priorização aplicada",
                          description:
                            "Ordenação: qualificação e valor (maior primeiro), depois tarefa mais próxima e criação recente.",
                        });
                      }}
                    >
                      <Sparkles className="h-4 w-4" aria-hidden />
                      Priorizar negociações
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-start gap-2 border-[var(--crm-border-2)] text-[var(--crm-ink-2)]"
                      onClick={() => {
                        clearAllCrmFilters();
                        setOwnerSearch("");
                        setOwnerOpen(false);
                      }}
                    >
                      <X className="h-4 w-4" aria-hidden />
                      Limpar filtros
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-start gap-2 border-[var(--crm-border-2)] text-[var(--crm-brand)]"
                      onClick={() => setAdvancedFilterOpen(true)}
                    >
                      <Filter className="h-4 w-4" aria-hidden />
                      Filtro avançado
                    </Button>
                  </section>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="hidden items-center gap-2 px-4 py-3 md:flex md:flex-nowrap md:overflow-x-auto md:scrollbar-hide md:px-6">
          <div className="order-1 inline-flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)] bg-card shadow-sm">
              <button
              type="button"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={cn(
                "flex h-9 w-10 items-center justify-center transition-colors",
                view === "board" ? "bg-[var(--crm-brand)] text-white" : "bg-[var(--crm-brand-tint)] text-[var(--crm-brand-2)]",
              )}
            >
              <BarChart3 className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={cn(
                "flex h-9 w-10 items-center justify-center transition-colors",
                view === "list" ? "bg-[var(--crm-brand)] text-white" : "bg-[var(--crm-brand-tint)] text-[var(--crm-brand-2)]",
              )}
            >
              <List className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {view === "board" ? (
            <div
              className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)] bg-card shadow-sm"
              role="group"
              aria-label="Densidade do card"
            >
              <button
                type="button"
                aria-pressed={cardDensity === "compact"}
                aria-label="Compacto"
                title="Compacto"
                onClick={() => setCardDensity("compact")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center transition-colors",
                  cardDensity === "compact"
                    ? "bg-[var(--crm-brand)] text-white"
                    : "bg-card text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]",
                )}
              >
                <Rows3 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={cardDensity === "cozy"}
                aria-label="Confortável"
                title="Confortável"
                onClick={() => setCardDensity("cozy")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center border-l border-[var(--crm-border-2)] transition-colors",
                  cardDensity === "cozy"
                    ? "bg-[var(--crm-brand)] text-white"
                    : "bg-card text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]",
                )}
              >
                <Rows2 className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={cardDensity === "expanded"}
                aria-label="Expandido"
                title="Expandido"
                onClick={() => setCardDensity("expanded")}
                className={cn(
                  "flex h-9 w-9 items-center justify-center border-l border-[var(--crm-border-2)] transition-colors",
                  cardDensity === "expanded"
                    ? "bg-[var(--crm-brand)] text-white"
                    : "bg-card text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]",
                )}
              >
                <LayoutList className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        <Popover open={funnelOpen} onOpenChange={setFunnelOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="order-2 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--crm-border)] bg-card px-3 text-left text-sm font-medium text-[var(--crm-ink-2)] shadow-sm transition-colors hover:bg-[var(--crm-surface)]"
            >
              <AlignJustify className="h-4 w-4 text-[var(--crm-brand-2)]" aria-hidden />
              <span className="max-w-[140px] truncate">{funnelTriggerLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
              Funil de vendas
            </div>
            <Separator />
            <ul className="max-h-64 overflow-y-auto py-1">
              {funnels.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFunnelId(f.id);
                      setFunnelOpen(false);
                    }}
                    className={cn(
                      "flex w-full px-3 py-2 text-left text-sm font-semibold",
                      f.id === funnelId ? "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]" : "text-[var(--crm-brand)] hover:bg-[var(--crm-surface)]",
                    )}
                  >
                    {f.listName}
                  </button>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex flex-col py-1">
              <button
                type="button"
                onClick={() => {
                  setFunnelId(funnels[0]?.id ?? DEFAULT_CRM_FUNNELS[0]?.id ?? "");
                  setFunnelOpen(false);
                }}
                className="px-3 py-2 text-left text-sm font-medium text-[var(--crm-brand-2)] hover:bg-[var(--crm-surface)]"
              >
                Primeiro funil
              </button>
              <Link
                to="/configuracoes?aba=funis"
                className="px-3 py-2 text-sm font-medium text-[var(--crm-brand-2)] hover:bg-[var(--crm-surface)]"
                onClick={() => setFunnelOpen(false)}
              >
                Configurar funis
              </Link>
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={ownerOpen} onOpenChange={onOwnerOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "order-2 inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-left text-sm font-medium shadow-sm transition-colors hover:bg-[var(--crm-surface)]",
                appliedOwner.mode === "pool"
                  ? "border-[var(--crm-brand-border)] text-[var(--crm-brand)]"
                  : "border-[var(--crm-border)] text-[var(--crm-ink-2)]",
              )}
            >
              <Users className="h-4 w-4 text-[var(--crm-brand-2)]" aria-hidden />
              <span className="max-w-[140px] truncate">{ownerTriggerLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg">
            <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
              Responsável
            </div>
            <Separator />
            <div className="p-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--crm-ink-3)]" aria-hidden />
                <Input
                  placeholder="Pesquisar"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  className="h-9 border-[var(--crm-border-2)] pl-9 text-sm"
                />
              </div>
            </div>
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setOwnerDraft({ mode: "all", customIds: new Set() })}
                className="text-sm font-medium text-[var(--crm-brand)] hover:underline"
              >
                Todas as negociações
              </button>
            </div>
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setOwnerDraft({ mode: "mine", customIds: new Set() })}
                className="text-sm font-bold text-[var(--crm-ink)] hover:underline"
              >
                Minhas negociações
              </button>
            </div>
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={() => setOwnerDraft({ mode: "pool", customIds: new Set() })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 text-left text-sm font-semibold hover:underline",
                  ownerDraft.mode === "pool" ? "text-[var(--crm-brand)]" : "text-[var(--crm-ink)]",
                )}
              >
                <span>Pool (sem responsável)</span>
                {poolCountInFunnel > 0 ? (
                  <span className="rounded-full bg-[var(--crm-brand-tint)] px-2 py-0.5 text-[11px] font-bold text-[var(--crm-brand)]">
                    {poolCountInFunnel}
                  </span>
                ) : null}
              </button>
              <p className="mt-1 text-[11px] leading-snug text-[var(--crm-ink-3)]">
                Fila para assumir — negócios ainda sem vendedor atribuído.
              </p>
            </div>
            <Separator />
            <ul className="max-h-48 overflow-y-auto py-2">
              {filteredAttendants.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--crm-surface)]">
                    <Checkbox
                      checked={ownerDraft.customIds.has(a.id)}
                      onCheckedChange={(checked) => {
                        setOwnerDraft((d) => {
                          const next = new Set(d.customIds);
                          if (checked === true) {
                            next.add(a.id);
                            return { mode: "custom", customIds: next };
                          }
                          next.delete(a.id);
                          return { mode: "custom", customIds: next };
                        });
                      }}
                      className="border-[var(--crm-ink-3)] data-[state=checked]:bg-[var(--crm-brand)] data-[state=checked]:border-[var(--crm-brand)]"
                    />
                    <span>{a.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex items-center justify-between gap-2 p-3">
              <button
                type="button"
                className="text-sm font-medium text-[var(--crm-brand)] hover:underline"
                onClick={() => setOwnerDraft({ mode: "all", customIds: new Set() })}
              >
                Limpar
              </button>
              <Button
                type="button"
                className="h-9 bg-[var(--crm-brand)] px-4 text-sm font-semibold hover:bg-[var(--crm-brand-strong)]"
                onClick={() => {
                  setAppliedOwner(draftToApplied(ownerDraft, profileId));
                  setOwnerOpen(false);
                }}
              >
                Aplicar
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <CrmSearchInput
          inputRef={searchInputRef}
          initialValue={searchQuery}
          resetKey={searchInputResetKey}
          onSearch={handleSearchSubmit}
          className="order-2 ml-0"
        />

        <AdvancedFilterDialog
          open={advancedFilterOpen}
          onOpenChange={setAdvancedFilterOpen}
          value={advancedFilter}
          onApply={(f) => setAdvancedFilter(f)}
          attendants={attendants}
          stages={funnel.stages.map((s) => ({ id: s.id, title: s.title }))}
        />

        <div className="order-3 ml-auto flex items-center gap-2 md:gap-3">

          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2 border-[var(--crm-border-2)] bg-card text-sm font-medium text-[var(--crm-brand)] hover:bg-[var(--crm-surface)]"
            onClick={() => {
              setSortId("priority");
              toast({
                title: "Priorização aplicada",
                description: "Ordenação: qualificação e valor (maior primeiro), depois tarefa mais próxima e criação recente.",
              });
            }}
          >
            <Sparkles className="h-4 w-4 text-[var(--crm-brand-2)]" aria-hidden />
            Priorizar
          </Button>

          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
                  aria-label="Mais opções"
                >
                  <MoreVertical className="h-[18px] w-[18px]" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => setFiltersPopoverOpen(true)}>
                  Abrir filtros avançados
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortId("priority")}>Ordenar por prioridade</DropdownMenuItem>
                <DropdownMenuItem onClick={clearAllCrmFilters}>Limpar todos os filtros</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover open={filtersPopoverOpen} onOpenChange={setFiltersPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative h-9 w-9 hover:bg-[var(--crm-surface-2)]",
                    extraFilterCount > 0 ? "text-[var(--crm-brand)]" : "text-[var(--crm-ink-2)]",
                  )}
                  aria-label="Filtros"
                >
                  <Filter className="h-[18px] w-[18px]" aria-hidden />
                  {extraFilterCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--crm-brand)] px-1 text-[9px] font-bold text-white">
                      {extraFilterCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(100vw-2rem,23rem)] border-[var(--crm-border)] bg-card p-0 text-[var(--crm-ink)] shadow-lg"
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Filtros</p>
                  {extraFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearAllCrmFilters}
                      className="text-xs font-medium text-[var(--crm-brand)] hover:underline"
                    >
                      Limpar todos
                    </button>
                  ) : null}
                </div>
                <Separator />
                <div className="max-h-[min(70vh,34rem)] space-y-4 overflow-y-auto px-4 py-4">
                  {/* Status */}
                  <section className="space-y-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden /> Status da negociação
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {STATUS_OPTIONS.map((opt) => {
                        const selected = statusFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setStatusFilter(opt.id)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                              selected
                                ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                                : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                            )}
                          >
                            <opt.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Alertas */}
                  <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Alertas do negócio
                    </p>
                    <div className="space-y-1">
                      {[
                        { id: "off" as const, label: "Todos (sem filtro de alerta)", icon: null, count: 0, danger: false },
                        { id: "any" as const, label: "Com alertas", icon: AlertTriangle, count: alertCountsInView.any, danger: false },
                        {
                          id: "stale" as const,
                          label: `Parado (${staleNegotiationDays}+ dias)`,
                          icon: AlertTriangle,
                          count: alertCountsInView.stale,
                          danger: false,
                        },
                        {
                          id: "no_future_task" as const,
                          label: "Sem tarefa futura",
                          icon: CalendarX2,
                          count: alertCountsInView.noFutureTask,
                          danger: true,
                        },
                      ].map((opt) => {
                        const selected = alertsFilter === opt.id;
                        const Icon = opt.icon;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAlertsFilter(opt.id)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                              selected
                                ? "bg-[var(--crm-brand-tint)] font-medium text-[var(--crm-brand)]"
                                : "hover:bg-[var(--crm-surface)]",
                            )}
                          >
                            <span className="inline-flex items-center gap-2">
                              {Icon ? (
                                <Icon
                                  className={cn("h-4 w-4 shrink-0", opt.danger ? "text-[var(--crm-danger)]" : "text-[var(--crm-orange)]")}
                                  aria-hidden
                                />
                              ) : null}
                              {opt.label}
                            </span>
                            {opt.count > 0 ? (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  opt.danger
                                    ? "bg-[var(--crm-danger-tint)] text-[var(--crm-danger-strong)]"
                                    : "bg-[var(--crm-amber-tint)] text-[var(--crm-orange)]",
                                )}
                              >
                                {opt.count}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Lead score */}
                  <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                      <Flame className="h-3.5 w-3.5" aria-hidden /> Lead score
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SCORE_FILTER_OPTIONS.map((opt) => {
                        const selected = scoreFilter === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setScoreFilter(opt.id)}
                            title={opt.hint}
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                              selected
                                ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                                : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Datas */}
                  <section className="space-y-2 border-t border-[var(--crm-surface-2)] pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Data de criação</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="crm-filter-from" className="text-xs text-[var(--crm-ink-2)]">
                          A partir de
                        </Label>
                        <Input
                          id="crm-filter-from"
                          type="date"
                          className="h-9 border-[var(--crm-border-2)] text-sm"
                          value={creationDateFilter?.from ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) {
                              setCreationDateFilter(null);
                              return;
                            }
                            setCreationDateFilter((prev) => ({
                              from: v,
                              to: prev?.to && prev.to >= v ? prev.to : v,
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="crm-filter-to" className="text-xs text-[var(--crm-ink-2)]">
                          Até
                        </Label>
                        <Input
                          id="crm-filter-to"
                          type="date"
                          className="h-9 border-[var(--crm-border-2)] text-sm"
                          value={creationDateFilter?.to ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) {
                              setCreationDateFilter(null);
                              return;
                            }
                            setCreationDateFilter((prev) => ({
                              from: prev?.from && prev.from <= v ? prev.from : v,
                              to: v,
                            }));
                          }}
                        />
                      </div>
                    </div>
                    {creationDateFilter ? (
                      <button
                        type="button"
                        onClick={() => setCreationDateFilter(null)}
                        className="text-xs font-medium text-[var(--crm-brand)] hover:underline"
                      >
                        Limpar datas
                      </button>
                    ) : null}
                  </section>

                  {/* Avançado */}
                  <section className="border-t border-[var(--crm-surface-2)] pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setFiltersPopoverOpen(false);
                        setAdvancedFilterOpen(true);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                        isAdvancedFilterActive(advancedFilter)
                          ? "border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] text-[var(--crm-brand)] hover:bg-[var(--crm-brand-tint-hover)]"
                          : "border-[var(--crm-border)] bg-card text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                      )}
                      title="Filtro avançado: combina regras com E/OU em campos como score, valor, data, cliente, etapa"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Filter className="h-4 w-4 shrink-0" aria-hidden />
                        Filtro avançado (regras E/OU)
                      </span>
                      {isAdvancedFilterActive(advancedFilter) ? (
                        <span className="rounded-full bg-[var(--crm-brand-border)] px-2 py-0.5 text-[11px] font-bold text-[var(--crm-brand)]">
                          {advancedFilter?.rules.length ?? 0}
                        </span>
                      ) : null}
                    </button>
                  </section>
                </div>
              </PopoverContent>
            </Popover>
            {isSupabaseConfigured ? (
              <CrmNotificationsBell funnels={funnels} negotiationRefs={negotiationFunnelRefs} />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface-2)]"
              aria-label="Ordenar por maior valor"
              onClick={() => {
                setSortId("value_desc");
                toast({
                  title: "Ordenação",
                  description: "Maior valor total primeiro.",
                });
              }}
            >
              <TrendingUp className="h-[18px] w-[18px]" aria-hidden />
            </Button>
          </div>

          <Button
            type="button"
            className="h-9 gap-1.5 rounded-md bg-[var(--crm-brand)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--crm-brand-strong)]"
            disabled={!canEditCrm}
            onClick={() => {
              if (!canEditCrm) {
                toast({
                  title: "Ação indisponível",
                  description: "Seu papel nao tem permissao para criar negociações.",
                  variant: "destructive",
                });
                return;
              }
              if (!isSupabaseConfigured) {
                toast({
                  title: "Supabase necessário",
                  description: "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para criar negociações.",
                  variant: "destructive",
                });
                return;
              }
              setCreateOpen(true);
            }}
          >
            + Criar
          </Button>
        </div>
        </div>

      <CrmCreateNegotiationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        funnels={funnels}
        defaultFunnelId={funnelId}
        profileId={profileId}
        userRole={profile?.role}
        assigneeOptions={crmAttendantOptions}
        canEdit={canEditCrm}
      />

      <div
        className={cn(
          "shrink-0 flex-wrap items-center gap-2 border-b border-[var(--crm-surface-2)] bg-[var(--crm-surface)] px-4 py-2 md:px-6",
          appliedOwner.mode === "pool" || creationDateFilter ? "flex" : "hidden",
        )}
      >
        {appliedOwner.mode === "pool" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--crm-brand-border)] bg-[var(--crm-brand-tint)] px-2.5 py-1 text-xs font-medium text-[var(--crm-brand)]">
            Pool (sem responsável)
            <button
              type="button"
              className="rounded p-0.5 text-[var(--crm-brand)]/70 hover:bg-[var(--crm-brand-tint-hover)]"
              aria-label="Remover filtro de pool"
              onClick={() => setAppliedOwner({ mode: "all" })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
        {creationDateFilter ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--crm-border-2)] bg-card px-2.5 py-1 text-xs text-[var(--crm-ink-2)]">
            Data de criação: {formatIsoDateToBr(creationDateFilter.from)} — {formatIsoDateToBr(creationDateFilter.to)}
            <button
              type="button"
              className="rounded p-0.5 text-[var(--crm-ink-3)] hover:bg-[var(--crm-surface)]"
              aria-label="Remover filtro"
              onClick={() => setCreationDateFilter(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {isSupabaseConfigured && negotiationsError ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex flex-col items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-6 py-8 text-center text-sm text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <p>
              {negotiationsErrorObj instanceof Error
                ? negotiationsErrorObj.message
                : "Falha ao carregar as negociações."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetchNegotiations()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          </div>
        </div>
      ) : isSupabaseConfigured && negotiationsLoading && dbRecords.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-[var(--crm-ink-3)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando negociações...
        </div>
      ) : view === "board" ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(e) => void handleDragEnd(e)}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 md:h-[calc(100dvh-8rem)] md:p-6">
            <div className="scrollbar-hide min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex h-full min-h-0 min-w-max items-stretch gap-4 pb-2">
                {stagesWithCards.map((stage) => (
                  <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  phoneIndex={phoneIndex}
                  customers={customers}
                  kanbanTaskPreviews={kanbanTaskPreviews}
                  onCardContextMenu={(card, event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setCardContextMenu({ card, x: event.clientX, y: event.clientY });
                  }}
                  onMoveStageLeft={() => moveStageOrder(stage.id, "left")}
                  onMoveStageRight={() => moveStageOrder(stage.id, "right")}
                  canMoveStageLeft={stagesWithCards.findIndex((s) => s.id === stage.id) > 0}
                  canMoveStageRight={
                    stagesWithCards.findIndex((s) => s.id === stage.id) <
                    stagesWithCards.length - 1
                  }
                  staleNegotiationDays={staleNegotiationDays}
                  canClaim={canClaimNegotiations}
                  isClaimPending={claimCrmNegotiation.isPending}
                  canReleaseToPool={canReleaseToPool}
                  isReleasePending={releaseCrmNegotiation.isPending}
                  canDelete={canDeleteNegotiation}
                  onClaimNegotiation={handleClaimNegotiation}
                  onReleaseNegotiation={handleReleaseNegotiation}
                  onDeleteNegotiation={setDeleteTarget}
                  onOpenNegotiation={openNegotiationCard}
                  onOpenCustomer={handleOpenCustomerCard}
                  onOpenWhatsapp={handleOpenWhatsappFromCard}
                  onUpdateInline={handleUpdateInlineNegotiation}
                  resolveAssigneeName={resolveAssigneeName}
                  attendantsForReassign={attendants}
                  canReassign={canEditCrm && profile?.role !== "atendimento"}
                  density={cardDensity}
                  scoresByNegId={scoresByNegId}
                  onColumnRefresh={() => {
                    void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
                    void queryClient.invalidateQueries({ queryKey: ["crm-negotiation-stages"] });
                    toast({
                      title: "Coluna atualizada",
                      description: "Dados do CRM recarregados.",
                    });
                  }}
                  onColumnValueSort={() => {
                    setSortId("value_desc");
                    toast({
                      title: "Ordenação",
                      description: "Maior valor primeiro (lista e colunas usam a mesma ordenação).",
                    });
                  }}
                  />
                ))}
                {hasNextPage ? (
                  <div className="flex h-full w-[240px] shrink-0 items-center justify-center p-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full shadow-sm text-[var(--crm-brand)] border-[var(--crm-brand-border)] hover:bg-[var(--crm-brand-tint)]"
                      onClick={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        "Carregar mais antigas"
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </DndContext>
      ) : (
        <CrmListView
          filteredNegotiations={filteredNegotiations}
          funnels={funnels}
          funnel={funnel}
          staleNegotiationDays={staleNegotiationDays}
          profileId={profileId}
          canReleaseToPool={canReleaseToPool}
          isClaimPending={claimCrmNegotiation.isPending}
          isReleasePending={releaseCrmNegotiation.isPending}
          sortId={sortId}
          setSortId={setSortId}

          attendants={attendants}
          openNegotiationCard={openNegotiationCard}
          onOpenCustomer={(customerId) => navigate(`/clientes/${customerId}`)}
          handleClaimNegotiation={handleClaimNegotiation}
          handleReleaseNegotiation={handleReleaseNegotiation}
          canBulkAct={canBulkAct}
          bulkSelected={bulkSelected}
          selectableBulkRows={selectableBulkRows}
          allBulkSelected={allBulkSelected}
          someBulkSelected={someBulkSelected}
          toggleBulkAll={toggleBulkAll}
          toggleBulkRow={toggleBulkRow}
          clearBulkSelection={clearBulkSelection}
          bulkBusy={bulkBusy}
          bulkAssignOpen={bulkAssignOpen}
          setBulkAssignOpen={setBulkAssignOpen}
          bulkAssignSearch={bulkAssignSearch}
          setBulkAssignSearch={setBulkAssignSearch}
          bulkStageOpen={bulkStageOpen}
          setBulkStageOpen={setBulkStageOpen}
          bulkStatusOpen={bulkStatusOpen}
          setBulkStatusOpen={setBulkStatusOpen}
          runBulkPatch={runBulkPatch}
          handleBulkExport={handleBulkExport}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      )}

      {cardContextMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[200]"
            aria-label="Fechar menu"
            onClick={() => setCardContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCardContextMenu(null);
            }}
          />
          <div
            className="fixed z-[201] min-w-[180px] rounded-md border border-[var(--crm-border)] bg-card py-1 shadow-lg"
            style={{ left: cardContextMenu.x, top: cardContextMenu.y }}
            role="menu"
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--crm-surface)]"
              role="menuitem"
              onClick={() => {
                openNegotiationCard(cardContextMenu.card);
                setCardContextMenu(null);
              }}
            >
              Abrir negócio
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--crm-surface)]"
              role="menuitem"
              onClick={() => {
                openNegotiationInNewTab(cardContextMenu.card);
                setCardContextMenu(null);
              }}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Abrir em nova aba
            </button>
          </div>
        </>
      ) : null}

      <MarkLostDialog
        open={lostDialogOpen}
        onOpenChange={(open) => {
          setLostDialogOpen(open);
          if (!open) setPendingLostDrag(null);
        }}
        pending={updateCrmNegotiation.isPending}
        onConfirm={completeLostDrag}
      />

      <MarkWinDialog
        open={winDialogOpen}
        onOpenChange={(open) => {
          setWinDialogOpen(open);
          if (!open) {
            setPendingWinDrag(null);
          }
        }}
        initialValue={pendingWinDrag?.card.totalValue ?? 0}
        pending={updateCrmNegotiation.isPending}
        onConfirm={completeWinDrag}
      />
      <CrmWhatsappPhoneDialog
        open={whatsappPhonePick != null}
        onOpenChange={(open) => {
          if (!open) {
            setWhatsappPhonePick(null);
          }
        }}
        leadTitle={whatsappPhonePick?.card.title ?? ""}
        options={whatsappPhonePick?.options ?? []}
        onSelect={(option) => {
          const card = whatsappPhonePick?.card;
          setWhatsappPhonePick(null);
          if (card) {
            openWhatsappFromCard(card, option.value);
          }
        }}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-[var(--crm-border-2)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negociação?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.title}" será removida permanentemente do CRM, junto com tarefas, produtos e documentos vinculados. Esta ação não pode ser desfeita.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[var(--crm-border-2)]">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[var(--crm-danger)] text-white hover:bg-[var(--crm-danger-strong)]"
              onClick={() => void handleConfirmDeleteNegotiation()}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </div>
  );
}
