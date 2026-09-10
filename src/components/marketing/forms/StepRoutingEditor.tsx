import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConditionalLogicEditor } from "./ConditionalLogicEditor";
import {
  type FormField,
  type FormFieldConditionalLogic,
  type FormStep,
  type FormStepRoutingRule,
} from "@/lib/marketing/form-types";

function normalizeRules(
  rules: FormStepRoutingRule[] | undefined,
  steps: FormStep[],
  currentStepId?: string,
): FormStepRoutingRule[] {
  const stepIds = steps.map((step, index) => step.id ?? `step_${index + 1}`);
  const availableTargets = stepIds.filter((id) => id !== currentStepId);
  if (!rules || rules.length === 0) {
    return [
      {
        id: `rule_${Math.random().toString(36).slice(2, 7)}`,
        label: "Regra 1",
        goToStepId: availableTargets[0] ?? stepIds[0] ?? "",
        conditionalLogic: { groups: [] },
      },
    ];
  }

  return rules.map((rule, index) => ({
    id: rule.id ?? `rule_${index + 1}_${Math.random().toString(36).slice(2, 7)}`,
    label: rule.label?.trim() || `Regra ${index + 1}`,
    goToStepId: rule.goToStepId || availableTargets[0] || "",
    conditionalLogic: rule.conditionalLogic,
  }));
}

interface StepRoutingEditorProps {
  title: string;
  description?: string;
  rules: FormStepRoutingRule[] | undefined;
  availableFields: FormField[];
  steps: FormStep[];
  currentStepId?: string;
  onChange: (next?: FormStepRoutingRule[]) => void;
}

export function StepRoutingEditor({
  title,
  description,
  rules,
  availableFields,
  steps,
  currentStepId,
  onChange,
}: StepRoutingEditorProps) {
  const currentRules = normalizeRules(rules, steps, currentStepId);
  const stepOptions = steps
    .map((step, index) => ({
      id: step.id ?? `step_${index + 1}`,
      title: step.title || `Etapa ${index + 1}`,
    }))
    .filter((item) => item.id !== currentStepId);

  function updateRule(index: number, nextRule: FormStepRoutingRule) {
    onChange(currentRules.map((rule, ruleIndex) => (ruleIndex === index ? nextRule : rule)));
  }

  function addRule() {
    onChange([
      ...currentRules,
      {
        id: `rule_${Math.random().toString(36).slice(2, 7)}`,
        label: `Regra ${currentRules.length + 1}`,
        goToStepId: stepOptions[0]?.id ?? "",
        conditionalLogic: { groups: [] },
      },
    ]);
  }

  function removeRule(index: number) {
    const next = currentRules.filter((_, ruleIndex) => ruleIndex !== index);
    onChange(next.length > 0 ? next : undefined);
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold">{title}</Label>
          {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
        </div>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={addRule}>
          <Plus className="mr-1 h-3 w-3" />
          Nova regra
        </Button>
      </div>

      <div className="space-y-2">
        {currentRules.map((rule, index) => (
          <div key={rule.id ?? index} className="rounded-md border bg-background p-2.5">
            <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Nome da regra</Label>
                <Input
                  className="h-8 text-xs"
                  value={rule.label ?? ""}
                  onChange={(event) => updateRule(index, { ...rule, label: event.target.value })}
                  placeholder={`Regra ${index + 1}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Ir para</Label>
                <Select
                  value={rule.goToStepId}
                  onValueChange={(value) => updateRule(index, { ...rule, goToStepId: value })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Escolha a etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {stepOptions.map((step) => (
                      <SelectItem key={step.id} value={step.id}>
                        {step.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => removeRule(index)}>
                <Trash2 className="mr-1 h-3 w-3" />
                Remover
              </Button>
            </div>

            <div className="mt-3 rounded-md border bg-muted/20 p-2">
              <ConditionalLogicEditor
                title="Quando esta regra dispara"
                description="Se as condições baterem, o formulário salta para a etapa escolhida acima."
                logic={rule.conditionalLogic}
                availableFields={availableFields}
                onChange={(conditionalLogic) =>
                  updateRule(index, {
                    ...rule,
                    conditionalLogic: conditionalLogic ?? { groups: [] },
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
