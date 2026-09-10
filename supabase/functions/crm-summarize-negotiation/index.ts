// Resumo IA da negociação: carrega contexto rico (negócio, cliente, atividades,
// comentários, tarefas abertas, produtos, últimas mensagens do chat vinculado)
// e pede ao Claude Haiku um resumo em bullets em PT-BR.
//
// Autenticado por JWT do usuário; gate adicional via requireTenantPermission
// (crm/view). NÃO grava em ai_usage — é uma ação humana sob demanda, não conta
// na cota de IA do tenant.

import { createChatCompletion, type OpenAiMessage } from "../_shared/openai.ts";
import { handleCors, jsonResponse } from "../_shared/http.ts";
import { PermissionDeniedError, requireTenantPermission } from "../_shared/supabase.ts";

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 800;

const SYSTEM_PROMPT = `Você resume negociações de CRM B2B/B2C para o vendedor que vai retomar o caso.
Receba o contexto estruturado da negociação (cliente, atividades, comentários, tarefas, mensagens) e produza um RESUMO em português do Brasil, formato BULLETS curtos, sem cabeçalho, cobrindo apenas o que existir:

- **Quem é o cliente** (nome, papel se claro, contexto que importa).
- **O que ele quer** (intenção, produto, dor principal).
- **Onde estamos** (etapa do funil, qualificação, valor, próximo passo).
- **Compromissos abertos** (tarefas pendentes, prazos prometidos).
- **Bloqueios / riscos** (objeções, atrasos, sinais de perda).
- **Última atividade** (data + o que foi dito ou feito).

Regras:
- Seja factual. NÃO invente. Se algo não está no contexto, omita.
- Frases curtas. Sem floreio. Português direto.
- Máximo 8 bullets. Cada um cabendo em uma linha.
- Não repita o título nem o nome do cliente em todos os bullets.
- Use **negrito** com parcimônia em palavras-chave (etapa, valor, prazo).
- Se não houver contexto suficiente (lead novo, sem atividades), diga isso em 1 bullet só.`;

type NegotiationRow = {
  id: string;
  title: string;
  status: string;
  funnel_id: string;
  stage_id: string;
  total_value: number | null;
  qualification: number | null;
  star_count: number | null;
  next_task_at: string | null;
  closing_forecast: string | null;
  last_contact_at: string | null;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  source_chat_id: string | null;
  assignee_id: string | null;
};

type CustomerRow = {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  perfil: string | null;
  rota: string | null;
  total_gasto: number | null;
  ticket_medio: number | null;
  observacoes: string | null;
};

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

function trunc(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let ctx;
  try {
    ctx = await requireTenantPermission(request, "crm", "view");
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      return jsonResponse({ error: err.message }, 403);
    }
    return jsonResponse({ error: err instanceof Error ? err.message : "Unauthorized." }, 401);
  }
  const { admin, tenantId } = ctx;

  let body: { negotiationId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "JSON inválido." }, 400);
  }
  const negotiationId = body.negotiationId?.trim();
  if (!negotiationId) {
    return jsonResponse({ error: "negotiationId obrigatório." }, 400);
  }

  // Carrega a negociação garantindo tenant ownership.
  const { data: negRow, error: negErr } = await admin
    .from("crm_negotiations")
    .select(
      "id, title, status, funnel_id, stage_id, total_value, qualification, star_count, next_task_at, closing_forecast, last_contact_at, last_interaction_at, created_at, updated_at, customer_id, source_chat_id, assignee_id",
    )
    .eq("id", negotiationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (negErr) return jsonResponse({ error: negErr.message }, 500);
  if (!negRow) return jsonResponse({ error: "Negociação não encontrada." }, 404);

  const neg = negRow as NegotiationRow;

  // Carrega contextos em paralelo (cliente, atividades, comments, tasks, produtos, mensagens).
  const [customerRes, activitiesRes, commentsRes, tasksRes, productsRes, messagesRes, assigneeRes] =
    await Promise.all([
      neg.customer_id
        ? admin
            .from("customers")
            .select("nome, telefone, email, perfil, rota, total_gasto, ticket_medio, observacoes")
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
        .limit(20),
      admin
        .from("crm_negotiation_comments")
        .select("body, created_at, created_by")
        .eq("negotiation_id", neg.id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10),
      admin
        .from("crm_tasks")
        .select("title, due_at, status, notes")
        .eq("negotiation_id", neg.id)
        .eq("tenant_id", tenantId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(15),
      admin
        .from("crm_negotiation_products")
        .select("quantity, unit_price, product_name")
        .eq("negotiation_id", neg.id)
        .eq("tenant_id", tenantId)
        .limit(20),
      neg.source_chat_id
        ? admin
            .from("whatsapp_messages")
            .select("direction, text_content, created_at")
            .eq("chat_id", neg.source_chat_id)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: null, error: null }),
      neg.assignee_id
        ? admin
            .from("profiles")
            .select("nome")
            .eq("id", neg.assignee_id)
            .eq("tenant_id", tenantId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const customer = (customerRes.data ?? null) as CustomerRow | null;
  const activities = (activitiesRes.data ?? []) as Array<{
    activity_type: string;
    title: string | null;
    body: string | null;
    created_at: string;
  }>;
  const comments = (commentsRes.data ?? []) as Array<{
    body: string;
    created_at: string;
  }>;
  const tasks = (tasksRes.data ?? []) as Array<{
    title: string;
    due_at: string | null;
    status: string;
    notes: string | null;
  }>;
  const products = (productsRes.data ?? []) as Array<{
    quantity: number | null;
    unit_price: number | null;
    product_name: string | null;
  }>;
  const messages = (messagesRes.data ?? []) as Array<{
    direction: string;
    text_content: string | null;
    created_at: string;
  }>;
  const assigneeName =
    (assigneeRes.data && (assigneeRes.data as { nome?: string }).nome) || null;

  // Monta o contexto textual estruturado.
  const lines: string[] = [];
  lines.push(`NEGOCIAÇÃO: ${neg.title}`);
  lines.push(`Status: ${neg.status} · Etapa: ${neg.stage_id} · Funil: ${neg.funnel_id}`);
  lines.push(`Valor: ${fmtBRL(neg.total_value)} · Qualif.: ${neg.qualification ?? 0}/5`);
  if (assigneeName) lines.push(`Responsável: ${assigneeName}`);
  if (neg.closing_forecast) lines.push(`Previsão fechamento: ${fmtBR(neg.closing_forecast)}`);
  if (neg.next_task_at) lines.push(`Próx. tarefa: ${fmtBR(neg.next_task_at)}`);
  lines.push(`Criada em: ${fmtBR(neg.created_at)}`);
  const lastTouch = neg.last_interaction_at ?? neg.last_contact_at;
  if (lastTouch) lines.push(`Última interação: ${fmtBR(lastTouch)}`);

  if (customer) {
    lines.push("");
    lines.push("CLIENTE:");
    if (customer.nome) lines.push(`Nome: ${customer.nome}`);
    if (customer.telefone) lines.push(`Telefone: ${customer.telefone}`);
    if (customer.email) lines.push(`E-mail: ${customer.email}`);
    if (customer.perfil) lines.push(`Perfil: ${customer.perfil}`);
    if (customer.rota) lines.push(`Rota/região: ${customer.rota}`);
    if (customer.total_gasto && Number(customer.total_gasto) > 0)
      lines.push(`Total gasto histórico: ${fmtBRL(Number(customer.total_gasto))}`);
    if (customer.ticket_medio && Number(customer.ticket_medio) > 0)
      lines.push(`Ticket médio: ${fmtBRL(Number(customer.ticket_medio))}`);
    if (customer.observacoes) lines.push(`Observações: ${trunc(customer.observacoes, 300)}`);
  }

  if (products.length > 0) {
    lines.push("");
    lines.push("PRODUTOS NA NEGOCIAÇÃO:");
    for (const p of products) {
      const name = p.product_name?.trim() || "Item";
      const q = Number(p.quantity ?? 1);
      const u = Number(p.unit_price ?? 0);
      lines.push(`- ${name} (qtd ${q}, unit. ${fmtBRL(u)})`);
    }
  }

  if (tasks.length > 0) {
    lines.push("");
    lines.push("TAREFAS:");
    for (const t of tasks) {
      const due = t.due_at ? fmtBR(t.due_at) : "sem prazo";
      const st = t.status === "concluida" ? "✓" : "○";
      const notes = t.notes?.trim() ? ` — ${trunc(t.notes, 100)}` : "";
      lines.push(`- ${st} ${t.title} (${due})${notes}`);
    }
  }

  if (comments.length > 0) {
    lines.push("");
    lines.push("COMENTÁRIOS INTERNOS (mais recentes primeiro):");
    for (const c of comments) {
      lines.push(`[${fmtBR(c.created_at)}] ${trunc(c.body, 220)}`);
    }
  }

  if (activities.length > 0) {
    lines.push("");
    lines.push("ATIVIDADES (mais recentes primeiro):");
    for (const a of activities) {
      const title = a.title?.trim() || a.activity_type;
      const body = a.body?.trim() ? ` — ${trunc(a.body, 160)}` : "";
      lines.push(`[${fmtBR(a.created_at)}] ${title}${body}`);
    }
  }

  if (messages.length > 0) {
    // Inverte cronológico — IA vê o fluxo da conversa antiga → recente.
    lines.push("");
    lines.push("ÚLTIMAS MENSAGENS DA CONVERSA:");
    for (const m of [...messages].reverse()) {
      if (!m.text_content?.trim()) continue;
      const who = m.direction === "outbound" ? "Atendente/IA" : "Cliente";
      lines.push(`[${fmtBR(m.created_at)}] ${who}: ${trunc(m.text_content, 200)}`);
    }
  }

  const userPrompt = `${lines.join("\n")}\n\nProduza o RESUMO em bullets.`;

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
    const summary = (res.choices?.[0]?.message?.content ?? "").trim();

    return jsonResponse({
      summary,
      usage: {
        input_tokens: res.usage?.prompt_tokens ?? 0,
        output_tokens: res.usage?.completion_tokens ?? 0,
      },
      model: MODEL,
      contextSize: {
        activities: activities.length,
        comments: comments.length,
        tasks: tasks.length,
        products: products.length,
        messages: messages.length,
        hasCustomer: Boolean(customer),
      },
    });
  } catch (err) {
    console.error("crm-summarize-negotiation:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Falha na chamada à IA." },
      500,
    );
  }
});
