// Tipos compartilhados das automacoes de marketing (Fase 0 do plano completo).
// Detalhes especificos por action (config schemas) entram nas fases seguintes.

export const MARKETING_FLOW_STATUSES = [
  "rascunho",
  "ativo",
  "pausado",
  "arquivado",
] as const;
export type MarketingFlowStatus = (typeof MARKETING_FLOW_STATUSES)[number];

export function isMarketingFlowStatus(value: unknown): value is MarketingFlowStatus {
  return (
    typeof value === "string" &&
    (MARKETING_FLOW_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------- Gatilhos

export const MARKETING_FLOW_TRIGGER_TYPES = [
  "manual",
  "whatsapp_message_received",
  "chat_assigned",
  "ai_paused",
  "ai_resumed",
  "form_submitted",
  "tag_added",
  "tag_removed",
  "negotiation_created",
  "negotiation_stage_changed",
  "webhook_received",
] as const;
export type MarketingFlowTriggerType = (typeof MARKETING_FLOW_TRIGGER_TYPES)[number];

export const MARKETING_FLOW_TRIGGER_LABELS: Record<MarketingFlowTriggerType, string> = {
  manual: "Manual",
  whatsapp_message_received: "Mensagem recebida no WhatsApp",
  chat_assigned: "Conversa atribuída",
  ai_paused: "IA pausada",
  ai_resumed: "IA retomada",
  form_submitted: "Formulário enviado",
  tag_added: "Etiqueta adicionada",
  tag_removed: "Etiqueta removida",
  negotiation_created: "Negociação criada",
  negotiation_stage_changed: "Etapa do CRM alterada",
  webhook_received: "Evento externo recebido",
};

export type MarketingFlowTrigger = {
  type: MarketingFlowTriggerType;
  config?: Record<string, unknown>;
};

export function isMarketingFlowTriggerType(
  value: unknown,
): value is MarketingFlowTriggerType {
  return (
    typeof value === "string" &&
    (MARKETING_FLOW_TRIGGER_TYPES as readonly string[]).includes(value)
  );
}

/** Resolve o rótulo de um gatilho a partir do `trigger.type` (jsonb solto). */
export function triggerLabelFromValue(value: unknown): string {
  return isMarketingFlowTriggerType(value)
    ? MARKETING_FLOW_TRIGGER_LABELS[value]
    : "Sem gatilho";
}

// ---------------------------------------------------------------- Executores

/**
 * actionIds que o worker realmente executa (switch de executeStep em
 * supabase/functions/marketing-flow-worker/index.ts). Os demais actionIds de
 * flow-actions.ts existem no editor mas ainda nao tem executor — usar num fluxo
 * publicado faria o passo falhar. Mantenha esta lista em sincronia com o worker.
 */
export const MARKETING_FLOW_EXECUTABLE_ACTIONS = [
  "espera",
  "webhook",
  "criar-tarefa-negociacao",
  "adicionar-tags",
  "remover-tag",
  "whatsapp",
  "email",
  "criar-negociacao",
  "mover-negociacao",
  "dividir-caminho",
  "dividir-por-segmentacao",
  "adicionar-leads-outros-fluxos",
  "remover-leads-outros-fluxos",
  "teste-ab",
  "esperar-condicao",
  "mensagem-inteligente",
  "unir-caminho",
  "definir-variavel",
  "atualizar-nome-negociacao",
  "atualizar-status",
  "definir-qualificacao",
  "adicionar-anotacao",
  "marcar-venda",
  "classificar-ia",
  "suprimir-canal",
  "transferir-humano",
] as const;
export type MarketingFlowExecutableAction =
  (typeof MARKETING_FLOW_EXECUTABLE_ACTIONS)[number];

/** Indica se a acao tem executor no worker (pode rodar em um fluxo publicado). */
export function isExecutableMarketingFlowAction(actionId: string): boolean {
  return (MARKETING_FLOW_EXECUTABLE_ACTIONS as readonly string[]).includes(actionId);
}

// ---------------------------------------------------------------- Criterios

export const MARKETING_FLOW_CRITERIA_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "greater_than",
  "less_than",
  "before",
  "after",
  "between",
  "in",
  "not_in",
] as const;
export type MarketingFlowCriteriaOperator =
  (typeof MARKETING_FLOW_CRITERIA_OPERATORS)[number];

export type MarketingFlowCriteriaCondition = {
  field: string;
  operator: MarketingFlowCriteriaOperator;
  value?: unknown;
};

export type MarketingFlowCriteriaGroup = {
  combinator: "and" | "or";
  conditions: (MarketingFlowCriteriaCondition | MarketingFlowCriteriaGroup)[];
};

/**
 * Formato do `criteria` jsonb. `group` e a forma estruturada nova; `conditions`
 * (string[]) e o legado simples mantido para compatibilidade com fluxos ja
 * criados antes da Fase 1.
 */
export type MarketingFlowCriteria = {
  group?: MarketingFlowCriteriaGroup;
  conditions?: string[];
};

// ---------------------------------------------------------------- Definicao

export const MARKETING_FLOW_SUBTITLE_VARIANTS = [
  "plain",
  "primary",
  "chip",
  "multiline",
] as const;
export type MarketingFlowSubtitleVariant =
  (typeof MARKETING_FLOW_SUBTITLE_VARIANTS)[number];

export type MarketingFlowStep = {
  id: string;
  actionId: string;
  label: string;
  iconKey: string;
  iconClass: string;
  subtitle?: string;
  subtitleVariant?: MarketingFlowSubtitleVariant;
  /** Configuracao estruturada da action (schema vem nas fases 2+). */
  config?: Record<string, unknown>;
};

export type MarketingFlowSettings = {
  allowReentry?: boolean;
  autoAbandonDays?: number | null;
};

/** Aresta dirigida do grafo (format >= 2). `branch` rotula a saida. */
export type MarketingFlowEdge = {
  from: string;
  to: string;
  branch?: string;
};

export type MarketingFlowDefinition = {
  steps: MarketingFlowStep[];
  /** Arestas explicitas do grafo. Presente em fluxos format >= 2. */
  edges?: MarketingFlowEdge[];
  /** Versao do formato da definicao. >= 2 = grafo com arestas explicitas. */
  format?: number;
  settings?: MarketingFlowSettings;
  exitConditions?: string[];
};

// ---------------------------------------------------------------- Execucao

export const MARKETING_FLOW_PARTICIPANT_STATUSES = [
  "active",
  "waiting",
  "completed",
  "exited",
  "failed",
  "paused",
] as const;
export type MarketingFlowParticipantStatus =
  (typeof MARKETING_FLOW_PARTICIPANT_STATUSES)[number];

export const MARKETING_FLOW_JOB_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "dead",
] as const;
export type MarketingFlowJobStatus = (typeof MARKETING_FLOW_JOB_STATUSES)[number];

export const MARKETING_FLOW_EVENT_TYPES = [
  "flow_entered",
  "step_started",
  "step_completed",
  "step_waiting",
  "step_failed",
  "retry_scheduled",
  "participant_exited",
  "participant_completed",
  "manual_pause",
  "manual_resume",
] as const;
export type MarketingFlowEventType = (typeof MARKETING_FLOW_EVENT_TYPES)[number];

export const MARKETING_FLOW_SUPPRESSION_CHANNELS = [
  "whatsapp",
  "email",
  "sms",
  "all",
] as const;
export type MarketingFlowSuppressionChannel =
  (typeof MARKETING_FLOW_SUPPRESSION_CHANNELS)[number];
