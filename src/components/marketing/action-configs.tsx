// Componentes de configuracao por action (Fase 2 do plano completo).
// Cada componente recebe { value, onChange } e edita o config estruturado da
// step (definition.steps[].config). pickConfigComponent(actionId) devolve o
// componente certo ou null quando a action nao tem schema ainda.

import type { ComponentType } from "react";
import { Star } from "lucide-react";
import { MARKETING_FLOW_SUPPRESSION_CHANNELS } from "@/lib/marketing/flow-types";
import { useEffectiveCrmFunnels } from "@/lib/api/crm-funnel-config";
import { DEFAULT_CRM_FUNNELS } from "@/data/crm-funnels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SPLIT_OPERATORS,
  WEBHOOK_METHODS,
  DEAL_STATUS_VALUES,
  getConfigKind,
  type ABTestConfig,
  type ABTestVariant,
  type ActionConfigByKind,
  type ActionConfigKind,
  type AddToFlowConfig,
  type CreateDealConfig,
  type CreateTaskConfig,
  type EmailConfig,
  type AddNoteConfig,
  type MarkSaleConfig,
  type MoveDealConfig,
  type RemoveFromFlowConfig,
  type SetQualificationConfig,
  type SuppressChannelConfig,
  type SetVariableAssignment,
  type SetVariableConfig,
  type SmartMessageConfig,
  type SplitConfig,
  type SplitOperator,
  type UpdateDealStatusConfig,
  type UpdateDealTitleConfig,
  type AiClassifyConfig,
  type TagConfig,
  type WaitConfig,
  type WaitUntilConfig,
  type WebhookConfig,
  type WebhookMethod,
  type WhatsAppConfig,
  type DealStatus,
} from "@/lib/marketing/flow-action-configs";
import { useMarketingFlows } from "@/lib/api/marketing-flows";

export type ActionConfigContext = {
  /** Outros steps do mesmo fluxo (usado por split pra escolher branches). */
  steps?: Array<{ id: string; label: string }>;
  /** Id do fluxo atual (usado por add/remove pra remover da lista de destino). */
  currentFlowId?: string;
};

type ConfigProps<T> = {
  value: T;
  onChange: (next: T) => void;
  context?: ActionConfigContext;
};

const SPLIT_OPERATOR_LABELS: Record<SplitOperator, string> = {
  equals: "é igual a",
  not_equals: "é diferente de",
  contains: "contém",
  not_contains: "não contém",
  exists: "existe",
  not_exists: "não existe",
  greater_than: "maior que",
  less_than: "menor que",
};

// ---------------------------------------------------------------- Wait

export function WaitActionConfig({ value, onChange }: ConfigProps<WaitConfig>) {
  const set = (patch: Partial<WaitConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-3 gap-3">
      {(
        [
          ["days", "Dias"],
          ["hours", "Horas"],
          ["minutes", "Minutos"],
        ] as const
      ).map(([field, label]) => (
        <div key={field} className="flex flex-col gap-2">
          <Label htmlFor={`wait-${field}`} className="text-xs font-semibold uppercase tracking-wide">
            {label}
          </Label>
          <Input
            id={`wait-${field}`}
            type="number"
            min={0}
            value={value[field]}
            onChange={(event) =>
              set({ [field]: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
            }
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- WhatsApp

export function WhatsAppActionConfig({ value, onChange }: ConfigProps<WhatsAppConfig>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="whatsapp-message" className="text-xs font-semibold uppercase tracking-wide">
        Mensagem
      </Label>
      <Textarea
        id="whatsapp-message"
        value={value.message}
        onChange={(event) => onChange({ message: event.target.value })}
        rows={6}
        placeholder="Olá {{cliente.nome}}, tudo bem?"
      />
      <p className="text-xs text-muted-foreground">
        Variáveis disponíveis na Fase 5: <code>{`{{cliente.nome}}`}</code>,{" "}
        <code>{`{{negociacao.titulo}}`}</code>, etc.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Email

export function EmailActionConfig({ value, onChange }: ConfigProps<EmailConfig>) {
  const set = (patch: Partial<EmailConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email-subject" className="text-xs font-semibold uppercase tracking-wide">
          Assunto
        </Label>
        <Input
          id="email-subject"
          value={value.subject}
          onChange={(event) => set({ subject: event.target.value })}
          placeholder="Olá {{cliente.nome}}, novidade para você"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email-body" className="text-xs font-semibold uppercase tracking-wide">
          Corpo do e-mail
        </Label>
        <Textarea
          id="email-body"
          value={value.body}
          onChange={(event) => set({ body: event.target.value })}
          rows={6}
          placeholder="Escreva sua mensagem. Aceita variáveis: {{cliente.nome}}, {{negociacao.titulo}}…"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- CreateTask

export function CreateTaskActionConfig({ value, onChange }: ConfigProps<CreateTaskConfig>) {
  const set = (patch: Partial<CreateTaskConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-title" className="text-xs font-semibold uppercase tracking-wide">
          Título da tarefa
        </Label>
        <Input
          id="task-title"
          value={value.title}
          onChange={(event) => set({ title: event.target.value })}
          placeholder="Entrar em contato com o lead"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-description" className="text-xs font-semibold uppercase tracking-wide">
          Descrição (opcional)
        </Label>
        <Textarea
          id="task-description"
          value={value.description ?? ""}
          onChange={(event) => set({ description: event.target.value })}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="task-due" className="text-xs font-semibold uppercase tracking-wide">
          Vencimento (dias a partir da execução)
        </Label>
        <Input
          id="task-due"
          type="number"
          min={0}
          value={value.dueDays}
          onChange={(event) =>
            set({ dueDays: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
          }
          className="max-w-32"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Funnel/Stage selector

function FunnelStageFields({
  funnelId,
  stageId,
  onChange,
}: {
  funnelId: string;
  stageId: string;
  onChange: (next: { funnelId: string; stageId: string }) => void;
}) {
  const { data: funnels = DEFAULT_CRM_FUNNELS } = useEffectiveCrmFunnels();
  const funnel = funnels.find((f) => f.id === funnelId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="deal-funnel" className="text-xs font-semibold uppercase tracking-wide">
          Funil
        </Label>
        <Select
          value={funnelId || undefined}
          onValueChange={(next) => onChange({ funnelId: next, stageId: "" })}
        >
          <SelectTrigger id="deal-funnel">
            <SelectValue placeholder="Selecione um funil" />
          </SelectTrigger>
          <SelectContent>
            {funnels.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.listName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="deal-stage" className="text-xs font-semibold uppercase tracking-wide">
          Etapa
        </Label>
        <Select
          value={stageId || undefined}
          onValueChange={(next) => onChange({ funnelId, stageId: next })}
          disabled={!funnel}
        >
          <SelectTrigger id="deal-stage">
            <SelectValue
              placeholder={funnel ? "Selecione uma etapa" : "Escolha o funil primeiro"}
            />
          </SelectTrigger>
          <SelectContent>
            {funnel?.stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- CreateDeal

export function CreateDealActionConfig({ value, onChange }: ConfigProps<CreateDealConfig>) {
  return (
    <div className="flex flex-col gap-3">
      <FunnelStageFields
        funnelId={value.funnelId}
        stageId={value.stageId}
        onChange={(next) => onChange({ ...value, ...next })}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="deal-title" className="text-xs font-semibold uppercase tracking-wide">
          Título da negociação (opcional)
        </Label>
        <Input
          id="deal-title"
          value={value.title ?? ""}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
          placeholder="Será gerado a partir do nome do lead se vazio"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- MoveDeal

export function MoveDealActionConfig({ value, onChange }: ConfigProps<MoveDealConfig>) {
  return (
    <FunnelStageFields
      funnelId={value.funnelId}
      stageId={value.stageId}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------- Tag

export function TagActionConfig({ value, onChange }: ConfigProps<TagConfig>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tag-name" className="text-xs font-semibold uppercase tracking-wide">
        Etiqueta
      </Label>
      <Input
        id="tag-name"
        value={value.tag}
        onChange={(event) => onChange({ tag: event.target.value })}
        placeholder="ex.: lead-qualificado"
      />
    </div>
  );
}

// ---------------------------------------------------------------- Webhook

export function WebhookActionConfig({ value, onChange }: ConfigProps<WebhookConfig>) {
  const set = (patch: Partial<WebhookConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-method" className="text-xs font-semibold uppercase tracking-wide">
            Método
          </Label>
          <Select
            value={value.method}
            onValueChange={(next) => set({ method: next as WebhookMethod })}
          >
            <SelectTrigger id="webhook-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-url" className="text-xs font-semibold uppercase tracking-wide">
            URL
          </Label>
          <Input
            id="webhook-url"
            value={value.url}
            onChange={(event) => set({ url: event.target.value })}
            placeholder="https://exemplo.com/webhook"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-headers" className="text-xs font-semibold uppercase tracking-wide">
          Headers (opcional, formato Key: Value por linha)
        </Label>
        <Textarea
          id="webhook-headers"
          value={value.headers ?? ""}
          onChange={(event) => set({ headers: event.target.value })}
          rows={3}
          placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-body" className="text-xs font-semibold uppercase tracking-wide">
          Body (opcional, JSON)
        </Label>
        <Textarea
          id="webhook-body"
          value={value.body ?? ""}
          onChange={(event) => set({ body: event.target.value })}
          rows={4}
          placeholder={'{ "leadId": "{{cliente.id}}" }'}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Split

export function SplitActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<SplitConfig>) {
  const set = (patch: Partial<SplitConfig>) => onChange({ ...value, ...patch });
  const steps = context?.steps ?? [];
  const needsValue = value.operator !== "exists" && value.operator !== "not_exists";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_1fr]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="split-field" className="text-xs font-semibold uppercase tracking-wide">
            Campo
          </Label>
          <Input
            id="split-field"
            value={value.field}
            onChange={(event) => set({ field: event.target.value })}
            placeholder="cliente.email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="split-operator" className="text-xs font-semibold uppercase tracking-wide">
            Operador
          </Label>
          <Select
            value={value.operator}
            onValueChange={(next) =>
              set({ operator: next as SplitOperator, ...(next === "exists" || next === "not_exists" ? { value: "" } : {}) })
            }
          >
            <SelectTrigger id="split-operator">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPLIT_OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {SPLIT_OPERATOR_LABELS[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="split-value" className="text-xs font-semibold uppercase tracking-wide">
            Valor
          </Label>
          <Input
            id="split-value"
            value={value.value}
            onChange={(event) => set({ value: event.target.value })}
            disabled={!needsValue}
            placeholder={needsValue ? "ex.: gmail.com" : "—"}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Variáveis suportadas: <code>cliente.&lt;campo&gt;</code>,{" "}
        <code>negociacao.&lt;campo&gt;</code>, <code>contexto.&lt;campo&gt;</code>.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="split-true" className="text-xs font-semibold uppercase tracking-wide">
            Se sim, ir para
          </Label>
          <Select
            value={value.trueStepId || undefined}
            onValueChange={(next) => set({ trueStepId: next })}
            disabled={steps.length === 0}
          >
            <SelectTrigger id="split-true">
              <SelectValue
                placeholder={steps.length === 0 ? "Adicione passos primeiro" : "Selecione um passo"}
              />
            </SelectTrigger>
            <SelectContent>
              {steps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="split-false" className="text-xs font-semibold uppercase tracking-wide">
            Se não, ir para
          </Label>
          <Select
            value={value.falseStepId || undefined}
            onValueChange={(next) => set({ falseStepId: next })}
            disabled={steps.length === 0}
          >
            <SelectTrigger id="split-false">
              <SelectValue
                placeholder={steps.length === 0 ? "Adicione passos primeiro" : "Selecione um passo"}
              />
            </SelectTrigger>
            <SelectContent>
              {steps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Add/Remove from other flow

function FlowPickerField({
  id,
  label,
  value,
  onChange,
  excludeFlowId,
  helper,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  excludeFlowId?: string;
  helper?: string;
}) {
  const { data: flows = [] } = useMarketingFlows();
  const filtered = flows.filter((f) => f.id !== excludeFlowId);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide">
        {label}
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onChange}
        disabled={filtered.length === 0}
      >
        <SelectTrigger id={id}>
          <SelectValue
            placeholder={filtered.length === 0 ? "Nenhum outro fluxo disponível" : "Selecione um fluxo"}
          />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export function AddToFlowActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<AddToFlowConfig>) {
  return (
    <FlowPickerField
      id="add-flow-target"
      label="Fluxo de destino"
      value={value.targetFlowId}
      onChange={(next) => onChange({ targetFlowId: next })}
      excludeFlowId={context?.currentFlowId}
      helper="O fluxo destino precisa estar ativo. Trigger interno usado: cross_flow."
    />
  );
}

export function RemoveFromFlowActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<RemoveFromFlowConfig>) {
  return (
    <div className="flex flex-col gap-3">
      <FlowPickerField
        id="remove-flow-target"
        label="Fluxo de origem"
        value={value.targetFlowId}
        onChange={(next) => onChange({ ...value, targetFlowId: next })}
        excludeFlowId={context?.currentFlowId}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="remove-flow-reason" className="text-xs font-semibold uppercase tracking-wide">
          Motivo (opcional)
        </Label>
        <Input
          id="remove-flow-reason"
          value={value.reason ?? ""}
          onChange={(event) => onChange({ ...value, reason: event.target.value })}
          placeholder="Lead concluiu este fluxo, remove do anterior"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- A/B Test

export function ABTestActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<ABTestConfig>) {
  const steps = context?.steps ?? [];
  const variants = value.variants;
  const sum = variants.reduce((s, v) => s + v.weight, 0);

  const update = (idx: number, patch: Partial<ABTestVariant>) => {
    onChange({
      variants: variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
    });
  };

  const add = () => {
    const id = `variant-${variants.length + 1}`;
    onChange({
      variants: [...variants, { id, weight: 0, nextStepId: "" }],
    });
  };

  const remove = (idx: number) => {
    onChange({ variants: variants.filter((_, i) => i !== idx) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Soma dos pesos: <span className={sum === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>{sum}%</span> (precisa ser 100)
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={add}>
          + Variante
        </Button>
      </div>
      {variants.map((v, i) => (
        <div
          key={i}
          className="grid items-end gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_90px_1fr_36px]"
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide">Nome (opcional)</Label>
            <Input
              value={v.label ?? ""}
              onChange={(event) => update(i, { label: event.target.value })}
              placeholder={`Variante ${i + 1}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide">Peso %</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={v.weight}
              onChange={(event) =>
                update(i, {
                  weight: Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))),
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide">Próximo passo</Label>
            <Select
              value={v.nextStepId || undefined}
              onValueChange={(next) => update(i, { nextStepId: next })}
              disabled={steps.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={steps.length === 0 ? "Adicione passos primeiro" : "Selecione"}
                />
              </SelectTrigger>
              <SelectContent>
                {steps.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
            disabled={variants.length <= 2}
            aria-label="Remover variante"
            className="text-muted-foreground hover:text-destructive"
          >
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Wait Until

export function WaitUntilActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<WaitUntilConfig>) {
  const steps = context?.steps ?? [];
  const set = (patch: Partial<WaitUntilConfig>) => onChange({ ...value, ...patch });
  const needsValue = value.operator !== "exists" && value.operator !== "not_exists";
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_1fr]">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">Campo</Label>
          <Input
            value={value.field}
            onChange={(event) => set({ field: event.target.value })}
            placeholder="cliente.status"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">Operador</Label>
          <Select
            value={value.operator}
            onValueChange={(next) =>
              set({
                operator: next as SplitOperator,
                ...(next === "exists" || next === "not_exists" ? { value: "" } : {}),
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPLIT_OPERATORS.map((op) => (
                <SelectItem key={op} value={op}>
                  {SPLIT_OPERATOR_LABELS[op]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">Valor</Label>
          <Input
            value={value.value}
            onChange={(event) => set({ value: event.target.value })}
            disabled={!needsValue}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            Reverificar a cada (minutos)
          </Label>
          <Input
            type="number"
            min={1}
            value={value.checkIntervalMinutes}
            onChange={(event) =>
              set({ checkIntervalMinutes: Math.max(1, Math.floor(Number(event.target.value) || 1)) })
            }
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            Timeout (horas, 0 = sem timeout)
          </Label>
          <Input
            type="number"
            min={0}
            value={value.timeoutHours}
            onChange={(event) =>
              set({ timeoutHours: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
            }
          />
        </div>
      </div>

      {value.timeoutHours > 0 ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            Caminho alternativo (no timeout)
          </Label>
          <Select
            value={value.alternativeStepId || undefined}
            onValueChange={(next) => set({ alternativeStepId: next })}
            disabled={steps.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={steps.length === 0 ? "Adicione passos primeiro" : "Vazio = fim do fluxo"}
              />
            </SelectTrigger>
            <SelectContent>
              {steps.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Smart Message

export function SmartMessageActionConfig({
  value,
  onChange,
}: ConfigProps<SmartMessageConfig>) {
  const set = (patch: Partial<SmartMessageConfig>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">Prompt</Label>
        <Textarea
          value={value.prompt}
          onChange={(event) => set({ prompt: event.target.value })}
          rows={5}
          placeholder="Escreva uma mensagem para reativar o lead {{cliente.nome}} que abandonou o carrinho."
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">Tom (opcional)</Label>
          <Input
            value={value.tone ?? ""}
            onChange={(event) => set({ tone: event.target.value })}
            placeholder="Amigável e direto"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">
            Tamanho máx. (caracteres)
          </Label>
          <Input
            type="number"
            min={50}
            max={1000}
            value={value.maxLength}
            onChange={(event) =>
              set({ maxLength: Math.max(1, Math.floor(Number(event.target.value) || 280)) })
            }
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A IA gera o texto e envia pelo mesmo canal do WhatsApp do lead. Usa as variáveis padrão{" "}
        <code>{`{{cliente.nome}}`}</code>, <code>{`{{negociacao.titulo}}`}</code> no prompt.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Set Variable

export function SetVariableActionConfig({
  value,
  onChange,
}: ConfigProps<SetVariableConfig>) {
  const assignments = value.assignments.length > 0 ? value.assignments : [{ key: "", value: "" }];
  const set = (next: SetVariableAssignment[]) => onChange({ assignments: next });

  const update = (index: number, patch: Partial<SetVariableAssignment>) => {
    set(assignments.map((assignment, i) => (i === index ? { ...assignment, ...patch } : assignment)));
  };

  return (
    <div className="flex flex-col gap-3">
      {assignments.map((assignment, index) => (
        <div key={index} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Nome</Label>
            <Input
              value={assignment.key}
              onChange={(event) => update(index, { key: event.target.value })}
              placeholder="variavel"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide">Valor</Label>
            <Input
              value={assignment.value}
              onChange={(event) => update(index, { value: event.target.value })}
              placeholder="{{cliente.nome}}"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => set(assignments.filter((_, i) => i !== index))}
              disabled={assignments.length === 1}
            >
              Remover
            </Button>
          </div>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => set([...assignments, { key: "", value: "" }])}
        >
          Adicionar variável
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Update Deal Title

export function UpdateDealTitleActionConfig({
  value,
  onChange,
}: ConfigProps<UpdateDealTitleConfig>) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-semibold uppercase tracking-wide">Novo nome</Label>
      <Input
        value={value.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="Negociação - {{cliente.nome}}"
      />
    </div>
  );
}

// ---------------------------------------------------------------- Update Deal Status

const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  em_andamento: "Em andamento",
  vendido: "Vendido",
  perdido: "Perdido",
  pausado: "Pausado",
  nao_pausado: "Retomar",
};

export function UpdateDealStatusActionConfig({
  value,
  onChange,
}: ConfigProps<UpdateDealStatusConfig>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">Status</Label>
        <Select value={value.status} onValueChange={(next) => onChange({ ...value, status: next as DealStatus })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o status" />
          </SelectTrigger>
          <SelectContent>
            {DEAL_STATUS_VALUES.map((status) => (
              <SelectItem key={status} value={status}>
                {DEAL_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value.status === "perdido" ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold uppercase tracking-wide">Motivo da perda</Label>
          <Input
            value={value.lossReason ?? ""}
            onChange={(event) => onChange({ ...value, lossReason: event.target.value })}
            placeholder="Sem orçamento"
          />
        </div>
      ) : null}
    </div>
  );
}

export function SetQualificationActionConfig({
  value,
  onChange,
}: ConfigProps<SetQualificationConfig>) {
  const current = Math.min(5, Math.max(0, Math.round(value.qualification || 0)));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">
          Qualificação (estrelas)
        </Label>
        <div className="flex items-center gap-1" role="group" aria-label="Definir estrelas">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} estrela${n === 1 ? "" : "s"}`}
              aria-pressed={n <= current}
              onClick={() => onChange({ ...value, qualification: current === n ? 0 : n })}
              className="flex h-8 w-8 items-center justify-center rounded transition-transform hover:scale-110"
            >
              <Star
                className={
                  n <= current
                    ? "h-5 w-5 fill-amber-400 text-amber-400"
                    : "h-5 w-5 text-muted-foreground"
                }
                aria-hidden
              />
            </button>
          ))}
          <span className="ml-2 text-sm text-muted-foreground">{current} / 5</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Clique para definir; clicar na estrela atual zera. Requer uma negociação no fluxo
          (use após “Criar Negociação”).
        </p>
      </div>
    </div>
  );
}

const SUPPRESS_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  sms: "SMS",
  all: "Todos os canais",
};

export function SuppressChannelActionConfig({
  value,
  onChange,
}: ConfigProps<SuppressChannelConfig>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">Canal a suprimir</Label>
        <Select
          value={value.channel}
          onValueChange={(next) =>
            onChange({ ...value, channel: next as SuppressChannelConfig["channel"] })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o canal" />
          </SelectTrigger>
          <SelectContent>
            {MARKETING_FLOW_SUPPRESSION_CHANNELS.map((ch) => (
              <SelectItem key={ch} value={ch}>
                {SUPPRESS_CHANNEL_LABELS[ch] ?? ch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">Motivo (opcional)</Label>
        <Input
          value={value.reason ?? ""}
          onChange={(event) => onChange({ ...value, reason: event.target.value })}
          placeholder="Pediu para não receber mais"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        O lead deixa de receber envios automáticos no canal escolhido. “Todos os canais” bloqueia
        qualquer envio. Respeita a LGPD/opt-out.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Add Note

export function AddNoteActionConfig({ value, onChange }: ConfigProps<AddNoteConfig>) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-semibold uppercase tracking-wide">Anotação</Label>
      <Textarea
        value={value.note}
        onChange={(event) => onChange({ note: event.target.value })}
        rows={5}
        placeholder="Escreva uma observação para a negociação."
      />
    </div>
  );
}

// ---------------------------------------------------------------- Mark Sale

export function MarkSaleActionConfig({ value, onChange }: ConfigProps<MarkSaleConfig>) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs font-semibold uppercase tracking-wide">
        Valor da venda (centavos, opcional)
      </Label>
      <Input
        type="number"
        min={0}
        value={value.valueCents}
        onChange={(event) => onChange({ valueCents: event.target.value })}
        placeholder="19900"
      />
      <p className="text-xs text-muted-foreground">
        Se ficar vazio, a automação mantém o valor atual da negociação.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- AI Classify

export function AiClassifyActionConfig({
  value,
  onChange,
  context,
}: ConfigProps<AiClassifyConfig>) {
  const steps = context?.steps ?? [];
  const set = (next: AiClassifyConfig) => onChange(next);

  const updateCategory = (index: number, patch: Partial<AiClassifyConfig["categories"][number]>) => {
    set({
      ...value,
      categories: value.categories.map((category, i) =>
        i === index ? { ...category, ...patch } : category,
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide">Prompt</Label>
        <Textarea
          value={value.prompt}
          onChange={(event) => set({ ...value, prompt: event.target.value })}
          rows={4}
          placeholder="Classifique a conversa como Quente, Morno ou Frio."
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold uppercase tracking-wide">Categorias</Label>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              set({
                ...value,
                categories: [...value.categories, { label: "", nextStepId: "" }],
              })
            }
          >
            Adicionar categoria
          </Button>
        </div>

        {value.categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Adicione ao menos duas categorias para o fluxo ramificar.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {value.categories.map((category, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rótulo
                </Label>
                <Input
                  value={category.label}
                  onChange={(event) => updateCategory(index, { label: event.target.value })}
                  placeholder="Quente"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Próximo passo
                </Label>
                <Select
                  value={category.nextStepId || undefined}
                  onValueChange={(next) => updateCategory(index, { nextStepId: next })}
                  disabled={steps.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={steps.length === 0 ? "Adicione passos primeiro" : "Selecionar passo"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {steps.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    set({
                      ...value,
                      categories: value.categories.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Registry

type AnyConfigComponent = ComponentType<{
  value: ActionConfigByKind[ActionConfigKind];
  onChange: (next: ActionConfigByKind[ActionConfigKind]) => void;
  context?: ActionConfigContext;
}>;

const COMPONENTS: { [K in ActionConfigKind]: ComponentType<ConfigProps<ActionConfigByKind[K]>> } = {
  wait: WaitActionConfig,
  whatsapp: WhatsAppActionConfig,
  email: EmailActionConfig,
  "create-task": CreateTaskActionConfig,
  "create-deal": CreateDealActionConfig,
  "move-deal": MoveDealActionConfig,
  tag: TagActionConfig,
  webhook: WebhookActionConfig,
  split: SplitActionConfig,
  "add-to-flow": AddToFlowActionConfig,
  "remove-from-flow": RemoveFromFlowActionConfig,
  "ab-test": ABTestActionConfig,
  "wait-until": WaitUntilActionConfig,
  "smart-message": SmartMessageActionConfig,
  "set-variable": SetVariableActionConfig,
  "update-deal-title": UpdateDealTitleActionConfig,
  "update-deal-status": UpdateDealStatusActionConfig,
  "set-qualification": SetQualificationActionConfig,
  "suppress-channel": SuppressChannelActionConfig,
  "add-note": AddNoteActionConfig,
  "mark-sale": MarkSaleActionConfig,
  "ai-classify": AiClassifyActionConfig,
};

export function pickConfigComponent(actionId: string): AnyConfigComponent | null {
  const kind = getConfigKind(actionId);
  if (!kind) return null;
  return COMPONENTS[kind] as AnyConfigComponent;
}
