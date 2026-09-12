import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBRL } from "@/lib/format";
import { Briefcase, CalendarDays, ChevronLeft, Hand, Instagram, FileText } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssignChatDialog } from "@/components/inbox/AssignChatDialog";
import { ChatHeaderActions } from "@/components/inbox/ChatHeaderActions";
import { ConversationAvatar } from "@/components/inbox/ConversationAvatar";
import { useTenantCollaborators } from "@/lib/api/settings";
import { AppointmentDialog } from "@/components/agendamentos/AppointmentDialog";
import { useUpcomingAppointment } from "@/lib/api/scheduling-appointments";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatFollowupBadge } from "@/components/inbox/ChatFollowupBadge";
import { CustomerLocalTime } from "@/components/inbox/CustomerLocalTime";
import { ChatCrmHeader } from "@/components/inbox/ChatCrmHeader";
import { ChatTagsPicker } from "@/components/inbox/ChatTagsPicker";
import { CreateLeadDialog } from "@/components/inbox/CreateLeadDialog";
import { FollowUpDialog } from "@/components/inbox/FollowUpDialog";
import { SnoozeChatDialog } from "@/components/inbox/SnoozeChatDialog";
import { CustomerProfileSheet } from "@/components/inbox/CustomerProfileSheet";
import { MarkWinDialog } from "@/components/crm/MarkWinDialog";
import { MessageInput } from "@/components/inbox/MessageInput";
import { MessageThread } from "@/components/inbox/MessageThread";
import { groupThreadItemsByDay, type ThreadEntry } from "@/lib/inboxMessageGroups";
import {
  useChatNotes,
  useChatNotesRealtime,
} from "@/lib/api/chat-notes";
import { cn, safeParseMs } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import {
  fetchInboxMessagesPage,
  getNextInboxMessagesPageParam,
  type InboxMessagesPageCursor,
  useInboxChatById,
  useInboxChats,
  useInboxChatsRealtime,
  useInboxMessages,
  useMarkChatAsRead,
  useWhatsappInstances,
  useDeleteWhatsappChats,
} from "@/lib/api/whatsapp";
import {
  useAtendimentoUsers,
  useAddTagToChats,
  useChatTags,
  usePinChat,
  useSnoozeChat,
} from "@/lib/api/chat-tags";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { useUpdateCrmNegotiation } from "@/lib/api/crm-negotiations";
import { useChatNegotiation, useSetChatResolution } from "@/lib/api/crm-lead";
import { useNegotiationProducts } from "@/lib/api/crm-negotiation-products";
import { isNegotiationUnassigned } from "@/lib/crm/negotiation-alerts";
import { hasSaleAttendant, validateMarkWinLines } from "@/lib/crm/sale-rules";
import { invalidateSalesQueries, persistMarkWinSale } from "@/lib/crm/persist-mark-win-sale";
import {
  canAtendimentoActOnChat,
  canAtendimentoModifyNegotiation,
  chatAssignedToOtherAttendantMessage,
  assumeConversationToViewMessage,
  chatAssigneeBlockedMessage,
  isInboxLeadLocked,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import { useAuth } from "@/hooks/useAuth";
import { useRolePermissions } from "@/hooks/useRolePermissions";
import { useQuickReplies } from "@/lib/api/quick-replies";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isE2eMockAuth } from "@/lib/e2e";
import { type InboxChat } from "@/types/domain";
import { useToast } from "@/hooks/use-toast";
import {
  useInboxInboundNotifications,
  useInboxNotificationSettings,
} from "@/hooks/useInboxInboundNotifications";
import { useInboxTitleBadge } from "@/hooks/useInboxTitleBadge";
import { isChatWaitingForCustomer } from "@/lib/inbox-chat-rules";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useInboxClaimActions } from "@/hooks/useInboxClaimActions";
import { useInboxComposer } from "@/hooks/useInboxComposer";
import { useFollowupsForChat } from "@/hooks/useFollowupsForChat";
import { useFollowupsIndexForTenant } from "@/hooks/useFollowupsIndexForTenant";
import { useRunPlayground } from "@/lib/api/ai-agent";
import { buildCopilotPromptFromThread } from "@/lib/inboxAiCopilot";
import { resolveConfiguredSaleStageId } from "@/data/crm-funnels";

function formatMoney(value: number) {
  return formatBRL(value);
}

export default function Inbox() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { can } = useRolePermissions();
  useInboxChatsRealtime(isSupabaseConfigured);
  const [searchParams, setSearchParams] = useSearchParams();
  const messagesScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const loadOlderScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const lastMarkReadAttemptRef = useRef<Record<string, number>>({});
  const lastScrollStateRef = useRef<{ chatId: string | null; messageCount: number }>({
    chatId: null,
    messageCount: 0,
  });
  const skipAutoScrollToBottomRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const threadAtBottomRef = useRef(true);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [tagsDialogOpen, setTagsDialogOpen] = useState(false);
  // O `activeChat` ainda não está disponível neste ponto — usaremos abaixo.
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDialogChatId, setAssignDialogChatId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(() => searchParams.get("chatId"));
  /** Mantém metadados do chat aberto quando ele sai do filtro (ex.: "Não lidas" após marcar como lido). */
  const [activeChatSnapshot, setActiveChatSnapshot] = useState<InboxChat | null>(null);
  const notificationSettings = useInboxNotificationSettings();
  // Notifica novas mensagens inbound em chats nao ativos / aba em background.
  useInboxInboundNotifications(activeChatId, notificationSettings.enabled);
  const [profileOpen, setProfileOpen] = useState(false);
  const [jumpToLatestVisible, setJumpToLatestVisible] = useState(false);
  const [markQuickSaleDialogOpen, setMarkQuickSaleDialogOpen] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"list" | "chat">("list");
  const [schedulingOpen, setSchedulingOpen] = useState(false);
  const [schedulingInitial, setSchedulingInitial] = useState<{
    providerId?: string;
    date?: string;
    startsAt?: string;
    customerId?: string;
    customerNome?: string;
    customerTelefone?: string;
  }>();
  const [inboxDocLinkOpen, setInboxDocLinkOpen] = useState(false);
  const navigate = useNavigate();

  const { data: collaborators = [] } = useTenantCollaborators({ enabled: isSupabaseConfigured });
  const allProviders = useMemo(
    () =>
      collaborators
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: (c.nome?.trim() || c.email?.trim() || "Sem nome").trim() })),
    [collaborators],
  );
  // Largura customizada da lista de conversas (px). Persistida em localStorage.
  // null = usa o tamanho padrão do CSS (responsivo).
  const [listWidthPx, setListWidthPx] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem("inbox-list-width");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 260 && n <= 720 ? n : null;
  });
  const resizingRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const startListResize = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startWidth = listWidthPx ?? 336;
    resizingRef.current = { startX: event.clientX, startWidth };
    function onMove(e: MouseEvent) {
      const ctx = resizingRef.current;
      if (!ctx) return;
      const delta = e.clientX - ctx.startX;
      const next = Math.min(720, Math.max(260, ctx.startWidth + delta));
      setListWidthPx(next);
    }
    function onUp() {
      const ctx = resizingRef.current;
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (ctx) {
        setListWidthPx((current) => {
          if (current != null && typeof window !== "undefined") {
            window.localStorage.setItem("inbox-list-width", String(current));
          }
          return current;
        });
      }
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [listWidthPx]);
  const requestedChatId = searchParams.get("chatId");
  const requestedCustomerId = searchParams.get("customerId");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsNarrowViewport(mq.matches);
    update();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const queryClient = useQueryClient();
  const prefetchChatMessages = (chatId: string) => {
    void queryClient.prefetchInfiniteQuery({
      queryKey: ["inbox-messages", chatId],
      queryFn: ({ pageParam }) => fetchInboxMessagesPage(chatId, pageParam ?? null),
      initialPageParam: null as InboxMessagesPageCursor | null,
      getNextPageParam: (lastPage) => getNextInboxMessagesPageParam(lastPage),
      staleTime: 60_000,
    });
  };

  // Callbacks estáveis para a lista de conversas: o ConversationRow é memoizado e
  // só deve re-renderizar quando seu chat/active mudar — não quando o Inbox re-renderiza
  // (ex.: digitação no composer). O ref guarda sempre a versão mais recente da lógica.
  const selectChatRef = useRef<(chatId: string) => void>(() => {});
  const prefetchChatRef = useRef<(chatId: string) => void>(() => {});
  prefetchChatRef.current = prefetchChatMessages;
  const stableSelectChat = useCallback((chatId: string) => selectChatRef.current(chatId), []);
  const stablePrefetchChat = useCallback((chatId: string) => prefetchChatRef.current(chatId), []);

  const { data: instances = [] } = useWhatsappInstances();
  const updateCrmNegotiationMutation = useUpdateCrmNegotiation();
  const setChatResolutionMutation = useSetChatResolution();
  const { data: effectiveCrmFunnels } = useEffectiveCrmFunnels();
  const { data: availableTags = [], isLoading: tagsLoading } = useChatTags();
  const { data: atendimentoUsers = [] } = useAtendimentoUsers();
  const { data: quickReplies = [] } = useQuickReplies();
  const snoozeChatMutation = useSnoozeChat();
  const pinChatMutation = usePinChat();
  const addTagToChatsMutation = useAddTagToChats({
    onSuccess: (_data, variables) => {
      const tag = availableTags.find((t) => t.id === variables.tagId);
      toast({
        title: "Etiqueta aplicada",
        description: `${tag?.name ?? "Etiqueta"} em ${variables.chatIds.length} conversa${variables.chatIds.length > 1 ? "s" : ""}.`,
      });
      setSelectedChatIds([]);
    },
    onError: (error) => {
      toast({
        title: "Erro ao etiquetar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const deleteChatsMutation = useDeleteWhatsappChats({
    onSuccess: () => {
      setSelectedChatIds([]);
      toast({
        title: "Conversas excluídas",
        description: "As conversas selecionadas foram excluídas com sucesso.",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir conversas",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const profileId = profile?.id;
  const canEditInbox = can("inbox", "edit");
  const canEditCrm = can("crm", "edit");
  const {
    search,
    instanceIds,
    listScope,
    assigneeFilter,
    snoozedFilter,
    quickFilter,
    selectedTagIds,
    setSearch,
    setInstanceIds,
    setListScope,
    setAssigneeFilter,
    setSnoozedFilter,
    setQuickFilter,
    setSelectedTagIds,
    inboxChatsFilter,
  } = useInboxFilters(profileId);

  const { data: chats = [], isLoading: chatsLoading } = useInboxChats(inboxChatsFilter, {
    // Realtime ja cobre updates em whatsapp_chats (ver useInboxChatsRealtime).
    // Mantemos um polling longo apenas como fallback em caso de WebSocket cair.
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  const requestedChatInList = useMemo(
    () => Boolean(requestedChatId && chats.some((chat) => chat.id === requestedChatId)),
    [requestedChatId, chats],
  );

  const {
    data: deepLinkedChat = null,
    isLoading: deepLinkChatLoading,
    isFetched: deepLinkChatFetched,
  } = useInboxChatById(requestedChatId, {
    enabled: Boolean(
      requestedChatId?.trim() &&
      !requestedChatInList &&
      (isSupabaseConfigured || isE2eMockAuth),
    ),
  });

  const activeChat = useMemo(() => {
    if (!activeChatId) {
      return null;
    }
    return (
      chats.find((chat) => chat.id === activeChatId) ??
      (deepLinkedChat?.id === activeChatId ? deepLinkedChat : null) ??
      activeChatSnapshot
    );
  }, [activeChatId, chats, deepLinkedChat, activeChatSnapshot]);

  useEffect(() => {
    if (!activeChatId) {
      setActiveChatSnapshot(null);
      return;
    }
    const found =
      chats.find((chat) => chat.id === activeChatId) ??
      (deepLinkedChat?.id === activeChatId ? deepLinkedChat : null);
    if (found) {
      setActiveChatSnapshot(found);
    }
  }, [activeChatId, chats, deepLinkedChat]);

  // O botão de pausar/retomar IA só faz sentido se o canal do chat tem IA ligada.
  const activeChannelAiEnabled = useMemo(
    () => instances.find((i) => i.id === activeChat?.instanceId)?.aiEnabled ?? false,
    [instances, activeChat?.instanceId],
  );

  const activeChatPhone = activeChat?.remotePhoneE164 ?? activeChat?.remotePhoneDigits ?? null;
  const { data: upcomingAppointment } = useUpcomingAppointment(
    activeChat?.customerId ?? null,
    activeChatPhone,
    { enabled: Boolean(activeChat) }
  );

  const upcomingApptText = useMemo(() => {
    if (!upcomingAppointment) return null;
    try {
      const dateObj = parseISO(upcomingAppointment.startsAt);
      const dateFormatted = format(dateObj, "dd/MM");
      const timeFormatted = format(dateObj, "HH:mm");
      const serviceName = upcomingAppointment.serviceNome || "Atendimento";
      return `Agendamento marcado: ${dateFormatted} às ${timeFormatted}h - ${serviceName}`;
    } catch {
      return null;
    }
  }, [upcomingAppointment]);

  const assignDialogChat = useMemo(() => {
    if (!assignDialogChatId) {
      return null;
    }
    return chats.find((chat) => chat.id === assignDialogChatId) ?? null;
  }, [assignDialogChatId, chats]);

  const blockedRequestedChatId = useMemo(() => {
    if (!requestedChatId?.trim()) {
      return null;
    }
    if (requestedChatInList || deepLinkedChat?.id === requestedChatId) {
      return null;
    }
    if (deepLinkChatLoading || !deepLinkChatFetched) {
      return null;
    }
    return requestedChatId;
  }, [
    requestedChatId,
    requestedChatInList,
    deepLinkedChat?.id,
    deepLinkChatLoading,
    deepLinkChatFetched,
  ]);

  const isManagerInbox = profile?.role === "admin" || profile?.role === "operacao";
  const canManageChatPool =
    profile?.role === "admin" || profile?.role === "operacao" || profile?.role === "financeiro";
  const { data: linkedNegotiation, isLoading: linkedNegotiationLoading } = useChatNegotiation(
    activeChat?.id ?? null,
  );
  const { data: linkedNegotiationProducts = [] } = useNegotiationProducts(linkedNegotiation?.id);
  const markWinInitialLines = useMemo(
    () =>
      linkedNegotiationProducts
        .filter((p) => p.productId)
        .map((p) => ({ productId: p.productId as string, quantity: p.quantity, unitValue: p.unitPrice })),
    [linkedNegotiationProducts],
  );

  const { followups: chatFollowups } = useFollowupsForChat(activeChat);

  const {
    claimChat: claimChatMutation,
    claimNegotiation: claimCrmNegotiation,
    releaseNegotiation: releaseCrmNegotiation,
    canReleaseToPool,
    mustAssumeChatToView,
    showClaimNegotiation,
    showReleaseNegotiation,
    offerClaimBoth,
    handleClaimChatAndNegotiation,
  } = useInboxClaimActions({
    chat: activeChat,
    negotiation: linkedNegotiation ?? null,
    negotiationLoading: linkedNegotiationLoading,
    viewerRole: profile?.role,
  });
  const managerUnassignedCount = useMemo(() => {
    if (!isManagerInbox) {
      return 0;
    }
    return chats.filter(
      (c) =>
        !c.assigneeId &&
        (c.resolution ?? "open") === "open" &&
        c.status === "open",
    ).length;
  }, [isManagerInbox, chats]);

  // Índice de follow-ups do tenant — 1 fetch único alimenta tanto o filtro
  // "Lembretes vencidos" quanto os chips nas linhas da ConversationList.
  const followupsIndex = useFollowupsIndexForTenant();

  /**
   * Lista efetivamente exibida na barra lateral. Os filtros "Aguardando cliente"
   * e "Lembretes vencidos" são client-side — server traz a fila do operador
   * inteira via assigneeId="mine" e a redução acontece aqui.
   */
  const displayedChats = useMemo(() => {
    if (quickFilter === "waiting_customer") {
      return chats.filter((c) => isChatWaitingForCustomer(c));
    }
    if (quickFilter === "overdue_followup") {
      const { customerIds, negotiationIds } = followupsIndex.overdue;
      if (customerIds.size === 0 && negotiationIds.size === 0) return [];
      return chats.filter(
        (c) =>
          (c.customerId && customerIds.has(c.customerId)) ||
          (c.primaryNegotiationId && negotiationIds.has(c.primaryNegotiationId)),
      );
    }
    if (
      quickFilter === "unread" &&
      activeChatId &&
      activeChatSnapshot &&
      !chats.some((c) => c.id === activeChatId)
    ) {
      return [{ ...activeChatSnapshot, unreadCount: 0 }, ...chats];
    }
    return chats;
  }, [chats, quickFilter, followupsIndex, activeChatId, activeChatSnapshot]);
  // Badge "(N) Distribui Bot" no titulo da aba enquanto em background.
  const totalUnread = useMemo(
    () => chats.reduce((acc, chat) => acc + (chat.unreadCount ?? 0), 0),
    [chats],
  );
  useInboxTitleBadge(totalUnread);
  // Atalhos de teclado globais do inbox.
  // - Ctrl/Cmd+K: foca a busca de conversas (sem inserir nada na caixa).
  // - Esc com foco em campo de texto: blur (sai do composer).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const input = searchInputRef.current;
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLInputElement
        ) {
          // Em radix overlays (dialogs etc.) o Esc ja faz o trabalho deles;
          // aqui so saimos do composer/busca quando o foco e direto neles.
          target.blur();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  const {
    data: messages = [],
    isLoading: messagesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInboxMessages(activeChat?.id, {
    enabled: Boolean(activeChat?.id) && !mustAssumeChatToView,
    // Fallback curto: se o Realtime do self-host oscilar, a conversa ativa
    // ainda recebe mensagens em poucos segundos.
    refetchInterval: activeChat && !mustAssumeChatToView ? 3_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const markChatAsRead = useMarkChatAsRead();

  useEffect(() => {
    if (chats.length === 0) {
      setActiveChatId(null);
      return;
    }

    setActiveChatId((current) => {
      if (requestedChatId) {
        if (
          chats.some((chat) => chat.id === requestedChatId) ||
          deepLinkedChat?.id === requestedChatId
        ) {
          return requestedChatId;
        }
        if (!deepLinkChatLoading && deepLinkChatFetched) {
          // Deep link inacessível (RLS / outro atendente): não faz fallback na lista.
          return null;
        }
        return requestedChatId;
      }

      if (requestedCustomerId) {
        const customerChat = chats.find((chat) => chat.customerId === requestedCustomerId);
        if (customerChat) {
          return customerChat.id;
        }
      }

      if (current && chats.some((chat) => chat.id === current)) {
        return current;
      }

      // No filtro "Não lidas", mantém o chat aberto mesmo após marcar como lido
      // (ele some da query filtrada, mas o painel lateral continua exibindo a conversa).
      if (current && quickFilter === "unread") {
        return current;
      }

      if (quickFilter === "unread") {
        return null;
      }

      return chats[0].id;
    });
  }, [
    chats,
    requestedChatId,
    requestedCustomerId,
    quickFilter,
    deepLinkedChat?.id,
    deepLinkChatLoading,
    deepLinkChatFetched,
  ]);

  useEffect(() => {
    if (quickFilter === "unread") {
      return;
    }

    if (!activeChat?.id || !activeChat.unreadCount) {
      return;
    }

    // So marca como lido com a aba visivel: evita PATCH desnecessario quando
    // o usuario esta em outra janela e o realtime/polling continua aumentando o
    // contador.
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }

    // Guarda extra contra erros recorrentes do backend (drift de schema etc.):
    // o `useMarkChatAsRead` ja faz patch otimista no cache, entao em fluxo normal
    // este efeito nao re-dispara para o mesmo chat. Este ref so blinda contra o
    // caso de erro com cache restaurado.
    const lastAttemptedUnread = lastMarkReadAttemptRef.current[activeChat.id];
    if (lastAttemptedUnread === activeChat.unreadCount) {
      return;
    }

    lastMarkReadAttemptRef.current[activeChat.id] = activeChat.unreadCount;
    void markChatAsRead.mutateAsync(activeChat.id).catch(() => undefined);
  }, [activeChat?.id, activeChat?.unreadCount, markChatAsRead, quickFilter]);

  useEffect(() => {
    setProfileOpen(false);
  }, [activeChat?.id]);

  /** Deep link: `/inbox?chatId=…&profile=1` abre o sheet de perfil (ex.: retorno do cadastro na inbox). */
  useEffect(() => {
    if (searchParams.get("profile") !== "1") {
      return;
    }
    if (!activeChat?.id) {
      return;
    }
    setProfileOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("profile");
    setSearchParams(next, { replace: true });
  }, [activeChat?.id, searchParams, setSearchParams]);

  const { data: chatNotes = [] } = useChatNotes(activeChat?.id);
  useChatNotesRealtime(activeChat?.id);

  const messageGroups = useMemo(() => {
    if (chatNotes.length === 0) {
      return groupThreadItemsByDay(messages);
    }
    const items: ThreadEntry[] = [...messages, ...chatNotes];
    items.sort((a, b) => {
      const aTs =
        "_noteKind" in a
          ? safeParseMs(a.createdAt)
          : safeParseMs(a.createdAt ?? a.sentAt ?? a.receivedAt);
      const bTs =
        "_noteKind" in b
          ? safeParseMs(b.createdAt)
          : safeParseMs(b.createdAt ?? b.sentAt ?? b.receivedAt);
      return aTs - bTs;
    });
    return groupThreadItemsByDay(items);
  }, [messages, chatNotes]);

  const canActOnChat = canAtendimentoActOnChat(profile?.role, activeChat?.assigneeId, profileId);
  const inboxAssigneeFilterOptions = useMemo(
    () =>
      isManagerInbox
        ? atendimentoUsers.map((user) => ({ id: user.id, name: user.nome }))
        : undefined,
    [isManagerInbox, atendimentoUsers],
  );
  const canModifyLinkedNegotiation = canAtendimentoModifyNegotiation(
    profile?.role,
    linkedNegotiation?.assigneeId,
    profileId,
  );
  const inboxLeadLocked = isInboxLeadLocked(
    profile?.role,
    activeChat?.assigneeId,
    linkedNegotiation?.assigneeId,
    profileId,
    { hasLinkedNegotiation: Boolean(linkedNegotiation) },
  );

  const composer = useInboxComposer({
    chat: activeChat,
    canEditInbox,
    inboxLeadLocked,
    hasLinkedNegotiation: Boolean(linkedNegotiation),
  });

  // Deep link: `?draft=<base64>` pré-preenche o composer ao abrir o chat (usado
  // por "Sugerir próxima mensagem" no detalhe do CRM). Aplica uma vez por
  // chatId + draft (ref previne re-aplicação durante navegação interna).
  const appliedDraftRef = useRef<string>("");
  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (!draftParam || !activeChat?.id) return;
    const signature = `${activeChat.id}:${draftParam}`;
    if (appliedDraftRef.current === signature) return;
    try {
      const b64 = draftParam.replace(/-/g, "+").replace(/_/g, "/");
      const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
      const text = decodeURIComponent(escape(atob(b64 + pad)));
      if (text.trim()) {
        composer.setBodyText(text);
        appliedDraftRef.current = signature;
        requestAnimationFrame(() => composer.bodyTextareaRef.current?.focus());
      }
    } catch {
      // Decode inválido: ignora silenciosamente.
    }
    const next = new URLSearchParams(searchParams);
    next.delete("draft");
    setSearchParams(next, { replace: true });
  }, [activeChat?.id, composer, searchParams, setSearchParams]);

  const suggestReplyMutation = useRunPlayground({
    onSuccess: (data) => {
      const text = data.reply?.trim();
      if (!text) {
        toast({
          title: "IA não retornou sugestão",
          description: "Tente novamente em alguns segundos.",
          variant: "destructive",
        });
        return;
      }
      composer.setBodyText(text);
      // Foca pra o vendedor poder editar imediatamente.
      requestAnimationFrame(() => composer.bodyTextareaRef.current?.focus());
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Tente novamente.";
      toast({ title: "Falha ao gerar sugestão", description: msg, variant: "destructive" });
    },
  });

  function handleSuggestReply() {
    if (!activeChat) return;
    const prompt = buildCopilotPromptFromThread(messages);
    if (prompt.length === 0) {
      toast({
        title: "Sem contexto para sugerir",
        description: "Aguarde alguma mensagem do cliente antes de pedir sugestão.",
      });
      return;
    }
    suggestReplyMutation.mutate(prompt);
  }
  const canMarkSaleFromChat =
    Boolean(activeChat) &&
    Boolean(linkedNegotiation) &&
    !linkedNegotiationLoading &&
    hasSaleAttendant({
      chatAssigneeId: activeChat?.assigneeId,
      negotiationAssigneeId: linkedNegotiation?.assigneeId,
      profileId,
      role: profile?.role,
    });

  function handleOpenSaleFlow() {
    if (!activeChat) {
      return;
    }
    if (!canEditCrm) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para registrar vendas ou devoluções.",
        variant: "destructive",
      });
      return;
    }
    if (!canActOnChat) {
      toast({
        title: "Assuma a conversa",
        description: chatAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!canModifyLinkedNegotiation) {
      toast({
        title: "Assuma o negócio",
        description: negotiationAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!activeChat.assigneeId?.trim()) {
      toast({
        title: "Sem atendente",
        description: "Atribua esta conversa a um atendente antes de registrar a venda.",
        variant: "destructive",
      });
      return;
    }
    if (activeChat.primaryNegotiationId && linkedNegotiationLoading) {
      toast({
        title: "Aguarde",
        description: "Carregando o negócio vinculado ao chat…",
      });
      return;
    }
    if (!linkedNegotiation) {
      toast({
        title: "Negócio não vinculado",
        description:
          "Use “Criar lead no CRM” ou “Vincular ao CRM” no cabeçalho da conversa antes de marcar a venda.",
        variant: "destructive",
      });
      return;
    }
    if (isNegotiationUnassigned(linkedNegotiation.assigneeId)) {
      toast({
        title: "Assuma o negócio",
        description: "O negócio precisa de um responsável no CRM antes da venda.",
        variant: "destructive",
      });
      return;
    }
    setMarkQuickSaleDialogOpen(true);
  }


  function scrollMessagesToBottom(behavior: ScrollBehavior = "auto") {
    const el = messagesScrollAreaRef.current;
    if (!el) {
      return;
    }

    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
  }

  function forceScrollToLatestMessage() {
    skipAutoScrollToBottomRef.current = false;
    lastScrollStateRef.current = { chatId: null, messageCount: 0 };
    threadAtBottomRef.current = true;
    setJumpToLatestVisible(false);

    requestAnimationFrame(() => {
      scrollMessagesToBottom("auto");
      requestAnimationFrame(() => {
        scrollMessagesToBottom("auto");
      });
    });
  }

  function handleSelectChat(chatId: string) {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setActiveChatSnapshot(chat);
    }
    setActiveChatId(chatId);
    if (isNarrowViewport) {
      setMobilePanel("chat");
    }
    forceScrollToLatestMessage();

    if (quickFilter === "unread") {
      if (chat?.unreadCount) {
        lastMarkReadAttemptRef.current[chatId] = chat.unreadCount;
        void markChatAsRead.mutateAsync(chatId).catch(() => undefined);
      }
    }
  }
  selectChatRef.current = handleSelectChat;

  function toggleSelectedChat(chatId: string) {
    setSelectedChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId],
    );
  }

  function applyTagToChats(chatIds: string[], tagId: string) {
    const uniqueChatIds = Array.from(new Set(chatIds));
    if (uniqueChatIds.length === 0) return;
    addTagToChatsMutation.mutate({ chatIds: uniqueChatIds, tagId });
  }

  const handleLoadOlderMessages = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    const el = messagesScrollAreaRef.current;
    if (el) {
      loadOlderScrollRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    }

    skipAutoScrollToBottomRef.current = true;
    await fetchNextPage();

    requestAnimationFrame(() => {
      const snap = loadOlderScrollRef.current;
      const scrollEl = messagesScrollAreaRef.current;
      if (snap && scrollEl) {
        const delta = scrollEl.scrollHeight - snap.scrollHeight;
        scrollEl.scrollTop = snap.scrollTop + delta;
        loadOlderScrollRef.current = null;
      }
    });
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleThreadScrollStateChange = useCallback(
    ({ atBottom }: { atBottom: boolean; distanceFromBottom: number }) => {
      threadAtBottomRef.current = atBottom;
      if (atBottom) {
        setJumpToLatestVisible(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeChat?.id || messagesLoading) {
      return;
    }

    if (skipAutoScrollToBottomRef.current) {
      skipAutoScrollToBottomRef.current = false;
      lastScrollStateRef.current = {
        chatId: activeChat.id,
        messageCount: messages.length,
      };
      return;
    }

    const lastState = lastScrollStateRef.current;
    const chatChanged = lastState.chatId !== activeChat.id;
    const messageCountChanged = lastState.messageCount !== messages.length;

    if (!chatChanged && !messageCountChanged) {
      return;
    }

    const shouldAutoScroll = chatChanged || threadAtBottomRef.current;

    if (shouldAutoScroll) {
      requestAnimationFrame(() => {
        scrollMessagesToBottom(chatChanged ? "auto" : "smooth");
      });
      setJumpToLatestVisible(false);
    } else if (messageCountChanged && !skipAutoScrollToBottomRef.current) {
      setJumpToLatestVisible(true);
    }

    lastScrollStateRef.current = {
      chatId: activeChat.id,
      messageCount: messages.length,
    };
  }, [activeChat?.id, messages.length, messagesLoading]);


  const showMobileList = !isNarrowViewport || mobilePanel === "list";
  const showMobileChat = !isNarrowViewport || mobilePanel === "chat";

  useEffect(() => {
    if (!isNarrowViewport) {
      setMobilePanel("chat");
      return;
    }
    if (!activeChatId) {
      setMobilePanel("list");
    }
  }, [activeChatId, isNarrowViewport]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div
        className={cn(
          "min-h-0 flex-1 gap-0",
          isNarrowViewport
            ? "flex flex-col"
            : "grid grid-rows-[1fr] lg:grid-cols-[var(--inbox-list-col,minmax(260px,min(100%,336px)))_1fr]",
        )}
        style={
          listWidthPx != null
            ? ({ ["--inbox-list-col" as string]: `${listWidthPx}px` } as React.CSSProperties)
            : undefined
        }
      >
        <div className={cn("min-h-0 min-w-0 flex-1", isNarrowViewport && !showMobileList && "hidden")}>
          <ConversationList
          search={search}
          onSearchChange={setSearch}
          selectedInstanceIds={instanceIds}
          onInstanceToggle={(nextId) =>
            setInstanceIds((prev) =>
              prev.includes(nextId) ? prev.filter((id) => id !== nextId) : [...prev, nextId],
            )
          }
          onClearInstances={() => setInstanceIds([])}
          listScope={listScope}
          onListScopeChange={setListScope}
          assigneeFilter={assigneeFilter}
          onAssigneeFilterChange={(value) => {
            setAssigneeFilter(value);
            if (value !== "all") {
              setQuickFilter(null);
            }
          }}
          snoozedFilter={snoozedFilter}
          onSnoozedFilterChange={(value) => {
            setSnoozedFilter(value);
            if (value !== "active") {
              setQuickFilter(null);
            }
          }}
          quickFilter={quickFilter}
          onQuickFilterChange={(value) => {
            setQuickFilter(value);
            if (value === "hidden") {
              setSnoozedFilter("active");
              setAssigneeFilter("all");
            } else if (value === "mine") {
              setAssigneeFilter("mine");
              setSnoozedFilter("active");
            } else if (value === "unassigned") {
              setAssigneeFilter("unassigned");
              setSnoozedFilter("active");
            } else if (value === "unread") {
              setAssigneeFilter("all");
              setSnoozedFilter("active");
            } else if (value === "waiting_customer") {
              // Mostra a fila do operador (server traz assigneeId="mine") e
              // o filtro client-side `isChatWaitingForCustomer` afina depois.
              setAssigneeFilter("mine");
              setSnoozedFilter("active");
            } else if (value === "overdue_followup") {
              // Mesma estratégia: server traz "minhas" + cruzamento com tarefas
              // vencidas é client-side.
              setAssigneeFilter("mine");
              setSnoozedFilter("active");
            } else {
              setAssigneeFilter("all");
              setSnoozedFilter("active");
            }
          }}
          selectedTagIds={selectedTagIds}
          onTagToggle={(tagId) =>
            setSelectedTagIds((prev) =>
              prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
            )
          }
          onClearTags={() => setSelectedTagIds([])}
          availableTags={availableTags}
          tagsLoading={tagsLoading}
          instances={instances}
          chatsLoading={chatsLoading}
          chats={displayedChats}
          activeChatId={activeChat?.id ?? null}
          onSelectChat={stableSelectChat}
          onPrefetchChat={stablePrefetchChat}
          viewerRole={profile?.role}
          searchInputRef={searchInputRef}
          assigneeFilterOptions={inboxAssigneeFilterOptions}
          managerUnassignedCount={isManagerInbox ? managerUnassignedCount : undefined}
          onOpenUnassignedQueue={() => {
            setQuickFilter("unassigned");
            setAssigneeFilter("unassigned");
            setSnoozedFilter("active");
          }}
          selectedChatIds={selectedChatIds}
          onChatSelectionToggle={toggleSelectedChat}
          onClearChatSelection={() => setSelectedChatIds([])}
          onApplyTagToChats={applyTagToChats}
          applyingTagToChats={addTagToChatsMutation.isPending}
          onDeleteChats={(chatIds) => deleteChatsMutation.mutate({ chatIds })}
          deletingChats={deleteChatsMutation.isPending}
          onPinChat={(chatId, isPinned) => pinChatMutation.mutate({ chatId, isPinned })}
          followupIndex={followupsIndex}
          />
        </div>

        <section
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden bg-background",
            isNarrowViewport ? (showMobileChat ? "flex" : "hidden") : "border-l border-border",
          )}
        >
          {isNarrowViewport ? (
            <div className="flex min-h-[52px] shrink-0 items-center justify-between border-b border-border bg-card px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 rounded-full px-3 text-sm"
                onClick={() => setMobilePanel("list")}
              >
                <ChevronLeft className="h-4 w-4" />
                Conversas
              </Button>
              {activeChat ? (
                <p className="min-w-0 flex-1 px-2 text-center text-sm font-semibold text-foreground truncate">
                  {activeChat.displayName}
                </p>
              ) : (
                <span className="min-w-0 flex-1" />
              )}
              <div className="w-[84px]" aria-hidden />
            </div>
          ) : null}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Redimensionar lista de conversas (duplo clique para resetar)"
            onMouseDown={startListResize}
            onDoubleClick={() => {
              setListWidthPx(null);
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("inbox-list-width");
              }
            }}
            className="absolute left-0 top-0 z-30 hidden h-full w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 lg:block"
          />
          {activeChat && mustAssumeChatToView ? (
            <div
              className="flex min-h-0 flex-1 flex-col items-center justify-center bg-background p-6"
              data-testid="inbox-claim-required"
            >
              <div className="w-full max-w-md rounded-lg border border-border bg-card px-8 py-10 text-center">
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Hand className="h-7 w-7" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-foreground">
                  {assumeConversationToViewMessage()}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Esta conversa ainda não tem atendente responsável. Assuma o atendimento para ver o histórico,
                  responder e usar as ferramentas do chat.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  {offerClaimBoth && linkedNegotiation ? (
                    <Button
                      type="button"
                      className="rounded-full"
                      disabled={
                        claimChatMutation.isPending ||
                        claimCrmNegotiation.isPending ||
                        releaseCrmNegotiation.isPending ||
                        !canEditInbox ||
                        !canEditCrm
                      }
                      onClick={() => void handleClaimChatAndNegotiation()}
                      data-testid="inbox-claim-both"
                    >
                      <Hand className="mr-2 h-4 w-4" />
                      Assumir conversa e negócio
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="rounded-full"
                      disabled={
                        claimChatMutation.isPending ||
                        claimCrmNegotiation.isPending ||
                        releaseCrmNegotiation.isPending ||
                        !canEditInbox
                      }
                      onClick={() => {
                        void (async () => {
                          try {
                            await claimChatMutation.mutateAsync(activeChat.id);
                            toast({
                              title: "Conversa assumida",
                              description: "Você já pode ver e responder esta conversa.",
                            });
                          } catch (error) {
                            toast({
                              title: "Não foi possível assumir",
                              description: error instanceof Error ? error.message : "Tente novamente.",
                              variant: "destructive",
                            });
                          }
                        })();
                      }}
                    >
                      <Hand className="mr-2 h-4 w-4" />
                      Assumir conversa
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
          <div className="relative z-10 flex min-h-[59px] shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 md:px-5">
            {activeChat ? (
              <>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <ConversationAvatar name={activeChat.displayName} avatarUrl={activeChat.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="min-w-0 truncate text-[17px] font-medium text-foreground">{activeChat.displayName}</p>
                      {activeChat.channelType === "instagram" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-600 dark:text-pink-400">
                          <Instagram className="h-3 w-3" aria-hidden />
                          Instagram
                        </span>
                      ) : null}
                      <CustomerLocalTime
                        phone={activeChat.remotePhoneE164 ?? activeChat.remotePhoneDigits ?? null}
                      />
                      {activeChat.customerId && !linkedNegotiation && !linkedNegotiationLoading ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="hidden h-7 shrink-0 rounded-full text-xs sm:inline-flex"
                          disabled={!canEditCrm}
                          onClick={() => setCreateLeadOpen(true)}
                        >
                          <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                          Criar lead
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="hidden h-7 shrink-0 rounded-full text-xs sm:inline-flex"
                        onClick={() => {
                          setSchedulingInitial({
                            customerId: activeChat.customerId ?? undefined,
                            customerNome: activeChat.displayName ?? "",
                            customerTelefone: activeChat.remotePhoneE164 ?? activeChat.remotePhoneDigits ?? "",
                          });
                          setSchedulingOpen(true);
                        }}
                      >
                        <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                        Agendar
                      </Button>
                    </div>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                      <ChatFollowupBadge
                        followups={chatFollowups}
                        onClick={() => setFollowUpDialogOpen(true)}
                      />
                      <ChatCrmHeader chat={activeChat} />
                    </div>
                  </div>
                </div>

                <ChatHeaderActions
                  chat={activeChat}
                  negotiation={linkedNegotiation ?? null}
                  canEditInbox={canEditInbox}
                  canEditCrm={canEditCrm}
                  canActOnChat={canActOnChat}
                  canMarkSaleFromChat={canMarkSaleFromChat}
                  isManagerInbox={isManagerInbox}
                  activeChannelAiEnabled={activeChannelAiEnabled}
                  offerClaimBoth={offerClaimBoth}
                  showClaimNegotiation={showClaimNegotiation}
                  showReleaseNegotiation={showReleaseNegotiation}
                  viewerRole={profile?.role}
                  viewerProfileId={profileId}
                  claimPending={claimChatMutation.isPending}
                  claimNegotiationPending={claimCrmNegotiation.isPending}
                  releaseNegotiationPending={releaseCrmNegotiation.isPending}
                  onClaimChat={async () => {
                    try {
                      await claimChatMutation.mutateAsync(activeChat.id);
                    } catch (error) {
                      toast({
                        title: "Não foi possível assumir",
                        description: error instanceof Error ? error.message : "Tente novamente.",
                        variant: "destructive",
                      });
                    }
                  }}
                  onClaimNegotiation={async () => {
                    if (!linkedNegotiation) return;
                    try {
                      await claimCrmNegotiation.mutateAsync(linkedNegotiation.id);
                      toast({
                        title: "Negócio assumido",
                        description: `Você é o responsável por "${linkedNegotiation.title}".`,
                      });
                    } catch (error) {
                      toast({
                        title: "Não foi possível assumir o negócio",
                        description: error instanceof Error ? error.message : "Tente novamente.",
                        variant: "destructive",
                      });
                    }
                  }}
                  onReleaseNegotiation={async () => {
                    if (!linkedNegotiation) return;
                    try {
                      await releaseCrmNegotiation.mutateAsync(linkedNegotiation.id);
                      toast({
                        title: "Devolvido ao pool",
                        description: `"${linkedNegotiation.title}" está sem responsável.`,
                      });
                    } catch (error) {
                      toast({
                        title: "Não foi possível devolver o negócio",
                        description: error instanceof Error ? error.message : "Tente novamente.",
                        variant: "destructive",
                      });
                    }
                  }}
                  onClaimChatAndNegotiation={handleClaimChatAndNegotiation}
                  notificationSettings={notificationSettings}
                  onOpenSnoozeDialog={() => setSnoozeDialogOpen(true)}
                  onOpenAssignDialog={() => {
                    setAssignDialogChatId(activeChat.id);
                    setAssignDialogOpen(true);
                  }}
                  onOpenProfile={() => setProfileOpen(true)}
                  onOpenSaleFlow={handleOpenSaleFlow}
                  onOpenFollowUp={() => setFollowUpDialogOpen(true)}
                />
              </>
            ) : (
              <div className="px-1">
                <p className="text-xl font-semibold tracking-[-0.04em] text-foreground md:text-2xl">
                  AdvocaCHAT
                </p>
                <p className="mt-1 max-w-md text-sm font-medium text-muted-foreground">
                  Selecione uma conversa para exibir as mensagens ou comece uma nova pela lista ao lado.
                </p>
              </div>
            )}
          </div>

          <div className="relative z-10 min-h-0 flex-1 overflow-hidden bg-background flex flex-col">
            {activeChat && upcomingApptText ? (
              <div className="w-full bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between z-20 shrink-0 select-none shadow-sm dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300">
                <span className="font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {upcomingApptText}
                </span>
              </div>
            ) : null}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {!activeChat ? (
              <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15"
                  aria-hidden
                >
                  <svg viewBox="0 0 24 24" className="h-12 w-12 text-muted-foreground" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.718 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>
                <div className="max-w-md text-center">
                  {blockedRequestedChatId ? (
                    <p
                      data-testid="inbox-chat-blocked"
                      className="mb-4 rounded-xl border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-4 py-3 text-sm text-[var(--crm-amber-ink)]"
                      role="status"
                    >
                      {chatAssignedToOtherAttendantMessage()}
                    </p>
                  ) : null}
                  <p className="text-2xl font-semibold tracking-tight text-foreground">converse. entenda. resolva.</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {blockedRequestedChatId
                      ? "Esta conversa não está disponível para o seu usuário. Escolha outra na lista ao lado."
                      : "Selecione uma conversa na lista ao lado para visualizar o historico e responder seus clientes."}
                  </p>
                </div>
              </div>
            ) : messagesLoading ? (
              <div className="flex h-full items-center justify-center text-sm font-medium text-muted-foreground">
                Carregando mensagens...
              </div>
            ) : messageGroups.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm font-medium text-muted-foreground">
                Essa conversa ainda nao possui mensagens sincronizadas.
              </div>
            ) : (
              <MessageThread
                scrollRef={messagesScrollAreaRef}
                messageGroups={messageGroups}
                activeChatName={activeChat.displayName}
                activeChatAvatarUrl={activeChat.avatarUrl}
                hasMoreOlder={hasNextPage}
                isLoadingOlder={isFetchingNextPage}
                onLoadOlder={handleLoadOlderMessages}
                onRetryMessage={composer.handleRetryMessage}
                onDiscardMessage={composer.handleDiscardMessage}
                onReplyMessage={composer.setReplyingTo}
                activeChatId={activeChat.id}
                retryingMessageId={composer.retryingMessageId}
                jumpToLatestVisible={jumpToLatestVisible}
                onJumpToLatest={forceScrollToLatestMessage}
                onScrollStateChange={handleThreadScrollStateChange}
              />
            )}
            </div>
          </div>

          <MessageInput
            bodyTextareaRef={composer.bodyTextareaRef}
            mediaUrlInputRef={composer.mediaUrlInputRef}
            attachmentInputRef={composer.attachmentInputRef}
            messageType={composer.messageType}
            onMessageTypeChange={composer.setMessageType}
            simulateTyping={composer.simulateTyping}
            onSimulateTypingChange={composer.setSimulateTyping}
            mediaUrl={composer.mediaUrl}
            onMediaUrlChange={composer.setMediaUrl}
            payloadText={composer.payloadText}
            onPayloadTextChange={composer.setPayloadText}
            selectedAttachmentName={composer.selectedAttachmentName}
            attachmentMimeType={composer.attachmentMimeType}
            bodyText={composer.bodyText}
            onBodyTextChange={(value) => {
              if (value === "/" && composer.bodyText === "") {
                composer.setQuickReplyOpen(true);
                return;
              }
              composer.setBodyText(value);
            }}
            onSend={composer.handleSendMessage}
            sendDisabled={
              composer.attachmentUploading ||
              !activeChat ||
              !canEditInbox ||
              inboxLeadLocked ||
              (composer.noteMode
                ? !composer.bodyText.trim() || composer.createChatNote.isPending
                : composer.messageType === "text"
                ? !composer.bodyText.trim()
                : !composer.bodyText.trim() && !composer.mediaUrl.trim())
            }
            composerActionsDisabled={inboxLeadLocked || !canEditInbox}
            noteMode={composer.noteMode}
            onNoteModeChange={(value) => {
              composer.setNoteMode(value);
              setTimeout(() => composer.bodyTextareaRef.current?.focus(), 50);
            }}
            showEmojiPicker={composer.showEmojiPicker}
            onToggleEmojiPicker={() => composer.setShowEmojiPicker(!composer.showEmojiPicker)}
            onAppendEmoji={composer.appendEmoji}
            onAttachmentButtonClick={() => composer.attachmentInputRef.current?.click()}
            onAttachmentChange={composer.handleAttachmentSelection}
            attachmentUploading={composer.attachmentUploading}
            attachmentProgress={composer.attachmentProgress}
            microphoneState={composer.microphoneState}
            isRecording={composer.isRecording}
            isRecordingPaused={composer.isRecordingPaused}
            recordingDurationSec={composer.recordingDurationSec}
            onMicrophoneClick={composer.handleMicrophoneClick}
            onRecordingPauseToggle={composer.handleRecordingPauseToggle}
            quickReplies={quickReplies}
            quickReplyOpen={composer.quickReplyOpen}
            onQuickReplyOpenChange={composer.setQuickReplyOpen}
            onQuickReplyShortcutOpen={() => composer.setQuickReplyOpen(true)}
            onSelectQuickReply={(reply) => {
              composer.setBodyText(reply.bodyText);
              composer.setMessageType("text");
              composer.setQuickReplyOpen(false);
              setTimeout(() => composer.bodyTextareaRef.current?.focus(), 50);
            }}
            onClearAttachment={() => composer.resetComposerAttachmentState({ keepBodyText: true })}
            replyingTo={composer.replyingTo}
            activeChatName={activeChat?.displayName}
            onCancelReply={() => composer.setReplyingTo(null)}
            onSuggestReply={handleSuggestReply}
            isSuggestingReply={suggestReplyMutation.isPending}
            suggestReplyDisabled={composer.bodyText.trim().length > 0 || messages.length === 0}
            crmSuggestNegotiationId={linkedNegotiation?.id ?? null}
            onCrmSuggestApply={(text) => {
              composer.setBodyText(text);
              requestAnimationFrame(() => composer.bodyTextareaRef.current?.focus());
            }}
            onSendDocumentLink={() => setInboxDocLinkOpen(true)}
          />
            </>
          )}
        </section>
      </div>
      <CustomerProfileSheet
        open={profileOpen && !mustAssumeChatToView}
        onOpenChange={setProfileOpen}
        chat={activeChat}
        messages={messages}
        crmActionsLocked={inboxLeadLocked || !canEditInbox || !canEditCrm}
        channelAiEnabled={activeChannelAiEnabled}
        onChatDeleted={() => {
          setActiveChatId(null);
          setProfileOpen(false);
        }}
      />

      {/* Diálogo de atribuição/transferência de conversa */}
      {activeChat ? (
        <>
          <SnoozeChatDialog
            open={snoozeDialogOpen}
            onOpenChange={setSnoozeDialogOpen}
            pending={snoozeChatMutation.isPending}
            onConfirm={(until) =>
              snoozeChatMutation.mutateAsync({ chatId: activeChat.id, until })
            }
          />
          <CreateLeadDialog
            chat={activeChat}
            open={createLeadOpen}
            onOpenChange={setCreateLeadOpen}
            canEditCrm={canEditCrm}
            canActOnChat={canActOnChat}
          />
          <FollowUpDialog
            chat={activeChat}
            open={followUpDialogOpen}
            onOpenChange={setFollowUpDialogOpen}
            profileId={profileId}
          />
          <Dialog open={tagsDialogOpen} onOpenChange={setTagsDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Etiquetas da conversa</DialogTitle>
                <DialogDescription>
                  Aplique ou crie etiquetas sem abrir o perfil do cliente.
                </DialogDescription>
              </DialogHeader>
              <ChatTagsPicker
                chatId={activeChat.id}
                tags={activeChat.tags ?? []}
                disabled={inboxLeadLocked || !canEditInbox}
                messages={messages}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={inboxDocLinkOpen} onOpenChange={setInboxDocLinkOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Coleta segura no caso
                </DialogTitle>
                <DialogDescription>
                  Os links antigos de ficha clínica e orçamento foram desativados.
                  Abra ou crie o caso jurídico para solicitar documentos com acesso individual e prazo de validade.
                  Os documentos já salvos continuam disponíveis.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setInboxDocLinkOpen(false)}>Fechar</Button>
                <Button onClick={() => navigate("/casos")}>Abrir casos</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AppointmentDialog
            open={schedulingOpen}
            onOpenChange={setSchedulingOpen}
            providers={allProviders}
            initial={schedulingInitial}
          />
        </>
      ) : null}

      <AssignChatDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        chat={assignDialogChat}
        atendimentoUsers={atendimentoUsers}
        canManageChatPool={canManageChatPool}
        profileId={profileId}
      />

      <MarkWinDialog
        open={Boolean(activeChat) && markQuickSaleDialogOpen}
        onOpenChange={(open) => {
          setMarkQuickSaleDialogOpen(open);
        }}
        initialValue={linkedNegotiation?.totalValue ?? 0}
        initialLines={markWinInitialLines}
        pending={
          updateCrmNegotiationMutation.isPending ||
          setChatResolutionMutation.isPending ||
          (Boolean(activeChat?.primaryNegotiationId) &&
            linkedNegotiationLoading &&
            markQuickSaleDialogOpen)
        }
        onConfirm={async ({ lines, totalValue, paymentMethod }) => {
          const lineError = validateMarkWinLines(lines);
          if (lineError) {
            toast({ title: "Venda incompleta", description: lineError, variant: "destructive" });
            return;
          }
          if (!activeChat) return;
          if (
            !hasSaleAttendant({
              chatAssigneeId: activeChat.assigneeId,
              negotiationAssigneeId: linkedNegotiation?.assigneeId,
              profileId,
              role: profile?.role,
            })
          ) {
            toast({
              title: "Assuma o negócio",
              description: !canActOnChat
                ? chatAssigneeBlockedMessage()
                : negotiationAssigneeBlockedMessage(),
              variant: "destructive",
            });
            return;
          }
          if (!isSupabaseConfigured) {
            toast({
              title: "Supabase não configurado",
              description: "Configure o Supabase para marcar vendas no CRM.",
              variant: "destructive",
            });
            return;
          }
          if (activeChat.primaryNegotiationId && linkedNegotiationLoading) {
            toast({
              title: "Aguarde",
              description: "Carregando o negócio vinculado ao chat…",
            });
            return;
          }
          if (!linkedNegotiation) {
            toast({
              title: "Negócio não vinculado",
              description:
                "Use “Criar lead no CRM” ou “Vincular ao CRM” no cabeçalho da conversa antes de marcar a venda.",
              variant: "destructive",
            });
            return;
          }
          if (linkedNegotiation.status === "vendido") {
            toast({
              title: "Já marcado como venda",
              description: "Este negócio já está como vendido no CRM.",
            });
            return;
          }
          if (linkedNegotiation.status === "perdido") {
            toast({
              title: "Não foi possível",
              description:
                "Negócios marcados como perdidos não podem ser convertidos em venda por aqui.",
              variant: "destructive",
            });
            return;
          }

          const saleStageId = resolveConfiguredSaleStageId(
            effectiveCrmFunnels,
            linkedNegotiation.funnelId,
          );

          try {
            await updateCrmNegotiationMutation.mutateAsync({
              id: linkedNegotiation.id,
              patch: {
                status: "vendido",
                stageId: saleStageId,
                totalValue,
              },
            });
            const soldBy =
              activeChat.assigneeId?.trim() ||
              linkedNegotiation.assigneeId?.trim() ||
              profile?.id?.trim();
            if (soldBy) {
              await persistMarkWinSale({
                chatId: activeChat.id,
                customerId: activeChat.customerId ?? linkedNegotiation.customerId ?? null,
                soldBy,
                lines,
                paymentMethod,
              });
              invalidateSalesQueries(
                queryClient,
                activeChat.customerId ?? linkedNegotiation.customerId,
              );
            }
            await setChatResolutionMutation.mutateAsync({
              chatId: activeChat.id,
              resolution: "resolved",
            });
            const itemsLabel =
              lines.length === 1
                ? lines[0]?.productName
                : `${lines.length} itens`;
            toast({
              title: "Venda registrada",
              description: itemsLabel
                ? `${itemsLabel} — ${formatMoney(totalValue)}. Conversa marcada como resolvida.`
                : `Negócio atualizado (${formatMoney(totalValue)}). A conversa foi marcada como resolvida.`,
            });
            useAppStore.getState().addNotification({
              tipo: "sucesso",
              titulo: "CRM atualizado",
              descricao: "Negócio como vendido e conversa resolvida.",
            });
          } catch (err) {
            toast({
              title: "Não foi possível salvar",
              description: err instanceof Error ? err.message : "Tente novamente.",
              variant: "destructive",
            });
            throw err;
          }
        }}
      />
    </div>
  );
}
