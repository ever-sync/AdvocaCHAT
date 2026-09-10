import type { OpenAPIV3 } from "swagger-ui-react";

/** Spec da edge function `n8n-reply` (resposta de IA / automação com regras). */
export function buildN8nReplyOpenApi(serverUrl: string): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: {
      title: "CaleoCRM n8n Reply API",
      version: "1.0.0",
      description: [
        "Edge function usada pelo **n8n (ou outro orquestrador)** para responder no WhatsApp após receber o webhook de entrada.",
        "",
        "### Fluxo típico",
        "1. Cliente envia mensagem → CaleoCRM chama o **webhook do n8n** (URL em Configurações) com evento `message.inbound`.",
        "2. Seu fluxo n8n processa e chama **esta API** (`n8n-reply`) para enviar texto, mudar estágio, tags ou handoff.",
        "",
        "### Autenticação (uma das opções)",
        "- `Authorization: Bearer <N8N_SERVICE_KEY>` (variável de ambiente no Supabase), ou",
        "- `X-CaleoCRM-Timestamp: <unix-seconds>` + `X-CaleoCRM-Signature: sha256=<hmac>`, onde o HMAC-SHA256 cobre `${timestamp}.${body}` (hex). Timestamp precisa estar dentro de ±5 minutos do horário do servidor para evitar replay.",
        "",
        "### Regras de negócio",
        "Respostas de texto só são enviadas se a IA estiver permitida (modo do chat, sem atendente humano, sem opt-out, etc.). Caso contrário: **409** com `block_reason`.",
        "",
        "Para integrações genéricas (CRM, listagens, envio sem regras de IA), use a **CaleoCRM API REST** (`wchat-api`).",
      ].join("\n"),
    },
    servers: [{ url: serverUrl, description: "Edge function n8n-reply" }],
    tags: [{ name: "Reply", description: "Ações no chat a partir do n8n" }],
    components: {
      securitySchemes: {
        serviceKey: {
          type: "http",
          scheme: "bearer",
          description: "N8N_SERVICE_KEY configurada no projeto Supabase",
        },
        hmacSignature: {
          type: "apiKey",
          in: "header",
          name: "X-CaleoCRM-Signature",
          description: "HMAC-SHA256 (hex) sobre `${timestamp}.${body}`, com prefixo `sha256=`. Requer também `X-CaleoCRM-Timestamp`. Segredo em Configurações → IA no n8n.",
        },
        hmacTimestamp: {
          type: "apiKey",
          in: "header",
          name: "X-CaleoCRM-Timestamp",
          description: "Unix epoch em segundos do momento da requisição. Janela aceita ±5 min para prevenir replay.",
        },
      },
      schemas: {
        N8nReplyRequest: {
          type: "object",
          required: ["chat_id", "tenant_id"],
          properties: {
            chat_id: { type: "string", format: "uuid" },
            tenant_id: { type: "string", format: "uuid" },
            text: {
              type: "string",
              description: "Mensagem de texto a enviar (opcional se só handoff/tags/stage)",
            },
            handoff: {
              type: "boolean",
              description: "Transfere para humano (ai_mode handoff + fila)",
            },
            set_stage: {
              type: "string",
              description: "ID do estágio CRM da negociação vinculada",
            },
            tags_add: {
              type: "array",
              items: { type: "string" },
              description: "Tags na negociação (cria se não existir)",
            },
          },
        },
        N8nReplySuccess: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            handoff: { type: "boolean" },
          },
        },
        N8nBlocked: {
          type: "object",
          properties: {
            error: { type: "string" },
            block_reason: { type: "string" },
            message: { type: "string" },
            ai_mode: { type: "string" },
          },
        },
        InboundWebhookPayload: {
          type: "object",
          description: "Payload que o CaleoCRM envia **para o seu webhook n8n** (não é endpoint desta API)",
          properties: {
            event: { type: "string", example: "message.inbound" },
            tenant_id: { type: "string", format: "uuid" },
            chat_id: { type: "string", format: "uuid" },
            instance_id: { type: "string", format: "uuid" },
            reply_url: { type: "string", description: "URL desta API n8n-reply" },
            ai: {
              type: "object",
              properties: {
                mode: { type: "string" },
                may_reply: { type: "boolean" },
              },
            },
            customer: { type: "object", nullable: true },
            negotiation: { type: "object", nullable: true },
            messages: { type: "array", items: { type: "object" } },
            latest_message: { type: "object" },
          },
        },
      },
    },
    paths: {
      "/": {
        post: {
          tags: ["Reply"],
          summary: "Responder / automação no chat",
          description:
            "Único endpoint da function. Integração n8n deve estar **ativada** no tenant.",
          security: [{ serviceKey: [] }, { hmacSignature: [], hmacTimestamp: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/N8nReplyRequest" },
                examples: {
                  reply: {
                    summary: "Enviar texto",
                    value: {
                      chat_id: "00000000-0000-0000-0000-000000000001",
                      tenant_id: "00000000-0000-0000-0000-000000000002",
                      text: "Olá! Como posso ajudar?",
                    },
                  },
                  handoff: {
                    summary: "Handoff para vendedor",
                    value: {
                      chat_id: "00000000-0000-0000-0000-000000000001",
                      tenant_id: "00000000-0000-0000-0000-000000000002",
                      handoff: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Processado",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/N8nReplySuccess" },
                },
              },
            },
            "401": { description: "Autenticação inválida" },
            "403": { description: "Integração n8n desativada" },
            "404": { description: "Chat não encontrado" },
            "409": {
              description: "IA bloqueada por regras",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/N8nBlocked" },
                },
              },
            },
          },
        },
      },
    },
  };
}

const inboundWebhookSchema: OpenAPIV3.SchemaObject = {
  type: "object",
  description: "Payload que o CaleoCRM envia para o webhook do n8n",
  properties: {
    event: { type: "string", example: "message.inbound" },
    tenant_id: { type: "string", format: "uuid" },
    chat_id: { type: "string", format: "uuid" },
    instance_id: { type: "string", format: "uuid" },
    reply_url: { type: "string" },
    ai: {
      type: "object",
      properties: {
        mode: { type: "string" },
        may_reply: { type: "boolean" },
        block_reason: { type: "string", nullable: true },
      },
    },
    customer: { type: "object", nullable: true },
    negotiation: { type: "object", nullable: true },
    messages: { type: "array", items: { type: "object" } },
    latest_message: { type: "object" },
  },
};

/** Spec informativa do webhook que o CaleoCRM dispara no n8n (referência). */
export function buildN8nInboundWebhookOpenApi(webhookUrl: string): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: {
      title: "Webhook CaleoCRM → n8n (entrada)",
      version: "1.0.0",
      description: [
        "Documentação de referência do payload que o **CaleoCRM envia para a URL do seu n8n**.",
        "Não é hospedado pelo CaleoCRM — configure a URL em **Configurações → IA no n8n**.",
        "",
        "Assinatura: headers `X-CaleoCRM-Timestamp` (unix seconds) + `X-CaleoCRM-Signature: sha256=<hmac>` (HMAC-SHA256 sobre `${timestamp}.${body}`). Janela de validade ±5 min — descarte requisições antigas para evitar replay.",
      ].join("\n"),
    },
    servers: [{ url: webhookUrl || "https://seu-n8n.exemplo.com/webhook", description: "Seu webhook n8n" }],
    paths: {
      "/": {
        post: {
          summary: "message.inbound",
          requestBody: {
            content: {
              "application/json": {
                schema: inboundWebhookSchema,
              },
            },
          },
          responses: { "200": { description: "Seu fluxo n8n deve responder 2xx" } },
        },
      },
    },
  };
}
