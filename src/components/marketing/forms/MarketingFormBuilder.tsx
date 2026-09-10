import { useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AlertCircle, ArrowLeft, Code2, Eye, Loader2, Monitor, Save, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateMarketingForm } from "@/lib/api/marketing-forms";
import { useMarketingEmailTemplates } from "@/lib/api/marketing-email-templates";
import { useDistinctCustomerTags } from "@/lib/api/customers";
import { validateBuilderFields } from "@/lib/marketing/form-validation";
import {
  createDefaultField,
  buildDefaultFormSteps,
  DEFAULT_FORM_THEME,
  formFieldGapToCss,
  formFieldGapLabel,
  groupFormFieldsIntoRows,
  isFormStepVisible,
  formFieldWidthToGridSpan,
  stepFieldIds,
  stepRoutingRules,
  createDefaultFormStep,
  type FormField,
  type FormFieldType,
  type FormFieldGap,
  type FormSettings,
  type FormTheme,
  type FormStep,
  type MarketingFormRecord,
} from "@/lib/marketing/form-types";
import { ContactFieldPalette } from "./ContactFieldPalette";
import { SortableFieldItem } from "./SortableFieldItem";
import { FieldEditor } from "./FieldEditor";
import { ConditionalLogicEditor } from "./ConditionalLogicEditor";
import { StepRoutingEditor } from "./StepRoutingEditor";
import { EmbedSnippetDialog } from "./EmbedSnippetDialog";
import { ABTestPanel } from "./ABTestPanel";
import { EmailTemplatesDialog } from "./EmailTemplatesDialog";

function parseTagList(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

function normalizeSteps(input: FormStep[] | undefined): FormStep[] {
  return (input ?? []).map((step, index) => ({
    id: step.id ?? `step_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
    title: step.title?.trim() || `Etapa ${index + 1}`,
    fieldIds: stepFieldIds(step),
    conditionalLogic: step.conditionalLogic,
    routingRules: stepRoutingRules(step),
  }));
}

function PreviewField({ field }: { field: FormField }) {
  return (
    <div className="space-y-1.5">
      {field.type === "title" ? (
        <h3 className="text-lg font-semibold tracking-tight">{field.label || "Sem título"}</h3>
      ) : field.type === "description" ? (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {field.defaultValue || "Sua descrição aparecerá aqui..."}
        </p>
      ) : field.type === "image" ? (
        <div className="w-full overflow-hidden rounded-md border bg-muted/20 flex items-center justify-center min-h-[100px]">
          {field.defaultValue ? (
            <img src={field.defaultValue} alt={field.label} className="w-full h-auto object-cover" />
          ) : (
            <p className="text-xs text-muted-foreground p-4 text-center">Nenhuma imagem configurada</p>
          )}
        </div>
      ) : (
        <label className="text-sm font-medium">
          {field.label || "Sem rótulo"}
          {field.required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      )}

      {(field.type === "text" || field.type === "email" || field.type === "phone" || field.type === "date") && (
        <input
          disabled
          type={field.type === "phone" ? "tel" : field.type}
          placeholder={field.placeholder || ""}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      )}

      {field.type === "textarea" && (
        <textarea disabled rows={3} placeholder={field.placeholder || ""} className="w-full rounded-md border px-3 py-2 text-sm" />
      )}

      {field.type === "select" && (
        <select disabled className="w-full rounded-md border px-3 py-2 text-sm">
          <option>Selecione...</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value}>{option.label}</option>
          ))}
        </select>
      )}

      {(field.type === "checkbox" || field.type === "radio") && (
        <div className="space-y-1.5 rounded-md border p-2.5">
          {(field.options ?? []).map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input type={field.type} disabled />
              {option.label}
            </label>
          ))}
        </div>
      )}

      {field.helpText ? <p className="text-xs opacity-70">{field.helpText}</p> : null}
    </div>
  );
}

function FormPreview({
  fields,
  device,
  submitMessage,
  theme,
  fieldGap,
  multiStep,
  steps,
  conversational,
}: {
  fields: FormField[];
  device: "desktop" | "mobile";
  submitMessage: string;
  theme: FormTheme;
  fieldGap: FormFieldGap;
  multiStep: boolean;
  steps: FormStep[];
  conversational: boolean;
}) {
  const visibleFields = fields.filter((f) => f.type !== "hidden");
  const rows = useMemo(() => groupFormFieldsIntoRows(visibleFields, device === "mobile"), [device, visibleFields]);
  const [step, setStep] = useState(0);
  const safeStep = Math.min(step, Math.max(0, visibleFields.length - 1));
  const btnStyle = { backgroundColor: theme.primaryColor, borderRadius: `${theme.borderRadius}px` };
  const isCompact = device === "mobile";
  const gap = formFieldGapToCss(fieldGap);
  const configuredSteps = useMemo(() => {
    if (!multiStep) return [];
    const source = steps.length > 0 ? steps : buildDefaultFormSteps(fields);
    return source.map((item, index) => ({
      id: item.id ?? `step_${index + 1}`,
      title: item.title || `Etapa ${index + 1}`,
      fieldIds: stepFieldIds(item),
      conditionalLogic: item.conditionalLogic,
      routingRules: item.routingRules,
    }));
  }, [fields, multiStep, steps]);
  const stepFields = useMemo(() => {
    if (!multiStep || configuredSteps.length === 0) return visibleFields;
    const ids = stepFieldIds(configuredSteps[Math.min(step, configuredSteps.length - 1)]);
    return fields.filter((field) => ids.includes(field.id) && field.type !== "hidden");
  }, [configuredSteps, fields, multiStep, step, visibleFields]);

  return (
    <div className={device === "mobile" ? "h-full overflow-y-auto p-2 sm:p-4" : "h-full overflow-y-auto p-4"}>
      <div
        className={
          device === "mobile"
            ? "mx-auto rounded-[1.9rem] border bg-muted/20 p-2.5 shadow-inner"
            : "mx-auto rounded-xl border p-4 shadow-sm"
        }
        style={{
          maxWidth: device === "mobile" ? 390 : 760,
          backgroundColor: theme.backgroundColor,
          color: theme.textColor,
          borderRadius: `${theme.borderRadius}px`,
        }}
      >
        <h3 className={device === "mobile" ? "mb-1 text-sm font-semibold" : "mb-1 text-base font-semibold"}>
          Pré-visualização{conversational ? " · conversacional" : ""}
        </h3>
        <p className={device === "mobile" ? "mb-3 text-[11px] opacity-70" : "mb-4 text-xs opacity-70"}>
          Visualização local do rascunho atual{multiStep ? " · etapas e blocos" : ""}.
        </p>

        {configuredSteps.length > 0 ? (
          <div className={device === "mobile" ? "mb-3 flex gap-2 overflow-x-auto pb-1" : "mb-4 flex flex-wrap gap-2"}>
            {configuredSteps.map((item, index) => {
              const active = index === Math.min(step, configuredSteps.length - 1);
              return (
                <button
                  key={item.id ?? index}
                  type="button"
                  className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                  onClick={() => setStep(index)}
                  style={{
                    borderColor: active ? theme.primaryColor : "rgba(148,163,184,0.35)",
                    color: active ? theme.primaryColor : "inherit",
                    backgroundColor: active ? "rgba(109, 40, 217, 0.06)" : "transparent",
                  }}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
        ) : null}

        {visibleFields.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm opacity-60">
            Adicione campos para visualizar o formulário.
          </div>
        ) : conversational ? (
          <div className="space-y-3">
            <p className="text-xs opacity-60">
              {multiStep && configuredSteps.length > 0
                ? `Etapa ${Math.min(step + 1, configuredSteps.length)} de ${configuredSteps.length}`
                : `Pergunta ${safeStep + 1} de ${visibleFields.length}`}
            </p>
            <PreviewField field={(multiStep && configuredSteps.length > 0 ? stepFields : visibleFields)[0] ?? visibleFields[safeStep]} />
            <div className="mt-2 flex gap-2">
              {safeStep > 0 ? (
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Voltar
                </button>
              ) : null}
              {safeStep < visibleFields.length - 1 ? (
                <button
                  type="button"
                  className="flex-1 px-3 py-2 text-sm font-medium text-white"
                  style={btnStyle}
                  onClick={() => setStep((s) => Math.min(visibleFields.length - 1, s + 1))}
                >
                  Avançar
                </button>
              ) : (
                <button type="button" className="flex-1 px-3 py-2 text-sm font-medium text-white" style={btnStyle} disabled>
                  Enviar
                </button>
              )}
            </div>
            <p className="text-center text-xs opacity-60">{submitMessage || "Obrigado!"}</p>
          </div>
        ) : multiStep && configuredSteps.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap }}>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-xs font-medium">
                {configuredSteps[Math.min(step, configuredSteps.length - 1)]?.title ?? `Etapa ${step + 1}`}
              </p>
              <p className="text-[11px] opacity-60">
                {Math.min(step + 1, configuredSteps.length)} de {configuredSteps.length} blocos
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap }}>
              {(stepFields.length > 0 ? stepFields : visibleFields).map((field) => (
                <PreviewField key={field.id} field={field} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {step > 0 ? (
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Voltar
                </button>
              ) : null}
              {step < configuredSteps.length - 1 ? (
                <button
                  type="button"
                  className="flex-1 px-3 py-2 text-sm font-medium text-white"
                  style={btnStyle}
                  onClick={() => setStep((s) => Math.min(configuredSteps.length - 1, s + 1))}
                >
                  Avançar
                </button>
              ) : (
                <button type="button" className="flex-1 px-3 py-2 text-sm font-medium text-white" style={btnStyle} disabled>
                  Enviar
                </button>
              )}
            </div>
            <p className="text-center text-xs opacity-60">{submitMessage || "Obrigado!"}</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap }}>
            <div style={{ display: "flex", flexDirection: "column", gap }}>
              {rows.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-12" style={{ gap }}>
                  {row.map((field) => {
                    const span = isCompact ? 12 : formFieldWidthToGridSpan(field.layoutWidth);
                    return (
                      <div key={field.id} className="min-w-0" style={{ gridColumn: `span ${span} / span ${span}` }}>
                        <PreviewField field={field} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-2 w-full px-3 py-2 text-sm font-medium text-white"
              style={btnStyle}
              disabled
            >
              Enviar
            </button>
            <p className="text-center text-xs opacity-60">{submitMessage || "Obrigado!"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface MarketingFormBuilderProps {
  form: MarketingFormRecord;
  onClose: () => void;
}

export function MarketingFormBuilder({ form, onClose }: MarketingFormBuilderProps) {
  const { toast } = useToast();
  const { data: emailTemplates = [] } = useMarketingEmailTemplates();
  const { data: customerTagSuggestions = [] } = useDistinctCustomerTags();
  const updateForm = useUpdateMarketingForm();

  const [name, setName] = useState(form.name);
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const [theme, setTheme] = useState<FormTheme>({ ...DEFAULT_FORM_THEME, ...form.theme });
  const [settings, setSettings] = useState<FormSettings>(form.settings);
  const [submitMessage, setSubmitMessage] = useState(form.submitMessage || "Obrigado! Recebemos suas informações.");
  const [submitWebhookUrl, setSubmitWebhookUrl] = useState(form.submitWebhookUrl ?? "");
  const [submitRedirectUrl, setSubmitRedirectUrl] = useState(form.submitRedirectUrl ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState(form.emailTemplateId ?? "");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [view, setView] = useState<"canvas" | "preview">("canvas");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const fieldGap = settings.fieldGap ?? 3;
  const formSteps = useMemo(() => {
    if (!settings.multiStep) return [];
    const source = normalizeSteps(settings.steps);
    return source.length > 0 ? source : buildDefaultFormSteps(fields);
  }, [fields, settings.multiStep, settings.steps]);

  const validation = useMemo(() => validateBuilderFields(fields), [fields]);
  const selectedField = fields.find((f) => f.id === selectedId) ?? null;
  const selectedFieldErrors = selectedField ? validation.fieldErrors[selectedField.id] ?? [] : [];
  const selectedStepIndex = useMemo(
    () => formSteps.findIndex((step) => stepFieldIds(step).includes(selectedId ?? "")),
    [formSteps, selectedId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function markDirty() {
    setDirty(true);
  }

  function addField(type: FormFieldType) {
    const field = createDefaultField(type);
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    markDirty();
  }

  function duplicateField(id: string) {
    setFields((prev) => {
      const source = prev.find((field) => field.id === id);
      if (!source) return prev;

      const index = prev.findIndex((field) => field.id === id);
      const clone: FormField = {
        ...source,
        id: `field_${Math.random().toString(36).slice(2, 8)}`,
        name: `${source.name}_copia`,
        label: `${source.label} (cópia)`,
      };

      const next = [...prev];
      next.splice(index + 1, 0, clone);
      setSelectedId(clone.id);
      return next;
    });
    markDirty();
  }

  function addContactField(field: FormField) {
    setFields((prev) => [...prev, field]);
    setSelectedId(field.id);
    markDirty();
  }

  function updateField(id: string, updates: Partial<FormField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    markDirty();
  }

  function updateSelectedField(updates: Partial<FormField>) {
    if (!selectedId) return;
    updateField(selectedId, updates);
  }

  function updateSteps(nextSteps: FormStep[]) {
    setSettings((prev) => ({ ...prev, steps: nextSteps }));
    markDirty();
  }

  function ensureMultiStepFromBlocks() {
    const nextSteps = buildDefaultFormSteps(fields);
    setSettings((prev) => ({ ...prev, multiStep: true, steps: nextSteps }));
    markDirty();
  }

  function addBlankStep() {
    const next = [...formSteps, createDefaultFormStep(formSteps.length, [])];
    updateSteps(next);
  }

  function renameStep(index: number, title: string) {
    const next = formSteps.map((step, i) => (i === index ? { ...step, title } : step));
    updateSteps(next);
  }

  function updateStepLogic(index: number, conditionalLogic: FormStep["conditionalLogic"]) {
    const next = formSteps.map((step, i) => (i === index ? { ...step, conditionalLogic } : step));
    updateSteps(next);
  }

  function updateStepRoutingRules(index: number, routingRules: FormStep["routingRules"]) {
    const next = formSteps.map((step, i) => (i === index ? { ...step, routingRules } : step));
    updateSteps(next);
  }

  function moveSelectedFieldToStep(index: number) {
    if (!selectedField) return;
    const next = formSteps.map((step, stepIndex) => {
      const ids = stepFieldIds(step).filter((fieldId) => fieldId !== selectedField.id);
      if (stepIndex === index && !ids.includes(selectedField.id)) {
        ids.push(selectedField.id);
      }
      return { ...step, fieldIds: ids };
    });
    updateSteps(next);
  }

  function removeFieldFromStep(index: number, fieldId: string) {
    const next = formSteps.map((step, stepIndex) => {
      if (stepIndex !== index) return step;
      return { ...step, fieldIds: stepFieldIds(step).filter((id) => id !== fieldId) };
    });
    updateSteps(next);
  }

  function assignFieldToStep(fieldId: string, stepIndex: number) {
    const next = formSteps.map((step, index) => ({
      ...step,
      fieldIds: index === stepIndex
        ? [...stepFieldIds(step), fieldId]
        : stepFieldIds(step).filter((id) => id !== fieldId),
    }));
    updateSteps(next);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
    markDirty();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === active.id);
      const newIndex = prev.findIndex((f) => f.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
    markDirty();
  }

  const moveSelectedFieldStepLabel = selectedStepIndex >= 0 ? `Mover para etapa ${selectedStepIndex + 1}` : "Mover para etapa";

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Informe o título do formulário", variant: "destructive" });
      return;
    }
    if (validation.hasErrors) {
      toast({
        title: "Corrija os campos antes de salvar",
        description: `${validation.totalErrors} ajuste(s) pendente(s).`,
        variant: "destructive",
      });
      return;
    }
    updateForm.mutate(
      {
        id: form.id,
        patch: {
          name: name.trim(),
          fields,
          theme,
          settings,
          submitMessage: submitMessage.trim() || "Obrigado!",
          submitWebhookUrl: submitWebhookUrl.trim() || null,
          submitRedirectUrl: submitRedirectUrl.trim() || null,
          emailTemplateId: emailTemplateId || null,
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ title: "Formulário salvo" });
        },
        onError: (e) => {
          toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8" onClick={onClose}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Voltar
          </Button>
          <span className="text-sm font-medium text-muted-foreground">{name || "Formulário"}</span>
          {dirty ? <Badge variant="secondary" className="h-5 text-[11px]">Não salvo</Badge> : null}
          {validation.hasErrors ? (
            <Badge variant="outline" className="h-5 border-amber-300 bg-amber-50 text-[11px] text-amber-800">
              <AlertCircle className="mr-1 h-3 w-3" />
              {validation.totalErrors} ajuste{validation.totalErrors > 1 ? "s" : ""}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8" onClick={() => setEmbedOpen(true)}>
            <Code2 className="mr-1.5 h-3.5 w-3.5" />
            Embed
          </Button>
          <Button size="sm" className="h-8" onClick={handleSave} disabled={updateForm.isPending}>
            {updateForm.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="builder" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="builder">Construtor</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="ab">A/B</TabsTrigger>
        </TabsList>

        {/* Builder */}
        <TabsContent value="builder" className="mt-3 min-h-0 flex-1">
          <div className="flex h-full min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm">
            <ContactFieldPalette existingFields={fields} onAddField={addContactField} onAddExtra={addField} />

            <div className="flex flex-1 flex-col overflow-hidden border-x">
              <div className="flex items-center justify-end gap-1.5 border-b bg-muted/40 px-3 py-2">
                <Button size="sm" variant={view === "canvas" ? "default" : "outline"} className="h-8" onClick={() => setView("canvas")}>
                  Canvas
                </Button>
                <Button size="sm" variant={view === "preview" ? "default" : "outline"} className="h-8" onClick={() => setView("preview")}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  Preview
                </Button>
                {view === "preview" ? (
                  <>
                    <Button size="sm" variant={previewDevice === "desktop" ? "default" : "outline"} className="h-8" onClick={() => setPreviewDevice("desktop")}>
                      <Monitor className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant={previewDevice === "mobile" ? "default" : "outline"} className="h-8" onClick={() => setPreviewDevice("mobile")}>
                      <Smartphone className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
              </div>

              {view === "canvas" ? (
                <div className="flex-1 overflow-y-auto p-4">
                  {fields.length === 0 ? (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center">
                      <p className="text-sm font-medium text-muted-foreground">Canvas vazio</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Clique em um tipo de campo no painel esquerdo para adicionar.
                      </p>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {fields.map((field) => (
                            <SortableFieldItem
                              key={field.id}
                              field={field}
                              isSelected={selectedId === field.id}
                              errorCount={(validation.fieldErrors[field.id] ?? []).length}
                              onSelect={() => setSelectedId(field.id)}
                              onDuplicate={() => duplicateField(field.id)}
                              onRemove={() => removeField(field.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              ) : (
                <FormPreview
                  fields={fields}
                  device={previewDevice}
                  submitMessage={submitMessage}
                  theme={theme}
                  fieldGap={fieldGap}
                  multiStep={!!settings.multiStep}
                  steps={formSteps}
                  conversational={!!settings.conversational}
                />
              )}

              {fields.length > 0 ? (
                <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                  {fields.length} campo{fields.length !== 1 ? "s" : ""}
                </div>
              ) : null}
            </div>

            <div className="flex w-64 flex-col overflow-y-auto border-l bg-card">
              <div className="border-b bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold">Propriedades</p>
              </div>
              <FieldEditor
                field={selectedField}
                allFields={fields}
                errors={selectedFieldErrors}
                onUpdate={(updates) => selectedId && updateField(selectedId, updates)}
              />
            </div>
          </div>
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="grid max-w-3xl gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Título do formulário</Label>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markDirty();
                  }}
                  placeholder="Ex: Captação de leads"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem de sucesso</Label>
                <Input
                  value={submitMessage}
                  onChange={(e) => {
                    setSubmitMessage(e.target.value);
                    markDirty();
                  }}
                  placeholder="Obrigado!"
                />
              </div>
            </div>

            <Separator />

            {/* Integrações e destino */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Integrações e destino</p>
                <p className="text-xs text-muted-foreground">
                  Decide o que acontece com o lead logo após o envio.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Webhook de envio</Label>
                  <Input
                    value={submitWebhookUrl}
                    onChange={(e) => {
                      setSubmitWebhookUrl(e.target.value);
                      markDirty();
                    }}
                    placeholder="https://seu-sistema.com/webhook/formulario"
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Envia um JSON estruturado com formulário, respostas, metadados e lead criado.
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Redirect após envio</Label>
                  <Input
                    value={submitRedirectUrl}
                    onChange={(e) => {
                      setSubmitRedirectUrl(e.target.value);
                      markDirty();
                    }}
                    placeholder="https://seusite.com/obrigado"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Tags automáticas do cliente</Label>
                  <Input
                    value={(settings.customerTags ?? []).join(", ")}
                    onChange={(e) => {
                      setSettings((prev) => ({ ...prev, customerTags: parseTagList(e.target.value) }));
                      markDirty();
                    }}
                    placeholder="Formulário Facebook, Lead Quente, CRM"
                  />
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Essas tags entram no cadastro do cliente junto com a origem do formulário.
                  </p>
                  {customerTagSuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {customerTagSuggestions.slice(0, 8).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const current = new Set(settings.customerTags ?? []);
                            current.add(tag);
                            setSettings((prev) => ({ ...prev, customerTags: [...current] }));
                            markDirty();
                          }}
                          className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between sm:col-span-2">
                  <div>
                    <Label className="text-sm">Criar registro na timeline</Label>
                    <p className="text-xs text-muted-foreground">
                      Adiciona um cartão de atividade no CRM quando o formulário for enviado.
                    </p>
                  </div>
                  <Switch
                    checked={!!settings.createActivityOnSubmit}
                    onCheckedChange={(checked) => {
                      setSettings((prev) => ({
                        ...prev,
                        createActivityOnSubmit: checked,
                        activityTitle: checked ? prev.activityTitle ?? "Formulário enviado" : prev.activityTitle,
                        activityBody: checked ? prev.activityBody ?? "" : prev.activityBody,
                      }));
                      markDirty();
                    }}
                  />
                </div>

                {settings.createActivityOnSubmit ? (
                  <>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Título da atividade</Label>
                      <Input
                        value={settings.activityTitle ?? "Formulário enviado"}
                        onChange={(e) => {
                          setSettings((prev) => ({ ...prev, activityTitle: e.target.value }));
                          markDirty();
                        }}
                        placeholder="Formulário enviado"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">Descrição da atividade</Label>
                      <Input
                        value={settings.activityBody ?? ""}
                        onChange={(e) => {
                          setSettings((prev) => ({ ...prev, activityBody: e.target.value }));
                          markDirty();
                        }}
                        placeholder="Lead entrou pelo formulário X com score Y"
                      />
                    </div>
                  </>
                ) : null}

                <div className="space-y-3 sm:col-span-2">
                  <div>
                    <p className="text-sm font-semibold">E-mail de confirmação</p>
                    <p className="text-xs text-muted-foreground">
                      Enviado automaticamente ao lead quando ele tem e-mail no formulário.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px] flex-1 space-y-1.5">
                      <Label className="text-xs">Template</Label>
                      <Select
                        value={emailTemplateId || "__none__"}
                        onValueChange={(v) => {
                          setEmailTemplateId(v === "__none__" ? "" : v);
                          markDirty();
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem e-mail" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem e-mail</SelectItem>
                          {emailTemplates.map((tpl) => (
                            <SelectItem key={tpl.id} value={tpl.id}>
                              {tpl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" onClick={() => setEmailDialogOpen(true)}>
                      Gerenciar templates
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Layout */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Layout</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Espaçamento entre campos</Label>
                  <Select
                    value={String(fieldGap)}
                    onValueChange={(value) => {
                      setSettings((prev) => ({ ...prev, fieldGap: Number(value) as FormFieldGap }));
                      markDirty();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Espaçamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 6].map((gapValue) => (
                        <SelectItem key={gapValue} value={String(gapValue)}>
                          {formFieldGapLabel(gapValue as FormFieldGap)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Controla o espaço visual entre colunas e linhas do formulário.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Aparência */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Aparência</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cor do botão</Label>
                  <Input
                    type="color"
                    value={theme.primaryColor}
                    onChange={(e) => {
                      setTheme((p) => ({ ...p, primaryColor: e.target.value }));
                      markDirty();
                    }}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fundo</Label>
                  <Input
                    type="color"
                    value={theme.backgroundColor}
                    onChange={(e) => {
                      setTheme((p) => ({ ...p, backgroundColor: e.target.value }));
                      markDirty();
                    }}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Texto</Label>
                  <Input
                    type="color"
                    value={theme.textColor}
                    onChange={(e) => {
                      setTheme((p) => ({ ...p, textColor: e.target.value }));
                      markDirty();
                    }}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Borda (px)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24}
                    value={theme.borderRadius}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setTheme((p) => ({ ...p, borderRadius: Number.isFinite(n) ? n : 8 }));
                      markDirty();
                    }}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Comportamento */}
            <div className="space-y-3">
              <p className="text-sm font-semibold">Comportamento</p>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Formulário em etapas</Label>
                  <p className="text-xs text-muted-foreground">Divide o fluxo em blocos para reduzir atrito.</p>
                </div>
                <Switch
                  checked={!!settings.multiStep}
                  onCheckedChange={(checked) => {
                    setSettings((prev) => ({
                      ...prev,
                      multiStep: checked,
                      steps: checked
                        ? normalizeSteps(prev.steps).length > 0
                          ? normalizeSteps(prev.steps)
                          : buildDefaultFormSteps(fields)
                        : prev.steps,
                    }));
                    markDirty();
                  }}
                />
              </div>
              {settings.multiStep ? (
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Etapas e blocos</p>
                      <p className="text-xs text-muted-foreground">
                        Agrupe os campos em blocos visuais e depois ajuste etapa por etapa.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={ensureMultiStepFromBlocks}>
                        Gerar blocos
                      </Button>
                      <Button size="sm" variant="outline" onClick={addBlankStep}>
                        Nova etapa
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {formSteps.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                        Ainda sem etapas. Gere blocos a partir das quebras de linha ou adicione uma etapa vazia.
                      </p>
                    ) : (
                      formSteps.map((step, index) => {
                        const ids = stepFieldIds(step);
                        const stepFields = fields.filter((field) => ids.includes(field.id));
                        return (
                          <div key={step.id ?? `${index}`} className="rounded-lg border bg-card p-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <Badge variant="secondary" className="shrink-0">
                                  Etapa {index + 1}
                                </Badge>
                                <Input
                                  value={step.title}
                                  onChange={(e) => renameStep(index, e.target.value)}
                                  className="h-8 min-w-0 flex-1"
                                  placeholder={`Etapa ${index + 1}`}
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {selectedField ? (
                                  <Button size="sm" variant="outline" className="h-8" onClick={() => moveSelectedFieldToStep(index)}>
                                    {moveSelectedFieldStepLabel}
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8"
                                  onClick={() =>
                                    updateSteps(
                                      formSteps.filter((_, stepIndex) => stepIndex !== index).map((item, stepIndex) => ({
                                        ...item,
                                        title: item.title || `Etapa ${stepIndex + 1}`,
                                      })),
                                    )
                                  }
                                  disabled={formSteps.length <= 1}
                                >
                                  Remover etapa
                                </Button>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {stepFields.length === 0 ? (
                                <span className="text-xs text-muted-foreground">Sem campos ainda.</span>
                              ) : (
                                stepFields.map((field) => (
                                  <button
                                    key={field.id}
                                    type="button"
                                    onClick={() => setSelectedId(field.id)}
                                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                    title="Selecionar campo"
                                  >
                                    {field.label}
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeFieldFromStep(index, field.id);
                                      }}
                                      className="rounded-full px-1 text-muted-foreground/50 transition-colors hover:text-red-500"
                                    >
                                      ×
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              <span>{stepFields.length} campo(s)</span>
                              <span>·</span>
                              <button
                                type="button"
                                className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                                onClick={() => {
                                  const currentIds = new Set(ids);
                                  const nextField = fields.find((field) => !currentIds.has(field.id) && field.type !== "hidden");
                                  if (nextField) {
                                    assignFieldToStep(nextField.id, index);
                                  }
                                }}
                              >
                                Adicionar próximo campo
                              </button>
                            </div>

                            <div className="mt-3 rounded-lg border bg-background/80 p-3">
                              <ConditionalLogicEditor
                                title="Visibilidade da etapa"
                                description="Use esta regra para esconder a etapa inteira dependendo das respostas anteriores."
                                logic={step.conditionalLogic}
                                availableFields={fields.filter((candidate) => candidate.type !== "hidden")}
                                onChange={(conditionalLogic) => updateStepLogic(index, conditionalLogic)}
                              />
                            </div>

                            <div className="mt-3 rounded-lg border bg-background/80 p-3">
                              <StepRoutingEditor
                                title="Salto automático"
                                description="Quando as respostas baterem, o formulário pula para a etapa escolhida."
                                rules={step.routingRules}
                                availableFields={fields.filter((candidate) => candidate.type !== "hidden")}
                                steps={formSteps}
                                currentStepId={step.id}
                                onChange={(routingRules) => updateStepRoutingRules(index, routingRules)}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Permitir duplicados</Label>
                  <p className="text-xs text-muted-foreground">
                    Reenvios do mesmo contato são aceitos ou bloqueados automaticamente.
                  </p>
                </div>
                <Switch
                  checked={!!settings.allowDuplicates}
                  onCheckedChange={(v) => {
                    setSettings((p) => ({ ...p, allowDuplicates: v }));
                    markDirty();
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Perfil progressivo</Label>
                  <p className="text-xs text-muted-foreground">Atualiza o lead existente em vez de duplicar.</p>
                </div>
                <Switch
                  checked={!!settings.progressiveProfiling}
                  onCheckedChange={(v) => {
                    setSettings((p) => ({ ...p, progressiveProfiling: v }));
                    markDirty();
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Modo conversacional</Label>
                  <p className="text-xs text-muted-foreground">Mostra um campo por vez, estilo chat.</p>
                </div>
                <Switch
                  checked={!!settings.conversational}
                  onCheckedChange={(v) => {
                    setSettings((p) => ({ ...p, conversational: v }));
                    markDirty();
                  }}
                />
              </div>
            </div>

            <Separator />

          </div>
        </TabsContent>

        <TabsContent value="ab" className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <ABTestPanel
            formId={form.id}
            currentFields={fields}
            currentSettings={settings}
            currentTheme={theme}
            onSettingsChange={(s) => {
              setSettings(s);
              markDirty();
            }}
          />
        </TabsContent>
      </Tabs>

      <EmbedSnippetDialog
        formId={form.id}
        formName={name || form.name}
        isActive={form.isActive}
        open={embedOpen}
        onOpenChange={setEmbedOpen}
      />

      <EmailTemplatesDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen} />
    </div>
  );
}
