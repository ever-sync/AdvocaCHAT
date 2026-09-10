import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import {
  type InboxMessagesPageResult,
  useSendWhatsappMessage,
} from "@/lib/api/whatsapp";
import { useCreateChatNote } from "@/lib/api/chat-notes";
import {
  WHATSAPP_MEDIA_MAX_BYTES,
  uploadWhatsappMediaFile,
} from "@/lib/api/whatsapp-media";
import {
  extensionForRecordedMime,
  pickAudioRecorderMime,
} from "@/lib/inboxAudioRecording";
import { maybeCompressImage } from "@/lib/inboxImageCompression";
import {
  chatAssigneeBlockedMessage,
  negotiationAssigneeBlockedMessage,
} from "@/lib/crm/negotiation-assignee";
import { clearInboxChatDraft, useInboxChatDraft } from "@/hooks/useInboxChatDraft";
import { useToast } from "@/hooks/use-toast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type { InboxChat, MessageType, WhatsappMessage } from "@/types/domain";

export type ComposerMicrophoneState = "idle" | "requesting" | "granted" | "denied";

export type UseInboxComposerArgs = {
  chat: InboxChat | null;
  canEditInbox: boolean;
  /** Lead bloqueado (estágio "vendido"/"perdido" + outras regras): impede envio. */
  inboxLeadLocked: boolean;
  /** Há negócio vinculado? Muda o título do toast de "Assuma a conversa" → "Assuma o negócio". */
  hasLinkedNegotiation: boolean;
};

export type UseInboxComposerResult = {
  // ---- Estado bruto ----
  messageType: Exclude<MessageType, "system">;
  bodyText: string;
  mediaUrl: string;
  payloadText: string;
  simulateTyping: boolean;
  showEmojiPicker: boolean;
  noteMode: boolean;
  microphoneState: ComposerMicrophoneState;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingDurationSec: number;
  quickReplyOpen: boolean;
  selectedAttachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentUploading: boolean;
  attachmentProgress: number | null;
  retryingMessageId: string | null;
  /** Mensagem que está sendo citada (reply). Null quando não há reply ativo. */
  replyingTo: WhatsappMessage | null;

  // ---- Mutations expostas pra UI ler isPending ----
  sendMessage: ReturnType<typeof useSendWhatsappMessage>;
  createChatNote: ReturnType<typeof useCreateChatNote>;

  // ---- Refs que vão para o MessageInput ----
  bodyTextareaRef: RefObject<HTMLTextAreaElement>;
  mediaUrlInputRef: RefObject<HTMLInputElement>;
  attachmentInputRef: RefObject<HTMLInputElement>;

  // ---- Setters ----
  setMessageType: (value: Exclude<MessageType, "system">) => void;
  setBodyText: (value: string) => void;
  setMediaUrl: (value: string) => void;
  setPayloadText: (value: string) => void;
  setSimulateTyping: (value: boolean) => void;
  setShowEmojiPicker: (value: boolean) => void;
  setNoteMode: (value: boolean) => void;
  setQuickReplyOpen: (value: boolean) => void;
  /** Marca/desmarca a mensagem que está sendo citada. */
  setReplyingTo: (value: WhatsappMessage | null) => void;
  /** Reseta anexo + mediaUrl + payload + messageType, mantendo bodyText opcionalmente. */
  resetComposerAttachmentState: (options?: { keepBodyText?: boolean }) => void;

  // ---- Handlers ----
  appendEmoji: (emoji: string) => void;
  handleSendMessage: () => Promise<void>;
  handleRetryMessage: (failed: WhatsappMessage) => Promise<void>;
  handleDiscardMessage: (failed: WhatsappMessage) => void;
  handleAttachmentSelection: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleMicrophoneClick: () => Promise<void>;
  handleRecordingPauseToggle: () => void;
};

/**
 * Encapsula todo o composer do Inbox: estado de texto/mídia/áudio/nota
 * interna, gravação por microfone, upload de anexo (com cancelamento),
 * envio com deduplicação de cliques, retry/discard de bolhas falhas,
 * e persistência de rascunho por chat.
 *
 * O hook é dono dos refs do textarea/inputs do MessageInput — basta passar
 * os refs retornados ao componente.
 */
export function useInboxComposer({
  chat,
  canEditInbox,
  inboxLeadLocked,
  hasLinkedNegotiation,
}: UseInboxComposerArgs): UseInboxComposerResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sendMessage = useSendWhatsappMessage();
  const createChatNote = useCreateChatNote();

  // -------- Estado --------
  const [messageType, setMessageType] = useState<Exclude<MessageType, "system">>("text");
  const [bodyText, setBodyText] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const [simulateTyping, setSimulateTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [microphoneState, setMicrophoneState] =
    useState<ComposerMicrophoneState>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [quickReplyOpen, setQuickReplyOpen] = useState(false);
  const [selectedAttachmentName, setSelectedAttachmentName] = useState<string | null>(null);
  const [attachmentMimeType, setAttachmentMimeType] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentProgress, setAttachmentProgress] = useState<number | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<WhatsappMessage | null>(null);

  // -------- Refs --------
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaUrlInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const attachmentAbortRef = useRef<AbortController | null>(null);
  const recentSendFingerprintsRef = useRef<Map<string, number>>(new Map());
  const lastSendErrorToastRef = useRef<{ key: string; at: number } | null>(null);

  // Rascunho persistido por chat (restaura ao abrir, salva debounced).
  useInboxChatDraft(chat?.id, bodyText, setBodyText);

  // Trocou de chat: sai do emoji picker, do modo nota, do reply, e cancela upload.
  useEffect(() => {
    setShowEmojiPicker(false);
    setNoteMode(false);
    setReplyingTo(null);
    attachmentAbortRef.current?.abort();
    attachmentAbortRef.current = null;
  }, [chat?.id]);

  // Cleanup quando o chat muda ou o componente desmonta: timer, recorder, stream.
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current != null) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      }
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = null;
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordingDurationSec(0);
    };
  }, [chat?.id]);

  // -------- Helpers internos --------
  function focusBodyComposer() {
    requestAnimationFrame(() => {
      bodyTextareaRef.current?.focus();
    });
  }

  function appendEmoji(emoji: string) {
    setBodyText((current) => `${current}${emoji}`);
    focusBodyComposer();
  }

  function detectMessageTypeFromFile(file: File): Exclude<MessageType, "system"> {
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) return "media";
    return "document";
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Nao foi possivel ler o arquivo selecionado."));
      };
      reader.onerror = () => {
        reject(reader.error ?? new Error("Falha ao ler o arquivo selecionado."));
      };
      reader.readAsDataURL(file);
    });
  }

  function resetComposerAttachmentState(options?: { keepBodyText?: boolean }) {
    if (!options?.keepBodyText) {
      setBodyText("");
    }
    setMessageType("text");
    setMediaUrl("");
    setPayloadText("{}");
    setSelectedAttachmentName(null);
    setAttachmentMimeType(null);
  }

  function clearRecordingTimer() {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function startRecordingTimer() {
    clearRecordingTimer();
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDurationSec((seconds) => seconds + 1);
    }, 1000);
  }

  // -------- Anexo (arquivo) --------
  /**
   * Faz upload de um arquivo e dispara o envio como mensagem independente.
   * Usado no fluxo multi-anexo (cada arquivo vira uma mensagem própria, sem caption).
   */
  async function uploadAndSendStandalone(rawFile: File): Promise<void> {
    if (!chat) return;
    let file = rawFile;
    try {
      const compression = await maybeCompressImage(rawFile);
      if (compression.compressed) file = compression.file;
    } catch {
      // Falha na compressão: usa o original.
    }
    if (file.size > WHATSAPP_MEDIA_MAX_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: `${file.name}: limite é ${WHATSAPP_MEDIA_MAX_BYTES / (1024 * 1024)} MB.`,
        variant: "destructive",
      });
      return;
    }
    let mediaValue: string;
    try {
      mediaValue = isSupabaseConfigured
        ? await uploadWhatsappMediaFile(file)
        : await readFileAsDataUrl(file);
    } catch (uploadError) {
      const msg =
        uploadError instanceof Error ? uploadError.message : "Falha no upload do arquivo.";
      toast({ title: `Falha ao enviar ${file.name}`, description: msg, variant: "destructive" });
      return;
    }
    const nextMessageType = detectMessageTypeFromFile(file);
    sendMessage.mutate({
      instanceId: chat.instanceId,
      chatId: chat.id,
      remoteJid: chat.remoteJid,
      messageType: nextMessageType,
      bodyText: "",
      mediaUrl: mediaValue,
      payload: { fileName: file.name, mimeType: file.type, size: file.size },
      simulateTypingMs: undefined,
      quotedMessageId: undefined,
    });
  }

  async function handleAttachmentSelection(event: ChangeEvent<HTMLInputElement>) {
    const allFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (allFiles.length === 0) return;

    // Multi-anexo: envia cada arquivo como mensagem própria, sem caption.
    if (allFiles.length > 1) {
      if (inboxLeadLocked || !canEditInbox) {
        toast({
          title: "Ação indisponível",
          description: "Assuma a conversa para enviar arquivos.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: `Enviando ${allFiles.length} arquivos`,
        description: "Cada arquivo será enviado como uma mensagem.",
      });
      for (const f of allFiles) {
        await uploadAndSendStandalone(f);
      }
      return;
    }

    const original = allFiles[0];

    // Compressão client-side de imagens grandes (sem perda visível).
    let file = original;
    try {
      const compression = await maybeCompressImage(original);
      if (compression.compressed) {
        file = compression.file;
      }
    } catch {
      // Falha na compressão: usa o original.
    }

    if (file.size > WHATSAPP_MEDIA_MAX_BYTES) {
      const descricaoLimite = `O limite e ${WHATSAPP_MEDIA_MAX_BYTES / (1024 * 1024)} MB.`;
      toast({ title: "Arquivo muito grande", description: descricaoLimite, variant: "destructive" });
      useAppStore
        .getState()
        .addNotification({ tipo: "aviso", titulo: "Arquivo muito grande", descricao: descricaoLimite });
      return;
    }

    const nextMessageType = detectMessageTypeFromFile(file);
    setAttachmentUploading(true);
    setAttachmentProgress(0);

    attachmentAbortRef.current?.abort();
    const abort = new AbortController();
    attachmentAbortRef.current = abort;

    try {
      let mediaValue: string;

      if (isSupabaseConfigured) {
        try {
          mediaValue = await uploadWhatsappMediaFile(file, {
            signal: abort.signal,
            onProgress: ({ ratio }) => setAttachmentProgress(ratio),
          });
        } catch (uploadError) {
          if (uploadError instanceof DOMException && uploadError.name === "AbortError") {
            return;
          }
          const msgUpload =
            uploadError instanceof Error
              ? uploadError.message
              : "Nao foi possivel enviar o arquivo ao Storage.";
          toast({ title: "Falha no upload", description: msgUpload, variant: "destructive" });
          useAppStore
            .getState()
            .addNotification({ tipo: "erro", titulo: "Falha no upload (inbox)", descricao: msgUpload });
          return;
        }
      } else {
        mediaValue = await readFileAsDataUrl(file);
      }

      setMessageType(nextMessageType);
      setMediaUrl(mediaValue);
      setSelectedAttachmentName(file.name);
      setAttachmentMimeType(file.type || null);
      setPayloadText(
        JSON.stringify({ fileName: file.name, mimeType: file.type, size: file.size }, null, 2),
      );

      const anexoDesc = isSupabaseConfigured
        ? `${file.name} enviado ao Storage e pronto para envio.`
        : `${file.name} foi preparado para envio (data URL local).`;
      toast({ title: "Arquivo anexado", description: anexoDesc });
      useAppStore
        .getState()
        .addNotification({ tipo: "sucesso", titulo: "Arquivo anexado", descricao: anexoDesc });

      focusBodyComposer();
    } catch (error) {
      const msgAnexo = error instanceof Error ? error.message : "Nao foi possivel preparar o arquivo.";
      toast({ title: "Falha ao anexar", description: msgAnexo, variant: "destructive" });
      useAppStore
        .getState()
        .addNotification({ tipo: "erro", titulo: "Falha ao anexar arquivo", descricao: msgAnexo });
    } finally {
      setAttachmentUploading(false);
      setAttachmentProgress(null);
      if (attachmentAbortRef.current === abort) {
        attachmentAbortRef.current = null;
      }
    }
  }

  // -------- Microfone / gravação --------
  async function stopRecordingAndFinalize() {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive") {
      clearRecordingTimer();
      setIsRecording(false);
      setRecordingDurationSec(0);
      return;
    }

    await new Promise<void>((resolve) => {
      rec.onstop = async () => {
        mediaRecorderRef.current = null;
        clearRecordingTimer();
        setIsRecording(false);
        setIsRecordingPaused(false);
        setRecordingDurationSec(0);

        microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
        microphoneStreamRef.current = null;

        const mime = rec.mimeType || pickAudioRecorderMime() || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mime });
        audioChunksRef.current = [];

        if (blob.size < 256) {
          toast({
            title: "Audio muito curto",
            description: "Grave por pelo menos um instante antes de parar.",
            variant: "destructive",
          });
          useAppStore.getState().addNotification({
            tipo: "aviso",
            titulo: "Audio muito curto",
            descricao: "Grave por pelo menos um instante antes de parar.",
          });
          resolve();
          return;
        }

        const ext = extensionForRecordedMime(mime);
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, {
          type: mime || "application/octet-stream",
        });

        setAttachmentUploading(true);
        setAttachmentProgress(0);
        attachmentAbortRef.current?.abort();
        const abort = new AbortController();
        attachmentAbortRef.current = abort;
        try {
          let mediaValue: string;
          if (isSupabaseConfigured) {
            mediaValue = await uploadWhatsappMediaFile(file, {
              signal: abort.signal,
              onProgress: ({ ratio }) => setAttachmentProgress(ratio),
            });
          } else {
            mediaValue = await readFileAsDataUrl(file);
          }
          setMessageType("audio");
          setMediaUrl(mediaValue);
          setSelectedAttachmentName(file.name);
          setAttachmentMimeType(file.type || null);
          setPayloadText(
            JSON.stringify(
              { fileName: file.name, mimeType: file.type, size: file.size, recorded: true },
              null,
              2,
            ),
          );
          focusBodyComposer();
        } catch (uploadError) {
          if (uploadError instanceof DOMException && uploadError.name === "AbortError") {
            resolve();
            return;
          }
          const msgGravacao =
            uploadError instanceof Error
              ? uploadError.message
              : "Nao foi possivel processar a gravacao.";
          toast({ title: "Falha ao enviar audio", description: msgGravacao, variant: "destructive" });
          useAppStore.getState().addNotification({
            tipo: "erro",
            titulo: "Falha ao enviar audio",
            descricao: msgGravacao,
          });
        } finally {
          setAttachmentUploading(false);
          setAttachmentProgress(null);
          if (attachmentAbortRef.current === abort) {
            attachmentAbortRef.current = null;
          }
        }
        resolve();
      };
      rec.stop();
    });
  }

  async function handleMicrophoneClick() {
    if (isRecording) {
      await stopRecordingAndFinalize();
      return;
    }

    if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.getUserMedia !== "function") {
      toast({
        title: "Microfone indisponivel",
        description: "Seu navegador nao oferece captura de audio nesta pagina.",
        variant: "destructive",
      });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Microfone indisponivel",
        descricao: "Seu navegador nao oferece captura de audio nesta pagina.",
      });
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      toast({
        title: "Gravacao nao suportada",
        description: "Use um navegador atualizado ou anexe um arquivo de audio.",
        variant: "destructive",
      });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Gravacao nao suportada",
        descricao: "Use um navegador atualizado ou anexe um arquivo de audio.",
      });
      return;
    }

    setMicrophoneState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
      microphoneStreamRef.current = stream;
      setMicrophoneState("granted");

      audioChunksRef.current = [];
      const mime = pickAudioRecorderMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.start(250);
      setMessageType("audio");
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingDurationSec(0);
      startRecordingTimer();
    } catch (error) {
      setMicrophoneState("denied");
      microphoneStreamRef.current = null;
      const permMsg = error instanceof Error ? error.message : "Nao foi possivel acessar o microfone.";
      toast({ title: "Permissao negada", description: permMsg, variant: "destructive" });
      useAppStore.getState().addNotification({
        tipo: "erro",
        titulo: "Permissao de microfone negada",
        descricao: permMsg,
      });
    }
  }

  function handleRecordingPauseToggle() {
    const rec = mediaRecorderRef.current;
    if (!isRecording || !rec || rec.state === "inactive") return;

    if (rec.state === "recording") {
      rec.pause();
      clearRecordingTimer();
      setIsRecordingPaused(true);
      return;
    }

    if (rec.state === "paused") {
      rec.resume();
      startRecordingTimer();
      setIsRecordingPaused(false);
    }
  }

  // -------- Retry / Discard --------
  const handleRetryMessage = useCallback(
    async (failed: WhatsappMessage) => {
      if (!chat) return;
      if (failed.direction !== "outbound" || failed.status !== "failed") return;
      if (sendMessage.isPending || retryingMessageId) return;

      setRetryingMessageId(failed.id);
      // Remove a bolha falha antes de reenviar; o envio cria nova bolha otimista.
      const queryKey = ["inbox-messages", failed.chatId] as const;
      queryClient.setQueryData<InfiniteData<InboxMessagesPageResult>>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== failed.id),
          })),
        };
      });
      try {
        await sendMessage.mutateAsync({
          instanceId: failed.instanceId,
          chatId: failed.chatId,
          remoteJid: chat.remoteJid,
          messageType: failed.messageType as Exclude<MessageType, "system">,
          bodyText: failed.bodyText ?? "",
          mediaUrl: failed.mediaUrl ?? undefined,
          payload: (failed.payloadJson ?? {}) as Record<string, unknown>,
          quotedMessageId: failed.quotedMessageId ?? undefined,
        });
      } catch (error) {
        console.error("Falha ao reenviar mensagem no inbox:", error);
      } finally {
        setRetryingMessageId(null);
      }
    },
    [chat, queryClient, retryingMessageId, sendMessage],
  );

  const handleDiscardMessage = useCallback(
    (failed: WhatsappMessage) => {
      if (!chat) return;
      if (failed.direction !== "outbound" || failed.status !== "failed") return;

      const queryKey = ["inbox-messages", failed.chatId] as const;
      queryClient.setQueryData<InfiniteData<InboxMessagesPageResult>>(queryKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          pages: current.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== failed.id),
          })),
        };
      });
    },
    [chat, queryClient],
  );

  // -------- Envio --------
  async function handleSendMessage() {
    if (!chat) return;

    if (inboxLeadLocked) {
      toast({
        title: hasLinkedNegotiation ? "Assuma o negócio" : "Assuma a conversa",
        description: hasLinkedNegotiation
          ? negotiationAssigneeBlockedMessage()
          : chatAssigneeBlockedMessage(),
        variant: "destructive",
      });
      return;
    }
    if (!canEditInbox) {
      toast({
        title: "Ação indisponível",
        description: "Seu papel nao tem permissao para enviar mensagens.",
        variant: "destructive",
      });
      return;
    }

    if (noteMode) {
      const body = bodyText.trim();
      if (!body) return;
      try {
        await createChatNote.mutateAsync({ chatId: chat.id, bodyText: body });
        setBodyText("");
        clearInboxChatDraft(chat.id);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Tente novamente.";
        toast({ title: "Falha ao salvar nota", description: msg, variant: "destructive" });
        useAppStore.getState().addNotification({
          tipo: "erro",
          titulo: "Falha ao salvar nota",
          descricao: msg,
        });
      }
      return;
    }

    const hasBody = Boolean(bodyText.trim());
    const hasMedia = Boolean(mediaUrl.trim());

    if (messageType === "text" && !hasBody) return;
    if (messageType !== "text" && !hasBody && !hasMedia) return;

    let payload: Record<string, unknown> = {};
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText);
      } catch {
        toast({
          title: "Payload invalido",
          description: "Revise o JSON complementar antes de enviar.",
          variant: "destructive",
        });
        useAppStore.getState().addNotification({
          tipo: "erro",
          titulo: "Payload invalido",
          descricao: "Revise o JSON complementar antes de enviar.",
        });
        return;
      }
    }

    const sendVars = {
      instanceId: chat.instanceId,
      chatId: chat.id,
      remoteJid: chat.remoteJid,
      messageType,
      bodyText,
      mediaUrl: mediaUrl || undefined,
      payload,
      simulateTypingMs: simulateTyping ? 600 : undefined,
      quotedMessageId: replyingTo?.id ?? undefined,
    };

    const sendFingerprint = JSON.stringify({
      chatId: sendVars.chatId,
      messageType: sendVars.messageType,
      bodyText: sendVars.bodyText.trim(),
      mediaUrl: sendVars.mediaUrl ?? "",
      payload,
    });
    const now = Date.now();
    for (const [key, timestamp] of recentSendFingerprintsRef.current) {
      if (now - timestamp > 5_000) {
        recentSendFingerprintsRef.current.delete(key);
      }
    }
    if (recentSendFingerprintsRef.current.has(sendFingerprint)) {
      return;
    }
    recentSendFingerprintsRef.current.set(sendFingerprint, now);

    resetComposerAttachmentState();
    setReplyingTo(null);
    clearInboxChatDraft(chat.id);

    // Envio em background; botão segue habilitado para várias mensagens em sequência.
    sendMessage.mutate(sendVars, {
      onError: (error) => {
        recentSendFingerprintsRef.current.delete(sendFingerprint);
        const envioErroMsg = error instanceof Error ? error.message : "Tente novamente.";
        const toastKey = `${sendVars.chatId}\0${envioErroMsg}`;
        const nowToast = Date.now();
        const lastToast = lastSendErrorToastRef.current;
        const shouldToast =
          !lastToast || lastToast.key !== toastKey || nowToast - lastToast.at > 10_000;
        if (shouldToast) {
          lastSendErrorToastRef.current = { key: toastKey, at: nowToast };
          toast({
            title: "Falha ao enviar",
            description: envioErroMsg,
            variant: "destructive",
          });
          useAppStore.getState().addNotification({
            tipo: "erro",
            titulo: "Falha ao enviar mensagem",
            descricao: envioErroMsg,
          });
        } else {
          console.error("Falha repetida ao enviar mensagem no inbox:", envioErroMsg);
        }
      },
    });
  }

  return {
    messageType,
    bodyText,
    mediaUrl,
    payloadText,
    simulateTyping,
    showEmojiPicker,
    noteMode,
    microphoneState,
    isRecording,
    isRecordingPaused,
    recordingDurationSec,
    quickReplyOpen,
    selectedAttachmentName,
    attachmentMimeType,
    attachmentUploading,
    attachmentProgress,
    retryingMessageId,
    replyingTo,
    sendMessage,
    createChatNote,
    bodyTextareaRef,
    mediaUrlInputRef,
    attachmentInputRef,
    setMessageType,
    setBodyText,
    setMediaUrl,
    setPayloadText,
    setSimulateTyping,
    setShowEmojiPicker,
    setNoteMode,
    setQuickReplyOpen,
    setReplyingTo,
    resetComposerAttachmentState,
    appendEmoji,
    handleSendMessage,
    handleRetryMessage,
    handleDiscardMessage,
    handleAttachmentSelection,
    handleMicrophoneClick,
    handleRecordingPauseToggle,
  };
}
