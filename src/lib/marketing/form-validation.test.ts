import { describe, expect, it } from "vitest";
import { validateFormSubmission } from "./form-validation";
import type { FormField, FormStep } from "./form-types";

function requiredField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: "field-1",
    type: "text",
    name: "campo",
    label: "Campo",
    required: true,
    ...overrides,
  };
}

describe("validateFormSubmission", () => {
  it("rejeita checkbox obrigatório vazio", () => {
    const errors = validateFormSubmission(
      [requiredField({ type: "checkbox" })],
      { campo: [] },
    );

    expect(errors.campo).toContain("obrigatório");
  });

  it("rejeita radio obrigatório sem seleção", () => {
    const errors = validateFormSubmission(
      [requiredField({ type: "radio" })],
      { campo: "" },
    );

    expect(errors.campo).toContain("obrigatório");
  });

  it("ignora campos de etapas ocultas na validação", () => {
    const fields: FormField[] = [
      requiredField({ id: "flag", name: "flag", label: "Flag", required: false }),
      requiredField({ id: "nome", name: "nome", label: "Nome" }),
    ];
    const steps: FormStep[] = [
      { title: "Etapa 1", fieldIds: ["flag"] },
      {
        title: "Etapa 2",
        fieldIds: ["nome"],
        conditionalLogic: {
          groups: [
            {
              join: "all",
              conditions: [{ field: "flag", operator: "equals", value: "sim" }],
            },
          ],
        },
      },
    ];

    const errors = validateFormSubmission(fields, { flag: "nao" }, { steps });
    expect(errors.nome).toBeUndefined();
  });
});
