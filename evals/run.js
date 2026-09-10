#!/usr/bin/env node
// Eval CI da IA do CaleoCRM (casos dourados + LLM-as-judge).
//
// Roda cada caso em evals/cases.json:
// 1) monta system prompt igual ao orchestrator (GROUNDING_RULES + persona + RAG)
// 2) chama Claude (sob o modelo da var EVAL_MODEL, default Sonnet 4.6)
// 3) Claude-as-judge (Sonnet 4.6) avalia a resposta contra a rubrica do caso
// 4) imprime relatório e sai 1 se o pass-rate cair abaixo de EVAL_MIN_PASS_RATE
//
// Uso:
//   ANTHROPIC_API_KEY=sk-... node evals/run.js
//
// Variáveis opcionais:
//   EVAL_MODEL=claude-haiku-4-5-20251001  → roda com Haiku (mais barato)
//   EVAL_MIN_PASS_RATE=0.9                → muda o threshold (default 0.85)
//   EVAL_VERBOSE=1                        → mostra resposta + reasoning do juiz

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY ausente. Exporte antes de rodar.");
  process.exit(2);
}

const EVAL_MODEL = process.env.EVAL_MODEL || "claude-sonnet-4-6";
const JUDGE_MODEL = "claude-sonnet-4-6";
const MIN_PASS_RATE = Number(process.env.EVAL_MIN_PASS_RATE ?? "0.85");
const VERBOSE = process.env.EVAL_VERBOSE === "1";

// Mantenha em sincronia com supabase/functions/ai-orchestrator/index.ts
// (qualquer mudança nas regras de grounding ou persona padrão exige re-rodar
// os evals para confirmar que continuam passando).
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

// Tools mínimas: o que o orchestrator expõe no modo "full". A eval simula com
// uma única tool obrigatória (send_whatsapp_message) + handoff — o resto não
// muda o que estamos medindo (qualidade textual + obediência às regras).
const TOOLS = [
  {
    name: "send_whatsapp_message",
    description: "Envia uma mensagem de texto para o cliente pelo WhatsApp.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto a enviar ao cliente." },
      },
      required: ["text"],
    },
  },
  {
    name: "handoff",
    description: "Transfere a conversa para um atendente humano. Use quando o cliente pedir, demonstrar irritação ou quando a pergunta fugir do escopo.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo curto da transferência." },
      },
      required: ["reason"],
    },
  },
];

function buildSystem(knowledge) {
  const blocks = [
    { type: "text", text: GROUNDING_RULES },
    { type: "text", text: DEFAULT_PERSONA },
  ];
  if (knowledge.length > 0) {
    blocks.push({
      type: "text",
      text:
        "Base de conhecimento da empresa (responda fatos SOMENTE com base nestes trechos):\n\n" +
        knowledge.map((k, i) => `[${i + 1}] ${k}`).join("\n\n"),
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

async function callAnthropic({ model, system, messages, tools, maxTokens = 512 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      tools: tools ?? [],
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  return res.json();
}

// Extrai o que efetivamente foi enviado pro cliente. O orchestrator obriga
// send_whatsapp_message, então buscamos esse tool_use; fallback para texto solto.
function extractSentText(response) {
  for (const b of response.content ?? []) {
    if (b.type === "tool_use" && b.name === "send_whatsapp_message") {
      const t = b.input?.text;
      if (typeof t === "string" && t.trim()) return t.trim();
    }
  }
  const text = (response.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  return text || null;
}

function extractToolNames(response) {
  return (response.content ?? [])
    .filter((b) => b.type === "tool_use")
    .map((b) => b.name)
    .filter(Boolean);
}

async function judgeResponse({ caseRow, sentText, tools }) {
  const judgeSystem = [{
    type: "text",
    text:
      `Você é um avaliador rigoroso de respostas de atendimento por IA. Recebe uma RESPOSTA e uma lista de CRITÉRIOS. ` +
      `Para cada critério, decida pass=true (atende) ou pass=false (viola). Considere também a lista TOOLS chamadas. ` +
      `Devolva APENAS um JSON: {"results":[{"criterion": "...", "pass": true, "reason": "..."}], "overall_pass": bool}. ` +
      `overall_pass é true só se TODOS os critérios passarem.`,
  }];
  const userText =
    `RESPOSTA enviada ao cliente:\n"""${sentText ?? "(nada enviado)"}"""\n\n` +
    `TOOLS chamadas: ${JSON.stringify(tools)}\n\n` +
    `CRITÉRIOS:\n${caseRow.rubric.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n` +
    `Avalie e responda apenas o JSON.`;
  const judgement = await callAnthropic({
    model: JUDGE_MODEL,
    system: judgeSystem,
    messages: [{ role: "user", content: userText }],
    maxTokens: 1024,
  });
  const raw = (judgement.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { overall_pass: false, results: [], parse_error: raw.slice(0, 200) };
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    return { overall_pass: false, results: [], parse_error: String(err) };
  }
}

async function runCase(caseRow) {
  const system = buildSystem(caseRow.knowledge ?? []);
  const messages = (caseRow.messages ?? []).map((m) => ({ role: m.role, content: m.text }));
  const response = await callAnthropic({ model: EVAL_MODEL, system, messages, tools: TOOLS });
  const sentText = extractSentText(response);
  const toolsCalled = extractToolNames(response);
  const judgement = await judgeResponse({ caseRow, sentText, tools: toolsCalled });
  return { sentText, toolsCalled, judgement };
}

async function main() {
  const cases = JSON.parse(readFileSync(join(__dirname, "cases.json"), "utf8"));
  console.log(`\nCaleoCRM AI evals — modelo: ${EVAL_MODEL} · juiz: ${JUDGE_MODEL} · ${cases.length} casos\n`);

  const results = [];
  for (const c of cases) {
    process.stdout.write(`• ${c.id}  `);
    try {
      const r = await runCase(c);
      const passed = Boolean(r.judgement.overall_pass);
      results.push({ id: c.id, title: c.title, passed, ...r });
      process.stdout.write(passed ? "✓\n" : "✗\n");
      if (VERBOSE || !passed) {
        console.log(`    resposta: ${r.sentText ?? "(vazia)"}`);
        console.log(`    tools: ${JSON.stringify(r.toolsCalled)}`);
        if (r.judgement.results) {
          for (const j of r.judgement.results) {
            console.log(`    ${j.pass ? "✓" : "✗"} ${j.criterion} — ${j.reason ?? ""}`);
          }
        }
        if (r.judgement.parse_error) console.log(`    parse_error: ${r.judgement.parse_error}`);
        console.log("");
      }
    } catch (err) {
      results.push({ id: c.id, title: c.title, passed: false, error: String(err) });
      console.log(`✗ erro: ${err.message ?? err}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const rate = passed / results.length;
  const ok = rate >= MIN_PASS_RATE;

  console.log(`\nResumo: ${passed}/${results.length} passou (${(rate * 100).toFixed(0)}%) — mínimo ${(MIN_PASS_RATE * 100).toFixed(0)}%`);
  console.log(ok ? "PASS\n" : "FAIL\n");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
