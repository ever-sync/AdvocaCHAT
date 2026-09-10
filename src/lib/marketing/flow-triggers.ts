import {
  MARKETING_FLOW_TRIGGER_LABELS,
  type MarketingFlowTriggerType,
} from "@/lib/marketing/flow-types";

export type MarketingTriggerCategory =
  | "manual"
  | "whatsapp"
  | "forms"
  | "tags"
  | "crm"
  | "ai"
  | "integrations";

export type MarketingTriggerFieldKind =
  | "text"
  | "textarea"
  | "select"
  | "multi-text";

export type MarketingTriggerOption = {
  value: string;
  label: string;
};

export type MarketingTriggerConfigField = {
  id: string;
  label: string;
  kind: MarketingTriggerFieldKind;
  placeholder?: string;
  helper?: string;
  options?: MarketingTriggerOption[];
};

export type MarketingTriggerConditionField = {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "date";
  operators: MarketingTriggerConditionOperator[];
};

export const MARKETING_TRIGGER_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "exists",
  "not_exists",
  "greater_than",
  "less_than",
] as const;

export type MarketingTriggerConditionOperator =
  (typeof MARKETING_TRIGGER_CONDITION_OPERATORS)[number];

export type MarketingTriggerCondition = {
  id: string;
  field: string;
  operator: MarketingTriggerConditionOperator;
  value?: string;
};

export type MarketingTriggerConfig = {
  [key: string]: unknown;
  conditions?: MarketingTriggerCondition[];
};

export type MarketingTriggerDefinition = {
  type: MarketingFlowTriggerType;
  category: MarketingTriggerCategory;
  label: string;
  description: string;
  scopes: MarketingTriggerConfigField[];
  filters: MarketingTriggerConfigField[];
  conditionFields: MarketingTriggerConditionField[];
  payload: string[];
  examples: string[];
};

export const MARKETING_TRIGGER_CATEGORY_LABEL: Record<MarketingTriggerCategory, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  forms: "Formulários",
  tags: "Etiquetas",
  crm: "CRM",
  ai: "IA",
  integrations: "Integrações",
};

export const MARKETING_TRIGGER_OPERATOR_LABEL: Record<MarketingTriggerConditionOperator, string> = {
  equals: "é igual a",
  not_equals: "não é igual a",
  contains: "contém",
  not_contains: "não contém",
  starts_with: "começa com",
  ends_with: "termina com",
  exists: "existe",
  not_exists: "não existe",
  greater_than: "maior que",
  less_than: "menor que",
};

const SENDER_OPTIONS: MarketingTriggerOption[] = [
  { value: "customer", label: "Cliente" },
  { value: "agent", label: "Atendente" },
  { value: "ai", label: "IA" },
  { value: "system", label: "Sistema" },
  { value: "any", label: "Qualquer origem" },
];

const MATCH_MODE_OPTIONS: MarketingTriggerOption[] = [
  { value: "any", label: "Qualquer palavra" },
  { value: "all", label: "Todas as palavras" },
  { value: "exact", label: "Texto exato" },
];

const MEDIA_OPTIONS: MarketingTriggerOption[] = [
  { value: "any", label: "Qualquer mensagem" },
  { value: "text", label: "Somente texto" },
  { value: "audio", label: "Áudio" },
  { value: "image", label: "Imagem" },
  { value: "document", label: "Documento" },
  { value: "video", label: "Vídeo" },
];

const BOOLEAN_OPTIONS: MarketingTriggerOption[] = [
  { value: "any", label: "Tanto faz" },
  { value: "true", label: "Sim" },
  { value: "false", label: "Não" },
];

export const MARKETING_TRIGGER_DEFINITIONS: MarketingTriggerDefinition[] = [
  {
    type: "manual",
    category: "manual",
    label: MARKETING_FLOW_TRIGGER_LABELS.manual,
    description: "Inicia somente quando um lead é adicionado manualmente ou por outro fluxo.",
    scopes: [],
    filters: [],
    conditionFields: [
      { id: "customer.name", label: "Nome do cliente", type: "text", operators: ["contains", "equals", "exists"] },
      { id: "customer.phone", label: "Telefone", type: "text", operators: ["contains", "equals", "exists"] },
    ],
    payload: ["customer.id", "customer.name", "customer.phone", "source.flowId"],
    examples: ["Adicionar leads selecionados em massa", "Mover lead de outro fluxo para este"],
  },
  {
    type: "whatsapp_message_received",
    category: "whatsapp",
    label: MARKETING_FLOW_TRIGGER_LABELS.whatsapp_message_received,
    description: "Dispara quando uma mensagem entra ou é registrada na conversa.",
    scopes: [
      {
        id: "instanceIds",
        label: "Instâncias do WhatsApp",
        kind: "multi-text",
        placeholder: "ID ou nome da instância",
        helper: "Deixe vazio para ouvir todas as instâncias.",
      },
    ],
    filters: [
      {
        id: "senderType",
        label: "Quem enviou",
        kind: "select",
        options: SENDER_OPTIONS,
      },
      {
        id: "messageType",
        label: "Tipo de mensagem",
        kind: "select",
        options: MEDIA_OPTIONS,
      },
      {
        id: "keywords",
        label: "Palavras-chave",
        kind: "multi-text",
        placeholder: "laudo, preço, documento",
        helper: "Use para disparar apenas quando a conversa tocar em certos assuntos.",
      },
      {
        id: "keywordMatchMode",
        label: "Como comparar palavras",
        kind: "select",
        options: MATCH_MODE_OPTIONS,
      },
      {
        id: "onlyUnassigned",
        label: "Conversa sem atendente",
        kind: "select",
        options: BOOLEAN_OPTIONS,
      },
      {
        id: "aiState",
        label: "Estado da IA",
        kind: "select",
        options: [
          { value: "any", label: "Tanto faz" },
          { value: "active", label: "IA ativa" },
          { value: "paused", label: "IA pausada" },
          { value: "handoff", label: "Com humano" },
        ],
      },
    ],
    conditionFields: [
      { id: "message.text", label: "Texto da mensagem", type: "text", operators: ["contains", "not_contains", "equals", "starts_with", "ends_with", "exists"] },
      { id: "message.type", label: "Tipo de mídia", type: "text", operators: ["equals", "not_equals", "exists"] },
      { id: "message.senderType", label: "Origem da mensagem", type: "text", operators: ["equals", "not_equals"] },
      { id: "chat.unreadCount", label: "Não lidas", type: "number", operators: ["greater_than", "less_than", "equals"] },
      { id: "chat.assigneeId", label: "Atendente", type: "text", operators: ["exists", "not_exists", "equals"] },
      { id: "customer.tags", label: "Etiquetas do cliente", type: "text", operators: ["contains", "not_contains"] },
    ],
    payload: ["message.id", "message.text", "message.type", "message.senderType", "chat.id", "customer.id", "instance.id"],
    examples: ["Cliente escreveu 'laudo'", "Atendente respondeu", "IA enviou uma mensagem", "Cliente mandou áudio"],
  },
  {
    type: "chat_assigned",
    category: "whatsapp",
    label: MARKETING_FLOW_TRIGGER_LABELS.chat_assigned,
    description: "Dispara quando uma conversa é assumida ou atribuída a um atendente.",
    scopes: [
      { id: "assigneeIds", label: "Atendentes", kind: "multi-text", placeholder: "ID ou nome do atendente" },
      { id: "instanceIds", label: "Instâncias", kind: "multi-text", placeholder: "ID ou nome da instância" },
    ],
    filters: [
      {
        id: "assignmentMode",
        label: "Tipo de atribuição",
        kind: "select",
        options: [
          { value: "any", label: "Qualquer atribuição" },
          { value: "manual", label: "Manual" },
          { value: "pool", label: "Saindo do pool" },
          { value: "automation", label: "Por automação" },
        ],
      },
    ],
    conditionFields: [
      { id: "chat.assigneeId", label: "Atendente", type: "text", operators: ["equals", "exists"] },
      { id: "chat.previousAssigneeId", label: "Atendente anterior", type: "text", operators: ["equals", "not_exists"] },
      { id: "customer.tags", label: "Etiquetas", type: "text", operators: ["contains", "not_contains"] },
    ],
    payload: ["chat.id", "chat.assigneeId", "chat.previousAssigneeId", "customer.id"],
    examples: ["Quando o atendente assumir a conversa", "Quando sair do pool"],
  },
  {
    type: "ai_paused",
    category: "ai",
    label: MARKETING_FLOW_TRIGGER_LABELS.ai_paused,
    description: "Dispara quando a IA é pausada por atendente, regra ou automação.",
    scopes: [{ id: "instanceIds", label: "Instâncias", kind: "multi-text", placeholder: "ID ou nome da instância" }],
    filters: [
      {
        id: "pausedBy",
        label: "Pausada por",
        kind: "select",
        options: [
          { value: "any", label: "Qualquer origem" },
          { value: "agent", label: "Atendente" },
          { value: "automation", label: "Automação" },
          { value: "system", label: "Sistema" },
        ],
      },
    ],
    conditionFields: [
      { id: "ai.pausedBy", label: "Pausada por", type: "text", operators: ["equals", "not_equals"] },
      { id: "chat.assigneeId", label: "Atendente", type: "text", operators: ["exists", "equals"] },
    ],
    payload: ["ai.mode", "ai.pausedBy", "chat.id", "customer.id"],
    examples: ["Humano assumiu e pausou a IA", "Fluxo pausou a IA antes do handoff"],
  },
  {
    type: "ai_resumed",
    category: "ai",
    label: MARKETING_FLOW_TRIGGER_LABELS.ai_resumed,
    description: "Dispara quando a IA volta a responder em uma conversa.",
    scopes: [{ id: "instanceIds", label: "Instâncias", kind: "multi-text", placeholder: "ID ou nome da instância" }],
    filters: [
      {
        id: "resumedBy",
        label: "Retomada por",
        kind: "select",
        options: [
          { value: "any", label: "Qualquer origem" },
          { value: "agent", label: "Atendente" },
          { value: "automation", label: "Automação" },
          { value: "system", label: "Sistema" },
        ],
      },
    ],
    conditionFields: [
      { id: "ai.resumedBy", label: "Retomada por", type: "text", operators: ["equals", "not_equals"] },
      { id: "chat.lastHumanMessageAt", label: "Última mensagem humana", type: "date", operators: ["exists", "not_exists"] },
    ],
    payload: ["ai.mode", "ai.resumedBy", "chat.id", "customer.id"],
    examples: ["IA voltou após X minutos", "Atendente devolveu para automação"],
  },
  {
    type: "form_submitted",
    category: "forms",
    label: MARKETING_FLOW_TRIGGER_LABELS.form_submitted,
    description: "Dispara quando um formulário de marketing é enviado.",
    scopes: [
      {
        id: "formIds",
        label: "Formulários",
        kind: "multi-text",
        placeholder: "ID ou nome do formulário",
        helper: "Deixe vazio para qualquer formulário.",
      },
    ],
    filters: [
      { id: "fieldName", label: "Campo do formulário", kind: "text", placeholder: "beneficio, cidade, origem" },
      { id: "fieldValue", label: "Valor esperado", kind: "text", placeholder: "INSS, SP, campanha-x" },
      {
        id: "leadMode",
        label: "Tipo de lead",
        kind: "select",
        options: [
          { value: "any", label: "Novo ou existente" },
          { value: "new", label: "Lead novo" },
          { value: "existing", label: "Lead existente" },
        ],
      },
    ],
    conditionFields: [
      { id: "form.id", label: "Formulário", type: "text", operators: ["equals", "contains"] },
      { id: "form.source", label: "Origem", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "fields.beneficio", label: "Campo benefício", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "fields.cidade", label: "Campo cidade", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "lead.isNew", label: "Lead novo", type: "boolean", operators: ["equals"] },
    ],
    payload: ["form.id", "form.name", "fields.*", "lead.id", "customer.id", "campaign.source"],
    examples: ["Formulário de orçamento enviado", "Campo benefício contém INSS", "Origem é Google Ads"],
  },
  {
    type: "tag_added",
    category: "tags",
    label: MARKETING_FLOW_TRIGGER_LABELS.tag_added,
    description: "Dispara quando uma etiqueta é vinculada a um cliente.",
    scopes: [
      {
        id: "tagIds",
        label: "Etiquetas",
        kind: "multi-text",
        placeholder: "ID ou nome da etiqueta",
        helper: "Use uma ou várias etiquetas para segmentar o disparo.",
      },
    ],
    filters: [
      {
        id: "tagMatchMode",
        label: "Como comparar",
        kind: "select",
        options: [
          { value: "any", label: "Qualquer etiqueta" },
          { value: "all", label: "Todas as etiquetas" },
        ],
      },
      { id: "customerHasTags", label: "Cliente também possui", kind: "multi-text", placeholder: "vip, lead quente" },
    ],
    conditionFields: [
      { id: "tag.name", label: "Nome da etiqueta", type: "text", operators: ["equals", "contains"] },
      { id: "tag.group", label: "Grupo da etiqueta", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "customer.tags", label: "Etiquetas do cliente", type: "text", operators: ["contains", "not_contains"] },
    ],
    payload: ["tag.id", "tag.name", "tag.group", "customer.id", "customer.tags"],
    examples: ["Etiqueta Lead quente aplicada", "Etiqueta Documentação enviada vinculada"],
  },
  {
    type: "tag_removed",
    category: "tags",
    label: MARKETING_FLOW_TRIGGER_LABELS.tag_removed,
    description: "Dispara quando uma etiqueta é removida de um cliente.",
    scopes: [
      {
        id: "tagIds",
        label: "Etiquetas",
        kind: "multi-text",
        placeholder: "ID ou nome da etiqueta",
        helper: "Use uma ou várias etiquetas para segmentar a saída da regra.",
      },
    ],
    filters: [
      {
        id: "tagMatchMode",
        label: "Como comparar",
        kind: "select",
        options: [
          { value: "any", label: "Qualquer etiqueta" },
          { value: "all", label: "Todas as etiquetas" },
        ],
      },
      { id: "customerHadTags", label: "Cliente tinha", kind: "multi-text", placeholder: "vip, lead quente" },
    ],
    conditionFields: [
      { id: "tag.name", label: "Nome da etiqueta", type: "text", operators: ["equals", "contains"] },
      { id: "tag.group", label: "Grupo da etiqueta", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "customer.tags", label: "Etiquetas do cliente antes da remoção", type: "text", operators: ["contains", "not_contains"] },
    ],
    payload: ["tag.id", "tag.name", "tag.group", "customer.id", "customer.tags", "customer.previousTags"],
    examples: ["Etiqueta Lead frio removida", "Etiqueta Documentação pendente saiu do cliente"],
  },
  {
    type: "negotiation_created",
    category: "crm",
    label: MARKETING_FLOW_TRIGGER_LABELS.negotiation_created,
    description: "Dispara quando uma negociação nasce no CRM.",
    scopes: [
      { id: "pipelineIds", label: "Pipelines", kind: "multi-text", placeholder: "ID ou nome do pipeline" },
      { id: "stageIds", label: "Etapas iniciais", kind: "multi-text", placeholder: "ID ou nome da etapa" },
    ],
    filters: [
      { id: "ownerIds", label: "Responsáveis", kind: "multi-text", placeholder: "ID ou nome do responsável" },
      { id: "minValue", label: "Valor mínimo", kind: "text", placeholder: "1000" },
    ],
    conditionFields: [
      { id: "negotiation.pipelineId", label: "Pipeline", type: "text", operators: ["equals", "contains"] },
      { id: "negotiation.stageId", label: "Etapa", type: "text", operators: ["equals", "contains"] },
      { id: "negotiation.value", label: "Valor", type: "number", operators: ["greater_than", "less_than", "equals"] },
      { id: "negotiation.ownerId", label: "Responsável", type: "text", operators: ["equals", "exists", "not_exists"] },
    ],
    payload: ["negotiation.id", "negotiation.pipelineId", "negotiation.stageId", "negotiation.value", "customer.id"],
    examples: ["Nova negociação no pipeline Comercial", "Negociação criada acima de R$ 1.000"],
  },
  {
    type: "negotiation_stage_changed",
    category: "crm",
    label: MARKETING_FLOW_TRIGGER_LABELS.negotiation_stage_changed,
    description: "Dispara quando uma negociação muda de etapa dentro de um pipeline.",
    scopes: [
      { id: "pipelineIds", label: "Pipelines", kind: "multi-text", placeholder: "ID ou nome do pipeline" },
      { id: "fromStageIds", label: "Etapas de origem", kind: "multi-text", placeholder: "De onde saiu" },
      { id: "toStageIds", label: "Etapas de destino", kind: "multi-text", placeholder: "Para onde entrou" },
    ],
    filters: [
      { id: "ownerIds", label: "Responsáveis", kind: "multi-text", placeholder: "ID ou nome do responsável" },
      {
        id: "onlyWithoutFutureTask",
        label: "Sem tarefa futura",
        kind: "select",
        options: BOOLEAN_OPTIONS,
      },
    ],
    conditionFields: [
      { id: "negotiation.pipelineId", label: "Pipeline", type: "text", operators: ["equals", "contains"] },
      { id: "negotiation.fromStageId", label: "Etapa anterior", type: "text", operators: ["equals", "not_equals", "exists"] },
      { id: "negotiation.toStageId", label: "Nova etapa", type: "text", operators: ["equals", "not_equals", "exists"] },
      { id: "negotiation.hasFutureTask", label: "Tem tarefa futura", type: "boolean", operators: ["equals"] },
    ],
    payload: ["negotiation.id", "negotiation.fromStageId", "negotiation.toStageId", "negotiation.pipelineId", "customer.id"],
    examples: ["Entrou na etapa Proposta", "Saiu de Aguardando documento", "Mudou para Recuperado"],
  },
  {
    type: "webhook_received",
    category: "integrations",
    label: MARKETING_FLOW_TRIGGER_LABELS.webhook_received,
    description: "Dispara quando um evento externo chega ao CaleoCRM via API key de integração.",
    scopes: [
      {
        id: "sourceSystems",
        label: "Sistemas de origem",
        kind: "multi-text",
        placeholder: "n8n, make, erp",
        helper: "Deixe vazio para aceitar qualquer sistema externo.",
      },
      {
        id: "eventNames",
        label: "Eventos",
        kind: "multi-text",
        placeholder: "deal.created, lead.won",
        helper: "Use para limitar o fluxo a eventos específicos.",
      },
    ],
    filters: [
      {
        id: "customerIds",
        label: "Clientes",
        kind: "multi-text",
        placeholder: "ID do cliente",
      },
      {
        id: "negotiationIds",
        label: "Negociações",
        kind: "multi-text",
        placeholder: "ID da negociação",
      },
      {
        id: "payloadContains",
        label: "Payload contém",
        kind: "text",
        placeholder: "status=paid",
      },
    ],
    conditionFields: [
      { id: "webhook.eventName", label: "Nome do evento", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "webhook.sourceSystem", label: "Sistema de origem", type: "text", operators: ["equals", "contains", "exists"] },
      { id: "webhook.customerId", label: "Cliente", type: "text", operators: ["equals", "exists", "not_exists"] },
      { id: "webhook.negotiationId", label: "Negociação", type: "text", operators: ["equals", "exists", "not_exists"] },
      { id: "webhook.payload", label: "Payload bruto", type: "text", operators: ["contains", "not_contains", "exists"] },
    ],
    payload: [
      "webhook.eventName",
      "webhook.sourceSystem",
      "webhook.customerId",
      "webhook.negotiationId",
      "webhook.payload",
    ],
    examples: [
      "Evento pago.recebido vindo do ERP",
      "Lead criado por webhook do n8n",
      "Pipeline atualizado por integração externa",
    ],
  },
];

export function getMarketingTriggerDefinition(
  type: unknown,
): MarketingTriggerDefinition | null {
  if (typeof type !== "string") return null;
  return MARKETING_TRIGGER_DEFINITIONS.find((trigger) => trigger.type === type) ?? null;
}

export function getMarketingTriggerLabel(type: unknown): string {
  return getMarketingTriggerDefinition(type)?.label ?? "Sem gatilho";
}

export function getMarketingTriggerDescription(type: unknown): string {
  return (
    getMarketingTriggerDefinition(type)?.description ??
    "Selecione uma fonte de entrada e configure quando o fluxo deve começar."
  );
}

export function normalizeTriggerConfig(value: unknown): MarketingTriggerConfig {
  return value && typeof value === "object" ? (value as MarketingTriggerConfig) : {};
}

export function triggerConfigArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function summarizeMarketingTrigger(
  type: unknown,
  configValue: unknown,
): string {
  const trigger = getMarketingTriggerDefinition(type);
  if (!trigger) return "Selecione um gatilho para iniciar o fluxo.";
  const config = normalizeTriggerConfig(configValue);
  const parts: string[] = [];

  for (const field of [...trigger.scopes, ...trigger.filters]) {
    const value = config[field.id];
    if (field.kind === "multi-text") {
      const items = triggerConfigArray(value);
      if (items.length > 0) parts.push(`${field.label}: ${items.slice(0, 3).join(", ")}`);
      continue;
    }
    if (field.kind === "select") {
      const raw = typeof value === "string" ? value : "";
      if (raw && raw !== "any") {
        const label = field.options?.find((option) => option.value === raw)?.label ?? raw;
        parts.push(`${field.label}: ${label}`);
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      parts.push(`${field.label}: ${value.trim()}`);
    }
  }

  const conditions = Array.isArray(config.conditions) ? config.conditions.length : 0;
  if (conditions > 0) parts.push(`${conditions} condição(ões)`);

  return parts.length > 0 ? parts.join(" · ") : trigger.description;
}
