// Configuracoes estruturadas das actions (Fase 2 do plano completo).
// - Tipos por action.
// - validate(config) -> issues (para o validador de fluxo).
// - summarize(config) -> string usada como `subtitle` do card.
// - ACTION_CONFIG_REGISTRY: mapeia actionId -> kind do config (varias actions
//   compartilham o mesmo kind, ex.: 'adicionar-tags' e 'remover-tag' -> 'tag').

import {
  MARKETING_FLOW_SUPPRESSION_CHANNELS,
  type MarketingFlowStep,
  type MarketingFlowSuppressionChannel,
} from "@/lib/marketing/flow-types";
import type { ValidationIssue } from "@/lib/marketing/flow-validation";

// ---------------------------------------------------------------- Types

export type WaitConfig = { days: number; hours: number; minutes: number };

export type WhatsAppConfig = { message: string };

export type EmailConfig = { subject: string; body: string };

export type CreateTaskConfig = {
  title: string;
  description?: string;
  dueDays: number;
};

export type CreateDealConfig = {
  funnelId: string;
  stageId: string;
  title?: string;
};

export type MoveDealConfig = { funnelId: string; stageId: string };

export type TagConfig = { tag: string };

export const WEBHOOK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type WebhookMethod = (typeof WEBHOOK_METHODS)[number];
export type WebhookConfig = {
  url: string;
  method: WebhookMethod;
  headers?: string;
  body?: string;
};

// ---------------------------------------------------------------- Fase 7

export const SPLIT_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "exists",
  "not_exists",
  "greater_than",
  "less_than",
] as const;
export type SplitOperator = (typeof SPLIT_OPERATORS)[number];

export type SplitConfig = {
  field: string;
  operator: SplitOperator;
  value: string;
  trueStepId: string;
  falseStepId: string;
};

export type AddToFlowConfig = { targetFlowId: string };
export type RemoveFromFlowConfig = { targetFlowId: string; reason?: string };

export type ABTestVariant = {
  id: string;
  label?: string;
  weight: number;
  nextStepId: string;
};
export type ABTestConfig = { variants: ABTestVariant[] };

export type WaitUntilConfig = {
  field: string;
  operator: SplitOperator;
  value: string;
  checkIntervalMinutes: number;
  timeoutHours: number;
  alternativeStepId?: string;
};

export type SmartMessageConfig = {
  prompt: string;
  tone?: string;
  maxLength: number;
};

export type SetVariableAssignment = { key: string; value: string };
export type SetVariableConfig = { assignments: SetVariableAssignment[] };

// ---------------------------------------------------------------- Fase 4 (CRM)

export type UpdateDealTitleConfig = { title: string };

// Valores reais da check constraint de crm_negotiations.status.
export const DEAL_STATUS_VALUES = [
  "em_andamento",
  "vendido",
  "perdido",
  "pausado",
  "nao_pausado",
] as const;
export type DealStatus = (typeof DEAL_STATUS_VALUES)[number];
export type UpdateDealStatusConfig = { status: DealStatus; lossReason?: string };

export type AddNoteConfig = { note: string };

/** Estrelas de qualificação da negociação (0–5), espelha crm_negotiations.qualification. */
export type SetQualificationConfig = { qualification: number };

/** Opt-out: insere uma supressão de canal (whatsapp/email/sms/all) para o lead. */
export type SuppressChannelConfig = {
  channel: MarketingFlowSuppressionChannel;
  reason?: string;
};

/** valueCents vazio => mantém o valor atual da negociação. */
export type MarkSaleConfig = { valueCents: string };

// Classificação por IA (Fase 6): ramifica pelo rótulo escolhido pelo Claude.
export type AiClassifyCategory = { label: string; nextStepId: string };
export type AiClassifyConfig = { prompt: string; categories: AiClassifyCategory[] };

export type ActionConfigByKind = {
  wait: WaitConfig;
  whatsapp: WhatsAppConfig;
  email: EmailConfig;
  "create-task": CreateTaskConfig;
  "create-deal": CreateDealConfig;
  "move-deal": MoveDealConfig;
  tag: TagConfig;
  webhook: WebhookConfig;
  split: SplitConfig;
  "add-to-flow": AddToFlowConfig;
  "remove-from-flow": RemoveFromFlowConfig;
  "ab-test": ABTestConfig;
  "wait-until": WaitUntilConfig;
  "smart-message": SmartMessageConfig;
  "set-variable": SetVariableConfig;
  "update-deal-title": UpdateDealTitleConfig;
  "update-deal-status": UpdateDealStatusConfig;
  "set-qualification": SetQualificationConfig;
  "suppress-channel": SuppressChannelConfig;
  "add-note": AddNoteConfig;
  "mark-sale": MarkSaleConfig;
  "ai-classify": AiClassifyConfig;
};

export type ActionConfigKind = keyof ActionConfigByKind;

// ---------------------------------------------------------------- Registry

/**
 * Mapeia actionId (ids do flow-actions.ts) -> kind do config.
 * Actions ausentes daqui continuam editaveis via subtitle/variant livre.
 */
export const ACTION_CONFIG_REGISTRY: Record<string, ActionConfigKind> = {
  espera: "wait",
  whatsapp: "whatsapp",
  email: "email",
  "criar-tarefa-negociacao": "create-task",
  "criar-negociacao": "create-deal",
  "mover-negociacao": "move-deal",
  "adicionar-tags": "tag",
  "remover-tag": "tag",
  webhook: "webhook",
  "dividir-caminho": "split",
  "dividir-por-segmentacao": "split",
  "adicionar-leads-outros-fluxos": "add-to-flow",
  "remover-leads-outros-fluxos": "remove-from-flow",
  "teste-ab": "ab-test",
  "esperar-condicao": "wait-until",
  "mensagem-inteligente": "smart-message",
  "definir-variavel": "set-variable",
  "atualizar-nome-negociacao": "update-deal-title",
  "atualizar-status": "update-deal-status",
  "definir-qualificacao": "set-qualification",
  "suprimir-canal": "suppress-channel",
  "adicionar-anotacao": "add-note",
  "marcar-venda": "mark-sale",
  "classificar-ia": "ai-classify",
};

export function getConfigKind(actionId: string): ActionConfigKind | null {
  return ACTION_CONFIG_REGISTRY[actionId] ?? null;
}

// ---------------------------------------------------------------- Parsers

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isWebhookMethod(value: unknown): value is WebhookMethod {
  return (
    typeof value === "string" &&
    (WEBHOOK_METHODS as readonly string[]).includes(value)
  );
}

export function parseConfig<K extends ActionConfigKind>(
  kind: K,
  raw: Record<string, unknown> | undefined,
): ActionConfigByKind[K] {
  const r = asRecord(raw);
  switch (kind) {
    case "wait":
      return {
        days: Math.max(0, Math.floor(toNumber(r.days, 0))),
        hours: Math.max(0, Math.floor(toNumber(r.hours, 0))),
        minutes: Math.max(0, Math.floor(toNumber(r.minutes, 0))),
      } as ActionConfigByKind[K];
    case "whatsapp":
      return { message: toString(r.message) } as ActionConfigByKind[K];
    case "email":
      return {
        subject: toString(r.subject),
        body: toString(r.body),
      } as ActionConfigByKind[K];
    case "create-task":
      return {
        title: toString(r.title),
        description: toString(r.description) || undefined,
        dueDays: Math.max(0, Math.floor(toNumber(r.dueDays, 1))),
      } as ActionConfigByKind[K];
    case "create-deal":
      return {
        funnelId: toString(r.funnelId),
        stageId: toString(r.stageId),
        title: toString(r.title) || undefined,
      } as ActionConfigByKind[K];
    case "move-deal":
      return {
        funnelId: toString(r.funnelId),
        stageId: toString(r.stageId),
      } as ActionConfigByKind[K];
    case "tag":
      return { tag: toString(r.tag) } as ActionConfigByKind[K];
    case "webhook":
      return {
        url: toString(r.url),
        method: isWebhookMethod(r.method) ? r.method : "POST",
        headers: toString(r.headers) || undefined,
        body: toString(r.body) || undefined,
      } as ActionConfigByKind[K];
    case "split": {
      const op = toString(r.operator);
      return {
        field: toString(r.field),
        operator: (SPLIT_OPERATORS as readonly string[]).includes(op)
          ? (op as SplitOperator)
          : "equals",
        value: toString(r.value),
        trueStepId: toString(r.trueStepId),
        falseStepId: toString(r.falseStepId),
      } as ActionConfigByKind[K];
    }
    case "add-to-flow":
      return { targetFlowId: toString(r.targetFlowId) } as ActionConfigByKind[K];
    case "remove-from-flow":
      return {
        targetFlowId: toString(r.targetFlowId),
        reason: toString(r.reason) || undefined,
      } as ActionConfigByKind[K];
    case "ab-test": {
      const raw = Array.isArray(r.variants) ? r.variants : [];
      const variants: ABTestVariant[] = raw
        .map((v, i) => {
          const vr = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
          return {
            id: toString(vr.id) || `variant-${i + 1}`,
            label: toString(vr.label) || undefined,
            weight: Math.max(0, Math.floor(toNumber(vr.weight, 0))),
            nextStepId: toString(vr.nextStepId),
          };
        })
        .filter((v) => v !== null);
      return { variants } as ActionConfigByKind[K];
    }
    case "wait-until": {
      const op = toString(r.operator);
      return {
        field: toString(r.field),
        operator: (SPLIT_OPERATORS as readonly string[]).includes(op)
          ? (op as SplitOperator)
          : "equals",
        value: toString(r.value),
        checkIntervalMinutes: Math.max(1, Math.floor(toNumber(r.checkIntervalMinutes, 30))),
        timeoutHours: Math.max(0, Math.floor(toNumber(r.timeoutHours, 0))),
        alternativeStepId: toString(r.alternativeStepId) || undefined,
      } as ActionConfigByKind[K];
    }
    case "smart-message":
      return {
        prompt: toString(r.prompt),
        tone: toString(r.tone) || undefined,
        maxLength: Math.max(1, Math.floor(toNumber(r.maxLength, 280))),
      } as ActionConfigByKind[K];
    case "set-variable": {
      const raw = Array.isArray(r.assignments) ? r.assignments : [];
      const assignments: SetVariableAssignment[] = raw.map((a) => {
        const ar = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
        return { key: toString(ar.key), value: toString(ar.value) };
      });
      return { assignments } as ActionConfigByKind[K];
    }
    case "update-deal-title":
      return { title: toString(r.title) } as ActionConfigByKind[K];
    case "update-deal-status": {
      const s = toString(r.status);
      return {
        status: (DEAL_STATUS_VALUES as readonly string[]).includes(s)
          ? (s as DealStatus)
          : "em_andamento",
        lossReason: toString(r.lossReason) || undefined,
      } as ActionConfigByKind[K];
    }
    case "set-qualification": {
      const n = Number(r.qualification);
      const qualification = Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : 0;
      return { qualification } as ActionConfigByKind[K];
    }
    case "suppress-channel": {
      const ch = toString(r.channel);
      const channel = (MARKETING_FLOW_SUPPRESSION_CHANNELS as readonly string[]).includes(ch)
        ? (ch as MarketingFlowSuppressionChannel)
        : "all";
      return { channel, reason: toString(r.reason) || undefined } as ActionConfigByKind[K];
    }
    case "add-note":
      return { note: toString(r.note) } as ActionConfigByKind[K];
    case "mark-sale":
      return { valueCents: toString(r.valueCents) } as ActionConfigByKind[K];
    case "ai-classify": {
      const raw = Array.isArray(r.categories) ? r.categories : [];
      const categories: AiClassifyCategory[] = raw.map((v) => {
        const vr = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
        return { label: toString(vr.label), nextStepId: toString(vr.nextStepId) };
      });
      return { prompt: toString(r.prompt), categories } as ActionConfigByKind[K];
    }
  }
  throw new Error(`Unsupported action config kind: ${String(kind)}`);
}

export function defaultConfig<K extends ActionConfigKind>(kind: K): ActionConfigByKind[K] {
  return parseConfig(kind, undefined);
}

// ---------------------------------------------------------------- Validate

type IssueWithoutStep = Omit<ValidationIssue, "stepId">;

export function validateActionConfig(
  step: MarketingFlowStep,
  kind: ActionConfigKind,
): IssueWithoutStep[] {
  const config = parseConfig(kind, step.config);
  const label = step.label;

  switch (kind) {
    case "wait": {
      const c = config as WaitConfig;
      if (c.days + c.hours + c.minutes <= 0) {
        return [
          {
            code: "WAIT_NO_DURATION",
            severity: "error",
            message: `“${label}”: defina uma duração maior que zero.`,
          },
        ];
      }
      return [];
    }
    case "whatsapp": {
      const c = config as WhatsAppConfig;
      if (!c.message.trim()) {
        return [
          {
            code: "MSG_EMPTY",
            severity: "error",
            message: `“${label}”: defina o conteúdo da mensagem.`,
          },
        ];
      }
      return [];
    }
    case "email": {
      const c = config as EmailConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.subject.trim()) {
        issues.push({
          code: "EMAIL_NO_SUBJECT",
          severity: "error",
          message: `“${label}”: defina o assunto do e-mail.`,
        });
      }
      if (!c.body.trim()) {
        issues.push({
          code: "EMAIL_NO_BODY",
          severity: "error",
          message: `“${label}”: defina o conteúdo do e-mail.`,
        });
      }
      return issues;
    }
    case "create-task": {
      const c = config as CreateTaskConfig;
      if (!c.title.trim()) {
        return [
          {
            code: "TASK_NO_TITLE",
            severity: "error",
            message: `“${label}”: defina um título para a tarefa.`,
          },
        ];
      }
      return [];
    }
    case "create-deal": {
      const c = config as CreateDealConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.funnelId) {
        issues.push({
          code: "DEAL_NO_FUNNEL",
          severity: "error",
          message: `“${label}”: selecione um funil.`,
        });
      }
      if (!c.stageId) {
        issues.push({
          code: "DEAL_NO_STAGE",
          severity: "error",
          message: `“${label}”: selecione uma etapa.`,
        });
      }
      return issues;
    }
    case "move-deal": {
      const c = config as MoveDealConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.funnelId) {
        issues.push({
          code: "DEAL_NO_FUNNEL",
          severity: "error",
          message: `“${label}”: selecione o funil de destino.`,
        });
      }
      if (!c.stageId) {
        issues.push({
          code: "DEAL_NO_STAGE",
          severity: "error",
          message: `“${label}”: selecione a etapa de destino.`,
        });
      }
      return issues;
    }
    case "tag": {
      const c = config as TagConfig;
      if (!c.tag.trim()) {
        return [
          {
            code: "TAG_EMPTY",
            severity: "error",
            message: `“${label}”: informe a etiqueta.`,
          },
        ];
      }
      return [];
    }
    case "webhook": {
      const c = config as WebhookConfig;
      if (!c.url.trim()) {
        return [
          {
            code: "WEBHOOK_NO_URL",
            severity: "error",
            message: `“${label}”: defina a URL do webhook.`,
          },
        ];
      }
      try {
        const u = new URL(c.url);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return [
            {
              code: "WEBHOOK_INVALID_URL",
              severity: "error",
              message: `“${label}”: URL deve começar com http:// ou https://.`,
            },
          ];
        }
      } catch {
        return [
          {
            code: "WEBHOOK_INVALID_URL",
            severity: "error",
            message: `“${label}”: URL do webhook inválida.`,
          },
        ];
      }
      return [];
    }
    case "split": {
      const c = config as SplitConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.field.trim()) {
        issues.push({
          code: "SPLIT_NO_FIELD",
          severity: "error",
          message: `“${label}”: defina o campo da condição.`,
        });
      }
      const needsValue = c.operator !== "exists" && c.operator !== "not_exists";
      if (needsValue && !c.value.trim()) {
        issues.push({
          code: "SPLIT_NO_VALUE",
          severity: "error",
          message: `“${label}”: defina o valor da condição.`,
        });
      }
      if (!c.trueStepId) {
        issues.push({
          code: "SPLIT_NO_TRUE_STEP",
          severity: "error",
          message: `“${label}”: escolha o passo do caminho "sim".`,
        });
      }
      if (!c.falseStepId) {
        issues.push({
          code: "SPLIT_NO_FALSE_STEP",
          severity: "error",
          message: `“${label}”: escolha o passo do caminho "não".`,
        });
      }
      return issues;
    }
    case "add-to-flow": {
      const c = config as AddToFlowConfig;
      if (!c.targetFlowId) {
        return [
          {
            code: "FLOW_NO_TARGET",
            severity: "error",
            message: `“${label}”: escolha o fluxo de destino.`,
          },
        ];
      }
      return [];
    }
    case "remove-from-flow": {
      const c = config as RemoveFromFlowConfig;
      if (!c.targetFlowId) {
        return [
          {
            code: "FLOW_NO_TARGET",
            severity: "error",
            message: `“${label}”: escolha o fluxo de origem.`,
          },
        ];
      }
      return [];
    }
    case "ab-test": {
      const c = config as ABTestConfig;
      const issues: IssueWithoutStep[] = [];
      if (c.variants.length < 2) {
        issues.push({
          code: "ABTEST_FEW_VARIANTS",
          severity: "error",
          message: `“${label}”: defina ao menos 2 variantes.`,
        });
      }
      const sumWeights = c.variants.reduce((s, v) => s + v.weight, 0);
      if (sumWeights !== 100) {
        issues.push({
          code: "ABTEST_WEIGHTS",
          severity: "error",
          message: `“${label}”: os pesos devem somar 100 (atual: ${sumWeights}).`,
        });
      }
      for (const [i, v] of c.variants.entries()) {
        if (!v.nextStepId) {
          issues.push({
            code: "ABTEST_NO_STEP",
            severity: "error",
            message: `“${label}”: variante ${i + 1} sem passo de destino.`,
          });
        }
      }
      return issues;
    }
    case "wait-until": {
      const c = config as WaitUntilConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.field.trim()) {
        issues.push({
          code: "WAITUNTIL_NO_FIELD",
          severity: "error",
          message: `“${label}”: defina o campo da condição.`,
        });
      }
      const needsValue = c.operator !== "exists" && c.operator !== "not_exists";
      if (needsValue && !c.value.trim()) {
        issues.push({
          code: "WAITUNTIL_NO_VALUE",
          severity: "error",
          message: `“${label}”: defina o valor da condição.`,
        });
      }
      if (c.checkIntervalMinutes < 1) {
        issues.push({
          code: "WAITUNTIL_INTERVAL",
          severity: "error",
          message: `“${label}”: intervalo de verificação precisa ser ≥ 1 minuto.`,
        });
      }
      if (c.timeoutHours === 0) {
        return [
          ...issues,
          {
            code: "WAITUNTIL_NO_TIMEOUT",
            severity: "warning",
            message: `“${label}”: sem timeout. O lead pode ficar esperando indefinidamente.`,
          },
        ];
      }
      return issues;
    }
    case "smart-message": {
      const c = config as SmartMessageConfig;
      if (!c.prompt.trim()) {
        return [
          {
            code: "SMART_NO_PROMPT",
            severity: "error",
            message: `“${label}”: defina o prompt para a IA.`,
          },
        ];
      }
      return [];
    }
    case "set-variable": {
      const c = config as SetVariableConfig;
      if (c.assignments.filter((a) => a.key.trim()).length === 0) {
        return [
          {
            code: "VAR_EMPTY",
            severity: "error",
            message: `“${label}”: defina ao menos uma variável (com nome).`,
          },
        ];
      }
      return [];
    }
    case "update-deal-title": {
      const c = config as UpdateDealTitleConfig;
      if (!c.title.trim()) {
        return [
          {
            code: "DEAL_TITLE_EMPTY",
            severity: "error",
            message: `“${label}”: defina o novo nome da negociação.`,
          },
        ];
      }
      return [];
    }
    case "update-deal-status": {
      const c = config as UpdateDealStatusConfig;
      if (!(DEAL_STATUS_VALUES as readonly string[]).includes(c.status)) {
        return [
          {
            code: "DEAL_STATUS_INVALID",
            severity: "error",
            message: `“${label}”: selecione um status válido.`,
          },
        ];
      }
      return [];
    }
    case "set-qualification": {
      const c = config as SetQualificationConfig;
      if (!Number.isInteger(c.qualification) || c.qualification < 0 || c.qualification > 5) {
        return [
          {
            code: "QUALIFICATION_RANGE",
            severity: "error",
            message: `“${label}”: a qualificação deve ser de 0 a 5 estrelas.`,
          },
        ];
      }
      return [];
    }
    case "suppress-channel": {
      const c = config as SuppressChannelConfig;
      if (!(MARKETING_FLOW_SUPPRESSION_CHANNELS as readonly string[]).includes(c.channel)) {
        return [
          {
            code: "SUPPRESS_CHANNEL_INVALID",
            severity: "error",
            message: `“${label}”: selecione o canal a suprimir.`,
          },
        ];
      }
      return [];
    }
    case "add-note": {
      const c = config as AddNoteConfig;
      if (!c.note.trim()) {
        return [
          {
            code: "NOTE_EMPTY",
            severity: "error",
            message: `“${label}”: escreva o conteúdo da anotação.`,
          },
        ];
      }
      return [];
    }
    case "mark-sale": {
      const c = config as MarkSaleConfig;
      if (c.valueCents.trim() && !Number.isFinite(Number(c.valueCents))) {
        return [
          {
            code: "SALE_VALUE_INVALID",
            severity: "error",
            message: `“${label}”: valor da venda inválido.`,
          },
        ];
      }
      return [];
    }
    case "ai-classify": {
      const c = config as AiClassifyConfig;
      const issues: IssueWithoutStep[] = [];
      if (!c.prompt.trim()) {
        issues.push({
          code: "AI_NO_PROMPT",
          severity: "error",
          message: `“${label}”: descreva o que a IA deve classificar.`,
        });
      }
      const valid = c.categories.filter((cat) => cat.label.trim());
      if (valid.length < 2) {
        issues.push({
          code: "AI_FEW_CATEGORIES",
          severity: "error",
          message: `“${label}”: defina ao menos 2 categorias.`,
        });
      }
      for (const [i, cat] of c.categories.entries()) {
        if (cat.label.trim() && !cat.nextStepId) {
          issues.push({
            code: "AI_NO_STEP",
            severity: "error",
            message: `“${label}”: categoria ${i + 1} ("${cat.label}") sem passo de destino.`,
          });
        }
      }
      return issues;
    }
  }
  throw new Error(`Unsupported action config kind: ${String(kind)}`);
}

// ---------------------------------------------------------------- Summarize

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function summarizeConfig(
  kind: ActionConfigKind,
  raw: Record<string, unknown> | undefined,
): string {
  const config = parseConfig(kind, raw);
  switch (kind) {
    case "wait": {
      const c = config as WaitConfig;
      return `${c.days} dia(s), ${c.hours} hora(s) e ${c.minutes} minuto(s)`;
    }
    case "whatsapp": {
      const c = config as WhatsAppConfig;
      const t = c.message.trim();
      return t.length > 60 ? `${t.slice(0, 60)}…` : t;
    }
    case "email": {
      const c = config as EmailConfig;
      if (!c.subject && !c.body) return "Configuração pendente";
      const subj = c.subject.trim() || "(sem assunto)";
      return subj.length > 60 ? `${subj.slice(0, 60)}…` : subj;
    }
    case "create-task": {
      const c = config as CreateTaskConfig;
      const due = c.dueDays > 0 ? ` (vence em ${c.dueDays} dia${c.dueDays > 1 ? "s" : ""})` : "";
      return c.title ? `${c.title}${due}` : "Tarefa sem título";
    }
    case "create-deal": {
      const c = config as CreateDealConfig;
      const title = c.title ? `${c.title} — ` : "";
      return c.funnelId && c.stageId
        ? `${title}${c.funnelId} → ${c.stageId}`
        : title || "Configuração pendente";
    }
    case "move-deal": {
      const c = config as MoveDealConfig;
      return c.funnelId && c.stageId
        ? `→ ${c.funnelId} → ${c.stageId}`
        : "Configuração pendente";
    }
    case "tag": {
      const c = config as TagConfig;
      return c.tag || "Etiqueta pendente";
    }
    case "webhook": {
      const c = config as WebhookConfig;
      return c.url ? `${c.method} ${c.url}` : "URL pendente";
    }
    case "split": {
      const c = config as SplitConfig;
      if (!c.field) return "Condição pendente";
      const needsValue = c.operator !== "exists" && c.operator !== "not_exists";
      const v = needsValue ? ` ${c.value}` : "";
      return `${c.field} ${c.operator}${v}`;
    }
    case "add-to-flow": {
      const c = config as AddToFlowConfig;
      return c.targetFlowId ? `→ fluxo ${c.targetFlowId.slice(0, 8)}` : "Fluxo pendente";
    }
    case "remove-from-flow": {
      const c = config as RemoveFromFlowConfig;
      return c.targetFlowId ? `← fluxo ${c.targetFlowId.slice(0, 8)}` : "Fluxo pendente";
    }
    case "ab-test": {
      const c = config as ABTestConfig;
      if (c.variants.length === 0) return "Sem variantes";
      return c.variants.map((v) => `${v.weight}%`).join(" / ");
    }
    case "wait-until": {
      const c = config as WaitUntilConfig;
      if (!c.field) return "Condição pendente";
      const timeout = c.timeoutHours > 0 ? ` (timeout ${c.timeoutHours}h)` : "";
      return `${c.field} ${c.operator} ${c.value}${timeout}`;
    }
    case "smart-message": {
      const c = config as SmartMessageConfig;
      if (!c.prompt) return "Prompt pendente";
      return c.prompt.length > 60 ? `${c.prompt.slice(0, 60)}…` : c.prompt;
    }
    case "set-variable": {
      const c = config as SetVariableConfig;
      const keys = c.assignments.map((a) => a.key.trim()).filter(Boolean);
      return keys.length ? `Definir ${keys.join(", ")}` : "Sem variáveis";
    }
    case "update-deal-title": {
      const c = config as UpdateDealTitleConfig;
      return c.title.trim() ? truncate(c.title, 50) : "Nome pendente";
    }
    case "update-deal-status": {
      const c = config as UpdateDealStatusConfig;
      const label_: Record<DealStatus, string> = {
        em_andamento: "Em andamento",
        vendido: "Ganha (venda)",
        perdido: "Perdida",
        pausado: "Pausada",
        nao_pausado: "Reativada",
      };
      return label_[c.status] ?? "Status";
    }
    case "set-qualification": {
      const c = config as SetQualificationConfig;
      const n = Math.min(5, Math.max(0, Math.round(c.qualification || 0)));
      return n === 0 ? "Zerar estrelas" : `${"★".repeat(n)} (${n})`;
    }
    case "suppress-channel": {
      const c = config as SuppressChannelConfig;
      const labels: Record<MarketingFlowSuppressionChannel, string> = {
        whatsapp: "WhatsApp",
        email: "E-mail",
        sms: "SMS",
        all: "Todos os canais",
      };
      return `Opt-out: ${labels[c.channel] ?? c.channel}`;
    }
    case "add-note": {
      const c = config as AddNoteConfig;
      return c.note.trim() ? truncate(c.note, 50) : "Anotação pendente";
    }
    case "mark-sale": {
      const c = config as MarkSaleConfig;
      const n = Number(c.valueCents);
      if (c.valueCents.trim() && Number.isFinite(n)) {
        return `Venda · ${(n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
      }
      return "Marcar venda";
    }
    case "ai-classify": {
      const c = config as AiClassifyConfig;
      const labels = c.categories.map((cat) => cat.label.trim()).filter(Boolean);
      return labels.length ? `IA → ${labels.join(" / ")}` : "Classificação por IA";
    }
  }
  throw new Error(`Unsupported action config kind: ${String(kind)}`);
}
