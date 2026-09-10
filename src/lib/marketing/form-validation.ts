// Validação de formulários: do builder (config) e de submissão (respostas).
// Portado de formularios/lib/forms/builder-validation.ts + lib/services/form-validator.ts.

import {
  fieldNeedsOptions,
  isFormFieldVisible,
  isFormStepVisible,
  stepFieldIds,
  isVisualField,
  type FormField,
  type FormStep,
} from "@/lib/marketing/form-types";

export interface BuilderValidationResult {
  fieldErrors: Record<string, string[]>;
  hasErrors: boolean;
  totalErrors: number;
}

export interface SubmissionValidationOptions {
  steps?: FormStep[];
}

const NAME_REGEX = /^[a-z][a-z0-9_]*$/;

/** Valida a configuração dos campos no construtor (rótulos, nomes, opções, regex). */
export function validateBuilderFields(fields: FormField[]): BuilderValidationResult {
  const fieldErrors: Record<string, string[]> = {};
  const nameMap = new Map<string, string[]>();

  for (const field of fields) {
    const errors: string[] = [];
    const label = field.label.trim();
    const name = field.name.trim();

    if (!label) {
      errors.push("Rótulo obrigatório.");
    }

    if (!name) {
      errors.push("Identificador obrigatório.");
    } else if (!NAME_REGEX.test(name)) {
      errors.push("Identificador deve começar com letra e usar apenas a-z, 0-9 e _.");
    }

    if (fieldNeedsOptions(field.type)) {
      const options = field.options ?? [];
      const validOptions = options.filter((opt) => opt.label.trim().length > 0);
      if (validOptions.length < 1) {
        errors.push("Adicione pelo menos 1 opção válida.");
      }
    }

    if (field.validation?.minLength !== undefined && field.validation.minLength < 0) {
      errors.push("Mínimo de caracteres não pode ser negativo.");
    }

    if (
      field.validation?.minLength !== undefined &&
      field.validation?.maxLength !== undefined &&
      field.validation.minLength > field.validation.maxLength
    ) {
      errors.push("Mínimo de caracteres não pode ser maior que máximo.");
    }

    if (field.validation?.pattern) {
      try {
        new RegExp(field.validation.pattern);
      } catch {
        errors.push("Regex de validação inválida.");
      }
    }

    if (errors.length > 0) {
      fieldErrors[field.id] = errors;
    }

    if (name) {
      const ids = nameMap.get(name) ?? [];
      ids.push(field.id);
      nameMap.set(name, ids);
    }
  }

  for (const ids of nameMap.values()) {
    if (ids.length > 1) {
      for (const id of ids) {
        fieldErrors[id] = [...(fieldErrors[id] ?? []), "Identificador duplicado."];
      }
    }
  }

  const totalErrors = Object.values(fieldErrors).reduce((acc, errors) => acc + errors.length, 0);
  return {
    fieldErrors,
    totalErrors,
    hasErrors: totalErrors > 0,
  };
}

function isValidPhone(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  const normalized = raw.replace(/[^\d+]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");

  // E.164: máximo 15 dígitos; formatos locais costumam ter ao menos 10.
  if (digitsOnly.length < 10 || digitsOnly.length > 15) return false;

  // Rejeita valores óbvios como 00000000000.
  if (/^(\d)\1+$/.test(digitsOnly)) return false;

  // Se tem "+", precisa estar no início.
  if (normalized.includes("+") && !normalized.startsWith("+")) return false;

  return true;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida as respostas de uma submissão contra a definição dos campos. */
export function validateFormSubmission(
  fields: FormField[],
  data: Record<string, unknown>,
  options: SubmissionValidationOptions = {},
): Record<string, string> {
  const errors: Record<string, string> = {};
  const visibleStepFieldIds = new Set<string>();
  if (Array.isArray(options.steps) && options.steps.length > 0) {
    for (const step of options.steps) {
      if (!isFormStepVisible(step, data)) continue;
      for (const fieldId of stepFieldIds(step)) visibleStepFieldIds.add(fieldId);
    }
  }

  function isEmptySubmissionValue(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) {
      return value.length === 0 || value.every((item) => String(item ?? "").trim() === "");
    }
    return String(value).trim() === "";
  }

  for (const field of fields) {
    if (field.type === "hidden") continue;
    if (isVisualField(field.type)) continue;
    if (visibleStepFieldIds.size > 0 && !visibleStepFieldIds.has(field.id)) continue;
    if (!isFormFieldVisible(field, data)) continue;

    const value = data[field.name];

    if (field.required && isEmptySubmissionValue(value)) {
      errors[field.name] = `${field.label} é obrigatório`;
      continue;
    }

    if (isEmptySubmissionValue(value)) continue;

    if (field.type === "email" && !EMAIL_REGEX.test(String(value))) {
      errors[field.name] = `${field.label} deve ser um e-mail válido`;
    }

    if (field.type === "phone" && !isValidPhone(value)) {
      errors[field.name] = `${field.label} deve ser um telefone válido`;
    }

    if (field.validation?.minLength && String(value).length < field.validation.minLength) {
      errors[field.name] = `${field.label} deve ter no mínimo ${field.validation.minLength} caracteres`;
    }

    if (field.validation?.maxLength && String(value).length > field.validation.maxLength) {
      errors[field.name] = `${field.label} deve ter no máximo ${field.validation.maxLength} caracteres`;
    }

    if (field.validation?.pattern && !new RegExp(field.validation.pattern).test(String(value))) {
      errors[field.name] = `${field.label} está em formato inválido`;
    }
  }

  return errors;
}
