import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  useAddTagToChat,
  useChatTags,
  useCreateChatTag,
  useRemoveTagFromChat,
} from "@/lib/api/chat-tags";
import { useRunPlayground } from "@/lib/api/ai-agent";
import { CHAT_TAG_COLOR_PRESETS, DEFAULT_CHAT_TAG_COLOR } from "@/lib/chat-tag-colors";
import {
  buildIntentClassifierPrompt,
  parseIntentClassifierReply,
} from "@/lib/inboxIntentClassifier";
import { cn } from "@/lib/utils";
import type { ChatTag, ChatTagOnChat, WhatsappMessage } from "@/types/domain";
import { useToast } from "@/hooks/use-toast";

type ChatTagsPickerProps = {
  chatId: string;
  tags: ChatTagOnChat[];
  disabled?: boolean;
  /** Mensagens da thread — quando passadas, libera o botão "Sugerir com IA". */
  messages?: WhatsappMessage[];
};

export function ChatTagsPicker({ chatId, tags, disabled = false, messages }: ChatTagsPickerProps) {
  const { toast } = useToast();
  const { data: catalog = [], isLoading: catalogLoading } = useChatTags();
  const createTag = useCreateChatTag();
  const addTag = useAddTagToChat();
  const removeTag = useRemoveTagFromChat();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_CHAT_TAG_COLOR);
  const [aiSuggestions, setAiSuggestions] = useState<ChatTag[]>([]);
  const [aiNoSuggestion, setAiNoSuggestion] = useState(false);

  const appliedIds = useMemo(() => new Set(tags.map((t) => t.tagId)), [tags]);

  const addable = useMemo(
    () => catalog.filter((t) => !appliedIds.has(t.id)),
    [appliedIds, catalog],
  );

  const suggestIntent = useRunPlayground({
    onSuccess: (data) => {
      const { matched } = parseIntentClassifierReply(data.reply ?? "", catalog);
      // Filtra sugestões já aplicadas.
      const fresh = matched.filter((t) => !appliedIds.has(t.id));
      setAiSuggestions(fresh);
      setAiNoSuggestion(fresh.length === 0);
    },
    onError: (error) => {
      toast({
        title: "Não foi possível sugerir etiquetas",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const canSuggest = Array.isArray(messages) && messages.length > 0 && catalog.length > 0;

  const handleSuggestIntent = () => {
    if (!canSuggest || !messages) return;
    setAiSuggestions([]);
    setAiNoSuggestion(false);
    suggestIntent.mutate(buildIntentClassifierPrompt(messages, catalog));
  };

  const applySuggestion = async (tag: ChatTag) => {
    setAiSuggestions((prev) => prev.filter((t) => t.id !== tag.id));
    try {
      await addTag.mutateAsync({ chatId, tagId: tag.id });
    } catch (e) {
      // Rollback visual: devolve a sugestão à lista.
      setAiSuggestions((prev) => [tag, ...prev]);
      toast({
        title: "Erro ao aplicar sugestão",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const isBusy = disabled || createTag.isPending || addTag.isPending || removeTag.isPending;

  const applyExisting = async (tagId: string) => {
    try {
      await addTag.mutateAsync({ chatId, tagId });
    } catch (e) {
      toast({
        title: "Erro ao aplicar etiqueta",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const createAndApply = async () => {
    const name = newName.trim();
    if (name.length < 2) {
      toast({
        title: "Nome muito curto",
        description: "Use pelo menos 2 caracteres para a etiqueta.",
        variant: "destructive",
      });
      return;
    }

    try {
      const existing = catalog.find((t) => t.name.toLowerCase() === name.toLowerCase());
      const tagId = existing
        ? existing.id
        : (
            await createTag.mutateAsync({
              name,
              color: newColor,
              scope: "global",
            })
          ).id;

      if (!appliedIds.has(tagId)) {
        await addTag.mutateAsync({ chatId, tagId });
      }
      setNewName("");
      setNewColor(DEFAULT_CHAT_TAG_COLOR);
    } catch (e) {
      toast({
        title: "Erro ao criar etiqueta",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const removeApplied = async (tagId: string) => {
    try {
      await removeTag.mutateAsync({ chatId, tagId });
    } catch (e) {
      toast({
        title: "Erro ao remover etiqueta",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="rounded-[20px] border border-[var(--inbox-border)] bg-card/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--inbox-muted-2)]">Etiquetas</p>
        {canSuggest ? (
          <button
            type="button"
            disabled={isBusy || suggestIntent.isPending}
            onClick={handleSuggestIntent}
            data-testid="chat-tags-suggest"
            className="inline-flex items-center gap-1 rounded-full bg-wchat-50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title="Sugerir etiquetas com base na conversa"
          >
            {suggestIntent.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Sugerir com IA
          </button>
        ) : null}
      </div>

      {aiSuggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Sugeridas:</span>
          {aiSuggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={isBusy}
              onClick={() => void applySuggestion(tag)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: tag.color, color: tag.color, backgroundColor: `${tag.color}11` }}
              title={`Aplicar "${tag.name}"`}
            >
              <Plus className="h-3 w-3" />
              {tag.name}
            </button>
          ))}
        </div>
      ) : aiNoSuggestion ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sem sugestão automática — adicione manualmente abaixo.
        </p>
      ) : null}

      <div className="mt-2 flex min-h-[36px] flex-wrap gap-2">
        {tags.map((t) => (
          <span
            key={t.tagId}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: `${t.color}33`, color: t.color }}
          >
            {t.name}
            <button
              type="button"
              className="rounded-full p-0.5 opacity-80 hover:opacity-100"
              style={{ backgroundColor: `${t.color}44` }}
              aria-label={`Remover etiqueta ${t.name}`}
              disabled={isBusy}
              onClick={() => void removeApplied(t.tagId)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 ? (
          <span className="text-sm text-[var(--inbox-muted-2)]">Nenhuma etiqueta.</span>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        <div className="space-y-2">
          <Label className="text-xs text-[var(--inbox-muted)]">Adicionar etiqueta já usada na base</Label>
          {catalogLoading ? (
            <p className="text-xs text-[var(--inbox-muted-2)]">Carregando catálogo…</p>
          ) : addable.length === 0 ? (
            <p className="text-xs text-[var(--inbox-muted-2)]">
              Nenhuma outra etiqueta disponível além das já aplicadas.
            </p>
          ) : (
            <Select disabled={isBusy} onValueChange={(tagId) => void applyExisting(tagId)}>
              <SelectTrigger className="h-9 rounded-xl border-[var(--inbox-border)] bg-card">
                <SelectValue placeholder="Escolher etiqueta…" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2 border-t border-[var(--inbox-border)] pt-3">
          <Label className="text-xs text-[var(--inbox-muted)]">Criar etiqueta nova</Label>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome da etiqueta"
              className="h-9 flex-1 rounded-xl border-[var(--inbox-border)] bg-card"
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createAndApply();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-9 w-9 shrink-0 rounded-xl"
              disabled={!newName.trim() || isBusy}
              aria-label="Criar e aplicar etiqueta"
              onClick={() => void createAndApply()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {CHAT_TAG_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={isBusy}
                aria-label={`Cor ${color}`}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-transform hover:scale-105",
                  newColor === color ? "border-[var(--crm-brand)] ring-2 ring-[var(--crm-brand)]/30" : "border-card shadow-sm",
                )}
                style={{ backgroundColor: color }}
                onClick={() => setNewColor(color)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
