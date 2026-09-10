// AI orchestrator — Fases 2, 3 e 5 (F2 + F3 + F5)
// Drena a fila `ai_jobs` (agendada por pg_cron via x-cron-secret) e, para cada chat
// elegível, roda o loop de tool-use do Claude com o catálogo de tools (_shared/ai-tools.ts):
// responder, mover etapa, taguear, gravar campo personalizado, criar tarefa, handoff.
// Injeta no contexto a base de conhecimento (RAG/pgvector, com corte de relevância) e as
// etapas do funil. Grounding inegociável (anti-alucinação) + log de cada turno em ai_turns (F5).
// Lock por chat (worker_job_locks) evita processamento concorrente do mesmo chat.

import {
  type AnthropicContentBlock,
  type AnthropicMessage,
  type AnthropicSystemBlock,
  type AnthropicTool,
  createMessage,
} from "../_shared/anthropic.ts";
import { normalizeChatAiMode } from "../_shared/ai-business-rules.ts";
import { executeTool, isChatStillEligible, type ToolContext, toolsForMode } from "../_shared/ai-tools.ts";
import { embedQuery, rerankDocuments } from "../_shared/embeddings.ts";
import { redactPii } from "../_shared/pii-redaction.ts";
import { assessGrounding, type CritiqueResult } from "../_shared/ai-critique.ts";
import { emitAiWebhook } from "../_shared/ai-webhooks.ts";
import { summarizeOldMessages } from "../_shared/ai-summarize.ts";
import { createChatCompletion, type OpenAiMessage, type OpenAiTool } from "../_shared/openai.ts";
import { transcribeAudio } from "../_shared/transcribe.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, isInternalRequest } from "../_shared/supabase.ts";
import { acquireWorkerLock, releaseWorkerLock } from "../_shared/workerLock.ts";

type Admin = ReturnType<typeof createAdminClient>;

const DRAIN_BATCH = 10;
const MAX_TOOL_ITERATIONS = 5;
const HISTORY_LIMIT = 20;
// Summarization: gera resumo quando o chat passa de SUMMARY_TRIGGER msgs;
// reaproveita o resumo existente até acumular SUMMARY_REFRESH_AFTER msgs
// novas (evita queimar Haiku a cada turno em chat que cresce devagar).
const SUMMARY_TRIGGER = 30;
const SUMMARY_REFRESH_AFTER = 10;
const CHAT_LOCK_TTL_SECONDS = 120;
const STALE_PROCESSING_MS = 5 * 60 * 1000; // recupera jobs 'processing' órfãos (worker caiu)
// Hybrid retrieval: busca larga (vector + BM25 + RRF) → reranker → corte final.
const RAG_HYBRID_CANDIDATES = 16; // candidatos para o reranker (mais sinal = melhor ranking)
const RAG_TOP_K = 5; // trechos finais injetados no prompt
const RAG_MIN_RELEVANCE = 0.3; // score do reranker (0-1), corte anti-ruído
const MAX_JOB_ATTEMPTS = 3; // tentativas por turno antes de marcar 'error' (retry com backoff)
const MAX_TURNS_PER_HOUR = 30; // teto anti-spam de respostas da IA por chat por hora

// Circuit breaker: ≥ BREAKER_THRESHOLD turnos não-delivered nos últimos
// BREAKER_WINDOW → desliga a IA do chat (vira handoff) para não queimar
// tokens nem irritar o cliente. Reabertura é manual (botão Retomar IA).
const BREAKER_WINDOW = 5;
const BREAKER_THRESHOLD = 3;
const BAD_OUTCOMES = new Set(["blocked_critique", "no_reply", "tool_error"]);

// Regras inegociáveis de grounding — sempre aplicadas, ACIMA da persona do tenant.
const GROUNDING_RULES = `REGRAS INEGOCIÁVEIS (valem acima de qualquer instrução de persona):
- Para falar com o cliente você DEVE usar a ferramenta send_whatsapp_message — texto fora dela NÃO chega. SEMPRE responda ao cliente por essa ferramenta em todo turno (mesmo que também use outras ferramentas).
- Responda fatos (preços, prazos, produtos, disponibilidade, políticas, condições) SOMENTE com base na "Base de conhecimento" e no histórico desta conversa. Se a informação não estiver ali, é PROIBIDO inventar ou supor.
- Quando não tiver a informação: diga que vai confirmar com a equipe e use a ferramenta handoff. Nunca chute um número, prazo ou condição.
- Não confirme pedidos, valores ou acordos que não estejam explícitos na base.
- Cumprimentar, acolher e fazer perguntas para entender o cliente é sempre permitido.
- Faça handoff se o cliente pedir um humano, demonstrar irritação/urgência, ou se o assunto fugir do seu escopo.`;

const DEFAULT_PERSONA = `Você é um atendente virtual de uma empresa, conversando com clientes pelo WhatsApp em português do Brasil.
- Seja cordial, objetivo e natural, como uma pessoa de verdade. Mensagens curtas.
- Para responder ao cliente, você DEVE chamar a ferramenta send_whatsapp_message. Texto fora dela não chega ao cliente.
- Use as demais ferramentas para registrar o que aprender (etiquetas, campos do contato) e para avançar a negociação.
- Quando precisar coletar dados, faça uma pergunta por vez.`;

type TenantAiConfig = {
  llmProvider: "anthropic" | "openai";
  model: string;
  systemPrompt: string | null;
  maxOutputTokens: number;
  monthlyTokenLimit: number | null;
  disclosureEnabled: boolean;
  disclosureMessage: string | null;
  enableModelRouting: boolean;
  enableThinking: boolean;
};

// Adaptive thinking: gasta ~2-5s extras + tokens de saída, mas melhora muito
// turnos complexos (comparações, multi-step, perguntas sobre vários trechos).
const THINKING_BUDGET = 1024;
const THINKING_LONG_USER_CHARS = 200;
const THINKING_MIN_KNOWLEDGE = 3;
const THINKING_KEYWORDS = [
  "compare", "comparar", "diferença", "diferenca",
  "por que", "porque",
  "como funciona", "como faço", "como faco",
  "qual a melhor", "qual o melhor",
  "explica", "explique", "explicar",
  "vantagens", "desvantagens",
];

/** Haiku não suporta extended thinking — sempre desativado pra ele. */
function modelSupportsThinking(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("haiku")) return false;
  return m.includes("sonnet") || m.includes("opus");
}

/** Decide o budget de thinking pra este turno. 0 = desligado. */
function pickThinkingBudget(
  config: TenantAiConfig,
  model: string,
  signals: { lastUserChars: number; lastUserText: string; knowledgeCount: number },
): number {
  if (!config.enableThinking) return 0;
  if (!modelSupportsThinking(model)) return 0;
  const userLower = signals.lastUserText.toLowerCase();
  const hasReasoningKeyword = THINKING_KEYWORDS.some((kw) => userLower.includes(kw));
  const needs =
    signals.knowledgeCount >= THINKING_MIN_KNOWLEDGE ||
    signals.lastUserChars >= THINKING_LONG_USER_CHARS ||
    hasReasoningKeyword;
  return needs ? THINKING_BUDGET : 0;
}

// Modelo "barato" pra turnos triviais — Haiku 4.5 vs Sonnet 4.6 são ~5× mais
// baratos em input e ~6× em output, mantendo qualidade alta para ack/cumprimento.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SHORT_TURN_CHARS = 40;

/**
 * Decide entre modelo barato (Haiku) e o configurado (default Sonnet) por turno.
 * Roteia pro Haiku quando o sinal é fraco (greeting, ack curto, "ok", "obrigado")
 * E não há contexto de RAG nem imagem. Caso contrário, fica no modelo configurado.
 *
 * Cache: cada modelo mantém o próprio cache no provedor — alternar invalida
 * a entrada do outro, mas para chats com muitos turnos curtos o ganho de custo
 * supera a perda de cache (Haiku é tão barato que perder cache nele é peanuts).
 */
function pickEffectiveModel(
  config: TenantAiConfig,
  signals: { lastUserChars: number; hasImage: boolean; knowledgeCount: number },
): string {
  if (!config.enableModelRouting) return config.model;
  // Só desce pro Haiku se for explicitamente trivial. Default conservador: Sonnet.
  const isTrivial =
    signals.lastUserChars > 0 &&
    signals.lastUserChars <= SHORT_TURN_CHARS &&
    !signals.hasImage &&
    signals.knowledgeCount === 0;
  return isTrivial ? HAIKU_MODEL : config.model;
}

// Aviso de transparência (LGPD): enviado uma vez por chat na primeira atuação da IA.
const DEFAULT_DISCLOSURE =
  "Olá! Você está sendo atendido por um assistente virtual com inteligência artificial. " +
  "Se preferir falar com uma pessoa, é só pedir. 🙂";

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  if (!isInternalRequest(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const { data: jobs, error } = await admin
    .from("ai_jobs")
    .select("*")
    .lte("run_after", nowIso)
    .or(`status.eq.pending,and(status.eq.processing,updated_at.lt.${staleIso})`)
    .order("run_after", { ascending: true })
    .limit(DRAIN_BATCH);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  let processed = 0;
  let skipped = 0;
  for (const job of jobs ?? []) {
    const lockKey = `ai_chat:${job.chat_id}`;
    let locked = false;
    try {
      locked = await acquireWorkerLock(admin, lockKey, CHAT_LOCK_TTL_SECONDS);
      if (!locked) {
        skipped++;
        continue;
      }
      await admin
        .from("ai_jobs")
        .update({ status: "processing", attempts: (job.attempts ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", job.id);

      await processJob(admin, job);

      // Marca done só se nada re-agendou o job (run_after intacto). Se uma nova mensagem
      // chegou durante o processamento, o job voltou a 'pending' e será reprocessado.
      await admin
        .from("ai_jobs")
        .update({ status: "done", last_error: null, updated_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("run_after", job.run_after);
      processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attemptsSoFar = (job.attempts ?? 0) + 1; // já incrementado no claim
      if (attemptsSoFar < MAX_JOB_ATTEMPTS) {
        // Re-tenta com backoff (resolve erros transitórios do LLM: 429/529/5xx/rede).
        const backoffMs = Math.min(attemptsSoFar * 30, 300) * 1000;
        await admin
          .from("ai_jobs")
          .update({
            status: "pending",
            run_after: new Date(Date.now() + backoffMs).toISOString(),
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("run_after", job.run_after);
        console.warn(`ai-orchestrator retry ${attemptsSoFar}/${MAX_JOB_ATTEMPTS}:`, job.id, message);
      } else {
        await admin
          .from("ai_jobs")
          .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
          .eq("id", job.id)
          .eq("run_after", job.run_after);
        console.error("ai-orchestrator job failed (sem mais retries):", job.id, message);
      }
    } finally {
      if (locked) await releaseWorkerLock(admin, lockKey);
    }
  }

  return jsonResponse({ ok: true, processed, skipped, picked: (jobs ?? []).length });
});

async function processJob(admin: Admin, job: Record<string, unknown>) {
  const chatId = String(job.chat_id);
  const tenantId = String(job.tenant_id);

  const { data: chat } = await admin
    .from("whatsapp_chats")
    .select("*, customers(opt_out)")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat) return;

  if (!(await isChatStillEligible(admin, chatId))) return;

  // Circuit breaker: 3+ falhas seguidas → handoff humano antes de gastar mais
  // tokens. Janela curta (últimos 5 turnos) detecta padrões agudos sem afetar
  // chats que historicamente funcionam.
  if (await tripCircuitBreakerIfNeeded(admin, tenantId, chatId)) return;

  // O canal pode ter sido desligado durante o debounce; também pega a persona do canal.
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("ai_enabled, ai_persona")
    .eq("id", chat.instance_id)
    .maybeSingle();
  if (!inst?.ai_enabled) return;
  const channelPersona = (inst.ai_persona as string | null) ?? null;

  // Teto anti-spam por chat (evita loop/abuso queimando tokens).
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentTurns } = await admin
    .from("ai_turns")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId)
    .gte("created_at", oneHourAgo);
  if ((recentTurns ?? 0) >= MAX_TURNS_PER_HOUR) {
    console.warn("ai-orchestrator: teto de turnos/hora atingido", chatId);
    return;
  }

  const config = await getTenantAiConfig(admin, tenantId);
  if (!(await aiBudgetAllows(admin, tenantId, config.monthlyTokenLimit))) {
    console.warn("ai-orchestrator: add-on inativo ou cota mensal esgotada", tenantId);
    return;
  }

  // Se uma execução anterior enviou a resposta mas morreu/estourou timeout antes
  // de marcar o job como done, não gere outra resposta para o mesmo inbound.
  // Ignora o aviso LGPD, porque ele pode ser a única mensagem já enviada antes
  // de uma queda e o cliente ainda precisa receber a resposta do turno.
  const disclosureTexts = [DEFAULT_DISCLOSURE, config.disclosureMessage ?? ""].filter(Boolean);
  if (await hasAiReplyAfterLatestInbound(admin, chatId, disclosureTexts)) return;

  const aiMode = normalizeChatAiMode(chat.ai_mode as string | null | undefined);
  let tools = toolsForMode(aiMode);
  if (tools.length === 0) return; // off/handoff — sem ferramentas

  const negotiationId = (chat.primary_negotiation_id as string | null) ?? null;
  const customerId = (chat.customer_id as string | null) ?? null;

  const negotiation = negotiationId ? await loadNegotiation(admin, negotiationId) : null;
  const stages = negotiation?.funnelId ? await loadFunnelStages(admin, tenantId, negotiation.funnelId) : [];
  const fieldNames = await loadCustomFieldNames(admin, tenantId);
  // Sem campos personalizados definidos, não ofereça set_custom_field (evita erro/ruído).
  if (fieldNames.length === 0) {
    tools = tools.filter((t) => t.name !== "set_custom_field");
  }
  // Memória de longo prazo: fatos persistentes que a IA aprendeu sobre o cliente.
  // Sem customer vinculado a tool fica fora também (não tem onde gravar).
  const customerFacts = customerId ? await loadCustomerFacts(admin, customerId) : [];
  if (!customerId) {
    tools = tools.filter((t) => t.name !== "remember_customer_fact");
  }

  const { data: rows } = await admin
    .from("whatsapp_messages")
    .select("id, direction, body_text, created_at, actor_type, message_type, media_url, payload_json")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  // Áudio → transcrição (STT); outras mídias → placeholder, para a IA não ignorar.
  await resolveMediaContent(admin, rows ?? []);
  const conversation = buildConversation((rows ?? []).reverse());
  if (conversation.length === 0) return;

  // Conversation summary: em chats longos (>SUMMARY_TRIGGER msgs) gera/atualiza
  // resumo das mensagens ANTES da janela atual e injeta no system. Mantém
  // contexto sem inflar o prompt; reaproveita cache do chat.
  const conversationSummary = await maybeRefreshSummary(admin, chatId, chat);

  // RAG: busca os trechos relevantes (acima do corte de similaridade) da base do tenant.
  const startedAt = Date.now();
  const userMessage = lastUserText(conversation);
  const retrieved = await retrieveKnowledge(admin, tenantId, userMessage);

  const system = buildSystem(config, {
    chat,
    personaOverride: channelPersona,
    stageId: negotiation?.stageId ?? null,
    stages,
    fieldNames,
    customerFacts,
    knowledge: retrieved.map((r) => r.content),
    conversationSummary,
  });
  const ctx: ToolContext = { admin, tenantId, chat, negotiationId, customerId, aiMode };

  // Transparência (LGPD): na primeira atuação da IA neste chat, avisa que é um assistente.
  if (config.disclosureEnabled && !chat.ai_disclosure_sent) {
    const text = (config.disclosureMessage ?? "").trim() || DEFAULT_DISCLOSURE;
    await executeTool(ctx, "send_whatsapp_message", { text });
    await admin.from("whatsapp_chats").update({ ai_disclosure_sent: true }).eq("id", chatId);
  }

  // Model routing: turno trivial vai pro Haiku, complexo fica no modelo configurado.
  // Só roteia o Anthropic — o OpenAI mantém comportamento atual.
  const hasImage = conversation.some((m) => Boolean(m.imageUrl));
  const effectiveModel = config.llmProvider === "anthropic"
    ? pickEffectiveModel(config, {
      lastUserChars: userMessage.length,
      hasImage,
      knowledgeCount: retrieved.length,
    })
    : config.model;
  const effectiveConfig = { ...config, model: effectiveModel };

  const knowledgeChunks = retrieved.map((r) => r.content);
  // Adaptive thinking: liga extended thinking só em turnos complexos (RAG com
  // vários trechos, mensagem longa, palavras-chave de raciocínio). Haiku
  // ignora — não suporta.
  const thinkingBudget = pickThinkingBudget(effectiveConfig, effectiveModel, {
    lastUserChars: userMessage.length,
    lastUserText: userMessage,
    knowledgeCount: retrieved.length,
  });
  // Roda o loop de tool-use no provedor de LLM configurado (Anthropic ou OpenAI).
  const result = effectiveConfig.llmProvider === "openai"
    ? await runOpenAiLoop(ctx, effectiveConfig, system, conversation, tools)
    : await runAnthropicLoop(ctx, effectiveConfig, system, conversation, tools, knowledgeChunks, thinkingBudget);

  await admin.from("ai_usage").insert({
    tenant_id: tenantId,
    chat_id: chatId,
    model: effectiveModel,
    input_tokens: result.usage.input,
    output_tokens: result.usage.output,
    cache_read_tokens: result.usage.cacheRead,
    cache_creation_tokens: result.usage.cacheCreation,
  });

  // Observabilidade (F5): registra o turno completo para auditar/depurar alucinação.
  await admin.from("ai_turns").insert({
    tenant_id: tenantId,
    chat_id: chatId,
    model: effectiveModel,
    user_message: userMessage || null,
    retrieved,
    reply: result.replies.join("\n\n") || null,
    tools: result.toolLog,
    stop_reason: result.stopReason,
    iterations: result.iterations,
    input_tokens: result.usage.input,
    output_tokens: result.usage.output,
    cache_read_tokens: result.usage.cacheRead,
    cache_creation_tokens: result.usage.cacheCreation,
    latency_ms: Date.now() - startedAt,
    critique_flags: result.critiqueFlags,
    outcome: classifyOutcome(result),
    thinking_budget: thinkingBudget || null,
  });

  // Webhook out: turno concluído (delivered/blocked/etc.). Integrações usam
  // pra analytics, sync de CRM externo, alerta interno, etc.
  await emitAiWebhook(admin, tenantId, "ai.turn_completed", {
    chat_id: chatId,
    customer_id: customerId,
    model: effectiveModel,
    outcome: classifyOutcome(result),
    reply: result.replies.join("\n\n") || null,
    tools_called: (result.toolLog ?? []).map((t) => t.name).filter(Boolean),
    retrieved_count: retrieved.length,
    critique_flags_count: result.critiqueFlags.length,
    critique_blocked_count: result.critiqueFlags.filter((f) => f.blocked).length,
    input_tokens: result.usage.input,
    output_tokens: result.usage.output,
    iterations: result.iterations,
    latency_ms: Date.now() - startedAt,
  });
}

function classifyOutcome(result: LoopResult): string {
  if (result.replies.length > 0) return "delivered";
  // Sem envio: bloqueio do crítico tem prioridade na classificação para auditar
  // (foi escolha consciente de não deixar passar uma alucinação).
  if (result.critiqueFlags.some((f) => f.blocked)) return "blocked_critique";
  const allTools = result.toolLog ?? [];
  if (allTools.length > 0 && allTools.every((t) => Boolean(t.is_error))) return "tool_error";
  return "no_reply";
}

async function hasAiReplyAfterLatestInbound(admin: Admin, chatId: string, ignoredTexts: string[] = []): Promise<boolean> {
  const { data: latestInbound } = await admin
    .from("whatsapp_messages")
    .select("created_at")
    .eq("chat_id", chatId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inboundCreatedAt = latestInbound?.created_at as string | undefined;
  if (!inboundCreatedAt) return false;

  const ignored = new Set(ignoredTexts.map(normalizeComparableText).filter(Boolean));
  const { data } = await admin
    .from("whatsapp_messages")
    .select("body_text")
    .eq("chat_id", chatId)
    .eq("direction", "outbound")
    .eq("actor_type", "ai")
    .gte("created_at", inboundCreatedAt)
    .order("created_at", { ascending: false })
    .limit(8);

  return (data ?? []).some((row: Record<string, unknown>) => {
    const text = normalizeComparableText(String(row.body_text ?? ""));
    return Boolean(text && !ignored.has(text));
  });
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function tripCircuitBreakerIfNeeded(admin: Admin, tenantId: string, chatId: string): Promise<boolean> {
  const { data: recent } = await admin
    .from("ai_turns")
    .select("outcome")
    .eq("chat_id", chatId)
    .not("outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(BREAKER_WINDOW);

  const outcomes = (recent ?? []).map((r) => String(r.outcome ?? ""));
  // Só dispara depois de ter visto a janela inteira — chats novos têm direito
  // a aquecer antes de a IA ser desligada por insuficiência de evidência.
  if (outcomes.length < BREAKER_WINDOW) return false;
  const badCount = outcomes.filter((o) => BAD_OUTCOMES.has(o)).length;
  if (badCount < BREAKER_THRESHOLD) return false;

  // Trip: vira o chat pra handoff e deixa uma linha auditável na timeline.
  await admin.from("whatsapp_chats").update({ ai_mode: "handoff" }).eq("id", chatId);
  await admin.from("ai_turns").insert({
    tenant_id: tenantId,
    chat_id: chatId,
    model: "circuit-breaker",
    user_message: null,
    reply: `Circuit breaker: ${badCount} de ${BREAKER_WINDOW} turnos recentes falharam (${
      outcomes.join(", ")
    }). IA desligada nesta conversa — atendimento humano deve continuar.`,
    retrieved: [],
    tools: [],
    stop_reason: "circuit_tripped",
    iterations: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    latency_ms: 0,
    critique_flags: [],
    outcome: "circuit_tripped",
  });
  console.warn(`ai-orchestrator: circuit breaker tripped on chat ${chatId} (${badCount}/${BREAKER_WINDOW} bad)`);
  await emitAiWebhook(admin, tenantId, "ai.circuit_tripped", {
    chat_id: chatId,
    bad_outcomes: badCount,
    window: BREAKER_WINDOW,
    recent_outcomes: outcomes,
  });
  return true;
}

type LoopUsage = { input: number; output: number; cacheRead: number; cacheCreation: number };
type CritiqueFlag = {
  blocked: boolean;
  text: string;
  issues: string[];
  error?: string;
};
type LoopResult = {
  usage: LoopUsage;
  toolLog: Array<Record<string, unknown>>;
  replies: string[];
  stopReason: string | null;
  iterations: number;
  critiqueFlags: CritiqueFlag[];
};

// Self-critique só roda quando há contexto de RAG e a resposta é não-trivial
// (textos curtos como "ok" ou perguntas vazias não têm afirmação factual).
const CRITIQUE_MIN_CHARS = 50;

function toCritiqueFlag(text: string, verdict: CritiqueResult): CritiqueFlag {
  return {
    blocked: false,
    text,
    issues: verdict.issues,
    ...(verdict.error ? { error: verdict.error } : {}),
  };
}

function recordTool(
  result: LoopResult,
  name: string,
  input: Record<string, unknown> | undefined,
  outcome: { content: string; isError: boolean },
) {
  result.toolLog.push({ name, input: input ?? {}, result: outcome.content, is_error: outcome.isError });
  if (name === "send_whatsapp_message" && !outcome.isError) {
    const text = String((input?.text as string | undefined) ?? "").trim();
    if (text) result.replies.push(text);
  }
}

/** Loop de tool-use na Messages API da Anthropic (com cache_control no system/tools). */
async function runAnthropicLoop(
  ctx: ToolContext,
  config: TenantAiConfig,
  system: AnthropicSystemBlock[],
  conversation: ConvMessage[],
  tools: AnthropicTool[],
  /** Trechos da base usados no system; vazio = sem critique (nada pra ancorar). */
  knowledgeChunks: string[] = [],
  /** Budget de extended thinking; 0 = desligado (default). */
  thinkingBudget = 0,
): Promise<LoopResult> {
  const result: LoopResult = {
    usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    toolLog: [],
    replies: [],
    stopReason: null,
    iterations: 0,
    critiqueFlags: [],
  };
  let messages: AnthropicMessage[] = conversation.map(toAnthropicMessage);
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    result.iterations = i + 1;
    // Prompt caching: marca o último bloco da última mensagem. A cada iteração
    // o array cresce (assistant + tool_results); a Anthropic reaproveita o cache
    // do prefixo até o breakpoint da iteração anterior e só cobra como "novo" o
    // que entrou depois. Em loops de 3-5 iterações o ganho é grande.
    const response = await createMessage({
      model: config.model,
      maxTokens: config.maxOutputTokens,
      system,
      tools,
      messages: withMessagesCacheBreakpoint(messages),
      thinking: thinkingBudget > 0
        ? { type: "enabled", budget_tokens: thinkingBudget }
        : { type: "disabled" },
    });
    result.usage.input += response.usage.input_tokens ?? 0;
    result.usage.output += response.usage.output_tokens ?? 0;
    result.usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    result.usage.cacheCreation += response.usage.cache_creation_input_tokens ?? 0;
    result.stopReason = response.stop_reason;

    if (response.stop_reason !== "tool_use") {
      finalText = response.content.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("").trim();
      break;
    }

    const toolResults: AnthropicContentBlock[] = [];
    let aborted = false;
    for (const block of response.content.filter((b) => b.type === "tool_use")) {
      const name = String(block.name);
      const input = block.input;

      // Self-critique antes de enviar: se o turno usou RAG, valida que a
      // resposta proposta não inventa preço/prazo/política fora dos chunks.
      // Se reprovar, devolve erro pro LLM ao invés de executar — ele tenta
      // de novo na próxima iteração (mais conservador ou via handoff).
      if (name === "send_whatsapp_message" && knowledgeChunks.length > 0) {
        const text = String((input?.text as string | undefined) ?? "").trim();
        if (text.length >= CRITIQUE_MIN_CHARS) {
          const verdict = await assessGrounding(text, knowledgeChunks);
          if (!verdict.grounded && verdict.issues.length > 0) {
            const blockedMsg =
              `Sua resposta foi bloqueada pela auditoria — contém afirmação(ões) não sustentada(s) pela base: ` +
              `${verdict.issues.join("; ")}. ` +
              `Reformule sem esses pontos ou use a ferramenta handoff para a equipe humana confirmar.`;
            result.critiqueFlags.push({ blocked: true, text, issues: verdict.issues });
            result.toolLog.push({ name, input: input ?? {}, result: blockedMsg, is_error: true, critique_blocked: true });
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: blockedMsg, is_error: true });
            await emitAiWebhook(ctx.admin, ctx.tenantId, "ai.critique_blocked", {
              chat_id: String(ctx.chat.id),
              customer_id: ctx.customerId,
              blocked_text: text,
              issues: verdict.issues,
            });
            continue;
          }
          // Loga aprovados também (auditoria + análise de falso negativo).
          result.critiqueFlags.push(toCritiqueFlag(text, verdict));
        }
      }

      const outcome = await executeTool(ctx, name, input);
      recordTool(result, name, input, outcome);
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: outcome.content, is_error: outcome.isError });
      if (outcome.aborted) aborted = true;
    }

    messages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
    if (aborted) break;
  }

  await deliverFallback(ctx, result, finalText);
  return result;
}

/** Se o modelo respondeu em texto sem chamar send_whatsapp_message, entrega o texto. */
async function deliverFallback(ctx: ToolContext, result: LoopResult, finalText: string) {
  if (result.replies.length === 0 && finalText) {
    const outcome = await executeTool(ctx, "send_whatsapp_message", { text: finalText });
    recordTool(result, "send_whatsapp_message", { text: finalText }, outcome);
  }
}

/** Loop de tool-use na Chat Completions API da OpenAI (system vira texto único). */
async function runOpenAiLoop(
  ctx: ToolContext,
  config: TenantAiConfig,
  system: AnthropicSystemBlock[],
  conversation: ConvMessage[],
  tools: AnthropicTool[],
): Promise<LoopResult> {
  const result: LoopResult = {
    usage: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    toolLog: [],
    replies: [],
    stopReason: null,
    iterations: 0,
    critiqueFlags: [],
  };

  const systemText = system.map((b) => b.text).join("\n\n");
  const oaTools: OpenAiTool[] = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemText },
    ...conversation.map(toOpenAiMessage),
  ];

  let finalText = "";
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    result.iterations = i + 1;
    const response = await createChatCompletion({
      model: config.model,
      maxTokens: config.maxOutputTokens,
      messages,
      tools: oaTools,
    });
    const cached = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    result.usage.input += Math.max(0, (response.usage?.prompt_tokens ?? 0) - cached);
    result.usage.cacheRead += cached;
    result.usage.output += response.usage?.completion_tokens ?? 0;

    const choice = response.choices?.[0];
    const message = choice?.message;
    result.stopReason = choice?.finish_reason ?? null;
    if (!message) break;

    const toolCalls = message.tool_calls ?? [];
    // Reanexa a mensagem do assistant (com tool_calls) ao histórico.
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls.length ? toolCalls : undefined });

    if (choice?.finish_reason !== "tool_calls" || toolCalls.length === 0) {
      finalText = (message.content ?? "").trim();
      break;
    }

    let aborted = false;
    for (const call of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        input = {};
      }
      const outcome = await executeTool(ctx, call.function.name, input);
      recordTool(result, call.function.name, input, outcome);
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
      if (outcome.aborted) aborted = true;
    }
    if (aborted) break;
  }

  await deliverFallback(ctx, result, finalText);
  return result;
}

type NegotiationCtx = { stageId: string | null; funnelId: string | null };
type FunnelStage = { id: string; title: string };

const DEFAULT_FUNNEL_STAGES: FunnelStage[] = [
  { id: "lead", title: "LEAD QUALIFICADA" },
  { id: "contato", title: "CONTATO FEITO" },
  { id: "andamento", title: "EM ANDAMENTO" },
  { id: "contrato", title: "ENVIO CONTRATO" },
  { id: "venda", title: "VENDA" },
];

async function loadNegotiation(admin: Admin, negotiationId: string): Promise<NegotiationCtx> {
  const { data } = await admin
    .from("crm_negotiations")
    .select("stage_id, funnel_id")
    .eq("id", negotiationId)
    .maybeSingle();
  return {
    stageId: (data?.stage_id as string | null) ?? null,
    funnelId: (data?.funnel_id as string | null) ?? null,
  };
}

/** Etapas do funil do tenant (config custom) com fallback para os padrões. */
async function loadFunnelStages(admin: Admin, tenantId: string, funnelId: string): Promise<FunnelStage[]> {
  const { data } = await admin
    .from("tenant_crm_funnel_config")
    .select("funnels")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const funnels = Array.isArray(data?.funnels) ? (data!.funnels as Array<Record<string, unknown>>) : null;
  if (funnels) {
    const funnel = funnels.find((f) => String(f?.id) === funnelId);
    const stages = Array.isArray(funnel?.stages) ? (funnel!.stages as Array<Record<string, unknown>>) : null;
    if (stages && stages.length > 0) {
      return stages.map((s) => ({ id: String(s.id), title: String(s.title ?? s.id) }));
    }
  }
  return DEFAULT_FUNNEL_STAGES;
}

function lastUserText(conversation: ConvMessage[]): string {
  for (let i = conversation.length - 1; i >= 0; i--) {
    if (conversation[i].role === "user" && conversation[i].text) return conversation[i].text;
  }
  return "";
}

type KnowledgeMatch = { content: string; similarity: number };

/**
 * Hybrid retrieval: vector (HNSW) + BM25 (tsvector PT-BR) fundidos por RRF no
 * Postgres, depois reranker (Voyage rerank-2-lite) reordena os candidatos por
 * relevância real à query. Score final = relevance_score do reranker (0-1).
 * Sai vector-only para cair em hybrid+rerank: mais resiliente a paráfrase E a
 * termos exatos (SKU, modelo, código), com menos lixo no contexto.
 */
async function retrieveKnowledge(admin: Admin, tenantId: string, query: string): Promise<KnowledgeMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
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
    if (candidates.length === 0) return [];

    // Rerank: o ranking semântico do reranker é muito superior ao do cosine
    // ou ts_rank; aplicado nos top-N do hybrid, o ganho de precisão é grande.
    const reranked = await rerankDocuments(trimmed, candidates, RAG_TOP_K);
    return reranked
      .filter((r) => r.relevanceScore >= RAG_MIN_RELEVANCE)
      .map((r) => ({ content: candidates[r.index], similarity: r.relevanceScore }));
  } catch (err) {
    // RAG é best-effort: se a busca falhar (ex.: VOYAGE_API_KEY ausente,
    // reranker down), responde sem ela em vez de quebrar o turno.
    console.error("retrieveKnowledge:", err);
    return [];
  }
}

// Limite defensivo: muitos fatos viram ruído no contexto e empurram o que
// importa pra fora. 30 cobre 99% dos casos reais; admin pode podar mais
// no painel se algum cliente passar disso.
const MAX_CUSTOMER_FACTS = 30;

/**
 * Em chats longos, gera/atualiza um resumo das mensagens antes da janela atual.
 * - Só roda se o chat tem >= SUMMARY_TRIGGER mensagens totais.
 * - Reaproveita resumo cached se não acumulou SUMMARY_REFRESH_AFTER msgs novas.
 * - Persiste em whatsapp_chats (cache por chat).
 * Best-effort: falha devolve string vazia (sem resumo no system).
 */
async function maybeRefreshSummary(
  admin: Admin,
  chatId: string,
  chat: Record<string, unknown>,
): Promise<string> {
  const cached = (chat.ai_conversation_summary as string | null | undefined) ?? "";
  const cachedUpTo = (chat.ai_summary_up_to_msg_id as string | null | undefined) ?? null;

  const { count: total } = await admin
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("chat_id", chatId);
  if ((total ?? 0) < SUMMARY_TRIGGER) return "";

  // Mensagens ANTES da janela visível ao Claude (as últimas HISTORY_LIMIT já
  // vão verbatim no array). cachedUpTo = última msg incluída no resumo anterior.
  // Quantas mensagens "novas pra resumir" existem entre o resumo cached e o
  // início da janela atual.
  let cachedUpToTime: string | null = null;
  if (cachedUpTo) {
    const { data } = await admin
      .from("whatsapp_messages")
      .select("created_at")
      .eq("id", cachedUpTo)
      .maybeSingle();
    cachedUpToTime = (data?.created_at as string | undefined) ?? null;
  }

  // Cut-off: pega tudo MAIS ANTIGO que as últimas HISTORY_LIMIT msgs (essas vão
  // verbatim, não entram no resumo).
  const { data: windowEdge } = await admin
    .from("whatsapp_messages")
    .select("created_at, id")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .range(HISTORY_LIMIT - 1, HISTORY_LIMIT - 1)
    .maybeSingle();
  const cutoffCreatedAt = (windowEdge?.created_at as string | undefined) ?? null;
  if (!cutoffCreatedAt) return cached; // não há "antigas" o suficiente, mantém cached

  let query = admin
    .from("whatsapp_messages")
    .select("id, direction, body_text, created_at")
    .eq("chat_id", chatId)
    .lt("created_at", cutoffCreatedAt)
    .order("created_at", { ascending: true });
  if (cachedUpToTime) query = query.gt("created_at", cachedUpToTime);
  const { data: pending } = await query;

  const fresh = (pending ?? []).filter((r) => String(r.body_text ?? "").trim().length > 0);
  // Se já temos resumo e ainda não acumulou bastante coisa nova, reaproveita.
  if (cached && fresh.length < SUMMARY_REFRESH_AFTER) return cached;
  if (fresh.length === 0) return cached;

  const summary = await summarizeOldMessages({
    previousSummary: cached || null,
    messages: fresh.map((r) => ({
      role: r.direction === "inbound" ? "user" : "assistant",
      text: redactPii(String(r.body_text ?? "").trim()),
    })),
  });
  if (!summary.trim()) return cached;

  const lastMsg = fresh[fresh.length - 1];
  await admin
    .from("whatsapp_chats")
    .update({
      ai_conversation_summary: summary,
      ai_summary_up_to_msg_id: lastMsg.id,
      ai_summary_updated_at: new Date().toISOString(),
    })
    .eq("id", chatId);
  return summary;
}

async function loadCustomerFacts(admin: Admin, customerId: string): Promise<string[]> {
  const { data } = await admin
    .from("customer_ai_facts")
    .select("fact")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(MAX_CUSTOMER_FACTS);
  return (data ?? []).map((r: Record<string, unknown>) => String(r.fact)).filter(Boolean);
}

async function loadCustomFieldNames(admin: Admin, tenantId: string): Promise<string[]> {
  const { data } = await admin
    .from("customer_custom_fields")
    .select("nome")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((f: Record<string, unknown>) => String(f.nome)).filter(Boolean);
}

async function getTenantAiConfig(admin: Admin, tenantId: string): Promise<TenantAiConfig> {
  const { data } = await admin
    .from("tenant_ai_config")
    .select("llm_provider, model, system_prompt, max_output_tokens, monthly_token_limit, ai_disclosure_enabled, ai_disclosure_message, enable_model_routing, enable_thinking")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    llmProvider: data?.llm_provider === "openai" ? "openai" : "anthropic",
    model: data?.model ?? "claude-sonnet-4-6",
    systemPrompt: data?.system_prompt ?? null,
    maxOutputTokens: data?.max_output_tokens ?? 1024,
    monthlyTokenLimit: data?.monthly_token_limit ?? null,
    disclosureEnabled: data?.ai_disclosure_enabled ?? true,
    disclosureMessage: data?.ai_disclosure_message ?? null,
    enableModelRouting: data?.enable_model_routing ?? true,
    enableThinking: data?.enable_thinking ?? true,
  };
}

async function monthlyTokensUsed(admin: Admin, tenantId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data } = await admin
    .from("ai_usage")
    .select("input_tokens, output_tokens")
    .eq("tenant_id", tenantId)
    .gte("created_at", monthStart.toISOString());
  return (data ?? []).reduce(
    (sum: number, r: Record<string, number>) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    0,
  );
}

/**
 * Decide se a IA pode rodar considerando o add-on (plataforma) e o auto-teto (tenant):
 * - há subscription e está inativa → bloqueia (add-on não pago);
 * - cota do plano (sem overage) e/ou auto-teto do tenant formam o limite efetivo;
 * - DENY-BY-DEFAULT: sem assinatura ativa do add-on, a IA NÃO roda (produto pago).
 */
async function aiBudgetAllows(admin: Admin, tenantId: string, selfLimit: number | null): Promise<boolean> {
  const { data: billing } = await admin
    .from("billing_subscriptions")
    .select("status, trial_ends_at, current_period_end")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const now = Date.now();
  const systemAccessActive = billing?.status === "trialing"
    ? Boolean(billing.trial_ends_at) && new Date(String(billing.trial_ends_at)).getTime() > now
    : billing?.status === "active"
      && Boolean(billing.current_period_end)
      && new Date(String(billing.current_period_end)).getTime() > now;
  if (!systemAccessActive) {
    return false;
  }

  const { data: sub } = await admin
    .from("tenant_ai_subscription")
    .select("active, monthly_token_quota, overage_allowed, trial_ends_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Deny-by-default: sem add-on provisionado/ativo → sem IA (integridade comercial).
  if (!sub || !sub.active) return false;
  if (sub.trial_ends_at && new Date(sub.trial_ends_at as string) < new Date()) return false; // trial expirado

  let hardLimit: number | null = null;
  if (!sub.overage_allowed && sub.monthly_token_quota > 0) hardLimit = sub.monthly_token_quota;

  if (selfLimit && selfLimit > 0) {
    hardLimit = hardLimit == null ? selfLimit : Math.min(hardLimit, selfLimit);
  }
  if (hardLimit == null) return true; // add-on ativo, sem teto efetivo

  return (await monthlyTokensUsed(admin, tenantId)) < hardLimit;
}

/**
 * Resolve o conteúdo de mensagens de mídia sem texto (muta `body_text` in-place):
 * áudio → transcrição (cacheada em payload_json.transcription); imagem/doc/vídeo →
 * placeholder, para a IA reconhecer em vez de ignorar. Best-effort (não quebra o turno).
 */
async function resolveMediaContent(admin: Admin, rows: Array<Record<string, unknown>>) {
  for (const row of rows) {
    if (String(row.body_text ?? "").trim()) continue;
    const type = String(row.message_type ?? "");
    const mediaUrl = (row.media_url as string | null) ?? null;
    if (!mediaUrl) continue;
    const payload = (row.payload_json as Record<string, unknown> | null) ?? {};

    if (type === "audio") {
      const cached = typeof payload.transcription === "string" ? payload.transcription : "";
      if (cached.trim()) {
        const transcript = cached.replace(/^\[(?:áudio|audio)[^\]]*\]\s*/i, "").trim();
        row.body_text = transcript || cached.trim();
        if (transcript) {
          await admin
            .from("whatsapp_chats")
            .update({
              last_message_preview: transcript,
              last_message_at: row.created_at ?? new Date().toISOString(),
            })
            .eq("id", row.chat_id);
        }
        continue;
      }
      try {
        const text = await transcribeAudio(mediaUrl);
        if (text) {
          const transcript = text.trim();
          row.body_text = transcript;
          await admin
            .from("whatsapp_messages")
            .update({ body_text: transcript, payload_json: { ...payload, transcription: transcript } })
            .eq("id", row.id);
          await admin
            .from("whatsapp_chats")
            .update({
              last_message_preview: transcript,
              last_message_at: row.created_at ?? new Date().toISOString(),
            })
            .eq("id", row.chat_id);
        }
      } catch (err) {
        console.error("resolveMediaContent(audio):", err);
      }
      continue;
    }

    // Imagem: NÃO vira placeholder — buildConversation anexa a própria imagem (visão).
    if (type === "document") row.body_text = "[o cliente enviou um documento/arquivo]";
    else if (type === "video") row.body_text = "[o cliente enviou um vídeo]";
  }
}

// Mensagem neutra: texto + imagem opcional (cada loop formata pro seu provedor).
type ConvMessage = { role: "user" | "assistant"; text: string; imageUrl?: string };

/**
 * Histórico (cronológico) → mensagens neutras. Garante que comece em 'user'.
 * Aplica redação de PII (CPF/CNPJ/RG/CNH/cartão) ANTES de mandar pro LLM —
 * o DB mantém o dado original para a operação humana. Telefone e e-mail
 * ficam intactos porque a IA usa em set_custom_field/create_task.
 */
function buildConversation(rows: Array<Record<string, unknown>>): ConvMessage[] {
  const messages: ConvMessage[] = [];
  for (const row of rows) {
    const role = row.direction === "inbound" ? "user" : "assistant";
    const rawText = String(row.body_text ?? "").trim();
    const text = rawText ? redactPii(rawText) : "";
    const isImage = String(row.message_type ?? "") === "image" && row.media_url;
    if (isImage) {
      messages.push({ role, text: text || "[imagem enviada pelo cliente]", imageUrl: String(row.media_url) });
    } else if (text) {
      messages.push({ role, text });
    }
  }
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }
  return messages;
}

/**
 * Adiciona cache_control no último bloco da última mensagem para criar um
 * breakpoint de cache no histórico. Combinado com os breakpoints de tools e
 * persona, a Anthropic reaproveita o prefixo entre iterações do tool-use loop
 * (a cada iteração só os novos tool_results contam como input "novo"). Limite:
 * 4 breakpoints por request — usamos 3 (tools + persona + última mensagem).
 */
function withMessagesCacheBreakpoint(messages: AnthropicMessage[]): AnthropicMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const ttl1h = { type: "ephemeral", ttl: "1h" } as const;
  let blocks: AnthropicContentBlock[];
  if (typeof last.content === "string") {
    blocks = [{ type: "text", text: last.content, cache_control: ttl1h }];
  } else {
    blocks = last.content.map((block, idx) =>
      idx === last.content.length - 1 ? { ...block, cache_control: ttl1h } : block,
    );
  }
  return [...messages.slice(0, -1), { ...last, content: blocks }];
}

/** ConvMessage → mensagem da Anthropic (imagem vira bloco image/source url). */
function toAnthropicMessage(m: ConvMessage): AnthropicMessage {
  if (m.imageUrl) {
    return {
      role: m.role,
      content: [
        { type: "image", source: { type: "url", url: m.imageUrl } },
        { type: "text", text: m.text },
      ],
    };
  }
  return { role: m.role, content: m.text };
}

/** ConvMessage → mensagem da OpenAI (imagem vira image_url). */
function toOpenAiMessage(m: ConvMessage): OpenAiMessage {
  if (m.imageUrl) {
    return {
      role: m.role,
      content: [
        { type: "text", text: m.text },
        { type: "image_url", image_url: { url: m.imageUrl } },
      ],
    };
  }
  return { role: m.role, content: m.text };
}

function buildSystem(
  config: TenantAiConfig,
  opts: {
    chat: Record<string, unknown>;
    personaOverride?: string | null;
    stageId: string | null;
    stages: FunnelStage[];
    fieldNames: string[];
    customerFacts: string[];
    knowledge: string[];
    /** Resumo de mensagens antigas (gerado por Haiku) — vazio quando o chat é curto. */
    conversationSummary: string;
  },
): AnthropicSystemBlock[] {
  // Persona do canal (se houver) > persona do tenant > padrão do sistema.
  const persona = opts.personaOverride?.trim() || config.systemPrompt?.trim() || DEFAULT_PERSONA;
  // Grounding (regras fixas) + persona = prefixo estável (cache_control na persona);
  // contexto e base de conhecimento vêm depois (voláteis, fora do cache).
  const blocks: AnthropicSystemBlock[] = [
    { type: "text", text: GROUNDING_RULES },
    { type: "text", text: persona, cache_control: { type: "ephemeral", ttl: "1h" } },
  ];

  const context: string[] = [];
  const name = String(opts.chat.display_name ?? "").trim();
  if (name) context.push(`Nome do contato: ${name}.`);
  if (opts.stageId) context.push(`Etapa atual no funil: ${opts.stageId}.`);
  if (opts.stages.length > 0) {
    context.push(
      `Etapas do funil disponíveis (use o id com move_stage): ${
        opts.stages.map((s) => `${s.id} (${s.title})`).join(", ")
      }.`,
    );
  }
  if (opts.fieldNames.length > 0) {
    context.push(`Campos personalizados que você pode preencher com set_custom_field: ${opts.fieldNames.join(", ")}.`);
  }
  if (context.length > 0) {
    blocks.push({ type: "text", text: `Contexto desta conversa: ${context.join(" ")}` });
  }

  // Resumo das mensagens anteriores em chats longos. Vem antes da memória do
  // cliente e do RAG porque é o histórico imediato (mensagens fora da janela
  // de 20 mais recentes que já estão no array de messages).
  if (opts.conversationSummary && opts.conversationSummary.trim().length > 0) {
    blocks.push({
      type: "text",
      text:
        "Resumo das mensagens anteriores desta conversa (o que ficou fora da janela recente):\n\n" +
        opts.conversationSummary.trim() +
        "\n\nAs últimas mensagens completas vêm a seguir no histórico.",
    });
  }

  // Memória de longo prazo: fatos persistentes do cliente. Bloco separado e
  // claramente marcado para personalizar sem confundir com a base de conhecimento.
  if (opts.customerFacts.length > 0) {
    blocks.push({
      type: "text",
      text:
        "Memória sobre este cliente (use para personalizar — não cite literalmente, apenas se adapte):\n" +
        opts.customerFacts.map((f) => `- ${f}`).join("\n") +
        "\n\nSe aprender algo NOVO e durável (preferência, contexto, restrição) que vá valer em conversas futuras, " +
        "use a ferramenta remember_customer_fact. Não duplique fatos já listados acima.",
    });
  } else {
    blocks.push({
      type: "text",
      text:
        "Ainda não há memória de longo prazo sobre este cliente. " +
        "Se aprender algo durável (ex.: 'prefere áudio a texto'), use a ferramenta remember_customer_fact para salvar.",
    });
  }

  if (opts.knowledge.length > 0) {
    blocks.push({
      type: "text",
      text:
        "Base de conhecimento da empresa (responda fatos SOMENTE com base nestes trechos):\n\n" +
        opts.knowledge.map((k, i) => `[${i + 1}] ${k}`).join("\n\n"),
    });
  } else {
    blocks.push({
      type: "text",
      text:
        "Não há trechos relevantes na base de conhecimento para esta mensagem. " +
        "Você pode cumprimentar e fazer perguntas, mas NÃO afirme fatos sobre produtos, preços, prazos ou políticas — " +
        "se o cliente perguntar algo assim, diga que vai confirmar com a equipe ou faça handoff.",
    });
  }
  return blocks;
}
