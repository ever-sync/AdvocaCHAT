// Self-critique / hallucination guard: avalia se a resposta proposta pela IA
// tem afirmações factuais (preço, prazo, política, produto, condição) não
// sustentadas pelos trechos da base de conhecimento. Usa Haiku 4.5 (rápido e
// barato — vale como guarda obrigatória antes de cada send_whatsapp_message
// quando há RAG hit). Best-effort: se a chamada falhar, libera o envio
// (não quebra o turno).

import { createChatCompletion, type OpenAiMessage } from "./openai.ts";

const CRITIQUE_MODEL = "gpt-4o-mini";
const CRITIQUE_MAX_TOKENS = 256;

export type CritiqueResult = {
  grounded: boolean;
  issues: string[];
  /** Se a chamada falhou (timeout, erro, parse), retorna grounded=true para
   * não bloquear injustamente o envio — log fica em `error`. */
  error?: string;
};

const SYSTEM_PROMPT = `Você é um auditor crítico de respostas de atendimento.
Sua tarefa: dado um CONTEXTO (trechos da base de conhecimento da empresa) e uma RESPOSTA proposta pela IA, identifique CADA afirmação factual da resposta que NÃO esteja sustentada pelo contexto.

Afirmações factuais incluem: preços, prazos, produtos, políticas, condições, garantias, prazos de entrega, formas de pagamento, especificações técnicas.

Não conte como problema:
- Cumprimentos, perguntas, acolhimentos.
- Resumir/parafrasear o que está no contexto.
- Dizer que vai confirmar com a equipe ou fazer handoff.
- Pedidos de informação.

Responda APENAS um JSON válido no formato:
{"grounded": true} se a resposta está OK (sem afirmações factuais não sustentadas).
{"grounded": false, "issues": ["descrição curta da afirmação 1", "..."]} se houver problema.

NÃO inclua texto fora do JSON.`;

/**
 * Auditoria de uma resposta proposta. Falhas (rede, parse) devolvem grounded=true
 * para não bloquear envio por engano — o log do erro fica em `error`.
 */
export async function assessGrounding(
  response: string,
  chunks: string[],
): Promise<CritiqueResult> {
  const text = response.trim();
  if (!text) return { grounded: true, issues: [] };
  if (chunks.length === 0) return { grounded: true, issues: [] };

  const contextBlock = chunks.map((c, i) => `[${i + 1}] ${c}`).join("\n\n");
  const userText =
    `CONTEXTO:\n\n${contextBlock}\n\nRESPOSTA PROPOSTA:\n\n${text}\n\n` +
    `Avalie a RESPOSTA contra o CONTEXTO. Responda apenas o JSON.`;

  const messages: OpenAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText }
  ];

  try {
    const res = await createChatCompletion({
      model: CRITIQUE_MODEL,
      maxTokens: CRITIQUE_MAX_TOKENS,
      messages,
      tools: [],
    });
    const raw = (res.choices?.[0]?.message?.content ?? "").trim();
    return parseCritique(raw);
  } catch (err) {
    return {
      grounded: true,
      issues: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseCritique(raw: string): CritiqueResult {
  if (!raw) return { grounded: true, issues: [], error: "empty response" };
  // Modelos às vezes embrulham JSON em ```; extrai o primeiro {...} balanceado.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { grounded: true, issues: [], error: `no JSON in response: ${raw.slice(0, 100)}` };
  }
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { grounded?: boolean; issues?: unknown };
    if (parsed.grounded === false) {
      const issues = Array.isArray(parsed.issues)
        ? parsed.issues.map((i) => String(i)).filter((i) => i.length > 0)
        : [];
      return { grounded: false, issues };
    }
    return { grounded: true, issues: [] };
  } catch (err) {
    return {
      grounded: true,
      issues: [],
      error: `JSON parse: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
