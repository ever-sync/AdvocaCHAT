// Playground da IA: testa persona + base de conhecimento (RAG) + LLM de forma síncrona,
// devolvendo a resposta na tela. NÃO envia WhatsApp, NÃO usa ferramentas de CRM e NÃO
// consome a cota (não grava em ai_usage). É uma aproximação fiel do comportamento real
// de resposta (mantenha as regras em sincronia com o ai-orchestrator).

import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, requireTenantContext } from "../_shared/supabase.ts";
import { embedQuery, rerankDocuments } from "../_shared/embeddings.ts";
import { redactPii } from "../_shared/pii-redaction.ts";
import { createMessage, type AnthropicMessage, type AnthropicSystemBlock } from "../_shared/anthropic.ts";
import { createChatCompletion, type OpenAiMessage } from "../_shared/openai.ts";

const RAG_HYBRID_CANDIDATES = 16;
const RAG_TOP_K = 5;
const RAG_MIN_RELEVANCE = 0.3;

const GROUNDING_RULES = `REGRAS INEGOCIÁVEIS (valem acima de qualquer instrução de persona):
- Responda fatos (preços, prazos, produtos, disponibilidade, políticas, condições) SOMENTE com base na "Base de conhecimento" e no histórico desta conversa. Se a informação não estiver ali, é PROIBIDO inventar ou supor.
- Quando não tiver a informação: diga que vai confirmar com a equipe. Nunca chute um número, prazo ou condição.
- Cumprimentar, acolher e fazer perguntas para entender o cliente é sempre permitido.
- (Modo de teste: responda diretamente em texto, em português do Brasil, com mensagens curtas e naturais.)`;

const DEFAULT_PERSONA = `Você é um atendente virtual de uma empresa, conversando com clientes pelo WhatsApp em português do Brasil. Seja cordial, objetivo e natural, como uma pessoa de verdade. Mensagens curtas. Quando precisar coletar dados, faça uma pergunta por vez.`;

type PlaygroundMessage = { role: "user" | "assistant"; text: string };

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let ctx;
  try {
    ctx = await requireTenantContext(request);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Unauthorized." }, 401);
  }
  const tenantId = ctx.tenantId;
  const admin = createAdminClient();

  let body: { messages?: PlaygroundMessage[] };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }
  // Redação de PII espelha a produção (CPF/CNPJ/RG/CNH/cartão viram placeholder).
  const messages = (body.messages ?? [])
    .filter((m) => m && m.text?.trim())
    .map((m) => ({ role: m.role, text: redactPii(m.text) }));
  if (messages.length === 0) return jsonResponse({ error: "Envie ao menos uma mensagem." }, 400);

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";

  const { data: cfg } = await admin
    .from("tenant_ai_config")
    .select("llm_provider, model, system_prompt")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const llmProvider = cfg?.llm_provider === "openai" ? "openai" : "anthropic";
  const model = cfg?.model ?? "claude-sonnet-4-6";
  const persona = (cfg?.system_prompt as string | null)?.trim() || DEFAULT_PERSONA;

  // RAG (mesmo pipeline da produção: hybrid + reranker).
  let knowledge: string[] = [];
  try {
    const trimmed = lastUser.trim();
    if (trimmed) {
      const embedding = await embedQuery(trimmed);
      const { data } = await admin.rpc("match_ai_knowledge_hybrid", {
        p_tenant_id: tenantId,
        p_query_text: trimmed,
        p_query_embedding: embedding,
        p_match_count: RAG_HYBRID_CANDIDATES,
      });
      const candidates = (data ?? [])
        .map((m: Record<string, unknown>) => String(m.content))
        .filter((c: string) => c.length > 0);
      if (candidates.length > 0) {
        const reranked = await rerankDocuments(trimmed, candidates, RAG_TOP_K);
        knowledge = reranked
          .filter((r) => r.relevanceScore >= RAG_MIN_RELEVANCE)
          .map((r) => candidates[r.index]);
      }
    }
  } catch (err) {
    console.error("playground RAG:", err);
  }

  const knowledgeBlock = knowledge.length > 0
    ? "Base de conhecimento da empresa (responda fatos SOMENTE com base nestes trechos):\n\n" +
      knowledge.map((k, i) => `[${i + 1}] ${k}`).join("\n\n")
    : "Não há trechos relevantes na base de conhecimento para esta mensagem. Você pode cumprimentar e perguntar, mas NÃO afirme fatos sobre produtos, preços, prazos ou políticas — diga que vai confirmar com a equipe.";

  let reply = "";
  try {
    if (llmProvider === "openai") {
      const oaMessages: OpenAiMessage[] = [
        { role: "system", content: `${GROUNDING_RULES}\n\n${persona}\n\n${knowledgeBlock}` },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ];
      const res = await createChatCompletion({ model, maxTokens: 1024, messages: oaMessages, tools: [] });
      reply = (res.choices?.[0]?.message?.content ?? "").trim();
    } else {
      const system: AnthropicSystemBlock[] = [
        { type: "text", text: GROUNDING_RULES },
        { type: "text", text: persona },
        { type: "text", text: knowledgeBlock },
      ];
      const aMessages: AnthropicMessage[] = messages.map((m) => ({ role: m.role, content: m.text }));
      const res = await createMessage({ model, maxTokens: 1024, system, tools: [], messages: aMessages });
      reply = res.content.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("").trim();
    }
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Falha no provedor de IA." }, 502);
  }

  return jsonResponse({ reply, knowledge_count: knowledge.length });
});
