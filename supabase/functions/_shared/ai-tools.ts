// Catálogo de tools da IA de atendimento (Fase 2).
// Definições (schemas Claude) + executores (ações com admin client) + allowlist por
// ai_mode. Reusado pelo orquestrador nativo (ai-orchestrator) e pelo n8n-reply, para
// que IA e N8N executem pelas MESMAS primitivas (mesmas regras/auditoria).

import {
  evaluateAiReplyEligibility,
  QUALIFYING_AI_STAGE_IDS,
  type ChatAiMode,
} from "./ai-business-rules.ts";
import type { AnthropicTool } from "./anthropic.ts";
import { decryptSecret } from "./crypto.ts";
import {
  getInstanceById,
  insertOrDedupeOutboundMessage,
  normalizeUazapiMessageId,
} from "./domain.ts";
import { createAdminClient } from "./supabase.ts";
import { sendMessageViaUazapi } from "./uazapi.ts";
import { emitAiWebhook } from "./ai-webhooks.ts";

type Admin = ReturnType<typeof createAdminClient>;

export type ToolName =
  | "send_whatsapp_message"
  | "move_stage"
  | "add_tag"
  | "remove_tag"
  | "set_custom_field"
  | "create_task"
  | "remember_customer_fact"
  | "handoff";

const NUMERIC_FIELD_KINDS = new Set(["numero", "inteiro", "moeda", "porcentagem"]);

// ---------------------------------------------------------------------------
// Definições (schemas) das tools
// ---------------------------------------------------------------------------

const TOOLS: Record<ToolName, AnthropicTool> = {
  send_whatsapp_message: {
    name: "send_whatsapp_message",
    description:
      "Envia uma mensagem de texto para o cliente no WhatsApp. Use sempre que quiser responder — é o único jeito do texto chegar ao cliente.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Texto da mensagem ao cliente, em português do Brasil." },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  move_stage: {
    name: "move_stage",
    description:
      "Move a negociação deste cliente para outra etapa do funil. Use quando o atendimento avançar (ex.: de 'lead' para 'contato').",
    input_schema: {
      type: "object",
      properties: {
        stage_id: { type: "string", description: "Identificador da etapa de destino (ex.: 'lead', 'contato')." },
      },
      required: ["stage_id"],
      additionalProperties: false,
    },
  },
  add_tag: {
    name: "add_tag",
    description:
      "Adiciona uma etiqueta (tag) à negociação para classificar o interesse, intenção ou perfil do cliente.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da etiqueta (ex.: 'interessado', 'orçamento')." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  remove_tag: {
    name: "remove_tag",
    description: "Remove uma etiqueta (tag) da negociação.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome da etiqueta a remover." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  set_custom_field: {
    name: "set_custom_field",
    description:
      "Grava o valor de um campo personalizado do contato (perfil progressivo). Use apenas os campos disponíveis informados no contexto.",
    input_schema: {
      type: "object",
      properties: {
        field_name: { type: "string", description: "Nome exato do campo personalizado." },
        value: { type: "string", description: "Valor informado pelo cliente." },
      },
      required: ["field_name", "value"],
      additionalProperties: false,
    },
  },
  create_task: {
    name: "create_task",
    description: "Cria uma tarefa de acompanhamento (follow-up) para a equipe.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da tarefa." },
        notes: { type: "string", description: "Detalhes da tarefa." },
        due_at: { type: "string", description: "Data/hora limite em ISO 8601 (opcional)." },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  remember_customer_fact: {
    name: "remember_customer_fact",
    description:
      "Salva um fato durável sobre o cliente para personalizar conversas futuras. Use APENAS para preferências/contextos que vão valer em outros atendimentos (ex.: 'prefere ser contatado pela manhã', 'tem 3 filhos pequenos', 'não gosta de áudios longos', 'trabalha com logística'). Não use para coisas efêmeras (estado do pedido atual) — para essas, use set_custom_field. Máximo 280 caracteres.",
    input_schema: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description:
            "O fato em uma frase curta, no infinitivo ou descritivo. Português objetivo. Ex.: 'prefere áudio a texto'.",
        },
      },
      required: ["fact"],
      additionalProperties: false,
    },
  },
  handoff: {
    name: "handoff",
    description:
      "Transfere o atendimento para um humano. Use quando o cliente pedir, demonstrar intenção de compra forte, ou quando você não conseguir resolver. Sempre escreva um resumo do que já foi conversado.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Motivo curto da transferência." },
        summary: { type: "string", description: "Resumo do atendimento até aqui, para o humano continuar sem reler tudo." },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
};

const MODE_TOOLS: Record<"qualifying" | "full", ToolName[]> = {
  qualifying: [
    "send_whatsapp_message",
    "add_tag",
    "remove_tag",
    "set_custom_field",
    "move_stage",
    "remember_customer_fact",
    "handoff",
  ],
  full: [
    "send_whatsapp_message",
    "add_tag",
    "remove_tag",
    "set_custom_field",
    "move_stage",
    "create_task",
    "remember_customer_fact",
    "handoff",
  ],
};

export function toolNamesForMode(mode: ChatAiMode): Set<ToolName> {
  return new Set(mode === "qualifying" || mode === "full" ? MODE_TOOLS[mode] : []);
}

/** Tools liberadas para o modo, com cache_control na última (1 breakpoint cobre todas). */
export function toolsForMode(mode: ChatAiMode): AnthropicTool[] {
  const names = [...toolNamesForMode(mode)];
  return names.map((name, i) =>
    i === names.length - 1
      ? { ...TOOLS[name], cache_control: { type: "ephemeral", ttl: "1h" } as const }
      : TOOLS[name],
  );
}

// ---------------------------------------------------------------------------
// Executores (reusáveis por n8n-reply e pelo orquestrador)
// ---------------------------------------------------------------------------

/** Envia texto pelo WhatsApp e persiste como outbound actor_type='ai'. */
export async function sendWhatsappText(
  admin: Admin,
  chat: Record<string, unknown>,
  text: string,
  source = "ai-orchestrator",
): Promise<void> {
  const instance = await getInstanceById(admin, String(chat.instance_id));

  // Idempotência defensiva: se o worker for cancelado/der 504 depois de enviar
  // pelo provedor, o mesmo ai_job pode ser reprocessado. Não reenvie a mesma
  // resposta da IA para o mesmo inbound.
  if (await wasSameAiTextAlreadySentForLatestInbound(admin, String(chat.id), text)) {
    console.warn("sendWhatsappText: duplicate AI reply suppressed", String(chat.id));
    return;
  }

  const apiKey = await decryptSecret(instance.encrypted_apikey);
  const config = {
    instanceName: instance.uazapi_instance_name,
    baseUrl: instance.uazapi_base_url,
    apiKey,
  };

  const response = await sendMessageViaUazapi(config, {
    messageType: "text",
    remoteJid: String(chat.remote_jid),
    bodyText: text,
    payload: {},
  });

  const rawProviderId = response.key?.id ?? response.data?.key?.id ?? response.id;
  const uazapiMessageId =
    normalizeUazapiMessageId(typeof rawProviderId === "string" ? rawProviderId : null) || null;

  await insertOrDedupeOutboundMessage(admin, instance, String(chat.id), {
    uazapiMessageId,
    messageType: "text",
    status: "sent",
    bodyText: text,
    payloadJson: { source },
    rawEvent: response,
    sentAt: new Date().toISOString(),
    actorType: "ai",
  });

  await admin
    .from("whatsapp_chats")
    .update({ last_message_preview: text, last_message_at: new Date().toISOString() })
    .eq("id", chat.id);
}

async function wasSameAiTextAlreadySentForLatestInbound(
  admin: Admin,
  chatId: string,
  text: string,
): Promise<boolean> {
  const normalizedText = normalizeMessageText(text);
  if (!normalizedText) return false;

  const { data: latestInbound } = await admin
    .from("whatsapp_messages")
    .select("created_at")
    .eq("chat_id", chatId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = admin
    .from("whatsapp_messages")
    .select("body_text")
    .eq("chat_id", chatId)
    .eq("direction", "outbound")
    .eq("actor_type", "ai")
    .order("created_at", { ascending: false })
    .limit(8);

  const inboundCreatedAt = latestInbound?.created_at as string | undefined;
  if (inboundCreatedAt) {
    query = query.gte("created_at", inboundCreatedAt);
  }

  const { data } = await query;
  return (data ?? []).some((row: Record<string, unknown>) => normalizeMessageText(String(row.body_text ?? "")) === normalizedText);
}

function normalizeMessageText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export async function moveNegotiationStage(admin: Admin, negotiationId: string, stageId: string): Promise<void> {
  const { error } = await admin
    .from("crm_negotiations")
    .update({ stage_id: stageId, last_interaction_at: new Date().toISOString() })
    .eq("id", negotiationId);
  if (error) throw new Error(error.message);
}

async function resolveTagId(admin: Admin, tenantId: string, name: string): Promise<string | null> {
  const { data: existing } = await admin
    .from("tags")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("scope", "negotiation")
    .ilike("name", name)
    .maybeSingle();
  return existing?.id ?? null;
}

export async function addNegotiationTag(
  admin: Admin,
  tenantId: string,
  negotiationId: string,
  name: string,
): Promise<void> {
  let tagId = await resolveTagId(admin, tenantId, name);
  if (!tagId) {
    const { data: created } = await admin
      .from("tags")
      .insert({ tenant_id: tenantId, name, color: "#6366f1", scope: "negotiation" })
      .select("id")
      .single();
    tagId = created?.id ?? null;
  }
  if (!tagId) throw new Error("Não foi possível criar a etiqueta.");
  await admin.from("entity_tags").upsert(
    { tenant_id: tenantId, tag_id: tagId, entity_type: "negotiation", entity_id: negotiationId },
    { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true },
  );
}

export async function removeNegotiationTag(
  admin: Admin,
  tenantId: string,
  negotiationId: string,
  name: string,
): Promise<void> {
  const tagId = await resolveTagId(admin, tenantId, name);
  if (!tagId) return;
  await admin
    .from("entity_tags")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("tag_id", tagId)
    .eq("entity_type", "negotiation")
    .eq("entity_id", negotiationId);
}

/** Upsert de campo personalizado (trigger normaliza telefone/cpf/cnpj/cep/email em value_text). */
export async function upsertCustomFieldValue(
  admin: Admin,
  tenantId: string,
  customerId: string,
  fieldName: string,
  value: string,
): Promise<string> {
  const { data: field } = await admin
    .from("customer_custom_fields")
    .select("id, nome, kind")
    .eq("tenant_id", tenantId)
    .ilike("nome", fieldName)
    .maybeSingle();
  if (!field) throw new Error(`Campo personalizado "${fieldName}" não existe.`);

  const payload: Record<string, unknown> = {
    customer_id: customerId,
    field_id: field.id,
    value_text: null,
    value_numeric: null,
    value_date: null,
    updated_at: new Date().toISOString(),
  };
  if (NUMERIC_FIELD_KINDS.has(field.kind)) {
    const n = Number(String(value).replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) payload.value_numeric = n;
    else payload.value_text = String(value);
  } else if (field.kind === "data") {
    payload.value_date = String(value);
  } else {
    payload.value_text = String(value);
  }

  const { error } = await admin
    .from("customer_custom_field_values")
    .upsert(payload, { onConflict: "customer_id,field_id" });
  if (error) throw new Error(error.message);
  return `Campo "${field.nome}" atualizado.`;
}

export async function createFollowupTask(
  admin: Admin,
  tenantId: string,
  input: { negotiationId: string | null; customerId: string | null; title: string; notes?: string; dueAt?: string | null },
): Promise<void> {
  if (!input.negotiationId && !input.customerId) {
    throw new Error("Sem negociação ou contato vinculado para criar a tarefa.");
  }
  const { error } = await admin.from("crm_tasks").insert({
    tenant_id: tenantId,
    negotiation_id: input.negotiationId,
    customer_id: input.customerId,
    title: input.title,
    notes: input.notes ?? "",
    due_at: input.dueAt ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Salva um fato de longo prazo sobre o cliente (memória persistente). Trata
 * unique violation como sucesso (já lembrava daquilo) — gracefully idempotente.
 */
export async function rememberCustomerFact(
  admin: Admin,
  tenantId: string,
  customerId: string,
  fact: string,
  chatId: string | null,
): Promise<string> {
  const { error } = await admin.from("customer_ai_facts").insert({
    tenant_id: tenantId,
    customer_id: customerId,
    fact,
    source: "ai",
    chat_id: chatId,
  });
  if (error) {
    // 23505 = unique_violation (fact already exists for this customer) → noop.
    if (error.code === "23505") {
      return "Fato já estava registrado na memória do cliente.";
    }
    throw new Error(error.message);
  }
  await emitAiWebhook(admin, tenantId, "ai.fact_remembered", {
    customer_id: customerId,
    chat_id: chatId,
    fact,
  });
  return "Fato salvo na memória do cliente.";
}

export async function handoffChat(
  admin: Admin,
  tenantId: string,
  chatId: string,
  opts: { summary?: string; negotiationId?: string | null; customerId?: string | null; reason?: string } = {},
): Promise<void> {
  await admin.from("whatsapp_chats").update({ ai_mode: "handoff" }).eq("id", chatId);
  await admin.rpc("auto_assign_chat_system", { p_chat_id: chatId });
  // Resumo do handoff vira uma tarefa "Retomar atendimento" para o humano pegar com contexto.
  if (opts.summary && (opts.negotiationId || opts.customerId)) {
    await createFollowupTask(admin, tenantId, {
      negotiationId: opts.negotiationId ?? null,
      customerId: opts.customerId ?? null,
      title: "Retomar atendimento (handoff IA)",
      notes: opts.summary,
    });
  }
  await emitAiWebhook(admin, tenantId, "ai.handoff", {
    chat_id: chatId,
    customer_id: opts.customerId ?? null,
    negotiation_id: opts.negotiationId ?? null,
    reason: opts.reason ?? null,
    summary: opts.summary ?? null,
  });
}

// ---------------------------------------------------------------------------
// Dispatcher (usado pelo orquestrador) — aplica allowlist + guardrails
// ---------------------------------------------------------------------------

export type ToolContext = {
  admin: Admin;
  tenantId: string;
  chat: Record<string, unknown>;
  negotiationId: string | null;
  customerId: string | null;
  aiMode: ChatAiMode;
};

export type ToolOutcome = { content: string; isError: boolean; aborted?: boolean };

/** Recarrega o estado do chat e reavalia elegibilidade (corrida: humano assumiu). */
export async function isChatStillEligible(admin: Admin, chatId: string): Promise<boolean> {
  const { data: chat } = await admin
    .from("whatsapp_chats")
    .select("ai_mode, assignee_id, primary_negotiation_id, customers(opt_out)")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat) return false;
  let negotiation: { assignee_id?: string | null; status?: string | null; stage_id?: string | null } | null = null;
  if (chat.primary_negotiation_id) {
    const { data } = await admin
      .from("crm_negotiations")
      .select("assignee_id, status, stage_id")
      .eq("id", chat.primary_negotiation_id as string)
      .maybeSingle();
    negotiation = data;
  }
  const customers = chat.customers as { opt_out?: boolean } | null | undefined;
  return evaluateAiReplyEligibility({
    aiMode: String(chat.ai_mode ?? "off"),
    chatAssigneeId: chat.assignee_id as string | null | undefined,
    negotiationAssigneeId: negotiation?.assignee_id,
    negotiationStatus: negotiation?.status,
    negotiationStageId: negotiation?.stage_id,
    customerOptOut: Boolean(customers?.opt_out),
  }).allowed;
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown> | undefined,
): Promise<ToolOutcome> {
  // Allowlist por modo (defesa em profundidade — o modelo só recebe as liberadas).
  if (!toolNamesForMode(ctx.aiMode).has(name as ToolName)) {
    return { content: `Ferramenta "${name}" não disponível no modo atual.`, isError: true };
  }

  try {
    switch (name as ToolName) {
      case "send_whatsapp_message": {
        const text = String(input?.text ?? "").trim();
        if (!text) throw new Error("Texto vazio; nada enviado.");
        // Recheca elegibilidade IMEDIATAMENTE antes de enviar (humano pode ter assumido).
        if (!(await isChatStillEligible(ctx.admin, String(ctx.chat.id)))) {
          return { content: "Conversa assumida por um humano; não envie mais mensagens.", isError: true, aborted: true };
        }
        await sendWhatsappText(ctx.admin, ctx.chat, text);
        return { content: "Mensagem enviada ao cliente.", isError: false };
      }
      case "move_stage": {
        if (!ctx.negotiationId) throw new Error("Sem negociação vinculada a este chat.");
        const stageId = String(input?.stage_id ?? "").trim();
        if (!stageId) throw new Error("stage_id obrigatório.");
        if (ctx.aiMode === "qualifying" && !QUALIFYING_AI_STAGE_IDS.has(stageId)) {
          throw new Error("No modo qualificação só é possível mover entre as etapas iniciais do funil.");
        }
        await moveNegotiationStage(ctx.admin, ctx.negotiationId, stageId);
        return { content: `Negociação movida para a etapa "${stageId}".`, isError: false };
      }
      case "add_tag": {
        if (!ctx.negotiationId) throw new Error("Sem negociação vinculada a este chat.");
        const tagName = String(input?.name ?? "").trim();
        if (!tagName) throw new Error("name obrigatório.");
        await addNegotiationTag(ctx.admin, ctx.tenantId, ctx.negotiationId, tagName);
        return { content: `Etiqueta "${tagName}" adicionada.`, isError: false };
      }
      case "remove_tag": {
        if (!ctx.negotiationId) throw new Error("Sem negociação vinculada a este chat.");
        const tagName = String(input?.name ?? "").trim();
        if (!tagName) throw new Error("name obrigatório.");
        await removeNegotiationTag(ctx.admin, ctx.tenantId, ctx.negotiationId, tagName);
        return { content: `Etiqueta "${tagName}" removida.`, isError: false };
      }
      case "set_custom_field": {
        if (!ctx.customerId) throw new Error("Sem contato vinculado a este chat.");
        const fieldName = String(input?.field_name ?? "").trim();
        const value = String(input?.value ?? "").trim();
        if (!fieldName || !value) throw new Error("field_name e value obrigatórios.");
        const msg = await upsertCustomFieldValue(ctx.admin, ctx.tenantId, ctx.customerId, fieldName, value);
        return { content: msg, isError: false };
      }
      case "create_task": {
        const title = String(input?.title ?? "").trim();
        if (!title) throw new Error("title obrigatório.");
        await createFollowupTask(ctx.admin, ctx.tenantId, {
          negotiationId: ctx.negotiationId,
          customerId: ctx.customerId,
          title,
          notes: input?.notes ? String(input.notes) : "",
          dueAt: input?.due_at ? String(input.due_at) : null,
        });
        return { content: "Tarefa criada.", isError: false };
      }
      case "remember_customer_fact": {
        if (!ctx.customerId) throw new Error("Sem contato vinculado a este chat.");
        const fact = String(input?.fact ?? "").trim();
        if (!fact) throw new Error("fact obrigatório.");
        if (fact.length > 280) throw new Error("Fact muito longo (máx. 280 caracteres).");
        const msg = await rememberCustomerFact(ctx.admin, ctx.tenantId, ctx.customerId, fact, String(ctx.chat.id));
        return { content: msg, isError: false };
      }
      case "handoff": {
        const summary = input?.summary ? String(input.summary) : undefined;
        const reason = input?.reason ? String(input.reason) : undefined;
        await handoffChat(ctx.admin, ctx.tenantId, String(ctx.chat.id), {
          reason,
          summary,
          negotiationId: ctx.negotiationId,
          customerId: ctx.customerId,
        });
        return { content: "Atendimento transferido para um humano.", isError: false, aborted: true };
      }
      default:
        return { content: `Ferramenta "${name}" desconhecida.`, isError: true };
    }
  } catch (err) {
    return { content: err instanceof Error ? err.message : String(err), isError: true };
  }
}
