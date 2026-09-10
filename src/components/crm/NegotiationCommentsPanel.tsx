import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AtSign, MessageSquare, Send, Trash2 } from "lucide-react";
import type { LeadScoreResult } from "@/lib/crm/lead-score";
import { Button } from "@/components/ui/button";
import {
  NegotiationAiSummaryButton,
  NegotiationSuggestMessageButton,
} from "@/components/crm/NegotiationAiSummary";
import { NegotiationScoreCard } from "@/components/crm/NegotiationScoreCard";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ReactNode } from "react";
import {
  type CrmNegotiationComment,
  useCreateCrmNegotiationComment,
  useCrmNegotiationComments,
  useCrmNegotiationCommentsRealtime,
  useDeleteCrmNegotiationComment,
} from "@/lib/api/crm-negotiation-comments";
import { cn } from "@/lib/utils";

type AttendantOption = { id: string; name: string };

/** Substring após o último "@" enquanto o usuário digita (até o caret). */
function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const slice = text.slice(0, caret);
  const at = slice.lastIndexOf("@");
  if (at === -1) return null;
  // Aceita só se o "@" é início OU veio depois de espaço/quebra.
  if (at > 0 && !/\s/.test(slice[at - 1])) return null;
  const query = slice.slice(at + 1);
  // Cancela quando o trecho contém espaço (já passou o nome).
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min atrás`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h atrás`;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Destaca `@Nome` no texto quando o nome corresponde a algum atendente conhecido. */
function renderBody(body: string, attendantsByName: Map<string, string>) {
  const out: React.ReactNode[] = [];
  const re = /(@[\p{L}\p{N}_]+(?:\s+[\p{L}\p{N}_]+){0,2})/gu;
  let last = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = re.exec(body))) {
    if (match.index > last) out.push(body.slice(last, match.index));
    const raw = match[0];
    // O regex captura até 3 palavras — vamos achar o subnome mais longo conhecido.
    const tail = raw.slice(1).trim();
    let matched: string | null = null;
    const tokens = tail.split(/\s+/);
    for (let n = tokens.length; n >= 1; n--) {
      const candidate = tokens.slice(0, n).join(" ").toLowerCase();
      if (attendantsByName.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (matched) {
      const consumed = `@${tokens.slice(0, matched.split(/\s+/).length).join(" ")}`;
      out.push(
        <span
          key={`m${idx++}`}
          className="rounded bg-[var(--crm-brand-tint)] px-1 font-medium text-[var(--crm-brand)]"
        >
          {consumed}
        </span>,
      );
      const consumedLen = consumed.length;
      // Resto da match (caso tenhamos consumido só parte) vira texto normal.
      if (consumedLen < raw.length) out.push(raw.slice(consumedLen));
    } else {
      out.push(raw);
    }
    last = match.index + raw.length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}

export function NegotiationCommentsPanel({
  negotiationId,
  attendants,
  leadScore,
  changeHistorySlot,
}: {
  negotiationId: string;
  attendants: AttendantOption[];
  leadScore?: LeadScoreResult;
  /** Painel opcional renderizado abaixo da thread (ex.: histórico de mudanças). */
  changeHistorySlot?: ReactNode;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: comments = [], isLoading } = useCrmNegotiationComments(negotiationId);
  useCrmNegotiationCommentsRealtime(negotiationId);
  const createMutation = useCreateCrmNegotiationComment();
  const deleteMutation = useDeleteCrmNegotiationComment();

  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<Set<string>>(() => new Set());
  const [mentionMenu, setMentionMenu] = useState<{
    start: number;
    query: string;
    highlight: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const attendantsById = useMemo(() => {
    const map = new Map<string, AttendantOption>();
    for (const a of attendants) map.set(a.id, a);
    return map;
  }, [attendants]);
  const attendantsByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of attendants) map.set(a.name.toLowerCase(), a.id);
    return map;
  }, [attendants]);

  const filteredCandidates = useMemo(() => {
    if (!mentionMenu) return [] as AttendantOption[];
    const q = mentionMenu.query.toLowerCase();
    return attendants
      .filter((a) => (q ? a.name.toLowerCase().includes(q) : true))
      .slice(0, 6);
  }, [attendants, mentionMenu]);

  const handleChange = useCallback((next: string, caret: number) => {
    setBody(next);
    const m = activeMentionQuery(next, caret);
    if (m) {
      setMentionMenu({ start: m.start, query: m.query, highlight: 0 });
    } else {
      setMentionMenu(null);
    }
  }, []);

  const insertMention = useCallback(
    (att: AttendantOption) => {
      const el = textareaRef.current;
      const caret = el?.selectionStart ?? body.length;
      const trigger = activeMentionQuery(body, caret);
      if (!trigger) return;
      const before = body.slice(0, trigger.start);
      const after = body.slice(caret);
      const next = `${before}@${att.name} ${after}`;
      setBody(next);
      setMentionIds((prev) => {
        const ns = new Set(prev);
        ns.add(att.id);
        return ns;
      });
      setMentionMenu(null);
      // Coloca caret depois do nome inserido + espaço.
      requestAnimationFrame(() => {
        const target = before.length + att.name.length + 2;
        el?.focus();
        el?.setSelectionRange(target, target);
      });
    },
    [body],
  );

  const handleSubmit = useCallback(async () => {
    if (!body.trim()) return;
    // Filtra menções que ainda aparecem no texto final (usuário pode ter apagado o nome).
    const finalMentions = Array.from(mentionIds).filter((id) => {
      const att = attendantsById.get(id);
      return att && body.toLowerCase().includes(`@${att.name.toLowerCase()}`);
    });
    try {
      await createMutation.mutateAsync({
        negotiationId,
        body,
        mentions: finalMentions,
      });
      setBody("");
      setMentionIds(new Set());
      setMentionMenu(null);
    } catch (err) {
      toast({
        title: "Não foi possível comentar",
        description: err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }, [attendantsById, body, createMutation, mentionIds, negotiationId, toast]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit com Cmd/Ctrl+Enter.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSubmit();
        return;
      }
      if (!mentionMenu) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionMenu(null);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionMenu((m) =>
          m ? { ...m, highlight: Math.min(filteredCandidates.length - 1, m.highlight + 1) } : m,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionMenu((m) => (m ? { ...m, highlight: Math.max(0, m.highlight - 1) } : m));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pick = filteredCandidates[mentionMenu.highlight];
        if (pick) {
          e.preventDefault();
          insertMention(pick);
        }
      }
    },
    [filteredCandidates, handleSubmit, insertMention, mentionMenu],
  );

  const handleDelete = useCallback(
    async (comment: CrmNegotiationComment) => {
      try {
        await deleteMutation.mutateAsync({ id: comment.id, negotiationId });
        toast({ title: "Comentário excluído." });
      } catch (err) {
        toast({
          title: "Não foi possível excluir",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      }
    },
    [deleteMutation, negotiationId, toast],
  );

  // Garante o foco quando popover de menção abre.
  useEffect(() => {
    if (!mentionMenu) return;
    setMentionMenu((m) =>
      m && m.highlight >= filteredCandidates.length
        ? { ...m, highlight: Math.max(0, filteredCandidates.length - 1) }
        : m,
    );
  }, [filteredCandidates.length, mentionMenu]);

  return (
    <div className="flex flex-col gap-4">
      {leadScore ? <NegotiationScoreCard score={leadScore} /> : null}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--crm-ink)]">
          <MessageSquare className="h-4 w-4 text-[var(--crm-brand)]" aria-hidden />
          Comentários da negociação
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NegotiationAiSummaryButton negotiationId={negotiationId} variant="outline" />
          <NegotiationSuggestMessageButton negotiationId={negotiationId} variant="outline" />
          <span className="text-xs text-[var(--crm-ink-3)]">
            {comments.length} {comments.length === 1 ? "comentário" : "comentários"}
          </span>
        </div>
      </header>

      <ul className="space-y-3">
        {isLoading ? (
          <li className="text-sm text-[var(--crm-ink-3)]">Carregando…</li>
        ) : comments.length === 0 ? (
          <li className="rounded-md border border-dashed border-[var(--crm-border)] p-4 text-center text-sm text-[var(--crm-ink-3)]">
            Sem comentários ainda. Use <kbd className="rounded bg-muted px-1 text-[10px]">@</kbd>{" "}
            para chamar alguém do time.
          </li>
        ) : (
          comments.map((c) => {
            const author = attendantsById.get(c.createdBy);
            const isMine = profile?.id === c.createdBy;
            const mentionsTags = c.mentions
              .map((id) => attendantsById.get(id)?.name)
              .filter((name): name is string => Boolean(name));
            return (
              <li
                key={c.id}
                className="rounded-md border border-[var(--crm-border)] bg-card p-3 shadow-sm"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-[var(--crm-ink-3)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-semibold text-[var(--crm-ink-2)]">
                      {author?.name ?? "Alguém"}
                    </span>
                    <span>·</span>
                    <span title={new Date(c.createdAt).toLocaleString("pt-BR")}>
                      {formatRelative(c.createdAt)}
                    </span>
                  </div>
                  {isMine ? (
                    <button
                      type="button"
                      className="rounded p-1 text-[var(--crm-ink-3)] hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger-strong)]"
                      onClick={() => void handleDelete(c)}
                      aria-label="Excluir comentário"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="whitespace-pre-wrap text-sm text-[var(--crm-ink)]">
                  {renderBody(c.body, attendantsByName)}
                </div>
                {mentionsTags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mentionsTags.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-[var(--crm-brand-tint)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--crm-brand)]"
                      >
                        <AtSign className="h-3 w-3" />
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={body}
          rows={3}
          onChange={(e) =>
            handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyDown={onKeyDown}
          placeholder="Comente aqui — use @ para mencionar um colega. Cmd/Ctrl+Enter envia."
          className="resize-y border-[var(--crm-border-2)] text-sm"
          disabled={createMutation.isPending}
        />
        {mentionMenu && filteredCandidates.length > 0 ? (
          <div className="absolute left-0 right-auto top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-[var(--crm-border)] bg-card shadow-lg">
            <ul className="max-h-56 overflow-y-auto py-1">
              {filteredCandidates.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => insertMention(a)}
                    onMouseEnter={() =>
                      setMentionMenu((m) => (m ? { ...m, highlight: i } : m))
                    }
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                      i === mentionMenu.highlight
                        ? "bg-[var(--crm-brand-tint)] text-[var(--crm-brand)]"
                        : "hover:bg-[var(--crm-surface)]",
                    )}
                  >
                    <AtSign className="h-3.5 w-3.5 text-[var(--crm-brand)]" />
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--crm-ink-3)]">
            <kbd className="rounded bg-muted px-1">@</kbd> menciona ·{" "}
            <kbd className="rounded bg-muted px-1">⌘/Ctrl+Enter</kbd> envia
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-2"
            disabled={!body.trim() || createMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            <Send className="h-4 w-4" />
            Comentar
          </Button>
        </div>
      </div>
      {changeHistorySlot}
    </div>
  );
}
