import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type FormConditionCompareTarget,
  type FormConditionJoin,
  type FormConditionOperator,
  type FormField,
  type FormFieldCondition,
  type FormFieldConditionalLogic,
} from "@/lib/marketing/form-types";

const CONDITION_OPERATORS: Array<{ value: FormConditionOperator; label: string }> = [
  { value: "equals", label: "Igual a" },
  { value: "not_equals", label: "Diferente de" },
  { value: "contains", label: "Contém" },
  { value: "not_contains", label: "Não contém" },
  { value: "greater_than", label: "Maior que" },
  { value: "less_than", label: "Menor que" },
  { value: "is_empty", label: "Está vazio" },
  { value: "is_not_empty", label: "Não está vazio" },
];

function normalizeConditionField(fields: FormField[], fieldName?: string): string {
  if (fieldName && fields.some((field) => field.name === fieldName)) return fieldName;
  return fields[0]?.name ?? "";
}

function createDefaultCondition(fields: FormField[], compareKind: FormConditionCompareTarget["kind"] = "value"): FormFieldCondition {
  const baseField = normalizeConditionField(fields);
  return {
    field: baseField,
    operator: "equals",
    value: "",
    compareTarget:
      compareKind === "field"
        ? { kind: "field", field: normalizeConditionField(fields, fields.find((field) => field.name !== baseField)?.name) }
        : { kind: "value", value: "" },
  };
}

function normalizeLogic(logic: FormFieldConditionalLogic | undefined, fields: FormField[]): FormFieldConditionalLogic {
  if (!logic || logic.groups.length === 0) {
    return { groups: [{ join: "all", conditions: [createDefaultCondition(fields)] }] };
  }
  return {
    groups: logic.groups.map((group) => ({
      join: group.join ?? "all",
      conditions:
        group.conditions.length > 0
          ? group.conditions.map((condition) => ({
              field: normalizeConditionField(fields, condition.field),
              operator: condition.operator,
              value: condition.value ?? "",
              compareTarget:
                condition.operator === "is_empty" || condition.operator === "is_not_empty"
                  ? undefined
                  : condition.compareTarget?.kind === "field"
                    ? { kind: "field", field: normalizeConditionField(fields, condition.compareTarget.field) }
                    : { kind: "value", value: condition.compareTarget?.kind === "value" ? condition.compareTarget.value : condition.value ?? "" },
            }))
          : [createDefaultCondition(fields)],
    })),
  };
}

interface ConditionalLogicEditorProps {
  title: string;
  description?: string;
  logic: FormFieldConditionalLogic | undefined;
  availableFields: FormField[];
  onChange: (next?: FormFieldConditionalLogic) => void;
}

export function ConditionalLogicEditor({
  title,
  description,
  logic,
  availableFields,
  onChange,
}: ConditionalLogicEditorProps) {
  if (availableFields.length === 0) {
    return (
      <div className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        Não há outros campos visíveis para usar como base desta regra.
      </div>
    );
  }

  const current = normalizeLogic(logic, availableFields);

  function updateGroup(index: number, nextGroup: FormFieldConditionalLogic["groups"][number]) {
    onChange({
      groups: current.groups.map((group, groupIndex) => (groupIndex === index ? nextGroup : group)),
    });
  }

  function updateCondition(groupIndex: number, conditionIndex: number, nextCondition: FormFieldCondition) {
    const groups = current.groups.map((group, index) => {
      if (index !== groupIndex) return group;
      return {
        ...group,
        conditions: group.conditions.map((condition, idx) => (idx === conditionIndex ? nextCondition : condition)),
      };
    });
    onChange({ groups });
  }

  function addGroup() {
    onChange({
      groups: [
        ...current.groups,
        {
          join: "all",
          conditions: [createDefaultCondition(availableFields)],
        },
      ],
    });
  }

  function addCondition(groupIndex: number) {
    const groups = current.groups.map((group, index) => {
      if (index !== groupIndex) return group;
      return {
        ...group,
        conditions: [...group.conditions, createDefaultCondition(availableFields)],
      };
    });
    onChange({ groups });
  }

  function removeGroup(groupIndex: number) {
    const next = current.groups.filter((_, index) => index !== groupIndex);
    onChange(next.length > 0 ? { groups: next } : undefined);
  }

  function removeCondition(groupIndex: number, conditionIndex: number) {
    const groups = current.groups
      .map((group, index) => {
        if (index !== groupIndex) return group;
        return {
          ...group,
          conditions: group.conditions.filter((_, idx) => idx !== conditionIndex),
        };
      })
      .map((group) => ({
        ...group,
        conditions: group.conditions.length > 0 ? group.conditions : [createDefaultCondition(availableFields)],
      }));
    onChange({ groups });
  }

  function setConditionCompareTarget(
    groupIndex: number,
    conditionIndex: number,
    compareTarget: FormConditionCompareTarget,
  ) {
    updateCondition(groupIndex, conditionIndex, {
      ...current.groups[groupIndex].conditions[conditionIndex],
      compareTarget,
      value: compareTarget.kind === "value" ? compareTarget.value : current.groups[groupIndex].conditions[conditionIndex].value,
    });
  }

  function setConditionJoin(groupIndex: number, join: FormConditionJoin) {
    updateGroup(groupIndex, { ...current.groups[groupIndex], join });
  }

  function setConditionField(groupIndex: number, conditionIndex: number, fieldName: string) {
    const condition = current.groups[groupIndex].conditions[conditionIndex];
    updateCondition(groupIndex, conditionIndex, {
      ...condition,
      field: fieldName,
    });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold">{title}</Label>
          {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={addGroup}>
          <Plus className="mr-1 h-3 w-3" />
          Novo grupo
        </Button>
      </div>

      <div className="space-y-2">
        {current.groups.map((group, groupIndex) => (
          <div key={`${groupIndex}-${group.join}`} className="rounded-md border bg-background p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">Condições do grupo</Label>
                <Select value={group.join} onValueChange={(value) => setConditionJoin(groupIndex, value as FormConditionJoin)}>
                  <SelectTrigger className="h-7 w-24 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">E</SelectItem>
                    <SelectItem value="any">OU</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => removeGroup(groupIndex)}>
                <Trash2 className="mr-1 h-3 w-3" />
                Remover
              </Button>
            </div>

            <div className="mt-2 space-y-2">
              {group.conditions.map((condition, conditionIndex) => {
                const needsCompareTarget = !["is_empty", "is_not_empty"].includes(condition.operator);
                return (
                  <div key={`${groupIndex}-${conditionIndex}`} className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Campo</Label>
                      <Select value={condition.field} onValueChange={(value) => setConditionField(groupIndex, conditionIndex, value)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Campo" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableFields.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.name}>
                              {candidate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Operador</Label>
                      <Select
                        value={condition.operator}
                        onValueChange={(value) =>
                          updateCondition(groupIndex, conditionIndex, {
                            ...condition,
                            operator: value as FormConditionOperator,
                            compareTarget:
                              ["is_empty", "is_not_empty"].includes(value) ? undefined : condition.compareTarget ?? { kind: "value", value: "" },
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Operador" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPERATORS.map((operator) => (
                            <SelectItem key={operator.value} value={operator.value}>
                              {operator.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Comparar com</Label>
                      <Select
                        value={condition.compareTarget?.kind ?? "value"}
                        onValueChange={(value) =>
                          setConditionCompareTarget(
                            groupIndex,
                            conditionIndex,
                            value === "field"
                              ? { kind: "field", field: availableFields.find((candidate) => candidate.name !== condition.field)?.name ?? condition.field }
                              : { kind: "value", value: condition.compareTarget?.kind === "value" ? condition.compareTarget.value : condition.value ?? "" },
                          )
                        }
                        disabled={!needsCompareTarget}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Valor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="value">Valor</SelectItem>
                          <SelectItem value="field">Outro campo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Critério</Label>
                      {needsCompareTarget ? condition.compareTarget?.kind === "field" ? (
                        <Select
                          value={condition.compareTarget.field}
                          onValueChange={(value) =>
                            setConditionCompareTarget(groupIndex, conditionIndex, { kind: "field", field: value })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Escolha o campo" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields
                              .filter((candidate) => candidate.name !== condition.field)
                              .map((candidate) => (
                                <SelectItem key={candidate.id} value={candidate.name}>
                                  {candidate.label}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={condition.compareTarget?.kind === "value" ? condition.compareTarget.value : condition.value}
                          onChange={(event) =>
                            setConditionCompareTarget(groupIndex, conditionIndex, {
                              kind: "value",
                              value: event.target.value,
                            })
                          }
                          className="h-8 text-xs"
                          placeholder="Ex: sim"
                        />
                      ) : (
                        <div className="rounded-md border bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
                          Sem valor necessário para este operador.
                        </div>
                      )}
                    </div>

                    <div className="flex items-end justify-end sm:col-span-2 xl:col-span-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => removeCondition(groupIndex, conditionIndex)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Remover condição
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Este grupo será verdadeiro quando {group.join === "all" ? "todas" : "qualquer"} condição bater.
              </p>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => addCondition(groupIndex)}>
                <Plus className="mr-1 h-3 w-3" />
                Nova condição
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Separator />
      <p className="text-[11px] leading-4 text-muted-foreground">
        Os grupos são avaliados como <strong className="font-semibold text-foreground">OU</strong>. Dentro de cada grupo, você escolhe entre <strong className="font-semibold text-foreground">E</strong> ou <strong className="font-semibold text-foreground">OU</strong>.
      </p>
    </div>
  );
}
