import type { OpenAPIV3 } from "swagger-ui-react";

/** Spec da API REST pública (`wchat-api`). O `servers[0].url` é preenchido na página. */
export function buildWchatApiOpenApi(serverUrl: string): OpenAPIV3.Document {
  return {
    openapi: "3.0.3",
    info: {
      title: "CaleoCRM API REST",
      version: "1.3.0",
      description: [
        "API genérica para integrações (n8n, Zapier, Make, backends próprios).",
        "",
        "**Autenticação:** `Authorization: Bearer wchat_<segredo>` (chave criada em Configurações → Integrações).",
        "",
        "**Escopos:** `read`, `write` ou `*`.",
        "",
        "Esta API é **independente** da edge function `n8n-reply` (fluxo de IA com regras de negócio).",
      ].join("\n"),
    },
    servers: [{ url: serverUrl, description: "Edge function wchat-api" }],
    tags: [
      { name: "Sistema", description: "Health, metadados da chave e colaboradores" },
      { name: "Chats", description: "Conversas WhatsApp e Transferência" },
      { name: "Mensagens", description: "Envio de Texto e Mídia (Documentos, Imagens, Áudios)" },
      { name: "Clientes", description: "Cadastro de clientes e perfil estendido" },
      { name: "CRM", description: "Negociações, Estágios do Kanban e Itens" },
      { name: "Automação", description: "Idempotência e regras determinísticas de automação" },
      { name: "Tags", description: "Etiquetas do sistema" },
      { name: "Produtos", description: "Catálogo de produtos" },
    ],
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wchat_<secret>",
          description: "Chave de API do tenant (prefixo wchat_)",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
        SendMessageRequest: {
          type: "object",
          properties: {
            text: { type: "string", description: "Corpo ou legenda da mensagem" },
            message_type: {
              type: "string",
              enum: ["text", "image", "document", "audio", "video"],
              default: "text",
              description: "Tipo da mensagem",
            },
            media_url: { type: "string", description: "URL da mídia (obrigatório se message_type != text)" },
            file_name: { type: "string", description: "Nome do arquivo anexo (ex: contrato.pdf)" },
            chat_id: { type: "string", format: "uuid" },
            phone: { type: "string", example: "5511999999999" },
            remote_jid: { type: "string", example: "5511999999999@s.whatsapp.net" },
            instance_id: { type: "string", format: "uuid", description: "Opcional; usa instância padrão" },
            event_type: { type: "string", description: "Tipo estável do efeito para auditoria." },
            idempotency_key: {
              type: "string",
              description: "Chave única. Repetições concluídas não enviam outra mensagem.",
            },
          },
        },
        SendMessageResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            chat_id: { type: "string", format: "uuid" },
            message_id: { type: "string", format: "uuid" },
            remote_jid: { type: "string" },
            message_type: { type: "string" },
            deduplicated: { type: "boolean" },
          },
        },
        TransferChatRequest: {
          type: "object",
          properties: {
            assignee_id: { type: "string", format: "uuid", description: "ID do atendente/colaborador" },
            status: { type: "string", default: "open", description: "Status da conversa (open, waiting, closed)" },
            ai_mode: { type: "string", default: "off", description: "Modo IA (off, handoff, auto)" },
          },
        },
        CustomerCreate: {
          type: "object",
          required: ["nome"],
          properties: {
            nome: { type: "string" },
            telefone: { type: "string" },
            phone: { type: "string", description: "Alias de telefone" },
            email: { type: "string" },
            perfil: { type: "string" },
            rota: { type: "string" },
            cidade: { type: "string" },
            codigo: { type: "string" },
            origem: { type: "string", default: "api" },
            custom_fields: { type: "object", description: "Objeto com campos customizados do lead" },
          },
        },
        CustomerPatch: {
          type: "object",
          properties: {
            nome: { type: "string" },
            telefone: { type: "string" },
            email: { type: "string" },
            perfil: { type: "string" },
            cidade: { type: "string" },
            rota: { type: "string" },
            status: { type: "string" },
            ativo: { type: "boolean" },
            opt_out: { type: "boolean" },
            opt_out_at: { type: "string", format: "date-time" },
            custom_fields: { type: "object", description: "Campos customizados estendidos do lead" },
          },
        },
        CustomerCustomFieldsUpsert: {
          type: "object",
          required: ["values"],
          properties: {
            values: {
              type: "object",
              additionalProperties: true,
              description: "Mapa nome do campo personalizado → valor.",
            },
          },
        },
        NegotiationCreate: {
          type: "object",
          required: ["title", "funnel_id", "stage_id"],
          properties: {
            title: { type: "string" },
            funnel_id: { type: "string" },
            stage_id: { type: "string" },
            customer_id: { type: "string", format: "uuid" },
            assignee_id: { type: "string", format: "uuid" },
            status: { type: "string", default: "em_andamento" },
            total_value: { type: "number" },
          },
        },
        NegotiationPatch: {
          type: "object",
          properties: {
            title: { type: "string" },
            funnel_id: { type: "string" },
            stage_id: { type: "string" },
            status: { type: "string" },
            assignee_id: { type: "string", format: "uuid" },
            total_value: { type: "number" },
            qualification: { type: "number" },
            next_task_at: { type: "string", format: "date-time" },
            lost_reason: { type: "string" },
            transition_event: {
              type: "string",
              description: "Evento de negócio que originou a solicitação de transição.",
            },
            transition_reason: {
              type: "string",
              description: "Fato confirmado que justifica a mudança de etapa.",
            },
            event_type: { type: "string" },
            idempotency_key: { type: "string" },
          },
        },
        CrmTaskCreate: {
          type: "object",
          required: ["title"],
          properties: {
            negotiation_id: { type: "string", format: "uuid" },
            customer_id: { type: "string", format: "uuid" },
            title: { type: "string" },
            due_at: { type: "string", format: "date-time" },
            notes: { type: "string" },
            template_id: { type: "string", format: "uuid" },
            event_type: { type: "string" },
            idempotency_key: {
              type: "string",
              description: "Impede a criação repetida da mesma tarefa.",
            },
          },
        },
        AutomationEventRequest: {
          type: "object",
          required: ["event_type", "idempotency_key"],
          properties: {
            event_type: { type: "string" },
            idempotency_key: { type: "string", maxLength: 500 },
            lease_seconds: { type: "integer", minimum: 30, maximum: 3600 },
            metadata: { type: "object", additionalProperties: true },
            resource_type: { type: "string" },
            resource_id: { type: "string" },
            result: { type: "object", additionalProperties: true },
          },
        },
        QualificationFacts: {
          type: "object",
          properties: {
            benefit: { type: "string", description: "Benefício recebido pelo titular." },
            pays_ir: { type: "string", description: "Situação do desconto ou pagamento de IR." },
            health: { type: "string", description: "Condição de saúde informada." },
            contact_role: { type: "string", description: "Titular, familiar responsável ou representante." },
            authorization: { type: "string", description: "Situação da autorização do titular." },
          },
        },
        QualificationEvaluationRequest: {
          type: "object",
          properties: {
            negotiation_id: { type: "string", format: "uuid" },
            customer_id: { type: "string", format: "uuid" },
            apply: { type: "boolean", default: true },
            dry_run: { type: "boolean", default: false },
            facts: {
              $ref: "#/components/schemas/QualificationFacts",
              description: "Aceito somente em dry run para testar a matriz sem alterar o CRM.",
            },
            event_type: { type: "string" },
            idempotency_key: { type: "string" },
          },
        },
        HumanHandoffRequest: {
          type: "object",
          required: ["negotiation_id", "idempotency_key"],
          properties: {
            negotiation_id: { type: "string", format: "uuid" },
            assignee_id: {
              type: "string",
              format: "uuid",
              description: "Opcional. Sem ele, preserva o responsável atual ou seleciona um colaborador ativo.",
            },
            reason: { type: "string", description: "Motivo factual do encaminhamento." },
            next_action: { type: "string", description: "Próxima ação recomendada ao especialista." },
            due_hours: {
              type: "number",
              minimum: 0.25,
              maximum: 168,
              default: 2,
              description: "SLA da tarefa, em horas.",
            },
            source_message_id: { type: "string" },
            event_type: { type: "string", default: "human_handoff_created" },
            idempotency_key: { type: "string" },
          },
        },
        TagAssignRequest: {
          type: "object",
          required: ["entity_id", "tag_name"],
          properties: {
            entity_type: { type: "string", default: "whatsapp_chat", description: "whatsapp_chat, customer ou negotiation" },
            entity_id: { type: "string", format: "uuid" },
            tag_name: { type: "string", example: "VIP" },
          },
        },
        AddNegotiationItemRequest: {
          type: "object",
          required: ["product_id"],
          properties: {
            product_id: { type: "string", format: "uuid" },
            quantity: { type: "number", default: 1 },
            unit_price: { type: "number" },
          },
        },
      },
    },
    security: [{ bearerApiKey: [] }],
    paths: {
      "/v1/health": {
        get: {
          tags: ["Sistema"],
          summary: "Health check",
          description: "Público sem chave; com Bearer retorna também o tenant autenticado.",
          security: [],
          responses: {
            "200": { description: "OK" },
          },
        },
      },
      "/v1/me": {
        get: {
          tags: ["Sistema"],
          summary: "Tenant e chave atual",
          responses: { "200": { description: "OK" }, "401": { description: "Não autorizado" } },
        },
      },
      "/v1/collaborators": {
        get: {
          tags: ["Sistema"],
          summary: "Listar colaboradores/atendentes",
          description: "Retorna a lista de usuários ativos do tenant para atribuição de chat/negociação.",
          responses: { "200": { description: "Lista em `data`" } },
        },
      },
      "/v1/chats": {
        get: {
          tags: ["Chats"],
          summary: "Listar conversas",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Lista em `data`" } },
        },
      },
      "/v1/chats/{chatId}": {
        get: {
          tags: ["Chats"],
          summary: "Detalhe da conversa",
          parameters: [{ name: "chatId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Não encontrado" } },
        },
      },
      "/v1/chats/{chatId}/transfer": {
        post: {
          tags: ["Chats"],
          summary: "Transferir atendimento",
          description: "Atribui o chat a um atendente específico ou fila, atualizando status e modo IA.",
          parameters: [{ name: "chatId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TransferChatRequest" } },
            },
          },
          responses: { "200": { description: "Chat transferido com sucesso" } },
        },
      },
      "/v1/messages/send": {
        post: {
          tags: ["Mensagens"],
          summary: "Enviar mensagem (Texto ou Mídia)",
          description: "Envia mensagem de texto ou mídia (PDF, Imagem, Áudio) para a conversa.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SendMessageRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Enviada",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SendMessageResponse" },
                },
              },
            },
            "400": { description: "Payload inválido" },
            "404": { description: "Chat não encontrado" },
          },
        },
      },
      "/v1/automation/events/claim": {
        post: {
          tags: ["Automação"],
          summary: "Reservar efeito idempotente",
          description:
            "Reserva uma chave antes do efeito externo. Retorna `deduplicated: true` se o evento já estiver processando ou concluído.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AutomationEventRequest" } },
            },
          },
          responses: { "200": { description: "Evento reservado ou deduplicado" } },
        },
      },
      "/v1/automation/events/complete": {
        post: {
          tags: ["Automação"],
          summary: "Concluir efeito idempotente",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AutomationEventRequest" } },
            },
          },
          responses: { "200": { description: "Evento concluído" } },
        },
      },
      "/v1/automation/events/fail": {
        post: {
          tags: ["Automação"],
          summary: "Liberar evento para nova tentativa",
          description: "Marca o efeito como falho. A próxima reserva poderá executá-lo novamente.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AutomationEventRequest" } },
            },
          },
          responses: { "200": { description: "Evento marcado como falho" } },
        },
      },
      "/v1/crm/qualification/evaluate": {
        post: {
          tags: ["Automação", "CRM"],
          summary: "Avaliar qualificação por regras determinísticas",
          description:
            "Lê os fatos confirmados no perfil do lead, calcula a classificação e aplica etapa, pontuação, temperatura e próximo passo. A IA não escolhe a etapa. Estados avançados e terminais são preservados contra regressão.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/QualificationEvaluationRequest" },
              },
            },
          },
          responses: {
            "200": { description: "Decisão calculada e, quando permitido, aplicada" },
            "400": { description: "Payload inválido ou negociação ausente" },
            "404": { description: "Negociação não encontrada" },
          },
        },
      },
      "/v1/crm/handoffs": {
        post: {
          tags: ["Automação", "CRM"],
          summary: "Criar handoff humano completo",
          description:
            "Em uma única transação, cria uma tarefa com SLA, atribui responsável, move o card para Análise Humana, desliga a IA no chat e grava no lead o dossiê com resumo, critérios, documentos, pendências, última mensagem e próxima ação.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HumanHandoffRequest" },
              },
            },
          },
          responses: {
            "201": { description: "Handoff e tarefa criados" },
            "200": { description: "Evento repetido deduplicado" },
            "400": { description: "Payload ou dados do lead inválidos" },
            "404": { description: "Negociação não encontrada" },
            "409": { description: "Estado terminal ou transição bloqueada" },
          },
        },
      },
      "/v1/customers": {
        get: {
          tags: ["Clientes"],
          summary: "Listar clientes",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
            { name: "q", in: "query", schema: { type: "string" }, description: "Busca em nome, telefone, e-mail" },
          ],
          responses: { "200": { description: "Lista em `data`" } },
        },
        post: {
          tags: ["Clientes"],
          summary: "Criar cliente",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CustomerCreate" } },
            },
          },
          responses: { "201": { description: "Criado" } },
        },
      },
      "/v1/customers/{customerId}": {
        get: {
          tags: ["Clientes"],
          summary: "Obter cliente",
          parameters: [
            { name: "customerId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "OK" }, "404": { description: "Não encontrado" } },
        },
        patch: {
          tags: ["Clientes"],
          summary: "Atualizar cliente e campos customizados",
          parameters: [
            { name: "customerId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CustomerPatch" } },
            },
          },
          responses: { "200": { description: "Atualizado" } },
        },
      },
      "/v1/customers/{customerId}/custom-fields": {
        post: {
          tags: ["Clientes"],
          summary: "Preencher campos personalizados do cliente",
          parameters: [
            { name: "customerId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CustomerCustomFieldsUpsert" } },
            },
          },
          responses: {
            "200": { description: "Campos preenchidos" },
            "400": { description: "Campos inválidos ou não encontrados" },
            "404": { description: "Cliente não encontrado" },
          },
        },
      },
      "/v1/crm/stages": {
        get: {
          tags: ["CRM"],
          summary: "Listar estágios do Kanban",
          description: "Retorna todos os estágios do funil cadastrados no tenant.",
          responses: { "200": { description: "Lista de estágios em `data`" } },
        },
      },
      "/v1/crm/negotiations": {
        get: {
          tags: ["CRM"],
          summary: "Listar negociações",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer" } },
            { name: "customer_id", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: { "200": { description: "Lista em `data`" } },
        },
        post: {
          tags: ["CRM"],
          summary: "Criar negociação",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/NegotiationCreate" } },
            },
          },
          responses: { "201": { description: "Criada" } },
        },
      },
      "/v1/crm/tasks": {
        post: {
          tags: ["CRM"],
          summary: "Criar tarefa de CRM",
          description: "Cria uma tarefa vinculada a uma negociação ou cliente do tenant.",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CrmTaskCreate" } },
            },
          },
          responses: {
            "201": { description: "Tarefa criada" },
            "400": { description: "Dados inválidos ou referência fora do tenant" },
          },
        },
      },
      "/v1/crm/negotiations/{negotiationId}": {
        patch: {
          tags: ["CRM"],
          summary: "Atualizar negociação",
          description:
            "Atualiza a negociação. Mudanças de estágio são validadas pela máquina de estados do Caleo; saltos não permitidos retornam 409 e informam as próximas etapas autorizadas.",
          parameters: [
            { name: "negotiationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/NegotiationPatch" } },
            },
          },
          responses: {
            "200": { description: "Atualizada, com a transição e o novo estado em `transition` e `state`." },
            "409": { description: "Transição bloqueada pela máquina de estados." },
          },
        },
      },
      "/v1/crm/negotiations/{negotiationId}/items": {
        post: {
          tags: ["CRM"],
          summary: "Adicionar produto à negociação",
          parameters: [
            { name: "negotiationId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AddNegotiationItemRequest" } },
            },
          },
          responses: { "201": { description: "Item adicionado" } },
        },
      },
      "/v1/tags": {
        get: {
          tags: ["Tags"],
          summary: "Listar tags do tenant",
          responses: { "200": { description: "Lista em `data`" } },
        },
      },
      "/v1/tags/assign": {
        post: {
          tags: ["Tags"],
          summary: "Vincular tag a um chat ou cliente",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TagAssignRequest" } },
            },
          },
          responses: { "200": { description: "Tag vinculada com sucesso" } },
        },
      },
      "/v1/products": {
        get: {
          tags: ["Produtos"],
          summary: "Listar catálogo de produtos",
          responses: { "200": { description: "Lista em `data`" } },
        },
      },
    },
  };
}
