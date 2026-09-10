import { useLayoutEffect, useRef, type ChangeEvent, type RefObject } from "react";
import {
  FileText,
  Loader2,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pause,
  PenLine,
  Play,
  Reply,
  Send,
  Smile,
  Sparkles,
  X,
  Zap,
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
import { NegotiationSuggestMessageButton } from "@/components/crm/NegotiationAiSummary";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WHATSAPP_MEDIA_MAX_BYTES } from "@/lib/api/whatsapp-media";
import { resolveComposerAttachmentPreview } from "@/lib/inboxComposerPreview";
import { getInboxMessagePreviewText } from "@/lib/inboxMessageBody";
import { cn } from "@/lib/utils";
import type { MessageType, QuickReply, WhatsappMessage } from "@/types/domain";
import { QUICK_EMOJIS } from "./inboxComposerOptions";
import { QuickReplyPicker } from "./QuickReplyPicker";

const COMPOSER_ICON =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wchat-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

export type MessageInputProps = {
  bodyTextareaRef: RefObject<HTMLTextAreaElement>;
  mediaUrlInputRef: RefObject<HTMLInputElement>;
  attachmentInputRef: RefObject<HTMLInputElement>;
  messageType: Exclude<MessageType, "system">;
  onMessageTypeChange: (value: Exclude<MessageType, "system">) => void;
  simulateTyping: boolean;
  onSimulateTypingChange: (value: boolean) => void;
  mediaUrl: string;
  onMediaUrlChange: (value: string) => void;
  payloadText: string;
  onPayloadTextChange: (value: string) => void;
  selectedAttachmentName: string | null;
  attachmentMimeType?: string | null;
  bodyText: string;
  onBodyTextChange: (value: string) => void;
  onSend: () => void;
  sendDisabled: boolean;
  /** Bloqueia anexo, áudio e emoji (ex.: lead não assumido). */
  composerActionsDisabled?: boolean;
  showEmojiPicker: boolean;
  onToggleEmojiPicker: () => void;
  onAppendEmoji: (emoji: string) => void;
  onAttachmentButtonClick: () => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  attachmentUploading?: boolean;
  /** Progresso 0..1 durante upload, null fora dele. */
  attachmentProgress?: number | null;
  microphoneState: "idle" | "requesting" | "granted" | "denied";
  isRecording?: boolean;
  isRecordingPaused?: boolean;
  recordingDurationSec?: number;
  onMicrophoneClick: () => void;
  onRecordingPauseToggle?: () => void;
  quickReplies?: QuickReply[];
  quickReplyOpen?: boolean;
  onQuickReplyOpenChange?: (open: boolean) => void;
  onQuickReplyShortcutOpen?: () => void;
  onSelectQuickReply?: (reply: QuickReply) => void;
  noteMode?: boolean;
  onNoteModeChange?: (value: boolean) => void;
  onClearAttachment?: () => void;
  /** Mensagem que o composer está citando (reply). Null quando não há reply ativo. */
  replyingTo?: WhatsappMessage | null;
  /** Nome a mostrar no header da barra de reply para mensagem inbound. */
  activeChatName?: string;
  /** Cancela o reply, fechando a barra. */
  onCancelReply?: () => void;
  /** Aciona a IA copilot para sugerir uma resposta. Omitir esconde o botão. */
  onSuggestReply?: () => void;
  /** Indica que uma sugestão está sendo gerada (mostra spinner). */
  isSuggestingReply?: boolean;
  /** Desabilita o botão (sem thread, composer com texto, sem permissão, etc.). */
  suggestReplyDisabled?: boolean;
  /**
   * Quando o chat tem uma negociação CRM vinculada, expõe um segundo botão de
   * sugestão que usa o contexto completo da negociação (tarefas, comentários,
   * atividades) — render só quando ID + handler de aplicar forem fornecidos.
   */
  crmSuggestNegotiationId?: string | null;
  onCrmSuggestApply?: (text: string) => void;
  onSendDocumentLink?: (category: "anamnese" | "orcamento" | "contrato") => void;
};

export function MessageInput({
  bodyTextareaRef,
  mediaUrlInputRef,
  attachmentInputRef,
  messageType,
  onMessageTypeChange,
  simulateTyping,
  onSimulateTypingChange,
  mediaUrl,
  onMediaUrlChange,
  payloadText,
  onPayloadTextChange,
  selectedAttachmentName,
  attachmentMimeType = null,
  bodyText,
  onBodyTextChange,
  onSend,
  sendDisabled,
  composerActionsDisabled = false,
  showEmojiPicker,
  onToggleEmojiPicker,
  onAppendEmoji,
  onAttachmentButtonClick,
  onAttachmentChange,
  attachmentUploading = false,
  attachmentProgress = null,
  microphoneState,
  isRecording = false,
  isRecordingPaused = false,
  recordingDurationSec = 0,
  onMicrophoneClick,
  onRecordingPauseToggle,
  quickReplies = [],
  quickReplyOpen = false,
  onQuickReplyOpenChange,
  onQuickReplyShortcutOpen,
  onSelectQuickReply,
  noteMode = false,
  onNoteModeChange,
  onClearAttachment,
  replyingTo = null,
  activeChatName,
  onCancelReply,
  onSuggestReply,
  isSuggestingReply = false,
  suggestReplyDisabled = false,
  crmSuggestNegotiationId,
  onCrmSuggestApply,
  onSendDocumentLink,
}: MessageInputProps) {
  const previewKind = resolveComposerAttachmentPreview(
    messageType,
    mediaUrl,
    attachmentMimeType,
  );
  const previewTitle =
    previewKind === "image"
      ? "Imagem"
      : previewKind === "video"
        ? "Video"
        : previewKind === "audio"
          ? "Audio"
          : previewKind === "document"
            ? "Documento"
            : null;

  const moreToolsRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [bodyText, bodyTextareaRef]);

  return (
    <div className="relative z-10 shrink-0 border-t border-border bg-card px-3 py-2 md:px-5 md:py-3">
      {(messageType === "media" || messageType === "audio" || messageType === "document") && (
        <div className="mb-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Anexos: ate {WHATSAPP_MEDIA_MAX_BYTES / (1024 * 1024)} MB por arquivo (imagens, video, audio,
            PDF e documentos comuns).
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {selectedAttachmentName ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-3 py-1 text-xs font-semibold text-[var(--inbox-ink-2)]">
                <span>{previewTitle ?? "Arquivo"}</span>
                <span className="max-w-[220px] truncate font-medium">{selectedAttachmentName}</span>
              </div>
            ) : null}
            {onClearAttachment ? (
              <button
                type="button"
                disabled={attachmentUploading}
                onClick={onClearAttachment}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--inbox-border)] bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--inbox-surface)] disabled:pointer-events-none disabled:opacity-50"
                title="Remover anexo"
              >
                <X className="h-3.5 w-3.5" />
                Remover
              </button>
            ) : null}
          </div>
          {attachmentUploading && attachmentProgress !== null ? (
            <div className="mb-2 w-full max-w-[360px] rounded-2xl border border-[var(--inbox-border)] bg-[var(--inbox-surface)] px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--inbox-ink-2)]">
                <span>Subindo arquivo...</span>
                <span className="tabular-nums">{Math.round(attachmentProgress * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--inbox-border)]">
                <div
                  className="h-full rounded-full bg-[var(--crm-brand)] transition-[width] duration-150"
                  style={{ width: `${Math.max(0, Math.min(1, attachmentProgress)) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {previewKind && mediaUrl.trim() ? (
            <div className="mb-3 overflow-hidden rounded-[22px] border border-[var(--inbox-border)] bg-[var(--inbox-surface)] p-2 shadow-[0_10px_24px_rgba(37,63,51,0.04)]">
              <div className="mb-2 flex items-center justify-between gap-2 px-1 pt-0.5">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {previewTitle ?? "Anexo"}
                  </p>
                  {selectedAttachmentName ? (
                    <p className="truncate text-xs text-[var(--inbox-ink-2)]">{selectedAttachmentName}</p>
                  ) : null}
                </div>
              </div>
              {previewKind === "image" ? (
                <img
                  src={mediaUrl}
                  alt=""
                  className="mx-auto max-h-40 w-auto max-w-full rounded-xl object-contain"
                />
              ) : null}
              {previewKind === "video" ? (
                <video
                  src={mediaUrl}
                  controls
                  className="mx-auto max-h-40 w-full max-w-full rounded-xl"
                />
              ) : null}
              {previewKind === "audio" ? (
                <audio src={mediaUrl} controls className="h-10 w-full max-w-md" />
              ) : null}
              {previewKind === "document" ? (
                <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-sm text-[var(--inbox-ink-2)]">
                  <FileText className="h-8 w-8 shrink-0 text-[var(--crm-brand)]" />
                  <span className="min-w-0 truncate">{selectedAttachmentName ?? "Documento"}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {/* URL preenchida pelo upload fica apenas no estado; campo visivel gerava ruido (link longo do Storage). */}
          <Input
            ref={mediaUrlInputRef}
            value={mediaUrl}
            onChange={(event) => onMediaUrlChange(event.target.value)}
            tabIndex={-1}
            aria-hidden
            placeholder={
              messageType === "audio"
                ? "URL do audio (opcional) — ou use o botao de microfone para gravar"
                : messageType === "document"
                  ? "URL do arquivo"
                  : "URL da midia ou da imagem"
            }
            className={cn(
              "sr-only",
              "h-px w-px min-w-0 border-0 p-0 shadow-none",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
          />
        </div>
      )}

      {messageType !== "text" &&
      messageType !== "media" &&
      messageType !== "audio" &&
      messageType !== "document" ? (
        <div className="mb-3">
          <Textarea
            value={payloadText}
            onChange={(event) => onPayloadTextChange(event.target.value)}
            placeholder='Payload extra em JSON. Ex.: {"buttons":[...]}'
            className="min-h-[100px] rounded-[24px] border-[var(--inbox-border)] bg-card font-mono text-xs shadow-[0_8px_18px_rgba(37,63,51,0.04)]"
          />
        </div>
      ) : null}

      {showEmojiPicker ? (
        <div className="mb-3 flex flex-wrap gap-2 rounded-[24px] border border-[var(--inbox-border)] bg-card p-3 shadow-[0_12px_24px_rgba(37,63,51,0.08)]">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onAppendEmoji(emoji)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg transition-colors hover:bg-[var(--inbox-surface)]"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {noteMode ? (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-[var(--inbox-gold-ink)] bg-[var(--inbox-gold-ink)] px-3 py-1.5">
          <div className="flex items-center gap-2">
            <PenLine className="h-3.5 w-3.5 text-[var(--inbox-gold)]" />
            <span className="text-xs font-medium text-[var(--inbox-gold)]">
              Nota interna — visível só para a equipe
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNoteModeChange?.(false)}
            className="ml-2 text-[var(--inbox-gold)] transition-colors hover:text-[var(--inbox-gold)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      {replyingTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-[3px] border-primary bg-wchat-50 px-3 py-2">
          <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold leading-tight text-primary">
              Respondendo a{" "}
              {replyingTo.direction === "outbound" ? "Você" : activeChatName || "Contato"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
              {getInboxMessagePreviewText(replyingTo) || "(mensagem sem texto)"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCancelReply?.()}
            className="ml-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-wchat-100 hover:text-foreground"
            aria-label="Cancelar reply"
            title="Cancelar reply"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className={cn(
        "flex min-h-[52px] items-end gap-1.5 rounded-[28px] px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2",
        noteMode ? "bg-[var(--crm-amber-tint)] ring-1 ring-[var(--crm-amber-border)]" : "bg-card ring-1 ring-border",
      )}>
        <input
          ref={attachmentInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar"
          onChange={onAttachmentChange}
        />
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <button
            type="button"
            onClick={onAttachmentButtonClick}
            disabled={attachmentUploading || composerActionsDisabled}
            className={cn(
              COMPOSER_ICON,
              messageType === "document" && "bg-wchat-200 text-primary",
            )}
            title={composerActionsDisabled ? "Assuma a conversa e o negócio para anexar" : "Anexar arquivo"}
            aria-label="Anexar arquivo"
          >
            {attachmentUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggleEmojiPicker}
            disabled={composerActionsDisabled}
            className={cn(COMPOSER_ICON, showEmojiPicker && "bg-wchat-200 text-primary")}
            title="Inserir emoji"
            aria-label="Inserir emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                ref={moreToolsRef}
                type="button"
                className={COMPOSER_ICON}
                aria-label="Mais ferramentas"
                title="Mais ferramentas"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Ferramentas
              </DropdownMenuLabel>
              {onSelectQuickReply ? (
                <DropdownMenuItem
                  disabled={composerActionsDisabled}
                  onSelect={(event) => {
                    event.preventDefault();
                    onQuickReplyOpenChange?.(true);
                  }}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Respostas rápidas
                </DropdownMenuItem>
              ) : null}
              {onNoteModeChange ? (
                <DropdownMenuItem
                  disabled={composerActionsDisabled}
                  onClick={() => onNoteModeChange(!noteMode)}
                >
                  <PenLine className="mr-2 h-4 w-4" />
                  {noteMode ? "Sair do modo nota" : "Nota interna"}
                </DropdownMenuItem>
              ) : null}
              {onSuggestReply ? (
                <DropdownMenuItem
                  disabled={composerActionsDisabled || suggestReplyDisabled || isSuggestingReply}
                  onClick={onSuggestReply}
                >
                  {isSuggestingReply ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Sugerir resposta (IA)
                </DropdownMenuItem>
              ) : null}
              {crmSuggestNegotiationId && onCrmSuggestApply ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      document
                        .querySelector<HTMLButtonElement>(
                          '[data-testid="composer-suggest-crm-message"] button',
                        )
                        ?.click();
                    }}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Sugerir com contexto CRM
                  </DropdownMenuItem>
                </>
              ) : null}
              {onSendDocumentLink ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={composerActionsDisabled}
                    onClick={() => onSendDocumentLink("anamnese")}
                  >
                    <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                    Enviar Anamnese (Link)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={composerActionsDisabled}
                    onClick={() => onSendDocumentLink("orcamento")}
                  >
                    <FileText className="mr-2 h-4 w-4 text-blue-600" />
                    Enviar Orçamento (Link)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={composerActionsDisabled}
                    onClick={() => onSendDocumentLink("contrato")}
                  >
                    <FileText className="mr-2 h-4 w-4 text-purple-600" />
                    Enviar Contrato (Link)
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {onSelectQuickReply ? (
            <QuickReplyPicker
              open={quickReplyOpen}
              onOpenChange={onQuickReplyOpenChange ?? (() => {})}
              replies={quickReplies}
              onSelect={onSelectQuickReply}
              disabled={composerActionsDisabled}
              hideTrigger
              anchorRef={moreToolsRef}
            />
          ) : null}
          {crmSuggestNegotiationId && onCrmSuggestApply ? (
            <div className="sr-only" data-testid="composer-suggest-crm-message">
              <NegotiationSuggestMessageButton
                negotiationId={crmSuggestNegotiationId}
                variant="ghost"
                iconOnly
                buttonTitle="Sugerir com contexto do CRM"
                onApplyToCurrent={onCrmSuggestApply}
              />
            </div>
          ) : null}
        </div>

        {/* textarea nativo evita border/min-height/ring herdados do shadcn (caixa dentro da pilula) */}
        <textarea
          ref={bodyTextareaRef}
          value={bodyText}
          rows={1}
          disabled={composerActionsDisabled}
          data-gramm_editor="false"
          data-grammarly-ignore="true"
          onChange={(event) => onBodyTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "/" && !event.shiftKey && !event.metaKey && !event.ctrlKey && bodyText.length === 0) {
              event.preventDefault();
              onQuickReplyShortcutOpen?.();
              return;
            }

            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void onSend();
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
          placeholder={noteMode ? "Escrever nota interna..." : "Digite uma mensagem"}
          className={cn(
            "min-h-[40px] max-h-[42vh] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2 md:max-h-80",
            "text-[15px] font-medium leading-6 text-foreground",
            "placeholder:text-muted-foreground",
            "border-0 shadow-none outline-none ring-0 ring-offset-0",
            "focus:border-0 focus:outline-none focus:ring-0 focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
          )}
        />

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void onMicrophoneClick();
            }}
            disabled={composerActionsDisabled}
            className={cn(
              COMPOSER_ICON,
              isRecording
                ? "bg-red-900/40 text-red-300 ring-2 ring-red-500/50 animate-pulse"
                : microphoneState === "granted"
                  ? "bg-wchat-200 text-primary"
                  : microphoneState === "denied"
                    ? "bg-red-900/30 text-red-300 hover:bg-red-900/50"
                    : undefined,
            )}
            title={
              isRecording
                ? `Gravando (${recordingDurationSec}s) — clique para parar e salvar`
                : "Gravar áudio"
            }
            aria-label="Gravar áudio"
          >
            {microphoneState === "requesting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
          {isRecording && onRecordingPauseToggle ? (
            <button
              type="button"
              onClick={onRecordingPauseToggle}
              disabled={composerActionsDisabled}
              className={COMPOSER_ICON}
              title={isRecordingPaused ? "Continuar gravação" : "Pausar gravação"}
              aria-label={isRecordingPaused ? "Continuar gravação" : "Pausar gravação"}
            >
              {isRecordingPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>
          ) : null}
          {isRecording ? (
            <span className="hidden text-xs tabular-nums text-red-600 sm:inline">
              {isRecordingPaused ? "Pausado" : `${recordingDurationSec}s`}
            </span>
          ) : null}
          <Button
            size="icon"
            className={cn(
              "h-9 w-9 shrink-0 rounded-full shadow-none",
              noteMode ? "bg-amber-600 hover:bg-amber-700" : "bg-primary text-primary-foreground hover:bg-wchat-700",
            )}
            disabled={sendDisabled || composerActionsDisabled || attachmentUploading}
            aria-busy={attachmentUploading}
            aria-label={noteMode ? "Salvar nota" : attachmentUploading ? "Enviando arquivo" : "Enviar mensagem"}
            title={noteMode ? "Salvar nota" : "Enviar"}
            onClick={() => {
              void onSend();
            }}
          >
            {noteMode ? (
              <PenLine className="h-4 w-4" />
            ) : attachmentUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
