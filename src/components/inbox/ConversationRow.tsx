import { memo, type MouseEvent } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, CalendarClock, Check, Clock, Instagram, Lock, Pin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isChatSlaBreached, isChatSnoozed, slaMinutesRemaining } from "@/lib/inbox-chat-rules";
import { mustAssumeUnassignedChatToView } from "@/lib/crm/negotiation-assignee";
import { cn } from "@/lib/utils";
import type { InboxChat, UserRole } from "@/types/domain";
import { ConversationAvatar } from "./ConversationAvatar";

const MESSAGE_PREVIEW_MAX_CHARS = 40;

function shortenMessagePreview(text: string, maxChars = MESSAGE_PREVIEW_MAX_CHARS): string {
  const t = text.trim();
  if (t.length <= maxChars) {
    return t;
  }
  const slice = t.slice(0, maxChars).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const clipped = lastSpace > maxChars * 0.55 ? slice.slice(0, lastSpace) : slice;
  return `${clipped}...`;
}

function formatConversationTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (isToday(date)) {
    return format(date, "HH:mm", { locale: ptBR });
  }

  if (isYesterday(date)) {
    return "Ontem";
  }

  return format(date, "dd/MM", { locale: ptBR });
}

const MAX_VISIBLE_TAGS = 2;

function ConversationTagBadges({ tags }: { tags: InboxChat["tags"] }) {
  const list = tags ?? [];
  if (list.length === 0) {
    return null;
  }
  const visible = list.slice(0, MAX_VISIBLE_TAGS);
  const overflow = list.length - visible.length;
  const label = list.map((t) => t.name).join(", ");

  return (
    <span
      className="mt-1 flex min-w-0 flex-wrap items-center gap-1"
      title={label}
      aria-label={`Etiquetas: ${label}`}
    >
      {visible.map((tag) => (
        <span
          key={tag.tagId}
          className="inline-flex max-w-[8rem] shrink-0 items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight"
          style={{
            backgroundColor: `${tag.color}33`,
            borderColor: `${tag.color}66`,
            color: tag.color,
          }}
        >
          {tag.name}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="text-[10px] font-semibold leading-none text-muted-foreground">+{overflow}</span>
      ) : null}
    </span>
  );
}

function AssigneeTag({ name }: { name: string }) {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  return (
    <span
      title={`Atribuído: ${name}`}
      className="inline-flex shrink-0 max-w-[8rem] items-center truncate rounded-full bg-wchat-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {firstName}
    </span>
  );
}

export const ConversationRow = memo(function ConversationRow({
  chat,
  active,
  onSelect,
  onPrefetch,
  viewerRole,
  followupStatus,
  selected = false,
  selectionMode = false,
  onSelectionToggle,
  onContextMenu,
}: {
  chat: InboxChat;
  active: boolean;
  /** Recebe o id estável; mantenha a referência estável no pai para o memo valer. */
  onSelect: (chatId: string) => void;
  onPrefetch?: (chatId: string) => void;
  /** Papel do usuário logado: atendimento não vê o preview de chats do pool até assumir. */
  viewerRole?: UserRole;
  /** Sinaliza follow-up no chat: 'overdue' (vermelho) ou 'soon' (amber). */
  followupStatus?: "overdue" | "soon" | null;
  selected?: boolean;
  selectionMode?: boolean;
  onSelectionToggle?: (chatId: string) => void;
  onContextMenu?: (chatId: string, event: MouseEvent) => void;
}) {
  const subtitle =
    chat.customerName && chat.customerName.trim() !== "" && chat.customerName !== chat.displayName
      ? chat.customerName
      : null;

  const snoozed = isChatSnoozed(chat);
  const slaBreached = isChatSlaBreached(chat);
  const slaMinutes = slaMinutesRemaining(chat);

  const lastPreviewTrimmed = chat.lastMessagePreview?.trim();
  const messagePreviewDisplay =
    lastPreviewTrimmed && lastPreviewTrimmed.length > 0
      ? shortenMessagePreview(lastPreviewTrimmed)
      : "Sem mensagens recentes";
  // Privacidade: atendimento não vê o conteúdo da última mensagem de um chat
  // do pool (sem dono) até assumi-lo — mesma regra que bloqueia a thread.
  const previewLocked = mustAssumeUnassignedChatToView(viewerRole, chat.assigneeId);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`inbox-chat-${chat.id}`}
      onClick={() => onSelect(chat.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(chat.id);
        }
      }}
      onContextMenu={(event) => {
        onContextMenu?.(chat.id, event);
      }}
      onPointerEnter={onPrefetch ? () => onPrefetch(chat.id) : undefined}
      className={cn(
        "group block w-full min-w-0 max-w-full cursor-pointer overflow-hidden rounded-lg px-1.5 py-2 text-left outline-none transition-colors duration-150",
        active ? "bg-wchat-100 ring-1 ring-primary/20" : "hover:bg-wchat-50",
        selected && "bg-primary/10 ring-1 ring-primary/35",
      )}
    >
      <div className="flex min-w-0 max-w-full items-start gap-2">
        {onSelectionToggle ? (
          <span
            className={cn(
              "mt-2 shrink-0 transition-opacity",
              selectionMode || selected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={() => onSelectionToggle(chat.id)}
              aria-label={`Selecionar conversa ${chat.displayName}`}
            />
          </span>
        ) : null}
        <span className="shrink-0 rounded-full">
          <ConversationAvatar name={chat.displayName} avatarUrl={chat.avatarUrl} size="xs" />
        </span>
        <div className="min-w-0 max-w-full flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1">
                <p className="min-w-0 truncate text-sm font-medium leading-snug text-foreground">
                  {chat.displayName}
                </p>
                {chat.channelType === "instagram" ? (
                  <Instagram
                    className="h-3.5 w-3.5 shrink-0 text-pink-600 dark:text-pink-400"
                    aria-label="Conversa do Instagram"
                  />
                ) : null}
                {chat.assigneeName ? <AssigneeTag name={chat.assigneeName} /> : null}
                {selected ? (
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                ) : null}
              </div>
              <ConversationTagBadges tags={chat.tags} />
              {subtitle ? (
                <p className="mt-0.5 truncate text-[12px] leading-snug text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              {chat.isPinned ? (
                <Pin className="h-3 w-3 text-muted-foreground" aria-label="Fixada" />
              ) : null}
              <p
                className={cn(
                  "text-[10px] tabular-nums leading-snug",
                  active ? "text-muted-foreground" : chat.unreadCount > 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                {formatConversationTime(chat.lastMessageAt)}
              </p>
            </div>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                "min-w-0 flex-1 line-clamp-1 text-[12px] leading-snug text-muted-foreground",
                !previewLocked && chat.unreadCount > 0 && !active && "font-medium text-foreground",
                previewLocked && "italic",
              )}
            >
              {previewLocked ? (
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3 shrink-0" aria-hidden />
                  Assuma para ver a mensagem
                </span>
              ) : (
                messagePreviewDisplay
              )}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {followupStatus === "overdue" ? (
                <span
                  title="Lembrete vencido"
                  aria-label="Lembrete vencido"
                  className="inline-flex h-5 items-center rounded-full bg-[var(--crm-danger-tint)] px-1.5 text-[9px] font-semibold text-[var(--crm-danger-strong)]"
                >
                  <CalendarClock className="h-3 w-3" />
                </span>
              ) : followupStatus === "soon" ? (
                <span
                  title="Lembrete próximo (até 1h)"
                  aria-label="Lembrete próximo"
                  className="inline-flex h-5 items-center rounded-full bg-[var(--crm-amber-tint)] px-1.5 text-[9px] font-semibold text-[var(--crm-amber-ink)]"
                >
                  <CalendarClock className="h-3 w-3" />
                </span>
              ) : null}
              {snoozed ? (
                <span
                  title={`Adiada até ${format(new Date(chat.snoozeUntil!), "dd/MM HH:mm", { locale: ptBR })}`}
                  className="inline-flex h-5 items-center rounded-full bg-[var(--crm-amber-tint)] px-1.5 text-[9px] font-semibold text-[var(--crm-amber-ink)]"
                >
                  <AlarmClock className="mr-0.5 h-3 w-3" />
                </span>
              ) : null}
              {slaBreached ? (
                <span
                  title="SLA de primeira resposta estourado"
                  className="inline-flex h-5 items-center rounded-full bg-[var(--crm-danger-tint)] px-1.5 text-[9px] font-semibold text-[var(--crm-danger-strong)]"
                >
                  SLA
                </span>
              ) : slaMinutes != null && slaMinutes <= 5 && slaMinutes > 0 ? (
                <span
                  title={`${slaMinutes} min para 1ª resposta`}
                  className="inline-flex h-5 items-center rounded-full bg-[var(--crm-amber-tint)] px-1.5 text-[9px] font-semibold text-[var(--crm-amber-ink)]"
                >
                  <Clock className="h-3 w-3" />
                </span>
              ) : null}
              {chat.unreadCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground">
                  {chat.unreadCount > 99 ? "99+" : chat.unreadCount}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
