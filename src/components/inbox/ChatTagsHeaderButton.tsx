import { Check, Tag, X } from "lucide-react";
import { useMemo } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useAddTagToChat,
  useChatTags,
  useRemoveTagFromChat,
} from "@/lib/api/chat-tags";
import { useToast } from "@/hooks/use-toast";
import type { ChatTagOnChat } from "@/types/domain";

type Props = {
  chatId: string;
  tags: ChatTagOnChat[];
  disabled?: boolean;
};

/**
 * Botão "Etiquetar" no header do chat — popover leve pra adicionar/remover
 * tags sem precisar abrir o perfil. Criar nova etiqueta continua só pelo
 * perfil ou Configurações (pra evitar duplicar UI de CRUD).
 */
export function ChatTagsHeaderButton({ chatId, tags, disabled = false }: Props) {
  const { toast } = useToast();
  const { data: catalog = [], isLoading } = useChatTags();
  const addTag = useAddTagToChat();
  const removeTag = useRemoveTagFromChat();

  const appliedIds = useMemo(() => new Set(tags.map((t) => t.tagId)), [tags]);
  const isBusy = disabled || addTag.isPending || removeTag.isPending;

  async function toggle(tagId: string) {
    try {
      if (appliedIds.has(tagId)) {
        await removeTag.mutateAsync({ chatId, tagId });
      } else {
        await addTag.mutateAsync({ chatId, tagId });
      }
    } catch (e) {
      toast({
        title: "Falha ao alterar etiqueta",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              data-testid="chat-tags-header-button"
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Etiquetar conversa"
            >
              <Tag className="h-4 w-4" />
              {tags.length > 0 ? (
                <span
                  className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {tags.length}
                </span>
              ) : null}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Etiquetar conversa</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Etiquetas da conversa
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {isLoading ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Carregando…</p>
          ) : catalog.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Nenhuma etiqueta criada. Crie uma em Configurações ou no perfil do contato.
            </p>
          ) : (
            catalog.map((tag) => {
              const applied = appliedIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void toggle(tag.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-wchat-50 disabled:opacity-60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden
                    />
                    <span className="truncate">{tag.name}</span>
                  </span>
                  {applied ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        {tags.length > 0 ? (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Aplicadas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t.tagId}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{ backgroundColor: `${t.color}33`, color: t.color }}
                >
                  {t.name}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void toggle(t.tagId)}
                    aria-label={`Remover ${t.name}`}
                    className="rounded-full p-0.5 opacity-80 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
