// Sugere a próxima mensagem a enviar pro lead da negociação. Lê o mesmo
// contexto do resumo (atividades, comentários, tarefas, conversa, cliente) e
// pede ao Claude Haiku uma redação em PT-BR no estilo WhatsApp, opcionalmente
// com tom controlado pelo vendedor (cordial / direto / urgente).
//
// Autenticado por JWT; gate crm/edit (escrever sugere ação) via
// requireTenantPermission. Não grava em ai_usage (ação humana sob demanda).

import { createChatCompletion, type OpenAiMessage } from "../_shared/openai.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { PermissionDeniedError, requireTenantPermission } from "../_shared/supabase.ts";

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 400;

type Tone = "cordial" | "direto" | "urgente";

const TONE_DIRECTIVE: Record<Tone, string> = {
  cordial:
    "Tom CORDIAL: caloroso e respeitoso. Cumprimente, valide o cliente, ofereça ajuda sem pressionar.",
  direto:
    "Tom DIRETO: objetivo e profissional. Sem floreio. Vá ao ponto: o que falta, qual o próximo passo, prazo.",
  urgente:
    "Tom URGENTE (sem ser agressivo): cria senso de prioridade, menciona prazo ou janela curta. Não use CAIXA ALTA.",
};

const SYSTEM_PROMPT = `Você ajuda um vendedor a redigir a PRÓXIMA MENSAGEM para o cliente no WhatsApp, em português do Brasil.

Receberá o contexto completo da negociação (cliente, últimas mensagens, tarefas, atividades, comentários internos, status atual no funil).

Regras invioláveis:
- NÃO invente fatos. Só fale sobre o que está claramente no contexto.
- Responda APENAS com o texto da mensagem — sem cabeçalho, sem comentários, sem aspas externas, sem emoji em excesso (zero ou um, no máximo).
- Estilo WhatsApp BR: curto (1 a 3 frases), natural, primeira pessoa do plural ("a gente", "vamos") ou tratamento que o cliente já usou.
- Se o cliente já tem nome no contexto, use o primeiro nome no cumprimento.
- Pode propor o próximo passo concreto (agendar call, enviar proposta, confirmar dado faltante).
- Se faltar informação crítica (cliente nunca falou, sem etapa clara), faça uma pergunta de qualificação leve em vez de chutar.
- Sem markdown. Sem **negrito**. Sem links inventados.
- Se for retomada de contato após dias parado, reconheça brevemente sem se desculpar muito.`;

type NegotiationRow = {
  id: string;
  title: string;
  status: string;
  funnel_id: string;
  stage_id: string;
  total_value: number | null;
  qualification: number | null;
  next_task_at: string | null;
  closing_forecast: string | null;
  last_contact_at: string | null;
  last_interaction_at: string | null;
  created_at: string;
  customer_id: string | null;
  source_chat_id: string | null;
  assignee_id: string | null;
};

type CustomerRow = {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  perfil: string | null;
};

function firstName(full: string | null | undefined): string {
  if (!full) return "";
  const parts = full.trim().split(/\s+/);
  return parts[0] || "";
}

function fmtBR(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (!isFinite(n) || n === 0) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function trunc(t: string, max = 200): string {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let ctx;
  try {
    ctx = await requireTenantPermission(request, "crm", "edit");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return jsonResponse({ error: err.message }, 403);
    }
    return jsonResponse({ error: err instanceof Error ? err.message : "Unauthorized." }, 401);
  }
  const { admin, tenantId } = ctx;

  let body: { negotiationId?: string; tone?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }
  const negotiationId = body.negotiationId?.trim();
  if (!negotiationId) {
    return jsonResponse({ error: "negotiationId obrigatório." }, 400);
  }
  const tone: Tone =
    body.tone === "direto" || body.tone === "urgente" ? body.tone : "cordial";

  const { data: negRow, error: negErr } = await admin
    .from("crm_negotiations")
    .select(
      "id, title, status, funnel_id, stage_id, total_value, qualification, next_task_at, closing_forecast, last_contact_at, last_interaction_at, created_at, customer_id, source_chat_id, assignee_id",
    )
    .eq("id", negotiationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (negErr) return jsonResponse({ error: negErr.message }, 500);
  if (!negRow) return jsonResponse({ error: "Negociação não encontrada." }, 404);
  const neg = negRow as NegotiationRow;

  // Contexto enxuto pra mensagem (menos peso que o resumo).
  const [customerRes, activitiesRes, tasksRes, commentsRes, messagesRes] = await Promise.all([
    neg.customer_id
      ? admin
          .from("customers")
          .select("nome, telefone, email, perfil")
          .eq("id", neg.customer_id)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("crm_activities")
      .select("activity_type, title, body, created_at")
      .eq("negotiation_id", neg.id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("crm_tasks")
      .select("title, due_at, status, notes")
      .eq("negotiation_id", neg.id)
      .eq("tenant_id", tenantId)
      .eq("status", "aberta")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(5),
    admin
      .from("crm_negotiation_comments")
      .select("body, created_at")
      .eq("negotiation_id", neg.id)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(5),
    neg.source_chat_id
      ? admin
          .from("whatsapp_messages")
          .select("direction, text_content, created_at")
          .eq("chat_id", neg.source_chat_id)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(15)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const customer = (customerRes.data ?? null) as CustomerRow | null;
  const activities = (activitiesRes.data ?? []) as Array<{
    activity_type: string;
    title: string | null;
    body: string | null;
    created_at: string;
  }>;
  const tasks = (tasksRes.data ?? []) as Array<{
    title: string;
    due_at: string | null;
    notes: string | null;
  }>;
  const comments = (commentsRes.data ?? []) as Array<{
    body: string;
    created_at: string;
  }>;
  const messages = (messagesRes.data ?? []) as Array<{
    direction: string;
    text_content: string | null;
    created_at: string;
  }>;

  const lines: string[] = [];
  lines.push(`NEGOCIAÇÃO: ${neg.title}`);
  lines.push(`Etapa: ${neg.stage_id} · Status: ${neg.status}`);
  if (neg.total_value) lines.push(`Valor: ${fmtBRL(neg.total_value)}`);
  const lastTouch = neg.last_interaction_at ?? neg.last_contact_at;
  if (lastTouch) lines.push(`Última interação: ${fmtBR(lastTouch)}`);
  if (neg.next_task_at) lines.push(`Próx. tarefa agendada: ${fmtBR(neg.next_task_at)}`);

  if (customer) {
    lines.push("");
    lines.push("CLIENTE:");
    if (customer.nome) lines.push(`Nome: ${customer.nome} (primeiro nome: ${firstName(customer.nome)})`);
    if (customer.perfil) lines.push(`Perfil: ${customer.perfil}`);
  }

  if (tasks.length > 0) {
    lines.push("");
    lines.push("TAREFAS ABERTAS (orientam o próximo passo):");
    for (const t of tasks) {
      const due = t.due_at ? fmtBR(t.due_at) : "sem prazo";
      lines.push(`- ${t.title} (${due})${t.notes ? ` — ${trunc(t.notes, 100)}` : ""}`);
    }
  }

  if (comments.length > 0) {
    lines.push("");
    lines.push("ÚLTIMOS COMENTÁRIOS INTERNOS:");
    for (const c of comments) {
      lines.push(`[${fmtBR(c.created_at)}] ${trunc(c.body, 160)}`);
    }
  }

  if (activities.length > 0) {
    lines.push("");
    lines.push("ATIVIDADES RECENTES:");
    for (const a of activities) {
      const t = a.title?.trim() || a.activity_type;
      const b = a.body?.trim() ? ` — ${trunc(a.body, 120)}` : "";
      lines.push(`[${fmtBR(a.created_at)}] ${t}${b}`);
    }
  }

  if (messages.length > 0) {
    lines.push("");
    lines.push("ÚLTIMAS MENSAGENS DA CONVERSA (cronológico):");
    for (const m of [...messages].reverse()) {
      if (!m.text_content?.trim()) continue;
      const who = m.direction === "outbound" ? "Atendente" : "Cliente";
      lines.push(`[${fmtBR(m.created_at)}] ${who}: ${trunc(m.text_content, 180)}`);
    }
  }

  const userPrompt =
    `${TONE_DIRECTIVE[tone]}\n\n${lines.join("\n")}\n\n` +
    `Redija a próxima mensagem (em PT-BR, estilo WhatsApp, curta). Devolva APENAS o texto da mensagem.`;

  const aiMessages: OpenAiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  try {
    const res = await createChatCompletion({
      model: MODEL,
      maxTokens: MAX_TOKENS,
      messages: aiMessages,
      tools: [],
    });
    const text = (res.choices?.[0]?.message?.content ?? "")
      .trim()
      // Strip aspas externas se o modelo embrulhar.
      .replace(/^["“'`]+/, "")
      .replace(/["”'`]+$/, "");

    return jsonResponse({
      message: text,
      tone,
      usage: {
        input_tokens: res.usage?.prompt_tokens ?? 0,
        output_tokens: res.usage?.completion_tokens ?? 0,
      },
      model: MODEL,
      chatId: neg.source_chat_id,
    });
  } catch (err) {
    console.error("crm-suggest-next-message:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Falha na chamada à IA." },
      500,
    );
  }
});
