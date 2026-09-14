import { describe, expect, it } from "vitest";
import { analyzeMedicalDocument } from "./legal-medical-document-analysis";

describe("classificação assistida de documento médico", () => {
  it("aponta provável laudo com evidências por página", () => {
    const result = analyzeMedicalDocument([
      {
        page: 1,
        status: "recognized",
        text: "LAUDO MÉDICO\nPaciente: Maria\nHistórico clínico e diagnóstico.",
      },
      {
        page: 2,
        status: "recognized",
        text: "Conclusão médica. CRM/SP 123456. Assinado digitalmente em 10/09/2026.",
      },
    ]);
    expect(result.classification).toBe("probable_medical_report");
    expect(
      result.signals.find((signal) => signal.key === "registration")?.pages,
    ).toEqual([2]);
    expect(result.suggestedChecks.issuer).toBe("present");
  });

  it("não confunde receita com laudo", () => {
    const result = analyzeMedicalDocument([
      {
        page: 1,
        status: "recognized",
        text: "Receita médica. Uso oral. Tomar um comprimido.",
      },
    ]);
    expect(result.classification).toBe("probably_other");
  });

  it("mantém arquivo sem texto como ilegível", () => {
    const result = analyzeMedicalDocument([
      { page: 1, status: "no_text_recognized", text: null },
    ]);
    expect(result.classification).toBe("unreadable");
    expect(result.suggestedChecks.readability).toBe("absent");
  });
});
