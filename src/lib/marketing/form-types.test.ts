import { describe, expect, it } from "vitest";
import {
  conditionalLogicMatches,
  formFieldGapToCss,
  formFieldGapLabel,
  formFieldWidthToGridSpan,
  isFormStepVisible,
  type FormField,
  type FormFieldConditionalLogic,
  type FormStep,
} from "./form-types";

describe("formFieldWidthToGridSpan", () => {
  it("mapeia 100, 66 e 33 para spans de grid", () => {
    expect(formFieldWidthToGridSpan(100)).toBe(12);
    expect(formFieldWidthToGridSpan(66)).toBe(8);
    expect(formFieldWidthToGridSpan(33)).toBe(4);
  });
});

describe("formFieldGap helpers", () => {
  it("converte espaçamento de layout em CSS legível", () => {
    expect(formFieldGapToCss(2)).toBe("0.5rem");
    expect(formFieldGapToCss(3)).toBe("0.75rem");
    expect(formFieldGapToCss(4)).toBe("1rem");
    expect(formFieldGapToCss(6)).toBe("1.5rem");
  });

  it("expõe rótulos amigáveis para o usuário", () => {
    expect(formFieldGapLabel(2)).toContain("8px");
    expect(formFieldGapLabel(3)).toContain("12px");
    expect(formFieldGapLabel(4)).toContain("16px");
    expect(formFieldGapLabel(6)).toContain("24px");
  });
});

describe("conditionalLogicMatches", () => {
  const values = {
    origem: "instagram",
    canal: "instagram",
    score: "85",
    cidade: "São Paulo",
  };

  it("aceita grupos com E e OU", () => {
    const logic: FormFieldConditionalLogic = {
      groups: [
        {
          join: "all",
          conditions: [
            { field: "origem", operator: "equals", value: "instagram" },
            { field: "cidade", operator: "contains", value: "paulo" },
          ],
        },
        {
          join: "all",
          conditions: [{ field: "score", operator: "greater_than", value: "90" }],
        },
      ],
    };

    expect(conditionalLogicMatches(logic, values)).toBe(true);
  });

  it("compara com outro campo e entende vazio", () => {
    const logic: FormFieldConditionalLogic = {
      groups: [
        {
          join: "all",
          conditions: [
            { field: "origem", operator: "equals", value: "", compareTarget: { kind: "field", field: "canal" } },
            { field: "cidade", operator: "is_not_empty", value: "" },
          ],
        },
      ],
    };

    expect(conditionalLogicMatches(logic, values)).toBe(true);
  });
});

describe("isFormStepVisible", () => {
  it("oculta etapas por regra condicional", () => {
    const step: FormStep = {
      title: "Etapa secreta",
      conditionalLogic: {
        groups: [
          {
            join: "all",
            conditions: [{ field: "origem", operator: "equals", value: "google" }],
          },
        ],
      },
    };

    expect(isFormStepVisible(step, { origem: "instagram" })).toBe(false);
  });
});
