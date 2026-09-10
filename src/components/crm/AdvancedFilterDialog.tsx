import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Filter as FilterIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADVANCED_FILTER_FIELD_META,
  ADVANCED_FILTER_OPERATOR_LABEL,
  STATUS_VALUES,
  isUnaryOperator,
  makeRuleId,
  operatorNeedsSecondValue,
  type AdvancedFilter,
  type AdvancedFilterFieldId,
  type AdvancedFilterOperator,
  type AdvancedFilterRule,
} from "@/lib/crm/advanced-filter";
import { cn } from "@/lib/utils";

type Attendant = { id: string; name: string };
type StageOption = { id: string; title: string };

function defaultRule(): AdvancedFilterRule {
  return {
    id: makeRuleId(),
    field: "title",
    operator: "contains",
    value: "",
  };
}

function adjustRuleForField(
  rule: AdvancedFilterRule,
  nextField: AdvancedFilterFieldId,
): AdvancedFilterRule {
  const meta = ADVANCED_FILTER_FIELD_META[nextField];
  const nextOp: AdvancedFilterOperator = meta.operators[0];
  return {
    ...rule,
    field: nextField,
    operator: nextOp,
    value: isUnaryOperator(nextOp) ? null : "",
    value2: undefined,
  };
}

function adjustRuleForOperator(
  rule: AdvancedFilterRule,
  nextOp: AdvancedFilterOperator,
): AdvancedFilterRule {
  return {
    ...rule,
    operator: nextOp,
    value: isUnaryOperator(nextOp) ? null : (rule.value ?? ""),
    value2: operatorNeedsSecondValue(nextOp) ? (rule.value2 ?? "") : undefined,
  };
}

export function AdvancedFilterDialog({
  open,
  onOpenChange,
  value,
  onApply,
  attendants,
  stages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: AdvancedFilter | null;
  onApply: (filter: AdvancedFilter | null) => void;
  attendants: Attendant[];
  stages: StageOption[];
}) {
  const [draft, setDraft] = useState<AdvancedFilter>(() =>
    value && value.rules.length > 0
      ? { op: value.op, rules: value.rules.map((r) => ({ ...r })) }
      : { op: "and", rules: [defaultRule()] },
  );

  // Resync ao abrir.
  useEffect(() => {
    if (!open) return;
    setDraft(
      value && value.rules.length > 0
        ? { op: value.op, rules: value.rules.map((r) => ({ ...r })) }
        : { op: "and", rules: [defaultRule()] },
    );
  }, [open, value]);

  const addRule = () => {
    setDraft((d) => ({ ...d, rules: [...d.rules, defaultRule()] }));
  };

  const removeRule = (id: string) => {
    setDraft((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
  };

  const updateRule = (id: string, patch: Partial<AdvancedFilterRule>) => {
    setDraft((d) => ({
      ...d,
      rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const applyFilter = () => {
    // Remove regras vazias (sem valor em ops não-unárias).
    const cleaned = draft.rules.filter((r) => {
      if (isUnaryOperator(r.operator)) return true;
      if (operatorNeedsSecondValue(r.operator)) {
        return r.value != null && String(r.value) !== "" && r.value2 != null && String(r.value2) !== "";
      }
      if (Array.isArray(r.value)) return r.value.length > 0;
      return r.value != null && String(r.value).trim() !== "";
    });
    onApply(cleaned.length > 0 ? { op: draft.op, rules: cleaned } : null);
    onOpenChange(false);
  };

  const clearFilter = () => {
    onApply(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilterIcon className="h-5 w-5 text-[var(--crm-brand)]" aria-hidden />
            Filtro avançado
          </DialogTitle>
          <DialogDescription>
            Combine regras com <strong>E</strong> (todas casam) ou <strong>OU</strong> (qualquer
            uma casa). Persiste na URL e pode ser salva como vista.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Toggle AND/OR */}
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--crm-border-2)] bg-card">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, op: "and" }))}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold transition-colors",
                draft.op === "and"
                  ? "bg-[var(--crm-brand)] text-white"
                  : "text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
              )}
            >
              E (todas casam)
            </button>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, op: "or" }))}
              className={cn(
                "px-4 py-1.5 text-xs font-semibold transition-colors",
                draft.op === "or"
                  ? "bg-[var(--crm-brand)] text-white"
                  : "text-[var(--crm-ink-2)] hover:bg-[var(--crm-surface)]",
              )}
            >
              OU (qualquer uma)
            </button>
          </div>

          <ul className="space-y-2">
            {draft.rules.map((rule, idx) => (
              <li
                key={rule.id}
                className="rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface)]/40 p-2"
              >
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
                  <span>
                    Regra {idx + 1}
                    {idx > 0 ? ` · ${draft.op === "and" ? "E" : "OU"}` : ""}
                  </span>
                  {draft.rules.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      className="rounded p-1 text-[var(--crm-ink-3)] hover:bg-[var(--crm-danger-tint)] hover:text-[var(--crm-danger-strong)]"
                      aria-label="Remover regra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <RuleRow
                  rule={rule}
                  onChange={(patch) => updateRule(rule.id, patch)}
                  attendants={attendants}
                  stages={stages}
                />
              </li>
            ))}
          </ul>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRule}
            className="h-8 gap-2"
          >
            <Plus className="h-4 w-4" />
            Adicionar regra
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={clearFilter} className="gap-2">
            <X className="h-4 w-4" />
            Limpar filtro
          </Button>
          <Button type="button" onClick={applyFilter}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  onChange,
  attendants,
  stages,
}: {
  rule: AdvancedFilterRule;
  onChange: (patch: Partial<AdvancedFilterRule>) => void;
  attendants: Attendant[];
  stages: StageOption[];
}) {
  const meta = ADVANCED_FILTER_FIELD_META[rule.field];
  const inList = useMemo(() => {
    if (Array.isArray(rule.value)) return rule.value.map(String);
    return [];
  }, [rule.value]);

  const renderValueInput = () => {
    if (isUnaryOperator(rule.operator)) {
      return (
        <div className="rounded border border-dashed border-[var(--crm-border)] px-3 py-1.5 text-xs text-[var(--crm-ink-3)]">
          (sem valor)
        </div>
      );
    }

    const fieldMeta = ADVANCED_FILTER_FIELD_META[rule.field];

    // Operadores de "days" sempre são number, independente do valueType.
    if (rule.operator === "older_than_days" || rule.operator === "within_last_days") {
      return (
        <Input
          type="number"
          min={0}
          value={rule.value == null ? "" : String(rule.value)}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="dias"
          className="h-8 text-sm"
        />
      );
    }

    if (rule.operator === "between") {
      return (
        <div className="flex items-center gap-2">
          <Input
            type={fieldMeta.valueType === "date" ? "date" : "number"}
            value={rule.value == null ? "" : String(rule.value)}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="min"
            className="h-8 text-sm"
          />
          <span className="text-xs text-[var(--crm-ink-3)]">e</span>
          <Input
            type={fieldMeta.valueType === "date" ? "date" : "number"}
            value={rule.value2 == null ? "" : String(rule.value2)}
            onChange={(e) => onChange({ value2: e.target.value })}
            placeholder="máx"
            className="h-8 text-sm"
          />
        </div>
      );
    }

    if (fieldMeta.valueType === "select") {
      const options: { id: string; label: string }[] =
        rule.field === "status"
          ? STATUS_VALUES.map((s) => ({ id: s.id, label: s.label }))
          : rule.field === "stage"
            ? stages.map((s) => ({ id: s.id, label: s.title }))
            : rule.field === "assignee"
              ? attendants.map((a) => ({ id: a.id, label: a.name }))
              : [];

      // Operador "in" = multi-select via checkboxes.
      if (rule.operator === "in") {
        return (
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded border border-[var(--crm-border-2)] bg-card p-2 text-xs">
            {options.length === 0 ? (
              <span className="text-[var(--crm-ink-3)]">Sem opções.</span>
            ) : (
              options.map((opt) => {
                const checked = inList.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-[var(--crm-surface)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...inList, opt.id]
                          : inList.filter((v) => v !== opt.id);
                        onChange({ value: next });
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })
            )}
          </div>
        );
      }

      return (
        <Select
          value={rule.value ? String(rule.value) : undefined}
          onValueChange={(v) => onChange({ value: v })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Selecionar…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (fieldMeta.valueType === "date") {
      return (
        <Input
          type="date"
          value={rule.value == null ? "" : String(rule.value)}
          onChange={(e) => onChange({ value: e.target.value })}
          className="h-8 text-sm"
        />
      );
    }

    if (fieldMeta.valueType === "number") {
      return (
        <Input
          type="number"
          value={rule.value == null ? "" : String(rule.value)}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="valor"
          className="h-8 text-sm"
        />
      );
    }

    return (
      <Input
        type="text"
        value={rule.value == null ? "" : String(rule.value)}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder="valor"
        className="h-8 text-sm"
      />
    );
  };

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
      <Select
        value={rule.field}
        onValueChange={(v) =>
          onChange(adjustRuleForField(rule, v as AdvancedFilterFieldId))
        }
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ADVANCED_FILTER_FIELD_META).map(([id, m]) => (
            <SelectItem key={id} value={id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={rule.operator}
        onValueChange={(v) =>
          onChange(adjustRuleForOperator(rule, v as AdvancedFilterOperator))
        }
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {meta.operators.map((op) => (
            <SelectItem key={op} value={op}>
              {ADVANCED_FILTER_OPERATOR_LABEL[op]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {renderValueInput()}
    </div>
  );
}
