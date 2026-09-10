import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowDown, ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { ForwardMessageDialog } from "./ForwardMessageDialog";
import {
  bubbleGroupSpacingClass,
  flattenMessageGroups,
  type MessageDayGroup,
  type ThreadFlattenItem,
} from "@/lib/inboxMessageGroups";
import { textContainsQuery } from "@/lib/inboxTextHighlight";
import type { ChatNote, WhatsappMessage } from "@/types/domain";
import { useTheme } from "next-themes";
import { MessageBubble } from "./MessageBubble";
import { WHATSAPP_CHAT_BG, WHATSAPP_CHAT_BG_DARK } from "./whatsappChatBg";

function NoteBubble({ note }: { note: ChatNote }) {
  const time = new Date(note.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex justify-center px-4 py-1">
      <div className="max-w-[75%] rounded-xl border border-[var(--inbox-gold-ink)] bg-[var(--inbox-gold-ink)] px-4 py-2.5 shadow-[0_1px_0.5px_rgba(0,0,0,0.4)]">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-full bg-[var(--inbox-gold-ink)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--inbox-gold)]">
            Nota interna
          </span>
          <span className="text-[12px] text-[var(--inbox-gold)]">{note.authorName}</span>
        </div>
        <p className="whitespace-pre-wrap text-[14px] leading-[1.4] text-[var(--inbox-gold-bg)]">{note.bodyText}</p>
        <p className="mt-1.5 text-right text-[11px] text-[var(--inbox-gold)]">{time}</p>
      </div>
    </div>
  );
}

export type MessageThreadProps = {
  scrollRef: RefObject<HTMLDivElement>;
  messageGroups: MessageDayGroup[];
  activeChatName: string;
  activeChatAvatarUrl?: string | null;
  hasMoreOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  onRetryMessage?: (message: WhatsappMessage) => void;
  onDiscardMessage?: (message: WhatsappMessage) => void;
  /** Disparado pelo botão de hover "Responder" de cada bolha. */
  onReplyMessage?: (message: WhatsappMessage) => void;
  /** ID da conversa ativa — para excluir ela da lista de destinos de encaminhamento. */
  activeChatId?: string | null;
  retryingMessageId?: string | null;
  jumpToLatestVisible?: boolean;
  onJumpToLatest?: () => void;
  onScrollStateChange?: (state: { atBottom: boolean; distanceFromBottom: number }) => void;
};

/**
 * Estimativa por tipo: aproxima o virtualizer da altura real ANTES do
 * `measureElement` rodar, reduzindo "saltos" de scroll quando midia/audio
 * entram no DOM (cuja altura difere bastante de uma bolha de texto).
 */
function estimateThreadItemSize(item: ThreadFlattenItem | undefined): number {
  if (!item) return 108;
  if (item.kind === "day") return 52;
  if (item.kind === "note") return 96;

  const message = item.message;
  switch (message.messageType) {
    case "media":
      return 280; // imagem/video
    case "audio":
      return 96; // controle de audio compacto
    case "document":
      return 96; // card de documento
    case "location":
    case "contact":
      return 140;
    default: {
      const length = message.bodyText?.length ?? 0;
      if (length > 280) return 200;
      if (length > 120) return 140;
      return 96;
    }
  }
}

export function MessageThread({
  scrollRef,
  messageGroups,
  activeChatName,
  activeChatAvatarUrl,
  hasMoreOlder = false,
  isLoadingOlder = false,
  onLoadOlder,
  onRetryMessage,
  onDiscardMessage,
  onReplyMessage,
  activeChatId,
  retryingMessageId = null,
  jumpToLatestVisible = false,
  onJumpToLatest,
  onScrollStateChange,
}: MessageThreadProps) {
  // Fundo do chat por tema. resolvedTheme só existe após montar; até lá lemos a
  // classe `dark` do <html> (já posta pelo script anti-flash) para não piscar.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme
    ? resolvedTheme === "dark"
    : typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const chatBg = isDark ? WHATSAPP_CHAT_BG_DARK : WHATSAPP_CHAT_BG;

  const flat = useMemo(() => flattenMessageGroups(messageGroups), [messageGroups]);

  // Lookup id → mensagem para resolver `quotedMessage` de cada bolha em O(1).
  // Construído a partir do mesmo dataset já achatado.
  const messageById = useMemo(() => {
    const map = new Map<string, WhatsappMessage>();
    for (const item of flat) {
      if (item.kind === "msg") {
        map.set(item.message.id, item.message);
      }
    }
    return map;
  }, [flat]);

  const [playingAudioMessageId, setPlayingAudioMessageId] = useState<string | null>(null);
  const playingAudioIndex = useMemo(() => {
    if (!playingAudioMessageId) return null;
    const index = flat.findIndex(
      (item) => item.kind === "msg" && item.message.id === playingAudioMessageId,
    );
    return index >= 0 ? index : null;
  }, [flat, playingAudioMessageId]);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (playingAudioIndex == null || indexes.includes(playingAudioIndex)) {
        return indexes;
      }
      return [...indexes, playingAudioIndex].sort((a, b) => a - b);
    },
    [playingAudioIndex],
  );

  const estimateSize = useCallback(
    (index: number) => estimateThreadItemSize(flat[index]),
    [flat],
  );

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey: (index) => flat[index]?.key ?? index,
    rangeExtractor,
    overscan: 8,
  });

  // --- Encaminhar mensagem ---
  const [forwardMessage, setForwardMessage] = useState<WhatsappMessage | null>(null);

  // --- Busca dentro da thread (Cmd/Ctrl+F) ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  /** Índices em `flat` (não em `messages`) das bolhas cujo bodyText casa com a query. */
  const matchIndices = useMemo(() => {
    if (!searchQuery.trim()) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < flat.length; i += 1) {
      const item = flat[i];
      if (item.kind !== "msg") continue;
      if (textContainsQuery(item.message.bodyText, searchQuery)) {
        out.push(i);
      }
    }
    return out;
  }, [flat, searchQuery]);

  // Reseta active quando query muda; mantém-no dentro dos limites.
  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchQuery]);

  // Scroll-to-index quando muda o match ativo.
  useEffect(() => {
    if (!searchOpen || matchIndices.length === 0) return;
    const flatIdx = matchIndices[activeMatchIndex];
    if (flatIdx == null) return;
    virtualizer.scrollToIndex(flatIdx, { align: "center" });
  }, [searchOpen, matchIndices, activeMatchIndex, virtualizer]);

  // Atalho global de busca (Cmd/Ctrl+F) e ESC pra fechar.
  // Também escuta evento "inbox:open-thread-search" pra ser disparado por botões externos.
  useEffect(() => {
    function openAndFocus() {
      setSearchOpen(true);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
    function onKeydown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openAndFocus();
      } else if (e.key === "Escape" && searchOpen) {
        // Só fecha se a busca está aberta; se foco está em outro input, deixa o
        // handler local dele tomar a decisão.
        if (document.activeElement === searchInputRef.current) {
          e.preventDefault();
          setSearchOpen(false);
          setSearchQuery("");
        }
      }
    }
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("inbox:open-thread-search", openAndFocus);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("inbox:open-thread-search", openAndFocus);
    };
  }, [searchOpen]);

  function goToNextMatch() {
    if (matchIndices.length === 0) return;
    setActiveMatchIndex((i) => (i + 1) % matchIndices.length);
  }
  function goToPrevMatch() {
    if (matchIndices.length === 0) return;
    setActiveMatchIndex((i) => (i - 1 + matchIndices.length) % matchIndices.length);
  }

  const loadOlderArmedRef = useRef(true);

  const handleAudioPlaybackChange = useCallback((messageId: string, playing: boolean) => {
    setPlayingAudioMessageId((current) => {
      if (playing) return messageId;
      return current === messageId ? null : current;
    });
  }, []);

  const reportScrollState = useCallback(() => {
    const node = scrollRef.current;
    if (!node || !onScrollStateChange) {
      return;
    }

    const distanceFromBottom = Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
    onScrollStateChange({
      atBottom: distanceFromBottom <= 96,
      distanceFromBottom,
    });
  }, [onScrollStateChange, scrollRef]);

  useEffect(() => {
    loadOlderArmedRef.current = true;
  }, [messageGroups]);

  useEffect(() => {
    reportScrollState();
  }, [flat.length, isLoadingOlder, reportScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !onLoadOlder || !hasMoreOlder) {
      return;
    }

    const loadOlder = onLoadOlder;
    const thresholdPx = 160;

    function onScroll() {
      const node = scrollRef.current;
      if (!node || !loadOlderArmedRef.current || isLoadingOlder) {
        reportScrollState();
        return;
      }

      reportScrollState();

      if (node.scrollTop < thresholdPx) {
        loadOlderArmedRef.current = false;
        void Promise.resolve(loadOlder()).finally(() => {
          loadOlderArmedRef.current = true;
        });
      }
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef, onLoadOlder, hasMoreOlder, isLoadingOlder, reportScrollState]);

  return (
    <div className="relative h-full min-h-0">
      {searchOpen ? (
        <div
          className="pointer-events-auto absolute inset-x-0 top-2 z-20 mx-auto flex max-w-md items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg"
          role="search"
          data-testid="thread-search-bar"
        >
          <Search className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) goToPrevMatch();
                else goToNextMatch();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setSearchOpen(false);
                setSearchQuery("");
              }
            }}
            placeholder="Buscar na conversa…"
            aria-label="Buscar na conversa"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {searchQuery.trim() ? (
            <span
              className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground"
              data-testid="thread-search-count"
            >
              {matchIndices.length === 0
                ? "0/0"
                : `${activeMatchIndex + 1}/${matchIndices.length}`}
            </span>
          ) : null}
          <button
            type="button"
            onClick={goToPrevMatch}
            disabled={matchIndices.length === 0}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground disabled:opacity-40"
            aria-label="Match anterior"
            title="Anterior (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={goToNextMatch}
            disabled={matchIndices.length === 0}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground disabled:opacity-40"
            aria-label="Próximo match"
            title="Próximo (Enter)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground"
            aria-label="Fechar busca"
            title="Fechar (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="h-full overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-none bg-background bg-[length:360px_360px] px-3 py-2 scrollbar-hide md:px-12"
        style={{ backgroundImage: chatBg, backgroundRepeat: "repeat", backgroundBlendMode: "normal" }}
      >
        {isLoadingOlder ? (
          <div className="flex justify-center py-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-wchat-50 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando mensagens antigas...
            </span>
          </div>
        ) : null}
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((v) => {
            const item = flat[v.index];
            return (
              <div
                key={v.key}
                data-index={v.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${v.start}px)` }}
              >
                {item.kind === "day" ? (
                  <div className="mb-4 flex justify-center px-8 pt-2">
                    <span className="rounded-lg bg-card/80 px-3.5 py-[5px] text-[11.5px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/70">
                      {item.label}
                    </span>
                  </div>
                ) : item.kind === "note" ? (
                  <div className="pb-3">
                    <NoteBubble note={item.note} />
                  </div>
                ) : (
                  <div className={bubbleGroupSpacingClass(item.groupPosition)}>
                    <MessageBubble
                    message={item.message}
                    groupPosition={item.groupPosition}
                    activeChatName={activeChatName}
                    activeChatAvatarUrl={activeChatAvatarUrl}
                    quotedMessage={
                      item.message.quotedMessageId
                        ? messageById.get(item.message.quotedMessageId) ?? null
                        : null
                    }
                    onRetry={onRetryMessage}
                    onDiscard={onDiscardMessage}
                    onReply={onReplyMessage}
                    onForward={setForwardMessage}
                    onAudioPlaybackChange={handleAudioPlaybackChange}
                    retryPending={retryingMessageId === item.message.id}
                    highlightQuery={searchOpen ? searchQuery : undefined}
                  />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {jumpToLatestVisible && onJumpToLatest ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
          <button
            type="button"
            onClick={onJumpToLatest}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground shadow-lg shadow-black/10 transition-colors hover:bg-wchat-50"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Novas mensagens
          </button>
        </div>
      ) : null}

      <ForwardMessageDialog
        open={forwardMessage !== null}
        onOpenChange={(v) => { if (!v) setForwardMessage(null); }}
        message={forwardMessage}
        currentChatId={activeChatId}
      />
    </div>
  );
}
