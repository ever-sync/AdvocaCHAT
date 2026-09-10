import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useSummarizeCrmNegotiation,
  useSuggestNextMessage,
  type SummarizeNegotiationResponse,
  type SuggestNextMessageTone,
} from "@/lib/api/crm-summarize";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Renderiza simples markdown-leve em segurança: parágrafos vazios viram quebras;
 * `**negrito**` vira <strong>. Não suporta links/imagens (evita XSS).
 */
function renderSummary(text: string) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={idx} />;
    // Quebra **bold**. Sem regex inseguro porque entra entre split() seguros.
    const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={idx} className="leading-relaxed">
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={i} className="text-[var(--crm-ink)]">
              {p.slice(2, -2)}
            </strong>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </div>
    );
  });
}

export function NegotiationAiSummaryButton({
  negotiationId,
  variant = "ghost",
}: {
  negotiationId: string;
  variant?: "ghost" | "outline" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SummarizeNegotiationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const summarize = useSummarizeCrmNegotiation();
  const { toast } = useToast();

  const run = useCallback(async () => {
    setError(null);
    setResult(null);
    try {
      const res = await summarize.mutateAsync(negotiationId);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar resumo.");
    }
  }, [negotiationId, summarize]);

  // Dispara automaticamente ao abrir.
  useEffect(() => {
    if (open && !result && !summarize.isPending && !error) {
      void run();
    }
    if (!open) {
      setCopied(false);
    }
  }, [open, result, summarize.isPending, error, run]);

  const handleCopy = useCallback(async () => {
    if (!result?.summary) return;
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopied(true);
      toast({ title: "Resumo copiado para a área de transferência." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione manualmente o texto.",
        variant: "destructive",
      });
    }
  }, [result?.summary, toast]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className="h-8 gap-2"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-4 w-4 text-[var(--crm-brand)]" aria-hidden />
        Resumir com IA
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setResult(null);
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--crm-brand)]" aria-hidden />
              Resumo do negócio
            </DialogTitle>
            <DialogDescription>
              IA lê o histórico (atividades, comentários, tarefas, conversa e cliente) e devolve
              um briefing em bullets — útil pra retomar um negócio sem reler tudo.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px] rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface)]/40 p-4 text-sm text-[var(--crm-ink-2)]">
            {summarize.isPending ? (
              <div className="flex items-center gap-2 text-[var(--crm-ink-3)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lendo o histórico e resumindo…
              </div>
            ) : error ? (
              <div className="text-[var(--crm-danger-strong)]">{error}</div>
            ) : result?.summary ? (
              <div className="space-y-0.5">{renderSummary(result.summary)}</div>
            ) : (
              <div className="text-[var(--crm-ink-3)]">Aguardando…</div>
            )}
          </div>

          {result && !error ? (
            <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--crm-ink-3)]">
              <span>
                {result.contextSize.activities} atividade
                {result.contextSize.activities === 1 ? "" : "s"} ·{" "}
                {result.contextSize.comments} coment.
                {result.contextSize.tasks > 0 ? ` · ${result.contextSize.tasks} tarefa(s)` : ""}
                {result.contextSize.products > 0 ? ` · ${result.contextSize.products} produto(s)` : ""}
                {result.contextSize.messages > 0 ? ` · ${result.contextSize.messages} msg(s)` : ""}
              </span>
              <span>·</span>
              <span title={`Modelo ${result.model}`}>
                {result.usage.input_tokens} in / {result.usage.output_tokens} out tokens
              </span>
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void run()}
              disabled={summarize.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${summarize.isPending ? "animate-spin" : ""}`} />
              Regerar
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => void handleCopy()}
              disabled={!result?.summary || summarize.isPending}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Sugerir próxima mensagem ─────────────────────────────────────────────────

const TONE_OPTIONS: { id: SuggestNextMessageTone; label: string; hint: string }[] = [
  { id: "cordial", label: "Cordial", hint: "Caloroso, sem pressionar" },
  { id: "direto", label: "Direto", hint: "Objetivo, ao ponto" },
  { id: "urgente", label: "Urgente", hint: "Senso de prioridade" },
];

function encodeDraftForUrl(text: string): string {
  try {
    const b64 = btoa(unescape(encodeURIComponent(text)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "";
  }
}

export function NegotiationSuggestMessageButton({
  negotiationId,
  variant = "ghost",
  onApplyToCurrent,
  buttonClassName,
  iconOnly,
  buttonTitle,
}: {
  negotiationId: string;
  variant?: "ghost" | "outline" | "default";
  /**
   * Quando informado, substitui o botão "Editar no WhatsApp" por "Aplicar no
   * composer" — usado quando o usuário já está dentro de uma conversa do
   * Inbox e não precisa de navegação extra.
   */
  onApplyToCurrent?: (text: string) => void;
  buttonClassName?: string;
  iconOnly?: boolean;
  buttonTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<SuggestNextMessageTone>("cordial");
  const [draft, setDraft] = useState<string>("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const suggest = useSuggestNextMessage();
  const { toast } = useToast();
  const navigate = useNavigate();

  const run = useCallback(
    async (nextTone?: SuggestNextMessageTone) => {
      setError(null);
      try {
        const res = await suggest.mutateAsync({
          negotiationId,
          tone: nextTone ?? tone,
        });
        setDraft(res.message);
        setChatId(res.chatId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao gerar sugestão.");
      }
    },
    [negotiationId, suggest, tone],
  );

  useEffect(() => {
    if (open && !draft && !suggest.isPending && !error) {
      void run();
    }
    if (!open) {
      setCopied(false);
    }
  }, [open, draft, suggest.isPending, error, run]);

  const handleToneChange = (next: SuggestNextMessageTone) => {
    setTone(next);
    setDraft("");
    void run(next);
  };

  const handleCopy = useCallback(async () => {
    if (!draft.trim()) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast({ title: "Mensagem copiada." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione manualmente o texto.",
        variant: "destructive",
      });
    }
  }, [draft, toast]);

  const handleOpenInbox = useCallback(() => {
    if (!chatId || !draft.trim()) return;
    const draftParam = encodeDraftForUrl(draft);
    const qs = new URLSearchParams({
      chatId,
      draft: draftParam,
    });
    navigate(`/inbox?${qs.toString()}`);
    setOpen(false);
  }, [chatId, draft, navigate]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        className={cn("h-8 gap-2", buttonClassName)}
        onClick={() => setOpen(true)}
        title={buttonTitle ?? "Sugerir próxima mensagem com IA"}
        aria-label={iconOnly ? buttonTitle ?? "Sugerir próxima mensagem com IA" : undefined}
      >
        <Send className="h-4 w-4 text-[var(--crm-brand)]" aria-hidden />
        {iconOnly ? null : "Sugerir próxima mensagem"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setDraft("");
            setError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--crm-brand)]" aria-hidden />
              Próxima mensagem sugerida
            </DialogTitle>
            <DialogDescription>
              IA lê o histórico e redige um texto curto pra você retomar a conversa.
              Sempre edite antes de enviar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--crm-ink-2)]">
                Tom
              </label>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)] bg-card">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleToneChange(opt.id)}
                    disabled={suggest.isPending}
                    title={opt.hint}
                    className={cn(
                      "px-3 py-1.5 text-xs font-semibold transition-colors",
                      tone === opt.id
                        ? "bg-[var(--crm-brand)] text-white"
                        : "text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--crm-ink-2)]">
                Mensagem (edite à vontade antes de enviar)
              </label>
              {suggest.isPending && !draft ? (
                <div className="flex h-32 items-center justify-center rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface)]/40 text-sm text-[var(--crm-ink-3)]">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lendo o histórico e redigindo…
                </div>
              ) : error ? (
                <div className="rounded-md border border-[var(--crm-danger-border)] bg-[var(--crm-danger-tint)] p-3 text-sm text-[var(--crm-danger-strong)]">
                  {error}
                </div>
              ) : (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={5}
                  placeholder="Aguardando…"
                  className="resize-y border-[var(--crm-border-2)] text-sm"
                />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void run()}
              disabled={suggest.isPending}
            >
              <RefreshCw className={`h-4 w-4 ${suggest.isPending ? "animate-spin" : ""}`} />
              Regerar
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void handleCopy()}
              disabled={!draft.trim() || suggest.isPending}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={() => {
                if (onApplyToCurrent) {
                  if (!draft.trim()) return;
                  onApplyToCurrent(draft);
                  setOpen(false);
                  toast({ title: "Sugestão aplicada no composer." });
                } else {
                  handleOpenInbox();
                }
              }}
              disabled={
                !draft.trim() ||
                suggest.isPending ||
                (!onApplyToCurrent && !chatId)
              }
              title={
                onApplyToCurrent
                  ? "Aplica o texto direto no composer desta conversa"
                  : chatId
                    ? "Abre a conversa com o texto já no composer"
                    : "Negócio sem chat vinculado — copie e cole no inbox"
              }
            >
              <MessageCircle className="h-4 w-4" />
              {onApplyToCurrent ? "Aplicar no composer" : "Editar no WhatsApp"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
