import { Loader2, Search, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInboxChats, useSendWhatsappMessage } from "@/lib/api/whatsapp";
import { useToast } from "@/hooks/use-toast";
import { ConversationAvatar } from "./ConversationAvatar";
import type { InboxChat, SendWhatsappMessageInput, WhatsappMessage } from "@/types/domain";

function buildForwardInput(message: WhatsappMessage, dest: InboxChat): SendWhatsappMessageInput {
  if (message.messageType === "system") {
    throw new Error("Mensagens de sistema não podem ser encaminhadas.");
  }

  const base = {
    instanceId: dest.instanceId,
    chatId: dest.id,
    remoteJid: dest.remoteJid,
    messageType: message.messageType,
  } satisfies Pick<SendWhatsappMessageInput, "instanceId" | "chatId" | "remoteJid" | "messageType">;

  if (message.messageType === "text") {
    return { ...base, bodyText: message.bodyText ?? "" };
  }
  // media / audio / document — mantém URL e legenda se houver
  return {
    ...base,
    mediaUrl: message.mediaUrl ?? undefined,
    bodyText: message.bodyText ?? undefined,
  };
}

export function ForwardMessageDialog({
  open,
  onOpenChange,
  message,
  currentChatId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: WhatsappMessage | null;
  currentChatId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const { toast } = useToast();
  const sendMessage = useSendWhatsappMessage();

  const { data: chats = [], isLoading } = useInboxChats(
    { status: "open", limit: 300 },
    { enabled: open },
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => c.id !== currentChatId)
      .filter((c) => !q || c.displayName.toLowerCase().includes(q));
  }, [chats, search, currentChatId]);

  const selectedChat = filtered.find((c) => c.id === selectedChatId) ?? null;

  async function handleSend() {
    if (!message || !selectedChat) return;
    try {
      await sendMessage.mutateAsync(buildForwardInput(message, selectedChat));
      toast({ title: `Encaminhado para ${selectedChat.displayName}` });
      onOpenChange(false);
      setSelectedChatId(null);
      setSearch("");
    } catch (e) {
      toast({
        title: "Erro ao encaminhar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setSelectedChatId(null);
      setSearch("");
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Encaminhar mensagem</DialogTitle>
          <DialogDescription>Escolha uma conversa para enviar esta mensagem.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-2 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto px-2 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
          ) : (
            <ul className="space-y-0.5 py-1">
              {filtered.map((chat) => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedChatId(chat.id === selectedChatId ? null : chat.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                      chat.id === selectedChatId
                        ? "bg-primary/10 ring-1 ring-primary/30"
                        : "hover:bg-wchat-50"
                    }`}
                  >
                    <ConversationAvatar name={chat.displayName} avatarUrl={chat.avatarUrl} size="xs" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{chat.displayName}</p>
                      {chat.lastMessagePreview ? (
                        <p className="truncate text-[11px] text-muted-foreground">{chat.lastMessagePreview}</p>
                      ) : null}
                    </div>
                    {chat.id === selectedChatId ? (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-3">
          <Button variant="outline" className="rounded-xl" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="rounded-xl"
            disabled={!selectedChat || sendMessage.isPending}
            onClick={() => void handleSend()}
          >
            {sendMessage.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
            Encaminhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
