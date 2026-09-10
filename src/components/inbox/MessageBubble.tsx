import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Check, CheckCheck, Clock3, FileText, Reply, RotateCcw, Share2, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { ConversationAvatar } from "@/components/inbox/ConversationAvatar";
import type { BubbleGroupPosition } from "@/lib/inboxMessageGroups";
import { getInboxMessageFailureReason } from "@/lib/inboxMessageFailure";
import { getInboxMessagePreviewText } from "@/lib/inboxMessageBody";
import { highlightTextMatches } from "@/lib/inboxTextHighlight";
import { resolveInboxAttachmentPresentation } from "@/lib/inboxMessageMedia";
import { isMetaCdnLikelyToBlockInlineEmbed } from "@/lib/restricted-media-hosts";
import { cn } from "@/lib/utils";
import type { WhatsappMessage } from "@/types/domain";

function formatMessageTime(value?: string | null) {
  if (!value) {
    return "";
  }

  return format(new Date(value), "HH:mm", { locale: ptBR });
}

function bubbleShellRadius(isOutbound: boolean, position: BubbleGroupPosition): string {
  const base = "rounded-[14px]";
  if (isOutbound) {
    switch (position) {
      case "middle":
        return `${base} rounded-tr-[5px] rounded-br-[5px]`;
      case "last":
        return `${base} rounded-tr-[5px] rounded-br-[5px]`;
      default:
        return `${base} rounded-br-[5px]`;
    }
  }

  switch (position) {
    case "middle":
      return `${base} rounded-tl-[5px] rounded-bl-[5px]`;
    case "last":
      return `${base} rounded-tl-[5px] rounded-bl-[5px]`;
    default:
      return `${base} rounded-bl-[5px]`;
  }
}

function showBubbleTail(position: BubbleGroupPosition): boolean {
  return position === "single" || position === "last";
}

function MessageAttachment({
  presentation,
  isOutbound,
  onAudioPlaybackChange,
}: {
  presentation: NonNullable<ReturnType<typeof resolveInboxAttachmentPresentation>>;
  isOutbound: boolean;
  onAudioPlaybackChange?: (playing: boolean) => void;
}) {
  const [mediaBlocked, setMediaBlocked] = useState(false);
  const cardClass = isOutbound
    ? "border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15"
    : "border-border bg-muted text-foreground hover:bg-wchat-100";

  if (mediaBlocked) {
    return (
      <a
        href={presentation.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
          cardClass,
        )}
      >
        <FileText className="h-5 w-5 shrink-0 opacity-90" />
        <span className="min-w-0 flex-1 truncate">
          {isMetaCdnLikelyToBlockInlineEmbed(presentation.url)
            ? "Não foi possível exibir aqui. Abra o link para ver a mídia."
            : "Mídia indisponível no preview. Clique para tentar abrir."}
        </span>
        <span className="shrink-0 text-xs underline underline-offset-2">Abrir</span>
      </a>
    );
  }

  switch (presentation.kind) {
    case "image":
      return (
        <a
          href={presentation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg"
        >
          <img
            src={presentation.url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-64 w-full max-w-[min(100%,300px)] object-contain"
            onError={() => setMediaBlocked(true)}
          />
        </a>
      );
    case "video":
      return (
        <video
          controls
          src={presentation.url}
          className="max-h-64 w-full max-w-[min(100%,300px)] rounded-lg"
          preload="metadata"
          onError={() => setMediaBlocked(true)}
        />
      );
    case "audio":
      return (
        <audio
          controls
          src={presentation.url}
          className={cn("h-10 w-[min(70vw,300px)] max-w-full", isOutbound ? "opacity-95" : "")}
          onPlay={() => onAudioPlaybackChange?.(true)}
          onPause={() => onAudioPlaybackChange?.(false)}
          onEnded={() => onAudioPlaybackChange?.(false)}
          onError={() => setMediaBlocked(true)}
        />
      );
    case "document":
      return (
        <a
          href={presentation.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
            cardClass,
          )}
        >
          <FileText className="h-5 w-5 shrink-0 opacity-90" />
          <span className="min-w-0 flex-1 truncate">{presentation.label}</span>
          <span className="shrink-0 text-xs underline underline-offset-2">Abrir</span>
        </a>
      );
    default:
      return null;
  }
}

function getOutboundStatusMeta(status: WhatsappMessage["status"]) {
  switch (status) {
    case "queued":
      return { label: "Na fila", icon: Clock3, className: "text-primary-foreground/75" };
    case "sent":
      return { label: "Enviado", icon: Check, className: "text-primary-foreground/75" };
    case "delivered":
      return { label: "Entregue", icon: CheckCheck, className: "text-primary-foreground/80" };
    case "read":
      return { label: "Lida", icon: CheckCheck, className: "text-primary-foreground" };
    case "failed":
      return { label: "Falha no envio", icon: AlertCircle, className: "text-red-200" };
    default:
      return { label: "Enviado", icon: Check, className: "text-primary-foreground/75" };
  }
}

type MessageBubbleProps = {
  message: WhatsappMessage;
  groupPosition?: BubbleGroupPosition;
  activeChatName: string;
  activeChatAvatarUrl?: string | null;
  /** Mensagem citada (resolvida pelo MessageThread a partir de message.quotedMessageId). */
  quotedMessage?: WhatsappMessage | null;
  onRetry?: (message: WhatsappMessage) => void;
  onDiscard?: (message: WhatsappMessage) => void;
  /** Clique no botão "Responder" da bolha. */
  onReply?: (message: WhatsappMessage) => void;
  /** Clique no botão "Encaminhar" da bolha. */
  onForward?: (message: WhatsappMessage) => void;
  /** Mantem a bolha renderizada enquanto um audio toca, mesmo fora da viewport virtualizada. */
  onAudioPlaybackChange?: (messageId: string, playing: boolean) => void;
  retryPending?: boolean;
  /** Quando setado, ocorrências dessa query no body são envolvidas em &lt;mark&gt;. */
  highlightQuery?: string;
};

/** Mini bloco de citação renderizado no topo de uma bolha que responde a outra. */
function QuotedMessagePreview({
  quoted,
  activeChatName,
  isOutbound,
}: {
  quoted: WhatsappMessage;
  activeChatName: string;
  isOutbound: boolean;
}) {
  const preview = getInboxMessagePreviewText(quoted);
  const authorLabel =
    quoted.direction === "outbound" ? "Você" : activeChatName || "Contato";
  return (
    <div
      className={cn(
        "mb-1 overflow-hidden rounded-md border-l-[3px] px-2.5 py-1.5",
        isOutbound
          ? "border-primary-foreground/60 bg-primary-foreground/10"
          : "border-primary bg-wchat-50",
      )}
    >
      <p
        className={cn(
          "truncate text-[11.5px] font-semibold leading-tight",
          isOutbound ? "text-primary-foreground/90" : "text-primary",
        )}
      >
        {authorLabel}
      </p>
      <p
        className={cn(
          "mt-0.5 line-clamp-2 text-[12px] leading-snug",
          isOutbound ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {preview || "(mensagem sem texto)"}
      </p>
    </div>
  );
}

function BubbleTail({ outbound }: { outbound: boolean }) {
  if (outbound) {
    return (
      <svg
        className="pointer-events-none absolute -bottom-px right-[-7px] z-[2] text-primary"
        width="9"
        height="13"
        viewBox="0 0 9 13"
        aria-hidden
      >
        <path d="M9 13H0c4.5-1.2 8.2-5.4 9-13z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      className="pointer-events-none absolute -bottom-px left-[-7px] z-[2] text-card"
      width="9"
      height="13"
      viewBox="0 0 9 13"
      aria-hidden
    >
      <path d="M0 13h9C4.5 11.8.8 7.6 0 0z" fill="currentColor" />
    </svg>
  );
}

function MessageMeta({
  timestamp,
  isOutbound,
  showMeta,
  message,
}: {
  timestamp: string | null;
  isOutbound: boolean;
  showMeta: boolean;
  message: WhatsappMessage;
}) {
  const statusMeta = isOutbound ? getOutboundStatusMeta(message.status) : null;

  if (!showMeta) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 self-end pb-px pl-2",
        "text-[11px] leading-none tabular-nums",
        isOutbound ? "text-primary-foreground/75" : "text-muted-foreground",
      )}
    >
      {isOutbound && message.actorType === "ai" ? (
        <span
          className="mr-0.5 rounded bg-primary-foreground/20 px-1 text-[9px] font-bold uppercase leading-none tracking-wide"
          title="Resposta enviada pela IA"
        >
          IA
        </span>
      ) : null}
      <span>{formatMessageTime(timestamp)}</span>
      {statusMeta ? (
        <span title={statusMeta.label} aria-label={statusMeta.label}>
          <statusMeta.icon className={cn("h-3.5 w-3.5 shrink-0", statusMeta.className)} />
        </span>
      ) : null}
    </span>
  );
}

function MessageBubbleImpl({
  message,
  groupPosition = "single",
  activeChatName,
  activeChatAvatarUrl,
  quotedMessage,
  onRetry,
  onDiscard,
  onReply,
  onForward,
  onAudioPlaybackChange,
  retryPending = false,
  highlightQuery,
}: MessageBubbleProps) {
  const isOutbound = message.direction === "outbound";
  const timestamp = message.createdAt ?? message.sentAt ?? message.receivedAt ?? null;
  const presentation = resolveInboxAttachmentPresentation(message);
  const rawBody = message.bodyText?.trim();
  const caption =
    rawBody && rawBody !== message.mediaUrl?.trim()
      ? getInboxMessagePreviewText(message)
      : null;

  const bodyText =
    presentation && !caption ? null : caption ?? (!presentation ? getInboxMessagePreviewText(message) : null);

  const showTail = showBubbleTail(groupPosition);
  const showInboundHeader =
    !isOutbound && (groupPosition === "single" || groupPosition === "first");
  const showInboundAvatar = !isOutbound && (groupPosition === "single" || groupPosition === "first");
  const showMeta = groupPosition === "single" || groupPosition === "last";
  const failureReason = message.status === "failed" ? getInboxMessageFailureReason(message) : null;

  return (
    <div
      className={cn("flex", isOutbound ? "justify-end pr-1" : "justify-start pl-0.5")}
    >
      <div className={cn("flex min-w-0 max-w-[min(420px,92%)]", isOutbound ? "justify-end" : "justify-start")}>
        {!isOutbound ? (
          <div className="w-10 shrink-0 pt-0.5" aria-hidden={!showInboundAvatar}>
            {showInboundAvatar ? (
              <ConversationAvatar name={activeChatName} avatarUrl={activeChatAvatarUrl} size="xs" />
            ) : null}
          </div>
        ) : null}

        <div className={cn("flex min-w-0 flex-col", isOutbound ? "items-end" : "items-start")}>
          {showInboundHeader ? (
            <div className="mb-0.5 px-0.5">
              <span className="truncate text-[12px] font-medium text-muted-foreground">{activeChatName}</span>
            </div>
          ) : null}

          <div className={cn("group relative inline-block max-w-full", isOutbound ? "ml-auto" : "")}>
            {!isOutbound && showTail ? <BubbleTail outbound={false} /> : null}

            {onReply ? (
              <button
                type="button"
                onClick={() => onReply(message)}
                className={cn(
                  "absolute -top-2 z-[3] inline-flex h-6 w-6 items-center justify-center rounded-full",
                  "border border-border bg-card text-muted-foreground shadow-sm",
                  "opacity-0 transition-opacity hover:bg-wchat-50 hover:text-foreground",
                  "group-hover:opacity-100 focus-visible:opacity-100",
                  isOutbound ? "-left-3" : "-right-3",
                )}
                title="Responder"
                aria-label="Responder esta mensagem"
              >
                <Reply className="h-3 w-3" />
              </button>
            ) : null}

            {onForward ? (
              <button
                type="button"
                onClick={() => onForward(message)}
                className={cn(
                  "absolute -top-2 z-[3] inline-flex h-6 w-6 items-center justify-center rounded-full",
                  "border border-border bg-card text-muted-foreground shadow-sm",
                  "opacity-0 transition-opacity hover:bg-wchat-50 hover:text-foreground",
                  "group-hover:opacity-100 focus-visible:opacity-100",
                  isOutbound ? "-left-10" : "-right-10",
                )}
                title="Encaminhar"
                aria-label="Encaminhar esta mensagem"
              >
                <Share2 className="h-3 w-3" />
              </button>
            ) : null}

            <div
              className={cn(
                "relative z-[1] min-w-[56px] px-2 py-1.5 sm:px-2.5",
                bubbleShellRadius(isOutbound, groupPosition),
                isOutbound
                  ? "bg-primary text-primary-foreground shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]"
                  : "border border-border bg-card text-foreground shadow-[0_1px_0.5px_rgba(11,20,26,0.08)]",
              )}
            >
              {quotedMessage ? (
                <QuotedMessagePreview
                  quoted={quotedMessage}
                  activeChatName={activeChatName}
                  isOutbound={isOutbound}
                />
              ) : null}

              {presentation ? (
                <div className={bodyText ? "mb-1" : undefined}>
                  <MessageAttachment
                    presentation={presentation}
                    isOutbound={isOutbound}
                    onAudioPlaybackChange={
                      presentation.kind === "audio"
                        ? (playing) => onAudioPlaybackChange?.(message.id, playing)
                        : undefined
                    }
                  />
                </div>
              ) : null}

              {bodyText ? (
                <div className="flex flex-wrap items-end gap-x-1">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[14.2px] leading-[1.42]">
                    {highlightQuery ? highlightTextMatches(bodyText, highlightQuery) : bodyText}
                  </p>
                  <MessageMeta
                    timestamp={timestamp}
                    isOutbound={isOutbound}
                    showMeta={showMeta}
                    message={message}
                  />
                </div>
              ) : (
                <div className="flex justify-end pt-0.5">
                  <MessageMeta
                    timestamp={timestamp}
                    isOutbound={isOutbound}
                    showMeta={showMeta}
                    message={message}
                  />
                </div>
              )}

              {message.status === "failed" ? (
                <div
                  className={cn(
                    "mt-2 rounded-xl border px-3 py-2 text-[12px] leading-5",
                    isOutbound
                      ? "border-red-300/50 bg-red-950/20 text-red-50"
                      : "border-red-200 bg-red-50 text-red-800",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className={cn("mt-0.5 h-4 w-4 shrink-0", isOutbound ? "text-red-200" : "text-red-600")}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Falha no envio</p>
                      <p className={cn("mt-0.5 text-[11.5px]", isOutbound ? "text-red-100/90" : "text-red-700")}>
                        {failureReason ?? "Esta mensagem não conseguiu sair. Você pode reenviar ou descartar."}
                      </p>
                    </div>
                  </div>
                  {(onRetry || onDiscard) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {onRetry ? (
                        <button
                          type="button"
                          onClick={() => onRetry(message)}
                          disabled={retryPending}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
                            isOutbound
                              ? "bg-red-50 text-red-950 hover:bg-card"
                              : "bg-red-600 text-white hover:bg-red-700",
                          )}
                          title="Tentar enviar de novo"
                        >
                          <RotateCcw className={cn("h-3.5 w-3.5", retryPending && "animate-spin")} />
                          Reenviar
                        </button>
                      ) : null}
                      {onDiscard ? (
                        <button
                          type="button"
                          onClick={() => onDiscard(message)}
                          disabled={retryPending}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-60",
                            isOutbound
                              ? "border-red-300/40 bg-transparent text-red-50 hover:bg-red-900/20"
                              : "border-red-200 bg-card text-red-700 hover:bg-red-50",
                          )}
                          title="Descartar esta mensagem"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Descartar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {isOutbound && showTail ? <BubbleTail outbound /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function arePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps) {
  if (prev.groupPosition !== next.groupPosition) return false;
  if (prev.activeChatName !== next.activeChatName) return false;
  if (prev.onRetry !== next.onRetry) return false;
  if (prev.onDiscard !== next.onDiscard) return false;
  if (prev.onReply !== next.onReply) return false;
  if (prev.onForward !== next.onForward) return false;
  if (prev.onAudioPlaybackChange !== next.onAudioPlaybackChange) return false;
  if (prev.retryPending !== next.retryPending) return false;
  if ((prev.highlightQuery ?? "") !== (next.highlightQuery ?? "")) return false;
  // Identidade do quoted basta — o conteúdo dele não muda em runtime; chega novo objeto = re-render.
  if (prev.quotedMessage?.id !== next.quotedMessage?.id) return false;
  const a = prev.message;
  const b = next.message;
  if (a === b) return true;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.bodyText === b.bodyText &&
    a.mediaUrl === b.mediaUrl &&
    a.direction === b.direction &&
    a.messageType === b.messageType &&
    a.sentAt === b.sentAt &&
    a.createdAt === b.createdAt &&
    a.receivedAt === b.receivedAt
  );
}

export const MessageBubble = memo(MessageBubbleImpl, arePropsEqual);
