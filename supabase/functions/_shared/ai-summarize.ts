// Summarização de mensagens antigas para chats longos. O orquestrador injeta
// o resumo no system prompt e mantém apenas as últimas N mensagens verbatim
// — preserva contexto sem inflar o prompt nem queimar tokens em chats com
// centenas de turnos. Roda no Haiku 4.5 (rápido e barato).
//
// Best-effort: se a chamada falhar, devolve string vazia e o orquestrador
// segue sem resumo (a IA perde contexto antigo mas o turno não quebra).

import { createChatCompletion, type OpenAiMessage } from "./openai.ts";

const SUMMARIZER_MODEL = "gpt-4o-mini";
const SUMMARIZER_MAX_TOKENS = 600;

const SYSTEM_PROMPT = `Você é um resumidor de conversas de atendimento via WhatsApp.
Dado o histórico (com possível resumo prévio + novas mensagens), produza um RESUMO ATUALIZADO
em português, em até 8 bullet points, cobrindo:

- O que o cliente quer (intenção, produto, dúvida principal).
- Dados que ele forneceu (nome, contexto, preferências, restrições).
- O que a IA/atendente já respondeu ou prometeu.
- Bloqueios ou pendências em aberto.
- Decisões/ações tomadas (etiquetas, etapas movidas, tarefas criadas).

Use frases curtas e factuais. NÃO invente nada que não esteja no histórico. Se houver
resumo prévio, integre — não duplique. Devolva APENAS os bullets, sem cabeçalho.`;

export type SummarizeInput = {
  /** Mensagens em ordem cronológica (mais antigas primeiro). */
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  /** Resumo anterior, se houver. Permite atualização incremental. */
  previousSummary?: string | null;
};

export async function summarizeOldMessages(input: SummarizeInput): Promise<string> {
  const cleaned = input.messages.filter((m) => m.text.trim().length > 0);
  if (cleaned.length === 0) return input.previousSummary ?? "";

  const prevBlock = input.previousSummary?.trim()
    ? `RESUMO PRÉVIO:\n${input.previousSummary.trim()}\n\nNOVAS MENSAGENS A INCORPORAR:\n`
    : "MENSAGENS:\n";
  const history = cleaned
    .map((m) => `${m.role === "user" ? "Cliente" : "IA"}: ${m.text}`)
    .join("\n");
  const userText = `${prevBlock}${history}\n\nProduza o RESUMO ATUALIZADO em bullets.`;

  const messages: OpenAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText }
  ];

  try {
    const res = await createChatCompletion({
      model: SUMMARIZER_MODEL,
      maxTokens: SUMMARIZER_MAX_TOKENS,
      messages,
      tools: [],
    });
    const text = (res.choices?.[0]?.message?.content ?? "").trim();
    return text;
  } catch (err) {
    console.error("summarizeOldMessages:", err);
    return input.previousSummary ?? "";
  }
}
