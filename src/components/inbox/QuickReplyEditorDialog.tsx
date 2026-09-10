import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import {
  useCreateQuickReply,
  useUpdateQuickReply,
} from "@/lib/api/quick-replies";
import { useToast } from "@/hooks/use-toast";
import type { QuickReply, QuickReplyScope } from "@/types/domain";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando definido, abre em modo edição. */
  editing?: QuickReply | null;
  /** Scope inicial em modo criação (default global). */
  defaultScope?: QuickReplyScope;
  /** Callback opcional após salvar com sucesso. Recebe o registro salvo. */
  onSaved?: (reply: QuickReply) => void;
};

export function QuickReplyEditorDialog({
  open,
  onOpenChange,
  editing,
  defaultScope = "global",
  onSaved,
}: Props) {
  const { toast } = useToast();
  const createQR = useCreateQuickReply();
  const updateQR = useUpdateQuickReply();

  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [scope, setScope] = useState<QuickReplyScope>(defaultScope);

  // Sincroniza estado quando abre (cria ou edita).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setShortcut(editing.shortcut ?? "");
      setBodyText(editing.bodyText);
      setScope(editing.scope);
    } else {
      setTitle("");
      setShortcut("");
      setBodyText("");
      setScope(defaultScope);
    }
  }, [open, editing, defaultScope]);

  const busy = createQR.isPending || updateQR.isPending;
  const canSave = title.trim().length > 0 && bodyText.trim().length > 0 && !busy;

  async function handleSave() {
    try {
      let saved: QuickReply;
      if (editing) {
        // updateQuickReply não altera scope — campo fica disabled no form em modo edição.
        await updateQR.mutateAsync({
          id: editing.id,
          title: title.trim(),
          shortcut: shortcut.trim() || null,
          bodyText,
        });
        saved = { ...editing, title: title.trim(), shortcut: shortcut.trim() || null, bodyText };
      } else {
        saved = await createQR.mutateAsync({
          title: title.trim(),
          shortcut: shortcut.trim() || null,
          bodyText,
          scope,
        });
      }
      toast({ title: editing ? "Resposta atualizada" : "Resposta criada" });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar resposta" : "Nova resposta rápida"}</DialogTitle>
          <DialogDescription>
            O título é o nome que aparece na busca. O atalho (opcional) é ativado digitando /atalho no chat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Saudação inicial"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Atalho</Label>
              <div className="flex items-center rounded-md border border-input bg-background">
                <span className="border-r px-2 text-sm text-muted-foreground">/</span>
                <Input
                  value={shortcut}
                  onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ""))}
                  placeholder="oi"
                  className="border-0 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem *</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Olá! Tudo bem? Em que posso ajudar?"
              className="min-h-[100px] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visibilidade</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as QuickReplyScope)}
              disabled={Boolean(editing)}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global — visível para toda a equipe</SelectItem>
                <SelectItem value="private">Minha — só eu vejo</SelectItem>
              </SelectContent>
            </Select>
            {editing ? (
              <p className="text-[11px] text-muted-foreground">
                Para alterar a visibilidade, recrie a resposta.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-xl" disabled={!canSave} onClick={() => void handleSave()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editing ? "Salvar alterações" : "Criar resposta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
