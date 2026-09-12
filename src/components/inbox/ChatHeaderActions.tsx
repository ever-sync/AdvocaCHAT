import { type ReactElement, type ReactNode } from "react";
import {
  AlarmClock,
  ArrowRightLeft,
  Bell,
  BellOff,
  Briefcase,
  CalendarClock,
  Hand,
  Loader2,
  MoreHorizontal,
  Pause,
  Phone,
  Pin,
  PinOff,
  Play,
  Search,
  ShoppingCart,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatTagsHeaderButton } from "@/components/inbox/ChatTagsHeaderButton";
import { useClearChatSnooze, usePinChat, useSetChatAiMode } from "@/lib/api/chat-tags";
import { useStartCall } from "@/lib/api/call-logs";
import {
  chatAssignedToOtherAttendantMessage,
  chatAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import { isChatSnoozed } from "@/lib/inbox-chat-rules";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CrmNegotiationRecord, InboxChat, UserRole } from "@/types/domain";

const ICON_BTN =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground disabled:opacity-45";

function IconTip({ label, children }: { label: ReactNode; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export type NotificationSettings = {
  enabled: boolean;
  permission: NotificationPermission | "unsupported";
  setEnabled: (next: boolean) => Promise<void> | void;
};

export type ChatHeaderActionsProps = {
  chat: InboxChat;
  negotiation: CrmNegotiationRecord | null;
  canEditInbox: boolean;
  canEditCrm: boolean;
  canActOnChat: boolean;
  canMarkSaleFromChat: boolean;
  isManagerInbox: boolean;
  activeChannelAiEnabled: boolean;
  offerClaimBoth: boolean;
  showClaimNegotiation: boolean;
  showReleaseNegotiation: boolean;
  viewerRole?: UserRole;
  viewerProfileId?: string;
  claimPending: boolean;
  claimNegotiationPending: boolean;
  releaseNegotiationPending: boolean;
  onClaimChat: () => void | Promise<void>;
  onClaimNegotiation: () => void | Promise<void>;
  onReleaseNegotiation: () => void | Promise<void>;
  onClaimChatAndNegotiation: () => void | Promise<void>;
  notificationSettings: NotificationSettings;
  onPinChat?: () => void;
  onOpenSnoozeDialog: () => void;
  onOpenAssignDialog: () => void;
  onOpenProfile: () => void;
  onOpenSaleFlow: () => void;
  onOpenFollowUp: () => void;
};

export function ChatHeaderActions({
  chat,
  negotiation,
  canEditInbox,
  canEditCrm,
  canActOnChat,
  canMarkSaleFromChat,
  isManagerInbox,
  activeChannelAiEnabled,
  offerClaimBoth,
  showClaimNegotiation,
  showReleaseNegotiation,
  viewerRole,
  viewerProfileId,
  claimPending,
  claimNegotiationPending,
  releaseNegotiationPending,
  onClaimChat,
  onClaimNegotiation,
  onReleaseNegotiation,
  onClaimChatAndNegotiation,
  notificationSettings,
  onPinChat,
  onOpenSnoozeDialog,
  onOpenAssignDialog,
  onOpenProfile,
  onOpenSaleFlow,
  onOpenFollowUp,
}: ChatHeaderActionsProps) {
  const { toast } = useToast();
  const pinChat = usePinChat();
  const setAiMode = useSetChatAiMode({
    onError: (error) =>
      toast({
        title: "Não foi possível alterar a IA",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      }),
  });
  const clearSnooze = useClearChatSnooze();
  const startCall = useStartCall({
    onSuccess: () => {
      toast({
        title: "Ligação iniciada",
        description: "Seu telefone vai tocar — atenda para conectar com o lead.",
      });
    },
    onError: (error) => {
      toast({
        title: "Não foi possível ligar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const aiPaused = chat.aiMode === "off" || chat.aiMode === "handoff";
  const snoozed = isChatSnoozed(chat);
  const notificationsActive =
    notificationSettings.enabled && notificationSettings.permission !== "denied";
  const phone = chat.remotePhoneE164 || chat.remotePhoneDigits || null;
  const claimBusy =
    claimPending || claimNegotiationPending || releaseNegotiationPending;

  function blockEditInboxToast() {
    toast({
      title: "Ação indisponível",
      description: "Seu papel nao tem permissao para esta ação.",
      variant: "destructive",
    });
  }

  function requireActiveAssigneeToast() {
    toast({
      title: "Assuma a conversa",
      description: chatAssigneeBlockedMessage(),
      variant: "destructive",
    });
  }

  function handleToggleAi() {
    if (!canEditInbox) {
      blockEditInboxToast();
      return;
    }
    if (!canActOnChat) {
      requireActiveAssigneeToast();
      return;
    }
    setAiMode.mutate(
      { chatId: chat.id, aiMode: aiPaused ? "full" : "off" },
      {
        onSuccess: () =>
          toast({
            title: aiPaused ? "IA reativada nesta conversa" : "IA pausada nesta conversa",
          }),
      },
    );
  }

  function handleClearSnooze() {
    if (!canEditInbox) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para adiar conversa.",
        variant: "destructive",
      });
      return;
    }
    if (!canActOnChat) {
      requireActiveAssigneeToast();
      return;
    }
    void clearSnooze.mutateAsync(chat.id);
  }

  function handleRequestSnooze() {
    if (!canEditInbox) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para adiar conversa.",
        variant: "destructive",
      });
      return;
    }
    if (!canActOnChat) {
      requireActiveAssigneeToast();
      return;
    }
    onOpenSnoozeDialog();
  }

  function handleRequestTransfer() {
    if (!canEditInbox) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para atribuir conversa.",
        variant: "destructive",
      });
      return;
    }
    if (
      viewerRole === "atendimento" &&
      chat.assigneeId &&
      chat.assigneeId !== viewerProfileId
    ) {
      toast({
        title: "Conversa de outro atendente",
        description: chatAssignedToOtherAttendantMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!isManagerInbox && !canActOnChat) {
      requireActiveAssigneeToast();
      return;
    }
    onOpenAssignDialog();
  }

  function handleCall() {
    if (!phone?.trim()) {
      toast({
        title: "Sem número",
        description: "Este lead não tem telefone para ligar.",
        variant: "destructive",
      });
      return;
    }
    startCall.mutate({
      toNumber: phone,
      customerId: chat.customerId ?? null,
      chatId: chat.id,
      negotiationId: negotiation?.id ?? chat.primaryNegotiationId ?? null,
    });
  }

  function handlePin() {
    if (onPinChat) {
      onPinChat();
    } else {
      pinChat.mutate({ chatId: chat.id, isPinned: !chat.isPinned });
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconTip label="Buscar na conversa">
        <button
          type="button"
          onClick={() => document.dispatchEvent(new CustomEvent("inbox:open-thread-search"))}
          className={ICON_BTN}
          aria-label="Buscar na conversa"
        >
          <Search className="h-4 w-4" />
        </button>
      </IconTip>

      <ChatTagsHeaderButton
        chatId={chat.id}
        tags={chat.tags ?? []}
        disabled={!canEditInbox}
      />

      {offerClaimBoth && negotiation ? (
        <IconTip label="Assumir conversa e negócio">
          <button
            type="button"
            onClick={() => void onClaimChatAndNegotiation()}
            disabled={claimBusy || !canEditInbox || !canEditCrm}
            className={cn(ICON_BTN, "bg-primary text-primary-foreground hover:bg-primary/90")}
            aria-label="Assumir ambos: conversa e negócio"
            data-testid="inbox-claim-both"
          >
            <Hand className="h-4 w-4" />
          </button>
        </IconTip>
      ) : null}

      {!chat.assigneeId && !offerClaimBoth ? (
        <IconTip label="Assumir conversa">
          <button
            type="button"
            onClick={() => void onClaimChat()}
            disabled={claimBusy || !canEditInbox}
            className={cn(ICON_BTN, "bg-primary text-primary-foreground hover:bg-primary/90")}
            aria-label="Assumir conversa"
          >
            <Hand className="h-4 w-4" />
          </button>
        </IconTip>
      ) : null}

      {activeChannelAiEnabled ? (
        <IconTip label={aiPaused ? "Retomar IA" : "Pausar IA"}>
          <button
            type="button"
            onClick={handleToggleAi}
            disabled={setAiMode.isPending || !canActOnChat || !canEditInbox}
            className={cn(
              ICON_BTN,
              !aiPaused && "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
            aria-label={aiPaused ? "Retomar IA" : "Pausar IA"}
          >
            {aiPaused ? (
              <Play className="h-4 w-4 fill-current" />
            ) : (
              <Pause className="h-4 w-4 fill-current" />
            )}
          </button>
        </IconTip>
      ) : null}

      <IconTip label="Ligar">
        <button
          type="button"
          onClick={handleCall}
          disabled={startCall.isPending || !phone?.trim()}
          className={ICON_BTN}
          aria-label="Ligar"
        >
          {startCall.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
        </button>
      </IconTip>

      <IconTip label="Perfil do cliente">
        <button
          type="button"
          onClick={onOpenProfile}
          className={ICON_BTN}
          aria-label="Perfil do cliente"
        >
          <UserRound className="h-4 w-4" />
        </button>
      </IconTip>

      {canMarkSaleFromChat && canEditCrm && canEditInbox ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="hidden h-8 shrink-0 gap-1.5 rounded-full text-xs font-semibold sm:inline-flex"
          onClick={onOpenSaleFlow}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Nova Venda
        </Button>
      ) : null}

      <DropdownMenu>
        <IconTip label="Mais ações">
          <DropdownMenuTrigger asChild>
            <button type="button" className={ICON_BTN} aria-label="Mais ações">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </IconTip>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Conversa
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={handlePin} disabled={pinChat.isPending}>
            {chat.isPinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
            {chat.isPinned ? "Desafixar conversa" : "Fixar conversa"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleRequestTransfer} disabled={!canEditInbox} data-testid="inbox-transfer-chat">
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Transferir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFollowUp} disabled={!canEditInbox}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Lembrete (follow-up)
          </DropdownMenuItem>
          {snoozed ? (
            <DropdownMenuItem
              onClick={handleClearSnooze}
              disabled={clearSnooze.isPending || !canActOnChat || !canEditInbox}
            >
              <AlarmClock className="mr-2 h-4 w-4" />
              Remover adiamento
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={handleRequestSnooze}
              disabled={!canActOnChat || !canEditInbox}
            >
              <AlarmClock className="mr-2 h-4 w-4" />
              Adiar conversa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => void notificationSettings.setEnabled(!notificationSettings.enabled)}
          >
            {notificationsActive ? (
              <Bell className="mr-2 h-4 w-4" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            {notificationsActive ? "Silenciar notificações" : "Ativar notificações"}
          </DropdownMenuItem>

          {(showClaimNegotiation || showReleaseNegotiation || negotiation) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Negócio CRM
              </DropdownMenuLabel>
            </>
          )}
          {showClaimNegotiation && negotiation && !offerClaimBoth ? (
            <DropdownMenuItem
              onClick={() => void onClaimNegotiation()}
              disabled={claimBusy || !canEditCrm}
            >
              <Briefcase className="mr-2 h-4 w-4" />
              Assumir negócio
            </DropdownMenuItem>
          ) : null}
          {showReleaseNegotiation && negotiation ? (
            <DropdownMenuItem
              onClick={() => void onReleaseNegotiation()}
              disabled={claimBusy || !canEditCrm}
            >
              <Users className="mr-2 h-4 w-4" />
              Devolver negócio ao pool
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onOpenSaleFlow}
            disabled={!canMarkSaleFromChat || !canEditCrm || !canEditInbox}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Registrar venda
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
