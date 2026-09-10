import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleDot,
  Database,
  Hash,
  MessageSquare,
  Webhook,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import type { MarketingFlowRecord } from "@/lib/api/marketing-flows";
import { useMarketingForms } from "@/lib/api/marketing-forms";
import { cn } from "@/lib/utils";
import {
  MARKETING_TRIGGER_CATEGORY_LABEL,
  MARKETING_TRIGGER_CONDITION_OPERATORS,
  MARKETING_TRIGGER_DEFINITIONS,
  MARKETING_TRIGGER_OPERATOR_LABEL,
  getMarketingTriggerDefinition,
  normalizeTriggerConfig,
  summarizeMarketingTrigger,
  triggerConfigArray,
  type MarketingTriggerCondition,
  type MarketingTriggerConfig,
  type MarketingTriggerConfigField,
  type MarketingTriggerConditionField,
  type MarketingTriggerDefinition,
} from "@/lib/marketing/flow-triggers";

const FIELD_ICON: Record<string, typeof Workflow> = {
  manual: Workflow,
  whatsapp: MessageSquare,
  forms: Database,
  tags: Tag,
  crm: CircleDot,
  ai: Sparkles,
  integrations: Webhook,
};

function newConditionId() {
  return globalThis.crypto?.randomUUID?.() ?? `condition-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeCondition(value: unknown): MarketingTriggerCondition | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const field = typeof rec.field === "string" ? rec.field : "";
  const operator = typeof rec.operator === "string" ? rec.operator : "";
  if (!field || !operator) return null;
  const id = typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : newConditionId();
  const normalized: MarketingTriggerCondition = {
    id,
    field,
    operator: operator as MarketingTriggerCondition["operator"],
  };
  if (rec.value !== undefined) {
    normalized.value = String(rec.value);
  }
  return normalized;
}

function normalizeConditions(value: unknown): MarketingTriggerCondition[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeCondition).filter((item): item is MarketingTriggerCondition => item !== null);
}

function fieldOperators(field?: MarketingTriggerConditionField) {
  return field?.operators ?? MARKETING_TRIGGER_CONDITION_OPERATORS;
}

function renderScopeValue(
  field: MarketingTriggerConfigField,
  value: unknown,
  onChange: (next: unknown) => void,
) {
  if (field.kind === "select") {
    // Só injeta o "Tudo" genérico se o campo NÃO tiver a própria opção `any`
    // (evita duplicar, ex.: leadMode já tem "Novo ou existente" = any).
    const hasAnyOption = field.options?.some((option) => option.value === "any");
    return (
      <Select
        value={typeof value === "string" ? value : "any"}
        onValueChange={(next) => onChange(next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder ?? "Selecione"} />
        </SelectTrigger>
        <SelectContent>
          {hasAnyOption ? null : <SelectItem value="any">Tudo</SelectItem>}
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === "textarea" || field.kind === "multi-text") {
    const text = triggerConfigArray(value).join(", ");
    return (
      <Textarea
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        rows={3}
      />
    );
  }

  return (
    <Input
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
    />
  );
}

function renderConditionValue(
  field: MarketingTriggerConditionField | undefined,
  value: string | undefined,
  onChange: (next: string) => void,
) {
  if (!field) {
    return (
      <Input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Valor"
      />
    );
  }

  if (field.type === "boolean") {
    return (
      <Select value={value ?? "any"} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Valor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Tanto faz</SelectItem>
          <SelectItem value="true">Sim</SelectItem>
          <SelectItem value="false">Não</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Valor"
    />
  );
}

function TriggerSummaryChips({
  definition,
  summary,
}: {
  definition: MarketingTriggerDefinition | null;
  summary: string;
}) {
  if (!definition) return null;

  const Icon = FIELD_ICON[definition.category] ?? Workflow;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1.5 rounded-full px-2.5 py-1 text-xs">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {MARKETING_TRIGGER_CATEGORY_LABEL[definition.category]}
      </Badge>
      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
        {definition.payload.length} variáveis
      </Badge>
      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-xs">
        {definition.examples.length} exemplos
      </Badge>
      {summary ? (
        <Badge className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">
          {summary}
        </Badge>
      ) : null}
    </div>
  );
}

/** Seletor dos formulários reais do tenant (em vez de digitar id/nome à mão). */
function FormsScopePicker({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const { data: forms = [], isLoading } = useMarketingForms();
  const selected = new Set(triggerConfigArray(value));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Carregando formulários…</p>;
  }
  if (forms.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nenhum formulário criado ainda. Crie em Marketing → Converter → Formulários.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-background p-2">
        {forms.map((form) => {
          const checked = selected.has(form.id);
          return (
            <button
              key={form.id}
              type="button"
              onClick={() => toggle(form.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                checked
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span className="truncate">{form.name || "(sem nome)"}</span>
              {checked ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "Nenhum selecionado = qualquer formulário dispara o fluxo."
          : `${selected.size} formulário${selected.size === 1 ? "" : "s"} selecionado${selected.size === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

type FormFieldOperator = "equals" | "contains" | "exists";
type FormFieldCondition = { field: string; operator: FormFieldOperator; value: string };

const FORM_FIELD_OPERATORS: { value: FormFieldOperator; label: string }[] = [
  { value: "equals", label: "é igual a" },
  { value: "contains", label: "contém" },
  { value: "exists", label: "está preenchido" },
];

function parseFieldConditions(value: unknown): FormFieldCondition[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const op = String(r.operator ?? "contains");
    return {
      field: String(r.field ?? ""),
      operator: op === "equals" || op === "exists" ? op : "contains",
      value: String(r.value ?? ""),
    };
  });
}

/** Construtor de condições de campo do formulário (operador + E/OU). */
function FormFieldConditionsEditor({
  conditions,
  mode,
  formIds,
  onChange,
}: {
  conditions: FormFieldCondition[];
  mode: "all" | "any";
  formIds: string[];
  onChange: (conditions: FormFieldCondition[], mode: "all" | "any") => void;
}) {
  const { data: forms = [] } = useMarketingForms();

  // Campos reais dos formularios selecionados (uniao, dedupe por `name`, que é a
  // chave que o matcher usa). Se nenhum form selecionado -> texto livre.
  const availableFields = useMemo(() => {
    const selected = formIds.length ? forms.filter((f) => formIds.includes(f.id)) : [];
    const map = new Map<string, { name: string; label: string; options: { label: string; value: string }[] }>();
    for (const form of selected) {
      for (const field of form.fields ?? []) {
        if (!field.name || field.type === "hidden") continue;
        if (!map.has(field.name)) {
          map.set(field.name, {
            name: field.name,
            label: field.label || field.name,
            options: (field.options ?? []).map((o) => ({ label: o.label, value: o.value })),
          });
        }
      }
    }
    return [...map.values()];
  }, [forms, formIds]);

  const hasFieldCatalog = availableFields.length > 0;

  const update = (i: number, patch: Partial<FormFieldCondition>) => {
    onChange(
      conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
      mode,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {conditions.length > 1 ? (
        <div className="inline-flex items-center gap-1 self-start rounded-md border border-border bg-muted/40 p-0.5 text-xs">
          {(["all", "any"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(conditions, m)}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "all" ? "Todas (E)" : "Qualquer (OU)"}
            </button>
          ))}
        </div>
      ) : null}

      {conditions.map((c, i) => {
        const selectedField = availableFields.find((f) => f.name === c.field);
        const fieldOptions = selectedField?.options ?? [];
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            {hasFieldCatalog ? (
              <Select
                value={c.field || undefined}
                onValueChange={(v) => update(i, { field: v, value: "" })}
              >
                <SelectTrigger className="h-9 w-full sm:w-44">
                  <SelectValue placeholder="campo do formulário" />
                </SelectTrigger>
                <SelectContent>
                  {availableFields.map((f) => (
                    <SelectItem key={f.name} value={f.name}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={c.field}
                onChange={(e) => update(i, { field: e.target.value })}
                placeholder="campo (ex.: beneficio)"
                className="h-9 w-full sm:w-44"
              />
            )}

            <Select value={c.operator} onValueChange={(v) => update(i, { operator: v as FormFieldOperator })}>
              <SelectTrigger className="h-9 w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORM_FIELD_OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {c.operator === "exists" ? (
              <span className="flex-1 text-xs text-muted-foreground">qualquer valor</span>
            ) : fieldOptions.length > 0 ? (
              <Select value={c.value || undefined} onValueChange={(v) => update(i, { value: v })}>
                <SelectTrigger className="h-9 w-full flex-1 sm:w-auto">
                  <SelectValue placeholder="valor" />
                </SelectTrigger>
                <SelectContent>
                  {fieldOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={c.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="valor (ex.: INSS)"
                className="h-9 w-full flex-1 sm:w-auto"
              />
            )}

            <button
              type="button"
              onClick={() => onChange(conditions.filter((_, idx) => idx !== i), mode)}
              aria-label="Remover condição"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start gap-1.5"
        onClick={() => onChange([...conditions, { field: "", operator: "contains", value: "" }], mode)}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Adicionar condição
      </Button>
      <p className="text-xs text-muted-foreground">
        {hasFieldCatalog
          ? "Campos e valores vêm do(s) formulário(s) selecionado(s). Sem condições = qualquer envio entra."
          : "Selecione um formulário acima para escolher os campos numa lista. Sem condições = qualquer envio entra."}
      </p>
    </div>
  );
}

function TriggerFieldEditor({
  field,
  value,
  onChange,
}: {
  field: MarketingTriggerConfigField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-medium text-foreground">{field.label}</Label>
      {field.id === "formIds" ? (
        <FormsScopePicker value={value} onChange={onChange} />
      ) : (
        renderScopeValue(field, value, onChange)
      )}
      {field.helper ? <p className="text-xs text-muted-foreground">{field.helper}</p> : null}
    </div>
  );
}

function TriggerConditionEditor({
  condition,
  definition,
  onChange,
  onRemove,
}: {
  condition: MarketingTriggerCondition;
  definition: MarketingTriggerDefinition;
  onChange: (next: MarketingTriggerCondition) => void;
  onRemove: () => void;
}) {
  const field = definition.conditionFields.find((item) => item.id === condition.field);
  const operators = fieldOperators(field);

  useEffect(() => {
    if (field && !field.operators.includes(condition.operator)) {
      onChange({
        ...condition,
        operator: field.operators[0],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field?.id]);

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4 lg:grid-cols-[1.3fr_0.9fr_1fr_auto]">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Campo
        </Label>
        <Select
          value={condition.field}
          onValueChange={(next) => {
            const nextField = definition.conditionFields.find((item) => item.id === next);
            const nextOperator = nextField?.operators[0] ?? condition.operator;
            onChange({ ...condition, field: next, operator: nextOperator });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione o campo" />
          </SelectTrigger>
          <SelectContent>
            {definition.conditionFields.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Operador
        </Label>
        <Select
          value={condition.operator}
          onValueChange={(next) =>
            onChange({
              ...condition,
              operator: next as MarketingTriggerCondition["operator"],
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Operador" />
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {MARKETING_TRIGGER_OPERATOR_LABEL[operator]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Valor
        </Label>
        {renderConditionValue(field, condition.value, (next) =>
          onChange({ ...condition, value: next }),
        )}
      </div>

      <div className="flex items-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remover condição"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function MarketingFlowTriggerSettingsPanel({
  flow,
  onTriggerChange,
  isPending,
}: {
  flow: MarketingFlowRecord;
  onTriggerChange: (trigger: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const currentTriggerType = typeof flow.trigger.type === "string" ? flow.trigger.type : "";
  const [draftType, setDraftType] = useState(currentTriggerType);
  const [draftConfig, setDraftConfig] = useState<MarketingTriggerConfig>(
    normalizeTriggerConfig(flow.trigger.config),
  );

  useEffect(() => {
    setDraftType(currentTriggerType);
    setDraftConfig(normalizeTriggerConfig(flow.trigger.config));
  }, [currentTriggerType, flow.trigger.config]);

  const definition = getMarketingTriggerDefinition(draftType);
  const summary = summarizeMarketingTrigger(draftType, draftConfig);
  const conditions = useMemo(() => normalizeConditions(draftConfig.conditions), [draftConfig.conditions]);

  const patchConfig = (patch: Partial<MarketingTriggerConfig>) => {
    setDraftConfig((prev) => ({ ...prev, ...patch }));
  };

  const updateCondition = (conditionId: string, next: MarketingTriggerCondition) => {
    setDraftConfig((prev) => ({
      ...prev,
      conditions: normalizeConditions(prev.conditions).map((condition) =>
        condition.id === conditionId ? next : condition,
      ),
    }));
  };

  const removeCondition = (conditionId: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      conditions: normalizeConditions(prev.conditions).filter((condition) => condition.id !== conditionId),
    }));
  };

  const addCondition = () => {
    if (!definition || definition.conditionFields.length === 0) return;
    const firstField = definition.conditionFields[0];
    setDraftConfig((prev) => ({
      ...prev,
      conditions: [
        ...normalizeConditions(prev.conditions),
        {
          id: newConditionId(),
          field: firstField.id,
          operator: firstField.operators[0],
          value: "",
        },
      ],
    }));
  };

  const commit = () => {
    if (!draftType) {
      onTriggerChange({});
      return;
    }
    onTriggerChange({ type: draftType, config: draftConfig });
  };

  const clearTrigger = () => {
    setDraftType("");
    setDraftConfig({});
    onTriggerChange({});
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-sm font-semibold">Gatilho inicial</Label>
                <p className="text-xs text-muted-foreground">
                  Todo fluxo começa aqui. Escolha a fonte, ajuste o escopo e depois refine com filtros
                  e condições.
                </p>
              </div>
              {definition ? (
                <Badge className="rounded-full bg-primary/10 px-3 py-1 text-primary hover:bg-primary/10">
                  {definition.label}
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-full px-3 py-1">
                  Sem gatilho definido
                </Badge>
              )}
            </div>

            <TriggerSummaryChips definition={definition} summary={summary} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="flow-trigger" className="text-sm font-medium">
                Fonte de entrada
              </Label>
              <Select
                value={draftType || undefined}
                onValueChange={(next) => {
                  setDraftType(next);
                  setDraftConfig({});
                }}
                disabled={isPending}
              >
                <SelectTrigger id="flow-trigger">
                  <SelectValue placeholder="Escolha o gatilho que inicia o fluxo" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_TRIGGER_DEFINITIONS.map((item) => {
                    const Icon = FIELD_ICON[item.category] ?? Workflow;
                    return (
                      <SelectItem key={item.type} value={item.type}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                          {item.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {definition ? definition.description : "Escolha uma fonte para revelar escopo, filtros e condições."}
              </p>
            </div>

            <div className="grid gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                O gatilho entrega ao fluxo
              </div>
              {definition ? (
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {definition.payload.slice(0, 4).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                  {definition.payload.length > 4 ? (
                    <li className="text-xs text-muted-foreground">
                      +{definition.payload.length - 4} variáveis adicionais
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  A seleção do gatilho vai mostrar aqui o que chega como payload e quais filtros ele aceita.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {definition ? (
        <>
          {definition.scopes.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Escopo</h3>
                  <p className="text-xs text-muted-foreground">
                    Limita a origem do gatilho antes de entrar no fluxo.
                  </p>
                </div>
                <Workflow className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {definition.scopes.map((field) => (
                  <TriggerFieldEditor
                    key={field.id}
                    field={field}
                    value={draftConfig[field.id]}
                    onChange={(next) => patchConfig({ [field.id]: next })}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {definition.filters.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Filtros rápidos</h3>
                  <p className="text-xs text-muted-foreground">
                    Regras de entrada mais comuns, sem precisar abrir o builder avançado.
                  </p>
                </div>
                <Hash className="h-4 w-4 text-primary" aria-hidden />
              </div>
              {draftType === "form_submitted" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium text-foreground">
                      Condições do formulário
                    </Label>
                    <FormFieldConditionsEditor
                      conditions={parseFieldConditions(draftConfig.fieldConditions)}
                      mode={draftConfig.fieldMatchMode === "any" ? "any" : "all"}
                      formIds={triggerConfigArray(draftConfig.formIds)}
                      onChange={(conditions, mode) =>
                        patchConfig({ fieldConditions: conditions, fieldMatchMode: mode })
                      }
                    />
                  </div>
                  {definition.filters
                    .filter((field) => field.id === "leadMode")
                    .map((field) => (
                      <TriggerFieldEditor
                        key={field.id}
                        field={field}
                        value={draftConfig[field.id]}
                        onChange={(next) => patchConfig({ [field.id]: next })}
                      />
                    ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {definition.filters.map((field) => (
                    <TriggerFieldEditor
                      key={field.id}
                      field={field}
                      value={draftConfig[field.id]}
                      onChange={(next) => patchConfig({ [field.id]: next })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Condições avançadas</h3>
                <p className="text-xs text-muted-foreground">
                  Monte filtros por campo, operador e valor, como um mini n8n para o gatilho.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCondition}
                disabled={definition.conditionFields.length === 0}
                className="gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Adicionar condição
              </Button>
            </div>

            {conditions.length > 0 ? (
              <div className="flex flex-col gap-3">
                {conditions.map((condition) => (
                  <TriggerConditionEditor
                    key={condition.id}
                    condition={condition}
                    definition={definition}
                    onChange={(next) => updateCondition(condition.id, next)}
                    onRemove={() => removeCondition(condition.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                Nenhuma condição avançada definida. Se quiser, comece com uma regra por campo ou deixe o
                gatilho mais aberto.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Exemplos úteis</h3>
                  <p className="text-xs text-muted-foreground">
                    Toque em um exemplo para visualizar o tipo de cenário que o gatilho cobre.
                  </p>
                </div>
                <RefreshCw className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <div className="flex flex-wrap gap-2">
                {definition.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="inline-flex items-center rounded-full border border-border bg-muted/25 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                  >
                    {example}
                  </button>
                ))}
              </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-foreground">Escolha uma fonte de entrada</h3>
            <p className="text-sm text-muted-foreground">
              Depois disso, o painel vai revelar escopo, filtros, condições e o payload disponível.
            </p>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={clearTrigger} disabled={isPending}>
          Limpar gatilho
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {definition?.label ?? (draftType || "Sem gatilho")}
          </Badge>
          <Button type="button" onClick={commit} disabled={isPending}>
            Aplicar gatilho
          </Button>
        </div>
      </div>
    </div>
  );
}
