import { useEffect, useRef } from "react";

const STORAGE_PREFIX = "inbox.draft.v1.";
const FLUSH_DEBOUNCE_MS = 250;

function readDraft(chatId: string): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${chatId}`);
    return raw ?? "";
  } catch {
    return "";
  }
}

function writeDraft(chatId: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${chatId}`, value);
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${chatId}`);
    }
  } catch {
    // localStorage cheio / privado: descarta silenciosamente.
  }
}

/**
 * Persiste o rascunho do composer por chat em localStorage.
 *
 * - Ao trocar de chat (`chatId` muda), restaura via `setBodyText` o rascunho
 *   armazenado para o novo chat (ou vazio se nunca digitado).
 * - Salva mudancas em `bodyText` com debounce (250ms) para evitar gravacao
 *   por keystroke.
 * - Quando o composer fica vazio para um chat, remove a chave do storage.
 */
export function useInboxChatDraft(
  chatId: string | null | undefined,
  bodyText: string,
  setBodyText: (next: string) => void,
) {
  const lastChatRef = useRef<string | null | undefined>(undefined);
  const flushTimerRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(false);

  // Restaura rascunho ao trocar de chat.
  useEffect(() => {
    if (lastChatRef.current === chatId) return;
    lastChatRef.current = chatId;

    if (!chatId) {
      // Sem chat ativo: nao mexer no composer (Inbox limpa se quiser).
      return;
    }

    const stored = readDraft(chatId);
    // Se o composer ja tinha algo (ex.: usuario digitou e nao enviou ainda)
    // e o stored e vazio, preservamos o que esta na tela. Caso contrario,
    // overrida com o rascunho salvo.
    if (stored || bodyText === "") {
      // Marca para nao sobrescrever o storage com o restore (set causa render).
      skipNextSaveRef.current = true;
      setBodyText(stored);
    }
    // Cancela qualquer flush pendente do chat anterior (nao queremos saved
    // para o chatId errado).
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    // Intencional: bodyText/setBodyText nao precisam disparar restauracao.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Salva rascunho quando o usuario digita (debounced).
  useEffect(() => {
    if (!chatId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }
    const timer = window.setTimeout(() => {
      writeDraft(chatId, bodyText);
    }, FLUSH_DEBOUNCE_MS);
    flushTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
    };
  }, [chatId, bodyText]);
}

/**
 * Apaga o rascunho de um chat (chamar apos envio bem-sucedido).
 */
export function clearInboxChatDraft(chatId: string | null | undefined) {
  if (!chatId) return;
  writeDraft(chatId, "");
}
