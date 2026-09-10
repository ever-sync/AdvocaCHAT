import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAssignChat,
  useAutoAssignChat,
  useUnassignChat,
} from "@/lib/api/chat-tags";
import { managerOnlyReleaseToPoolMessage } from "@/lib/crm/negotiation-assignee";
import { useToast } from "@/hooks/use-toast";
import type { AtendimentoUser, InboxChat } from "@/types/domain";

/** Sentinela do Select (Radix não aceita string vazia como value). */
const ASSIGN_NONE = "__none__";

export type AssignChatDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chat alvo da atribuição. Null quando o dialog está fechado/sem contexto. */
  chat: InboxChat | null;
  atendimentoUsers: AtendimentoUser[];
  /** Permissão para devolver ao pool e usar "Distribuir fila". */
  canManageChatPool: boolean;
  /** ID do usuário logado: usado pra marcar "(você)" no select. */
  profileId?: string;
};

export function AssignChatDialog({
  open,
  onOpenChange,
  chat,
  atendimentoUsers,
  canManageChatPool,
  profileId,
}: AssignChatDialogProps) {
  const { toast } = useToast();
  const assignChat = useAssignChat();
  const unassignChat = useUnassignChat();
  const autoAssignChat = useAutoAssignChat();

  const [selectedUser, setSelectedUser] = useState<string>("");

  // Sincroniza o select com o assignee atual sempre que abrir/trocar de chat.
  useEffect(() => {
    if (open) {
      setSelectedUser(chat?.assigneeId ?? "");
    }
  }, [open, chat?.assigneeId]);

  async function handleConfirm() {
    if (!chat) return;
    const previousAssigneeId = chat.assigneeId ?? null;
    const nextAssigneeId = selectedUser.trim() || null;

    if (nextAssigneeId && nextAssigneeId === previousAssigneeId) {
      toast({
        title: "Nenhuma alteração",
        description: "Selecione outro atendente para transferir.",
      });
      return;
    }

    if (!nextAssigneeId && !canManageChatPool) {
      toast({
        title: "Ação não permitida",
        description: managerOnlyReleaseToPoolMessage(),
        variant: "destructive",
      });
      return;
    }

    try {
      if (nextAssigneeId) {
        await assignChat.mutateAsync({
          chatId: chat.id,
          assigneeId: nextAssigneeId,
          reason: previousAssigneeId ? "transfer" : "assign",
        });
        const name =
          atendimentoUsers.find((u) => u.id === nextAssigneeId)?.nome ?? "atendente";
        toast({
          title: previousAssigneeId ? "Conversa transferida" : "Conversa atribuída",
          description: name,
        });
      } else {
        await unassignChat.mutateAsync({
          chatId: chat.id,
          reason: "release_to_pool",
        });
        toast({ title: "Conversa devolvida ao pool" });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        title: previousAssigneeId ? "Erro ao transferir" : "Erro ao atribuir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function handleDistribute() {
    if (!chat) return;
    try {
      const nextId = await autoAssignChat.mutateAsync(chat.id);
      if (!nextId) {
        toast({ title: "Nenhum atendente disponível", variant: "destructive" });
      } else {
        const name = atendimentoUsers.find((u) => u.id === nextId)?.nome ?? "atendente";
        toast({ title: "Conversa distribuída", description: `Atribuída a ${name}.` });
      }
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro ao distribuir",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  const isTransfer = Boolean(chat?.assigneeId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border bg-wchat-50 p-0">
        <DialogHeader className="border-b border-border pb-4 pl-6 pt-5">
          <DialogTitle className="text-[17px] font-medium text-foreground">
            {isTransfer ? "Transferir conversa" : "Atribuir conversa"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {chat?.assigneeName
              ? `Responsável atual: ${chat.assigneeName}. Escolha outro atendente para transferir.`
              : "Escolha o atendente responsável por esta conversa."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-6 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Novo responsável</Label>
            <Select
              value={selectedUser || ASSIGN_NONE}
              onValueChange={(value) =>
                setSelectedUser(value === ASSIGN_NONE ? "" : value)
              }
            >
              <SelectTrigger className="border border-input bg-card text-foreground focus:ring-primary">
                <SelectValue placeholder="Selecionar atendente..." />
              </SelectTrigger>
              <SelectContent className="border-border bg-card text-foreground">
                {canManageChatPool ? (
                  <SelectItem value={ASSIGN_NONE}>Sem responsável (pool)</SelectItem>
                ) : null}
                {atendimentoUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.nome}
                    {user.id === profileId ? " (você)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="flex w-full items-center gap-2">
            {canManageChatPool ? (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg border-border bg-transparent text-muted-foreground hover:bg-wchat-100"
                disabled={autoAssignChat.isPending}
                onClick={() => {
                  void handleDistribute();
                }}
              >
                Distribuir fila
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button
              size="sm"
              className="rounded-lg bg-primary text-primary-foreground hover:bg-wchat-700"
              disabled={assignChat.isPending || unassignChat.isPending}
              onClick={() => {
                void handleConfirm();
              }}
            >
              {isTransfer ? "Transferir" : "Atribuir"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
