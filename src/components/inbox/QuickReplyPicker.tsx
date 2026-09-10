import { Pencil, Plus, Zap } from "lucide-react";
import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickReplyEditorDialog } from "./QuickReplyEditorDialog";
import type { QuickReply } from "@/types/domain";

export function QuickReplyPicker({
  open,
  onOpenChange,
  replies,
  onSelect,
  disabled = false,
  hideTrigger = false,
  anchorRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replies: QuickReply[];
  onSelect: (reply: QuickReply) => void;
  disabled?: boolean;
  /** Abre o popover ancorado em outro botão (ex.: menu "Mais"). */
  hideTrigger?: boolean;
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const globalReplies = replies.filter((r) => r.scope === "global");
  const privateReplies = replies.filter((r) => r.scope === "private");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);

  function openCreate() {
    setEditingReply(null);
    onOpenChange(false);
    setEditorOpen(true);
  }
  function openEdit(reply: QuickReply) {
    setEditingReply(reply);
    onOpenChange(false);
    setEditorOpen(true);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {hideTrigger && anchorRef ? (
        <PopoverAnchor
          virtualRef={anchorRef as React.ComponentProps<typeof PopoverAnchor>["virtualRef"]}
        />
      ) : hideTrigger ? null : (
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled}
            title="Respostas rápidas (ou digite /)"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent px-0 text-muted-foreground shadow-none hover:bg-wchat-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 ${open ? "bg-wchat-200 text-primary" : ""}`}
          >
            <Zap className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent
        side="top"
        align="start"
        className="mb-1 w-[min(360px,calc(100vw-24px))] rounded-[20px] border-border bg-card p-0 shadow-[0_18px_42px_rgba(0,0,0,0.35)]"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder="Buscar resposta..."
            className="border-b border-border text-foreground placeholder:text-muted-foreground"
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma resposta encontrada.
            </CommandEmpty>

            {globalReplies.length > 0 ? (
              <CommandGroup
                heading="Compartilhadas"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {globalReplies.map((reply) => (
                  <QuickReplyItem
                    key={reply.id}
                    reply={reply}
                    onSelect={onSelect}
                    onEdit={openEdit}
                    onClose={() => onOpenChange(false)}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {privateReplies.length > 0 ? (
              <CommandGroup
                heading="Minhas"
                className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {privateReplies.map((reply) => (
                  <QuickReplyItem
                    key={reply.id}
                    reply={reply}
                    onSelect={onSelect}
                    onEdit={openEdit}
                    onClose={() => onOpenChange(false)}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {replies.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma resposta cadastrada.
              </div>
            ) : null}
          </CommandList>
          <div className="border-t border-border p-1.5">
            <button
              type="button"
              onClick={openCreate}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-wchat-100"
            >
              <Plus className="h-4 w-4" />
              Nova resposta rápida
            </button>
          </div>
        </Command>
      </PopoverContent>
      <QuickReplyEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editingReply}
      />
    </Popover>
  );
}

function QuickReplyItem({
  reply,
  onSelect,
  onEdit,
  onClose,
}: {
  reply: QuickReply;
  onSelect: (reply: QuickReply) => void;
  onEdit: (reply: QuickReply) => void;
  onClose: () => void;
}) {
  return (
    <CommandItem
      value={`${reply.title} ${reply.shortcut ?? ""} ${reply.bodyText}`}
      onSelect={() => {
        onSelect(reply);
        onClose();
      }}
      className="group/qr flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 hover:bg-wchat-100 aria-selected:bg-wchat-100"
    >
      <div className="flex w-full items-center gap-2">
        <span className="truncate text-[14px] font-medium text-foreground">{reply.title}</span>
        {reply.shortcut ? (
          <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            /{reply.shortcut}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEdit(reply);
          }}
          aria-label={`Editar ${reply.title}`}
          title="Editar"
          className={`${reply.shortcut ? "" : "ml-auto"} shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/qr:opacity-100 focus:opacity-100`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      <p className="line-clamp-2 text-[12px] leading-4 text-muted-foreground">{reply.bodyText}</p>
    </CommandItem>
  );
}
