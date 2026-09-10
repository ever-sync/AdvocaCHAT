import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useChatTags,
  useCreateChatTag,
  useDeleteChatTag,
  useUpdateChatTag,
} from "@/lib/api/chat-tags";
import { CHAT_TAG_COLOR_PRESETS, DEFAULT_CHAT_TAG_COLOR } from "@/lib/chat-tag-colors";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { ChatTag, ChatTagScope } from "@/types/domain";

type ChatTagsSettingsSectionProps = {
  canEdit: boolean;
  canDelete: boolean;
};

export function ChatTagsSettingsSection({ canEdit, canDelete }: ChatTagsSettingsSectionProps) {
  const { toast } = useToast();
  const { data: tags = [], isLoading } = useChatTags();
  const createTag = useCreateChatTag();
  const updateTag = useUpdateChatTag();
  const deleteTag = useDeleteChatTag();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CHAT_TAG_COLOR);
  const [scope, setScope] = useState<ChatTagScope>("global");

  const openCreate = () => {
    setEditingId(null);
    setName("");
    setColor(DEFAULT_CHAT_TAG_COLOR);
    setScope("global");
    setDialogOpen(true);
  };

  const openEdit = (tag: ChatTag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
    setScope(tag.scope);
    setDialogOpen(true);
  };

  const saveTag = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({
        title: "Nome inválido",
        description: "Use pelo menos 2 caracteres para a etiqueta.",
        variant: "destructive",
      });
      return;
    }

    const promise = editingId
      ? updateTag.mutateAsync({ id: editingId, name: trimmed, color })
      : createTag.mutateAsync({ name: trimmed, color, scope });

    void promise
      .then(() => {
        toast({ title: editingId ? "Etiqueta atualizada" : "Etiqueta criada" });
        setDialogOpen(false);
      })
      .catch((e: Error) => {
        toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
      });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Etiquetas</CardTitle>
              <CardDescription>
                Catálogo de etiquetas para organizar conversas no Inbox. Globais são visíveis para toda a
                equipe; Minhas são só suas.
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="rounded-xl"
              disabled={!canEdit}
              onClick={() => {
                if (!canEdit) {
                  toast({
                    title: "Ação indisponível",
                    description: "Seu papel não tem permissão para criar etiquetas.",
                    variant: "destructive",
                  });
                  return;
                }
                openCreate();
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova etiqueta
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando etiquetas…</p>
          ) : tags.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              Nenhuma etiqueta cadastrada. Clique em &quot;Nova etiqueta&quot; para começar.
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  isDeleting={deleteTag.isPending}
                  onEdit={() => {
                    if (!canEdit) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel não tem permissão para editar etiquetas.",
                        variant: "destructive",
                      });
                      return;
                    }
                    openEdit(tag);
                  }}
                  onDelete={() => {
                    if (!canDelete) {
                      toast({
                        title: "Ação indisponível",
                        description: "Seu papel não tem permissão para excluir etiquetas.",
                        variant: "destructive",
                      });
                      return;
                    }
                    void deleteTag.mutateAsync(tag.id).then(() => {
                      toast({ title: "Etiqueta removida" });
                    }).catch((e: Error) => {
                      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
                    });
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen && canEdit}
        onOpenChange={(open) => {
          if (!canEdit) {
            setDialogOpen(false);
            return;
          }
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
            <DialogDescription>
              A cor aparece nas conversas do Inbox. Etiquetas globais exigem permissão de gestão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Urgente"
              />
            </div>
            {!editingId ? (
              <div className="space-y-1.5">
                <Label>Visibilidade</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as ChatTagScope)}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global — visível para toda a equipe</SelectItem>
                    <SelectItem value="private">Minha — só eu vejo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {CHAT_TAG_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Cor ${preset}`}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-105",
                      color === preset ? "border-primary ring-2 ring-primary/30" : "border-white shadow-sm",
                    )}
                    style={{ backgroundColor: preset }}
                    onClick={() => setColor(preset)}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: `${color}33`, color }}
              >
                {name.trim() || "Prévia"}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="rounded-xl"
              disabled={
                !canEdit ||
                name.trim().length < 2 ||
                createTag.isPending ||
                updateTag.isPending
              }
              onClick={saveTag}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TagRow({
  tag,
  canEdit,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
}: {
  tag: ChatTag;
  canEdit: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{tag.name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              tag.scope === "global"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            }`}
          >
            {tag.scope === "global" ? "Global" : "Minha"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg"
          disabled={!canEdit}
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
          disabled={isDeleting || !canDelete}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
