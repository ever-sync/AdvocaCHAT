import { CheckCheck, ChevronDown, Instagram, ListFilter, MessageCircle, Search, Tag, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { inboxQuickFilterLabel } from "@/lib/inbox-quick-filters";
import type { ChatTag, InboxChat, InboxListScope, InboxQuickFilter, UserRole, WhatsappInstance } from "@/types/domain";
import { ConversationRow } from "./ConversationRow";

export type ConversationListProps = {
  search: string;
  onSearchChange: (value: string) => void;
  selectedInstanceIds: string[];
  onInstanceToggle: (instanceId: string) => void;
  onClearInstances: () => void;
  /** Alinhado aos estados do seletor de resolução no cabeçalho do chat (InboxListScope). */
  listScope: InboxListScope;
  onListScopeChange: (value: InboxListScope) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  snoozedFilter: "active" | "snoozed";
  onSnoozedFilterChange: (value: "active" | "snoozed") => void;
  quickFilter: InboxQuickFilter | null;
  onQuickFilterChange: (value: InboxQuickFilter | null) => void;
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  availableTags: ChatTag[];
  tagsLoading?: boolean;
  instances: WhatsappInstance[];
  chatsLoading: boolean;
  chats: InboxChat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onPrefetchChat: (chatId: string) => void;
  /** Papel do usuário logado: repassado às linhas para ocultar preview de chats do pool. */
  viewerRole?: UserRole;
  /** @deprecated Navegação ficou no rail estilo WhatsApp; mantido por compatibilidade. */
  showPainelExit?: boolean;
  searchInputRef?: RefObject<HTMLInputElement>;
  /** Gestor: filtra inbox por atendente específico. */
  assigneeFilterOptions?: ReadonlyArray<{ id: string; name: string }>;
  /** Gestor: atalho para fila sem responsável. */
  managerUnassignedCount?: number;
  onOpenUnassignedQueue?: () => void;
  selectedChatIds?: string[];
  onChatSelectionToggle?: (chatId: string) => void;
  onClearChatSelection?: () => void;
  onApplyTagToChats?: (chatIds: string[], tagId: string) => void;
  applyingTagToChats?: boolean;
  onDeleteChats?: (chatIds: string[]) => void;
  deletingChats?: boolean;
  onPinChat?: (chatId: string, isPinned: boolean) => void;
  /** Índice de follow-ups por customer/negotiation. Derivamos status por linha. */
  followupIndex?: {
    overdue: { customerIds: ReadonlySet<string>; negotiationIds: ReadonlySet<string> };
    soon: { customerIds: ReadonlySet<string>; negotiationIds: ReadonlySet<string> };
  };
};

type FilterSelectsProps = {
  listScope: InboxListScope;
  onListScopeChange: (value: InboxListScope) => void;
  snoozedFilter: "active" | "snoozed";
  onSnoozedFilterChange: (value: "active" | "snoozed") => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  assigneeFilterOptions?: ReadonlyArray<{ id: string; name: string }>;
};

function ConversationFilterSelects({
  listScope,
  onListScopeChange,
  snoozedFilter,
  onSnoozedFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  assigneeFilterOptions,
}: FilterSelectsProps) {
  return (
    <>
      <Select
        value={listScope}
        onValueChange={(value) => onListScopeChange(value as InboxListScope)}
      >
        <SelectTrigger className="h-9 rounded-lg border-0 bg-wchat-50 text-xs text-foreground focus:ring-primary">
          <SelectValue placeholder="Situacao" />
        </SelectTrigger>
        <SelectContent className="border-border bg-card text-foreground">
          <SelectItem value="all">Todas</SelectItem>
          <SelectItem value="open">Em aberto</SelectItem>
          <SelectItem value="closed">Encerradas</SelectItem>
          <SelectItem value="resolved">Resolvida</SelectItem>
          <SelectItem value="lost">Perdidas</SelectItem>
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-2">
        <Select
          value={snoozedFilter}
          onValueChange={(value) => onSnoozedFilterChange(value as "active" | "snoozed")}
        >
          <SelectTrigger className="h-9 rounded-lg border-0 bg-wchat-50 text-xs text-foreground focus:ring-primary">
            <SelectValue placeholder="Fila" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="active">Ativas</SelectItem>
            <SelectItem value="snoozed">Adiadas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={onAssigneeFilterChange}>
          <SelectTrigger className="h-9 rounded-lg border-0 bg-wchat-50 text-xs text-foreground focus:ring-primary">
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent className="border-border bg-card text-foreground">
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="mine">Meus</SelectItem>
            <SelectItem value="unassigned">Sem responsável</SelectItem>
            {assigneeFilterOptions?.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

type TagFilterListProps = {
  tagsLoading: boolean;
  availableTags: ChatTag[];
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  onClearTags: () => void;
  onAfterClear?: () => void;
};

function ConversationTagFilterList({
  tagsLoading,
  availableTags,
  selectedTagIds,
  onTagToggle,
  onClearTags,
  onAfterClear,
}: TagFilterListProps) {
  const activeTagCount = selectedTagIds.length;

  if (tagsLoading) {
    return <p className="px-1 py-3 text-center text-xs text-muted-foreground">Carregando etiquetas...</p>;
  }
  if (availableTags.length === 0) {
    return (
      <p className="px-1 py-3 text-center text-xs text-muted-foreground">Nenhuma etiqueta cadastrada ainda.</p>
    );
  }

  return (
    <>
      <div className="max-h-52 space-y-0.5 overflow-y-auto overscroll-y-contain">
        {availableTags.map((tag) => {
          const checked = selectedTagIds.includes(tag.id);
          return (
            <label
              key={tag.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs hover:bg-wchat-50"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onTagToggle(tag.id)}
                aria-label={tag.name}
              />
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
            </label>
          );
        })}
      </div>
      {activeTagCount > 0 ? (
        <button
          type="button"
          onClick={() => {
            onClearTags();
            onAfterClear?.();
          }}
          className="mt-1 w-full rounded-md px-2 py-2 text-center text-xs font-medium text-primary hover:bg-wchat-50"
        >
          Limpar filtro
        </button>
      ) : null}
    </>
  );
}

export function ConversationList({
  search,
  onSearchChange,
  selectedInstanceIds,
  onInstanceToggle,
  onClearInstances,
  listScope,
  onListScopeChange,
  assigneeFilter,
  onAssigneeFilterChange,
  snoozedFilter,
  onSnoozedFilterChange,
  quickFilter,
  onQuickFilterChange,
  selectedTagIds,
  onTagToggle,
  onClearTags,
  availableTags,
  tagsLoading = false,
  instances,
  chatsLoading,
  chats,
  activeChatId,
  onSelectChat,
  onPrefetchChat,
  viewerRole,
  searchInputRef,
  assigneeFilterOptions,
  managerUnassignedCount,
  onOpenUnassignedQueue,
  selectedChatIds = [],
  onChatSelectionToggle,
  onClearChatSelection,
  onApplyTagToChats,
  applyingTagToChats = false,
  onDeleteChats,
  deletingChats = false,
  onPinChat,
  followupIndex,
}: ConversationListProps) {
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(Boolean(search));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const activeTagCount = selectedTagIds.length;
  const selectedChatCount = selectedChatIds.length;
  const selectionMode = selectedChatCount > 0;
  const selectedChatSet = useMemo(() => new Set(selectedChatIds), [selectedChatIds]);
  const selectedInstanceLabel = useMemo(() => {
    if (selectedInstanceIds.length === 0) return "Todas";
    if (selectedInstanceIds.length === 1) {
      return instances.find((i) => i.id === selectedInstanceIds[0])?.displayName ?? "1 instância";
    }
    return `${selectedInstanceIds.length} instâncias`;
  }, [instances, selectedInstanceIds]);

  const listHeading = inboxQuickFilterLabel(quickFilter);
  const unreadCount = useMemo(
    () => chats.reduce((total, chat) => total + (chat.unreadCount ?? 0), 0),
    [chats],
  );
  const whatsappInstanceIds = useMemo(
    () => instances.filter((instance) => instance.provider !== "meta_instagram").map((instance) => instance.id),
    [instances],
  );
  const instagramInstanceIds = useMemo(
    () => instances.filter((instance) => instance.provider === "meta_instagram").map((instance) => instance.id),
    [instances],
  );

  function selectInstanceGroup(instanceIds: string[]) {
    onClearInstances();
    instanceIds.forEach((instanceId) => onInstanceToggle(instanceId));
  }

  function isInstanceGroupSelected(instanceIds: string[]) {
    return instanceIds.length > 0 &&
      selectedInstanceIds.length === instanceIds.length &&
      instanceIds.every((instanceId) => selectedInstanceIds.includes(instanceId));
  }

  const hasCustomFilters =
    selectedInstanceIds.length > 0 ||
    listScope !== "open" ||
    assigneeFilter !== "all" ||
    snoozedFilter !== "active" ||
    quickFilter !== null ||
    activeTagCount > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: chats.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    getItemKey: (index) => chats[index]?.id ?? index,
    overscan: 8,
  });

  function openContextMenu(chatId: string, event: MouseEvent) {
    event.preventDefault();
    setContextMenu({ chatId, x: event.clientX, y: event.clientY });
  }

  const contextTargetIds =
    contextMenu && selectedChatSet.has(contextMenu.chatId) && selectedChatIds.length > 0
      ? selectedChatIds
      : contextMenu
        ? [contextMenu.chatId]
        : [];

  const contextMenuChat = contextMenu ? chats.find((c) => c.id === contextMenu.chatId) : null;

  /**
   * Para cada chat, deriva o status de follow-up (overdue / soon / null) a
   * partir dos Sets de customer/negotiation. Mapa por chatId facilita o memo
   * do ConversationRow — passamos só uma string primitiva por linha.
   */
  const followupStatusByChatId = useMemo(() => {
    if (!followupIndex) return new Map<string, "overdue" | "soon">();
    const out = new Map<string, "overdue" | "soon">();
    for (const chat of chats) {
      const cId = chat.customerId ?? null;
      const nId = chat.primaryNegotiationId ?? null;
      const overdue =
        (cId && followupIndex.overdue.customerIds.has(cId)) ||
        (nId && followupIndex.overdue.negotiationIds.has(nId));
      if (overdue) {
        out.set(chat.id, "overdue");
        continue;
      }
      const soon =
        (cId && followupIndex.soon.customerIds.has(cId)) ||
        (nId && followupIndex.soon.negotiationIds.has(nId));
      if (soon) out.set(chat.id, "soon");
    }
    return out;
  }, [chats, followupIndex]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-hidden border-r border-border bg-card md:max-w-[336px] lg:max-w-none">
      <div className="shrink-0 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-xl font-bold leading-tight text-foreground">Conversas</h1>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold tabular-nums text-rose-600">
              {unreadCount}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-wchat-50 hover:text-foreground",
                searchOpen && "border-primary/35 bg-primary/5 text-primary",
              )}
              aria-label="Pesquisar conversas"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((open) => !open);
                window.setTimeout(() => searchInputRef?.current?.focus(), 0);
              }}
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </button>
            <Popover open={filtersPanelOpen} onOpenChange={setFiltersPanelOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-wchat-50 hover:text-foreground"
                  aria-label="Filtros"
                >
                  <ListFilter className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                  {hasCustomFilters ? (
                    <span
                      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary shadow-sm ring-2 ring-card"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-[min(calc(100vw-1.5rem),20rem)] border-border bg-card p-3 text-foreground"
              >
                <p className="mb-2 text-sm font-semibold tracking-tight">Filtros</p>
                <div className="space-y-2.5">
                  <ConversationFilterSelects
                    listScope={listScope}
                    onListScopeChange={onListScopeChange}
                    snoozedFilter={snoozedFilter}
                    onSnoozedFilterChange={onSnoozedFilterChange}
                    assigneeFilter={assigneeFilter}
                    onAssigneeFilterChange={onAssigneeFilterChange}
                    assigneeFilterOptions={assigneeFilterOptions}
                  />
                  <div className="border-t border-border pt-2.5">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Etiquetas</p>
                    <ConversationTagFilterList
                      tagsLoading={tagsLoading}
                      availableTags={availableTags}
                      selectedTagIds={selectedTagIds}
                      onTagToggle={onTagToggle}
                      onClearTags={onClearTags}
                      onAfterClear={() => setFiltersPanelOpen(false)}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {managerUnassignedCount != null && managerUnassignedCount > 0 && onOpenUnassignedQueue ? (
          <button
            type="button"
            data-testid="inbox-manager-queue"
            onClick={onOpenUnassignedQueue}
            className="mt-2 flex w-full items-center justify-between rounded-lg border border-[var(--crm-amber-border)] bg-[var(--crm-amber-tint)] px-2.5 py-2 text-left text-xs font-medium text-[var(--crm-amber-ink)] transition-colors hover:bg-[var(--crm-amber-tint)]"
          >
            <span>Fila: {managerUnassignedCount} sem responsável</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-amber-ink)]">Ver</span>
          </button>
        ) : null}

        <div className="mt-3 space-y-2.5">
          {searchOpen ? <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Pesquisar"
              className="h-9 rounded-lg border-0 bg-wchat-50 pl-9 text-[13px] text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div> : null}

          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Filtrar por instâncias"
                  className={cn(
                    "flex h-[52px] min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 text-left text-xs text-foreground transition-colors hover:bg-wchat-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                    selectedInstanceIds.length > 0 && "ring-1 ring-primary/35",
                  )}
                >
                  <span className="flex min-w-0 flex-col truncate">
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Canal selecionado</span>
                    <span className="mt-0.5 truncate font-semibold">{selectedInstanceLabel}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[var(--radix-popover-trigger-width)] border-border bg-card p-1.5 text-foreground"
              >
                <button
                  type="button"
                  onClick={onClearInstances}
                  className="mb-1 w-full rounded-md px-2 py-2 text-left text-xs font-medium hover:bg-wchat-50"
                >
                  Todas as instâncias
                </button>
                <div className="max-h-56 space-y-0.5 overflow-y-auto">
                  {instances.map((instance) => {
                    const checked = selectedInstanceIds.includes(instance.id);
                    return (
                      <label
                        key={instance.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-wchat-50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => onInstanceToggle(instance.id)}
                          aria-label={instance.displayName}
                        />
                        <span className="min-w-0 flex-1 truncate">{instance.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

          </div>

          <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-wchat-50 p-1" role="group" aria-label="Filtrar por canal">
            <button
              type="button"
              aria-pressed={isInstanceGroupSelected(whatsappInstanceIds)}
              onClick={() => selectInstanceGroup(whatsappInstanceIds)}
              disabled={whatsappInstanceIds.length === 0}
              className={cn(
                "flex h-9 items-center justify-center rounded-xl transition-colors disabled:opacity-35",
                isInstanceGroupSelected(whatsappInstanceIds) ? "bg-emerald-500 text-white shadow-sm" : "text-muted-foreground hover:bg-card",
              )}
              aria-label="WhatsApp"
            >
              <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              type="button"
              aria-pressed={isInstanceGroupSelected(instagramInstanceIds)}
              onClick={() => selectInstanceGroup(instagramInstanceIds)}
              disabled={instagramInstanceIds.length === 0}
              className={cn(
                "flex h-9 items-center justify-center rounded-xl transition-colors disabled:opacity-35",
                isInstanceGroupSelected(instagramInstanceIds) ? "bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white shadow-sm" : "text-muted-foreground hover:bg-card",
              )}
              aria-label="Instagram"
            >
              <Instagram className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button type="button" disabled className="flex h-9 items-center justify-center rounded-xl text-muted-foreground opacity-35" aria-label="Messenger indisponível">
              <MessageCircle className="h-[18px] w-[18px] fill-current" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={() => onQuickFilterChange(quickFilter === "unread" ? null : "unread")}
            className={cn(
              "flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold transition-colors",
              quickFilter === "unread" ? "border-primary/30 bg-primary/5 text-primary" : "bg-card text-muted-foreground hover:bg-wchat-50 hover:text-foreground",
            )}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            {quickFilter === "unread" ? "Mostrar todas" : `Ver não lidas (${unreadCount})`}
          </button>

          {selectedTagIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedTagIds.map((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <button
                    key={tagId}
                    type="button"
                    onClick={() => onTagToggle(tagId)}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${tag.color}33`, color: tag.color }}
                  >
                    {tag.name}
                    <X className="h-2.5 w-2.5" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {chatsLoading ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 scrollbar-hide">
          <div className="rounded-lg bg-wchat-50 px-3 py-6 text-center text-sm text-muted-foreground">
            Carregando conversas...
          </div>
        </div>
      ) : chats.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 scrollbar-hide">
          <div className="rounded-lg bg-wchat-50 px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhuma conversa encontrada.
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between px-3.5 pb-1 pt-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {listHeading}
            </p>
            <div className="flex items-center gap-2">
              {selectionMode ? (
                <button
                  type="button"
                  onClick={onClearChatSelection}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {selectedChatCount} selecionada{selectedChatCount > 1 ? "s" : ""}
                </button>
              ) : null}
              <span className="text-[11px] tabular-nums text-muted-foreground">{chats.length}</span>
            </div>
          </div>
          {selectionMode ? (
            <div className="mx-1.5 mb-1 flex shrink-0 items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {selectedChatCount} conversa{selectedChatCount > 1 ? "s" : ""} selecionada{selectedChatCount > 1 ? "s" : ""}
              </span>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={applyingTagToChats}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    <Tag className="h-3 w-3" />
                    Etiquetar
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 border-border bg-card p-1.5">
                  <ConversationTagActionList
                    tags={availableTags}
                    disabled={applyingTagToChats}
                    onSelect={(tagId) => onApplyTagToChats?.(selectedChatIds, tagId)}
                  />
                </PopoverContent>
              </Popover>

              {viewerRole === "admin" && (
                <>
                  <button
                    type="button"
                    disabled={deletingChats}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-red-600 px-2.5 text-xs font-semibold text-white disabled:opacity-60 hover:bg-red-700"
                  >
                    <Trash2 className="h-3 w-3" />
                    Excluir
                  </button>
                  <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <AlertDialogContent className="border-border bg-card text-foreground">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir conversas selecionadas?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground text-sm">
                          Tem certeza que deseja excluir permanentemente as {selectedChatCount} conversas selecionadas? Esta ação removerá as conversas e todas as suas mensagens do banco de dados, e não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletingChats}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deletingChats}
                          onClick={async (e) => {
                            e.preventDefault();
                            if (onDeleteChats) {
                              await onDeleteChats(selectedChatIds);
                              setDeleteConfirmOpen(false);
                            }
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {deletingChats ? "Excluindo..." : "Excluir"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <button
                type="button"
                onClick={onClearChatSelection}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-wchat-100"
                aria-label="Limpar seleção"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-1.5 pb-1.5 scrollbar-hide"
          >
            {/* Virtualizado: só renderiza as linhas visíveis (+overscan). */}
            <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const chat = chats[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-0.5"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <ConversationRow
                      chat={chat}
                      active={activeChatId === chat.id}
                      onSelect={onSelectChat}
                      onPrefetch={onPrefetchChat}
                      viewerRole={viewerRole}
                      followupStatus={followupStatusByChatId.get(chat.id) ?? null}
                      selected={selectedChatSet.has(chat.id)}
                      selectionMode={selectionMode}
                      onSelectionToggle={onChatSelectionToggle}
                      onContextMenu={openContextMenu}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {contextMenu ? (
        <div
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          role="presentation"
          onClick={() => setContextMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="fixed z-50 w-60 rounded-lg border border-border bg-card p-1.5 text-left shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Etiquetar conversa{contextTargetIds.length > 1 ? "s" : ""}
            </p>
            <ConversationTagActionList
              tags={availableTags}
              disabled={applyingTagToChats}
              onSelect={(tagId) => {
                onApplyTagToChats?.(contextTargetIds, tagId);
                setContextMenu(null);
              }}
            />
            <button
              type="button"
              className="mt-1 w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-wchat-50"
              onClick={() => {
                onChatSelectionToggle?.(contextMenu.chatId);
                setContextMenu(null);
              }}
            >
              {selectedChatSet.has(contextMenu.chatId) ? "Remover da seleção" : "Selecionar conversa"}
            </button>
            {onPinChat ? (
              <button
                type="button"
                className="w-full rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-wchat-50"
                onClick={() => {
                  onPinChat(contextMenu.chatId, !contextMenuChat?.isPinned);
                  setContextMenu(null);
                }}
              >
                {contextMenuChat?.isPinned ? "Desafixar conversa" : "Fixar conversa"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ConversationTagActionList({
  tags,
  disabled,
  onSelect,
}: {
  tags: ChatTag[];
  disabled?: boolean;
  onSelect: (tagId: string) => void;
}) {
  if (tags.length === 0) {
    return <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>;
  }

  return (
    <div className="max-h-56 overflow-y-auto">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(tag.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-wchat-50 disabled:opacity-60"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
          <span className="min-w-0 flex-1 truncate font-medium">{tag.name}</span>
        </button>
      ))}
    </div>
  );
}
