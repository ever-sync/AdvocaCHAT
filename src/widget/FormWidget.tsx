import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_FORM_THEME,
  buildDefaultFormSteps,
  formFieldGapToCss,
  groupFormFieldsIntoRows,
  conditionalLogicMatches,
  isFormFieldVisible,
  isFormStepVisible,
  formFieldWidthToGridSpan,
  stepFieldIds,
  stepRoutingRules,
  isVisualField,
  type FormSettings,
  type FormField,
  type FormTheme,
} from "@/lib/marketing/form-types";
import { validateFormSubmission } from "@/lib/marketing/form-validation";
import { formatPhone } from "@/lib/brasil-api";
import { collectPublicFormMetadata } from "../../supabase/functions/_shared/public-form-privacy";

type PublicForm = {
  id: string;
  name: string;
  fields: FormField[];
  settings: Partial<FormSettings>;
  theme: Partial<FormTheme>;
  submitMessage: string;
  submitRedirectUrl: string | null;
  variantId?: string | null;
};

type PublicFormEventType = "view" | "step_view" | "field_focus" | "field_change" | "step_next" | "step_back" | "submit" | "abandon";

const FUNCTION_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/forms-public`;

function getQueryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function collectMeta(): Record<string, unknown> {
  return collectPublicFormMetadata(window.location.search, document.referrer);
}

function collectHiddenFieldDefaults(fields: FormField[], meta: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const known = new Map<string, unknown>();
  for (const [key, value] of Object.entries(meta)) {
    known.set(key.toLowerCase(), value);
  }
  for (const field of fields) {
    if (field.type !== "hidden") continue;
    const current = field.defaultValue?.trim();
    if (current) {
      defaults[field.name] = current;
      continue;
    }
    const key = field.name.toLowerCase();
    if (known.has(key)) {
      defaults[field.name] = known.get(key);
    }
  }
  return defaults;
}

function fieldInputType(type: FormField["type"]): string {
  if (type === "phone") return "tel";
  if (type === "email") return "email";
  if (type === "date") return "date";
  return "text";
}

function fieldAutoComplete(field: FormField): string | undefined {
  const haystack = `${field.name} ${field.label}`.toLowerCase();
  if (field.type === "email" || /\bemail\b/.test(haystack)) return "email";
  if (field.type === "phone" || /\b(phone|telefone|celular|whatsapp)\b/.test(haystack)) return "tel";
  if (/\b(nome|name)\b/.test(haystack)) return "name";
  if (/\bempresa|company|razao|razão|organizacao|organização\b/.test(haystack)) return "organization";
  if (/\bcep|postal\b/.test(haystack)) return "postal-code";
  if (/\bcidade\b/.test(haystack)) return "address-level2";
  if (/\bestado\b/.test(haystack)) return "address-level1";
  if (/\bcpf\b/.test(haystack)) return "off";
  if (/\bcnpj\b/.test(haystack)) return "off";
  return "on";
}

function buildDraftStorageKey(formId: string | null): string {
  return formId ? `marketing.form.draft.${formId}` : "marketing.form.draft.unknown";
}

function buildSessionStorageKey(formId: string | null): string {
  return formId ? `marketing.form.session.${formId}` : "marketing.form.session.unknown";
}

function getOrCreateSessionId(storageKey: string): string {
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() ?? `sess_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return window.crypto?.randomUUID?.() ?? `sess_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function sendPublicFormEvent(payload: {
  formId: string;
  sessionId: string;
  eventType: PublicFormEventType;
  stepId?: string | null;
  fieldName?: string | null;
  fieldLabel?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const body = JSON.stringify({
    intent: "interaction",
    formId: payload.formId,
    session_id: payload.sessionId,
    event_type: payload.eventType,
    step_id: payload.stepId ?? null,
    field_name: payload.fieldName ?? null,
    field_label: payload.fieldLabel ?? null,
    metadata: payload.metadata ?? {},
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(FUNCTION_URL, blob);
    return;
  }

  void fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function FormWidget() {
  const formId = getQueryParam("formId") ?? getQueryParam("form");
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(0);
  const [isCompactViewport, setIsCompactViewport] = useState(() => window.innerWidth < 640);
  const [sessionId] = useState(() => getOrCreateSessionId(buildSessionStorageKey(formId)));
  const startedAt = useRef<number>(Date.now());
  const draftStorageKey = useMemo(() => buildDraftStorageKey(formId), [formId]);
  const eventViewTracked = useRef(false);
  const lastTrackedStepId = useRef<string | null>(null);
  const lastTrackedField = useRef<string | null>(null);
  const abandonTracked = useRef(false);
  const submittedRef = useRef(false);

  const theme = useMemo<FormTheme>(() => ({ ...DEFAULT_FORM_THEME, ...(form?.theme ?? {}) }), [form]);
  const configuredSteps = useMemo(() => {
    if (!form?.settings.multiStep) return [];
    const raw = Array.isArray(form?.settings.steps) && form!.settings.steps!.length > 0
      ? form!.settings.steps!
      : buildDefaultFormSteps(form?.fields ?? []);
    return raw.map((step, index) => ({
      id: step.id ?? `step_${index + 1}`,
      title: step.title || `Etapa ${index + 1}`,
      fieldIds: stepFieldIds(step),
      conditionalLogic: step.conditionalLogic,
      routingRules: step.routingRules,
    }));
  }, [form]);

  const currentEventStep = useMemo(() => {
    if (!form?.settings.multiStep || configuredSteps.length === 0) return null;
    return configuredSteps[Math.min(step, configuredSteps.length - 1)] ?? null;
  }, [configuredSteps, form, step]);

  useEffect(() => {
    if (!formId) {
      setLoadError("Formulário não especificado.");
      return;
    }
    let cancelled = false;
    fetch(`${FUNCTION_URL}?formId=${encodeURIComponent(formId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Formulário indisponível.");
        if (!cancelled) {
          setForm(json.form as PublicForm);
          startedAt.current = Date.now();
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  useEffect(() => {
    const updateViewport = () => setIsCompactViewport(window.innerWidth < 640);
    updateViewport();
    window.addEventListener("resize", updateViewport, { passive: true });
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!form || !formId) return;
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { values?: Record<string, unknown>; step?: number } | null;
      if (parsed?.values && typeof parsed.values === "object") {
        setValues(parsed.values);
      }
      if (typeof parsed?.step === "number") {
        setStep(parsed.step);
      }
    } catch {
      // ignore invalid draft
    }
  }, [draftStorageKey, form, formId]);

  useEffect(() => {
    if (!form || !formId) return;
    try {
      const payload = JSON.stringify({ values, step });
      window.localStorage.setItem(draftStorageKey, payload);
    } catch {
      // ignore storage errors
    }
  }, [draftStorageKey, form, formId, values, step]);

  useEffect(() => {
    if (!form || !formId || done) return;
    if (eventViewTracked.current) return;
    eventViewTracked.current = true;
    sendPublicFormEvent({
      formId,
      sessionId,
      eventType: "view",
      metadata: {
        multi_step: Boolean(form.settings.multiStep),
        total_fields: form.fields.length,
        total_steps: configuredSteps.length,
      },
    });
  }, [configuredSteps.length, done, form, formId, sessionId]);

  useEffect(() => {
    if (!form || !formId || done) return;
    if (!form.settings.multiStep || configuredSteps.length === 0) return;
    const stepConfig = currentEventStep;
    if (!stepConfig) return;
    const stepId = stepConfig.id ?? `step_${step + 1}`;
    if (lastTrackedStepId.current === stepId) return;
    lastTrackedStepId.current = stepId;
    sendPublicFormEvent({
      formId,
      sessionId,
      eventType: "step_view",
      stepId,
      metadata: {
        step_title: stepConfig.title,
        step_index: step + 1,
        total_steps: configuredSteps.length,
      },
    });
  }, [configuredSteps.length, currentEventStep, done, form, formId, sessionId, step]);

  useEffect(() => {
    const handlePageHide = () => {
      if (!form || !formId || done || submittedRef.current) return;
      if (abandonTracked.current) return;
      abandonTracked.current = true;
      const stepConfig = currentEventStep;
      sendPublicFormEvent({
        formId,
        sessionId,
        eventType: "abandon",
        stepId: stepConfig?.id ?? null,
        fieldName: lastTrackedField.current,
        metadata: {
          step_title: stepConfig?.title ?? null,
          step_index: step + 1,
          total_steps: configuredSteps.length,
          time_to_complete_seconds: Math.round((Date.now() - startedAt.current) / 1000),
          last_field: lastTrackedField.current,
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") handlePageHide();
    };

    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [configuredSteps.length, currentEventStep, done, form, formId, sessionId, step]);

  const fieldById = useMemo(() => {
    return new Map((form?.fields ?? []).map((field) => [field.id, field] as const));
  }, [form]);
  const allVisibleFields = useMemo(
    () => (form?.fields ?? []).filter((field) => field.type !== "hidden" && isFormFieldVisible(field, values)),
    [form, values],
  );
  const groupedFields = useMemo(
    () => groupFormFieldsIntoRows(allVisibleFields, isCompactViewport),
    [allVisibleFields, isCompactViewport],
  );
  const conversational = Boolean((form?.settings as Record<string, unknown> | undefined)?.conversational);
  const fieldGap = form?.settings?.fieldGap ?? 3;
  const gap = formFieldGapToCss(fieldGap);
  const currentStepFieldIds = configuredSteps[step] ? stepFieldIds(configuredSteps[step]) : [];
  function isVisibleStepField(field: FormField | undefined): field is FormField {
    if (!field) return false;
    return field.type !== "hidden" && isFormFieldVisible(field, values);
  }
  const currentStepFields = useMemo(() => {
    if (!form?.settings.multiStep || configuredSteps.length === 0) return allVisibleFields;
    if (!isFormStepVisible(configuredSteps[Math.min(step, configuredSteps.length - 1)], values)) return [];
    return currentStepFieldIds.map((id) => fieldById.get(id)).filter(isVisibleStepField);
  }, [allVisibleFields, configuredSteps.length, currentStepFieldIds, fieldById, form, values]);
  const resolvedStepIndexes = useMemo(() => {
    if (!form?.settings.multiStep || configuredSteps.length === 0) return [];
    return configuredSteps
      .map((stepConfig, index) => ({ index, fieldIds: stepFieldIds(stepConfig) }))
      .filter(({ index, fieldIds }) => {
        const stepConfig = configuredSteps[index];
        if (!isFormStepVisible(stepConfig, values)) return false;
        return fieldIds.map((id) => fieldById.get(id)).some(isVisibleStepField);
      })
      .map(({ index }) => index);
  }, [configuredSteps, fieldById, form, values]);
  const activeStepIndex = useMemo(() => {
    if (!form?.settings.multiStep || resolvedStepIndexes.length === 0) return 0;
    const exact = resolvedStepIndexes.find((index) => index >= step);
    return exact ?? resolvedStepIndexes[resolvedStepIndexes.length - 1] ?? 0;
  }, [form, resolvedStepIndexes, step]);
  const activeStepPosition = resolvedStepIndexes.indexOf(activeStepIndex);

  function getNextStepIndex(currentIndex: number): number | undefined {
    if (!form?.settings.multiStep || configuredSteps.length === 0) return undefined;
    const currentStepConfig = configuredSteps[currentIndex];
    if (!currentStepConfig) return undefined;

    for (const rule of stepRoutingRules(currentStepConfig)) {
      if (!conditionalLogicMatches(rule.conditionalLogic, values)) continue;
      const targetIndex = configuredSteps.findIndex((candidate) => (candidate.id ?? "") === rule.goToStepId);
      if (targetIndex >= 0 && targetIndex !== currentIndex) {
        return targetIndex;
      }
    }

    return resolvedStepIndexes.find((index) => index > currentIndex);
  }

  useEffect(() => {
    if (!form?.settings.multiStep || resolvedStepIndexes.length === 0) return;
    if (!resolvedStepIndexes.includes(step)) {
      setStep(activeStepIndex);
    }
  }, [activeStepIndex, form, resolvedStepIndexes, step]);

  function setValue(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function trackFieldInteraction(field: FormField, eventType: Exclude<PublicFormEventType, "view" | "step_view" | "submit">) {
    if (!form || !formId || done) return;
    lastTrackedField.current = field.name;
    const stepConfig = currentEventStep;
    sendPublicFormEvent({
      formId,
      sessionId,
      eventType,
      stepId: stepConfig?.id ?? null,
      fieldName: field.name,
      fieldLabel: field.label,
      metadata: {
        step_title: stepConfig?.title ?? null,
        step_index: step + 1,
        total_steps: configuredSteps.length,
      },
    });
  }

  function toggleCheckbox(name: string, optionValue: string, checked: boolean) {
    setValues((prev) => {
      const current = Array.isArray(prev[name]) ? (prev[name] as string[]) : [];
      const next = checked ? [...current, optionValue] : current.filter((v) => v !== optionValue);
      return { ...prev, [name]: next };
    });
  }

  /** onChange com máscara de telefone (BR). */
  function handleInputChange(field: FormField, raw: string) {
    setValue(field.name, field.type === "phone" ? formatPhone(raw) : raw);
  }

  /** Valida um único campo (e-mail/telefone) no blur, dando feedback imediato. */
  function validateSingleField(field: FormField) {
    const errs = validateFormSubmission([field], { [field.name]: values[field.name] });
    setErrors((prev) => {
      const next = { ...prev };
      if (errs[field.name]) next[field.name] = errs[field.name];
      else delete next[field.name];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || submitting) return;

    // hidden fields com valor padrão entram no payload
    const payload: Record<string, unknown> = { ...values };
    const meta = collectMeta();
    Object.assign(payload, collectHiddenFieldDefaults(form.fields, meta));

    const validationErrors = validateFormSubmission(form.fields, payload, { steps: form.settings.multiStep ? configuredSteps : undefined });
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    meta.time_to_complete_seconds = Math.round((Date.now() - startedAt.current) / 1000);
    if (form.variantId) meta.variant_id = form.variantId;

    try {
      const res = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formId: form.id, data: payload, meta }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Não foi possível enviar.");
      submittedRef.current = true;
      sendPublicFormEvent({
        formId: form.id,
        sessionId,
        eventType: "submit",
        metadata: {
          time_to_complete_seconds: meta.time_to_complete_seconds,
          total_fields: form.fields.length,
          multi_step: Boolean(form.settings.multiStep),
        },
      });
      if (json.redirect_url) {
        window.location.href = String(json.redirect_url);
        return;
      }
      try {
        window.localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore storage errors
      }
      setDone(true);
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : "Não foi possível enviar." });
    } finally {
      setSubmitting(false);
    }
  }

  const wrapStyle: React.CSSProperties = {
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
    borderRadius: theme.borderRadius,
    fontFamily: theme.fontFamily,
    padding: 20,
    maxWidth: 640,
    margin: "0 auto",
    boxSizing: "border-box",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 500, marginBottom: 6 };
  const primaryBtnStyle: React.CSSProperties = {
    padding: "11px 16px",
    border: "none",
    borderRadius: theme.borderRadius,
    backgroundColor: theme.primaryColor,
    color: "#fff",
    fontSize: 15,
    fontWeight: 600,
    cursor: submitting ? "default" : "pointer",
    opacity: submitting ? 0.7 : 1,
    fontFamily: "inherit",
  };
  const secondaryBtnStyle: React.CSSProperties = {
    padding: "11px 16px",
    border: "1px solid #d1d5db",
    borderRadius: theme.borderRadius,
    background: "transparent",
    color: "inherit",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  function goNext() {
    const currentFields = form?.settings.multiStep ? currentStepFields : allVisibleFields;
    if (currentFields.length === 0) return;
    const errs = validateFormSubmission(currentFields, values);
    if (Object.keys(errs).length > 0) {
      setErrors((p) => ({ ...p, ...errs }));
      return;
    }
    setErrors((p) => {
      const next = { ...p };
      for (const field of currentFields) delete next[field.name];
      return next;
    });
    if (form?.settings.multiStep && resolvedStepIndexes.length > 0) {
      const nextIndex = getNextStepIndex(step);
      if (nextIndex !== undefined) {
        setStep(nextIndex);
      }
      return;
    }
    setStep((s) => Math.min(s + 1, allVisibleFields.length - 1));
  }

  function goBack() {
    if (form?.settings.multiStep && resolvedStepIndexes.length > 0) {
      const prevIndex = resolvedStepIndexes[activeStepPosition - 1];
      if (prevIndex !== undefined) {
        setStep(prevIndex);
      }
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  function renderField(field: FormField) {
    if (isVisualField(field.type)) {
      if (field.type === "title") {
        return (
          <div key={field.id} style={{ marginBottom: "0.5rem" }}>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, color: theme.textColor, margin: 0 }}>
              {field.label}
            </h3>
          </div>
        );
      }
      if (field.type === "description") {
        return (
          <div key={field.id} style={{ marginBottom: "0.5rem" }}>
            <p style={{ fontSize: "0.875rem", color: theme.textColor, opacity: 0.8, margin: 0, whiteSpace: "pre-wrap" }}>
              {field.defaultValue}
            </p>
          </div>
        );
      }
      if (field.type === "image") {
        return (
          <div key={field.id} style={{ marginBottom: "0.5rem", width: "100%", display: "flex", justifyContent: "center" }}>
            {field.defaultValue ? (
              <img src={field.defaultValue} alt={field.label} style={{ maxWidth: "100%", borderRadius: theme.borderRadius }} />
            ) : null}
          </div>
        );
      }
      return null;
    }

    const err = errors[field.name];
    return (
      <div key={field.id}>
        {field.type !== "checkbox" && field.type !== "radio" ? (
          <label style={labelStyle} htmlFor={`f_${field.id}`}>
            {field.label}
            {field.required ? <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span> : null}
          </label>
        ) : (
          <p style={labelStyle}>
            {field.label}
            {field.required ? <span style={{ color: "#ef4444", marginLeft: 4 }}>*</span> : null}
          </p>
        )}

        {(field.type === "text" || field.type === "email" || field.type === "phone" || field.type === "date") && (
          <input
            id={`f_${field.id}`}
            type={fieldInputType(field.type)}
            inputMode={field.type === "phone" ? "tel" : field.type === "email" ? "email" : undefined}
            maxLength={field.type === "phone" ? 16 : undefined}
            autoComplete={fieldAutoComplete(field)}
            autoCapitalize={field.type === "email" || field.type === "phone" ? "off" : "words"}
            placeholder={field.placeholder ?? ""}
            style={inputStyle}
            value={(values[field.name] as string) ?? ""}
            onChange={(e) => handleInputChange(field, e.target.value)}
            onBlur={() => {
              trackFieldInteraction(field, "field_change");
              if (field.type === "email" || field.type === "phone") validateSingleField(field);
            }}
            onFocus={() => trackFieldInteraction(field, "field_focus")}
          />
        )}

        {field.type === "textarea" && (
          <textarea
            id={`f_${field.id}`}
            rows={3}
            placeholder={field.placeholder ?? ""}
            autoComplete={fieldAutoComplete(field)}
            autoCapitalize="sentences"
            style={inputStyle}
            value={(values[field.name] as string) ?? ""}
            onChange={(e) => {
              setValue(field.name, e.target.value);
              trackFieldInteraction(field, "field_change");
            }}
            onFocus={() => trackFieldInteraction(field, "field_focus")}
          />
        )}

        {field.type === "select" && (
          <select
            id={`f_${field.id}`}
            style={inputStyle}
            value={(values[field.name] as string) ?? ""}
            onChange={(e) => {
              setValue(field.name, e.target.value);
              trackFieldInteraction(field, "field_change");
            }}
            onFocus={() => trackFieldInteraction(field, "field_focus")}
          >
            <option value="">Selecione...</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {field.type === "radio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(field.options ?? []).map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="radio"
                    name={field.name}
                    value={opt.value}
                    checked={values[field.name] === opt.value}
                    onChange={() => {
                      setValue(field.name, opt.value);
                      trackFieldInteraction(field, "field_change");
                    }}
                  />
                  {opt.label}
                </label>
            ))}
          </div>
        )}

        {field.type === "checkbox" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(field.options ?? []).map((opt) => {
              const arr = Array.isArray(values[field.name]) ? (values[field.name] as string[]) : [];
              return (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={arr.includes(opt.value)}
                    onChange={(e) => {
                      toggleCheckbox(field.name, opt.value, e.target.checked);
                      trackFieldInteraction(field, "field_change");
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}

        {field.helpText ? <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{field.helpText}</p> : null}
        {err ? <p style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>{err}</p> : null}
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ ...wrapStyle, textAlign: "center" }}>
        <p style={{ fontSize: 14 }}>{loadError}</p>
      </div>
    );
  }
  if (!form) {
    return (
      <div style={wrapStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
          <div
            style={{
              height: 14,
              width: "42%",
              borderRadius: 6,
              background: "linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.06) 75%)",
              backgroundSize: "200% 100%",
              animation: "wchat-form-shimmer 1.2s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 40,
              borderRadius: 8,
              background: "linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.09) 50%, rgba(0,0,0,0.05) 75%)",
              backgroundSize: "200% 100%",
              animation: "wchat-form-shimmer 1.2s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 40,
              borderRadius: 8,
              background: "linear-gradient(90deg, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.09) 50%, rgba(0,0,0,0.05) 75%)",
              backgroundSize: "200% 100%",
              animation: "wchat-form-shimmer 1.2s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: 44,
              width: "36%",
              marginTop: 4,
              borderRadius: 8,
              background: "linear-gradient(90deg, rgba(109,40,217,0.15) 25%, rgba(109,40,217,0.28) 50%, rgba(109,40,217,0.15) 75%)",
              backgroundSize: "200% 100%",
              animation: "wchat-form-shimmer 1.2s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`@keyframes wchat-form-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }
  if (done) {
    return (
      <div style={{ ...wrapStyle, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
        <p style={{ fontSize: 15, fontWeight: 500 }}>{form.submitMessage || "Obrigado!"}</p>
      </div>
    );
  }

  return (
    <form style={wrapStyle} onSubmit={handleSubmit} noValidate>
      {/* honeypot anti-bot */}
      <input
        type="text"
        name="_hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        onChange={(e) => setValue("_hp", e.target.value)}
      />

      {form?.settings.multiStep && configuredSteps.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {configuredSteps.map((item, index) => {
              const hasVisible = isFormStepVisible(item, values) && stepFieldIds(item).map((id) => fieldById.get(id)).some(isVisibleStepField);
              const active = index === activeStepIndex;
              return (
                <button
                  key={item.id ?? index}
                  type="button"
                  onClick={() => setStep(index)}
                  style={{
                    ...secondaryBtnStyle,
                    padding: "8px 12px",
                    borderColor: active ? theme.primaryColor : "#d1d5db",
                    color: active ? theme.primaryColor : "inherit",
                    background: active ? "rgba(109, 40, 217, 0.06)" : "transparent",
                    opacity: hasVisible ? 1 : 0.5,
                  }}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Etapa {Math.min(activeStepPosition + 1, resolvedStepIndexes.length || configuredSteps.length)} de {configuredSteps.length}
          </div>
        </div>
      ) : null}

      {conversational && allVisibleFields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {form?.settings.multiStep && configuredSteps.length > 0 ? (
            <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
              Etapa {Math.min(activeStepPosition + 1, resolvedStepIndexes.length || configuredSteps.length)} de {configuredSteps.length}
            </p>
          ) : (
            <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>
              Pergunta {Math.min(step + 1, allVisibleFields.length)} de {allVisibleFields.length}
            </p>
          )}
          {renderField((form?.settings.multiStep && configuredSteps.length > 0 ? currentStepFields : allVisibleFields)[0] ?? allVisibleFields[0])}
          {errors._form ? <p style={{ fontSize: 13, color: "#ef4444" }}>{errors._form}</p> : null}
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 ? (
              <button type="button" onClick={goBack} style={secondaryBtnStyle}>
                Voltar
              </button>
            ) : null}
            {form?.settings.multiStep && configuredSteps.length > 0 ? (
              activeStepPosition < resolvedStepIndexes.length - 1 ? (
                <button type="button" onClick={goNext} style={{ ...primaryBtnStyle, flex: 1 }}>
                  Avançar
                </button>
              ) : (
                <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, flex: 1 }}>
                  {submitting ? "Enviando…" : "Enviar"}
                </button>
              )
            ) : step < allVisibleFields.length - 1 ? (
              <button type="button" onClick={goNext} style={{ ...primaryBtnStyle, flex: 1 }}>
                Avançar
              </button>
            ) : (
              <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, flex: 1 }}>
                {submitting ? "Enviando…" : "Enviar"}
              </button>
            )}
          </div>
        </div>
      ) : form?.settings.multiStep && configuredSteps.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {!isFormStepVisible(configuredSteps[Math.min(step, configuredSteps.length - 1)], values) ? (
            <div style={{ border: "1px dashed #d1d5db", borderRadius: theme.borderRadius, padding: 16, fontSize: 13, opacity: 0.7 }}>
              Esta etapa está oculta pelas respostas atuais.
            </div>
          ) : currentStepFields.length === 0 ? (
            <div style={{ border: "1px dashed #d1d5db", borderRadius: theme.borderRadius, padding: 16, fontSize: 13, opacity: 0.7 }}>
              Nenhum campo visível nesta etapa.
            </div>
          ) : (
            currentStepFields.map((field) => renderField(field))
          )}
          <div>
            {errors._form ? <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 12 }}>{errors._form}</p> : null}
            <div style={{ display: "flex", gap: 8 }}>
              {activeStepPosition > 0 ? (
                <button type="button" onClick={goBack} style={secondaryBtnStyle}>
                  Voltar
                </button>
              ) : null}
              {activeStepPosition < resolvedStepIndexes.length - 1 ? (
                <button type="button" onClick={goNext} style={{ ...primaryBtnStyle, flex: 1 }}>
                  Avançar
                </button>
              ) : (
                <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, flex: 1 }}>
                  {submitting ? "Enviando…" : "Enviar"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {groupedFields.map((row, index) => (
            <div key={index} style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap }}>
              {row.map((field) => {
                const span = isCompactViewport ? 12 : formFieldWidthToGridSpan(field.layoutWidth);
                return (
                  <div key={field.id} style={{ gridColumn: `span ${span} / span ${span}`, minWidth: 0 }}>
                    {renderField(field)}
                  </div>
                );
              })}
            </div>
          ))}
          <div>
            {errors._form ? <p style={{ fontSize: 13, color: "#ef4444", marginBottom: 12 }}>{errors._form}</p> : null}
            <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, width: "100%" }}>
              {submitting ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
