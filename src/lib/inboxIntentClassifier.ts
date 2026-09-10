import type { PlaygroundMessage } from "@/lib/api/ai-agent";
import { buildCopilotPromptFromThread } from "@/lib/inboxAiCopilot";
import type { ChatTag, WhatsappMessage } from "@/types/domain";

/** Quantos turnos contextuais incluir no prompt da classificação. */
const CLASSIFIER_HISTORY_LIMIT = 12;

/**
 * Sentinela que a IA deve usar quando nenhuma etiqueta do catálogo descreve
 * bem a conversa. Mantém o output fechado (evita texto livre extra).
 */
const NO_TAG_SENTINEL = "—";

/**
 * Monta o payload pra `ai-playground` pedindo classificação da conversa.
 * Não cria nova edge — encaixa instruções dentro de uma mensagem `user`
 * porque o playground não aceita system prompt customizado por chamada.
 */
export function buildIntentClassifierPrompt(
  messages: WhatsappMessage[],
  catalog: ReadonlyArray<Pick<ChatTag, "name">>,
): PlaygroundMessage[] {
  const allowed = catalog
    .map((t) => t.name.trim())
    .filter((n) => n.length > 0);

  // Reusa o builder do copiloto para ter a mesma higiene (sem system/failed,
  // só corpo de texto) e limita a um histórico mais curto.
  const history = buildCopilotPromptFromThread(messages, CLASSIFIER_HISTORY_LIMIT);
  const renderedHistory = history.length
    ? history
        .map(
          (m) => `[${m.role === "user" ? "cliente" : "atendente"}] ${m.text.replace(/\n+/g, " ").trim()}`,
        )
        .join("\n")
    : "(conversa ainda sem mensagens de texto)";

  const allowedList = allowed.length
    ? allowed.map((n) => `- ${n}`).join("\n")
    : "(catálogo vazio — responda apenas com o marcador)";

  const userBody = [
    "Tarefa: classifique a intenção/situação do CLIENTE na conversa abaixo.",
    "Responda APENAS com os nomes de etiquetas (separados por vírgula), escolhendo SOMENTE da lista permitida.",
    `Se nenhuma servir, responda exatamente "${NO_TAG_SENTINEL}". Sem explicações, sem ponto final, sem aspas.`,
    "",
    "Lista permitida:",
    allowedList,
    "",
    "Histórico (últimos turnos):",
    renderedHistory,
  ].join("\n");

  return [{ role: "user", text: userBody }];
}

export type IntentClassifierResult = {
  /** Tags do catálogo casadas pela resposta da IA. */
  matched: ChatTag[];
  /** Texto cru retornado (debug). */
  rawText: string;
};

/**
 * Mapeia o texto cru de resposta pra tags do catálogo (case-insensitive).
 * Tolerante a:
 *  - separadores: vírgula, ponto-e-vírgula, quebra de linha
 *  - aspas/pontuação periférica ("preço.", '"cancelamento"', etc.)
 *  - prefixos comuns ("etiquetas:", "tags:", "- ")
 *  - sentinela "—"
 *  - sufixo do tipo " (motivo: ...)" — corta no primeiro parêntese
 */
export function parseIntentClassifierReply(
  reply: string,
  catalog: ReadonlyArray<ChatTag>,
): IntentClassifierResult {
  const trimmed = reply?.trim() ?? "";
  if (!trimmed || trimmed === NO_TAG_SENTINEL) {
    return { matched: [], rawText: trimmed };
  }

  // Remove prefixos comuns que a IA pode adicionar mesmo instruída a não.
  const withoutPrefix = trimmed
    .replace(/^\s*(etiquetas?|tags?)\s*:\s*/i, "")
    .replace(/\.$/, "")
    .trim();

  const byNameLower = new Map<string, ChatTag>();
  for (const tag of catalog) {
    byNameLower.set(tag.name.trim().toLowerCase(), tag);
  }

  const matched = new Map<string, ChatTag>();
  const tokens = withoutPrefix.split(/[,;\n]+/);
  for (const raw of tokens) {
    const candidate = raw
      .replace(/^[\s\-•*]+/, "")
      .replace(/\s*\(.*$/, "") // corta "(motivo: ...)"
      .replace(/[".'`]/g, "")
      .trim()
      .toLowerCase();
    if (!candidate || candidate === NO_TAG_SENTINEL) continue;
    const tag = byNameLower.get(candidate);
    if (tag) matched.set(tag.id, tag);
  }

  return { matched: Array.from(matched.values()), rawText: trimmed };
}
