import { describe, expect, it } from "vitest";
import { buildIrCaseDossier, deriveIrReadiness, type IrDossierData } from "./legal-ir-dossier";

const base = {
  context: {
    control: { case_id: "case", tenant_id: "tenant", input_revision: 4, workflow_status: "in_legal_review", updated_at: null },
    can_fiscal: true, can_medical: true, can_assess: true,
    latest_assessment_id: "assessment", assessment_is_current: true,
    checklist_states: [{ item_id: "required", document_request_id: null, state: "approved" }], representation_states: [],
  },
  payers: [{ id: "payer", name: "INSS" }],
  incomes: [{ id: "income", payer_id: "payer", income_kind: "retirement", withholding_reported: "yes" }],
  evidence: [{ id: "event", event_date: "2026-01-01", date_precision: "exact", description: "Laudo conferido" }],
  reviews: [{ id: "review", result: "sufficient" }],
  checklist: [{ id: "required", title: "Documento de identidade", required: true }],
  assessments: [{ id: "assessment", version_number: 2, status: "approved", summary: "Revisão humana concluída" }],
} as unknown as IrDossierData;

describe("dossiê consolidado de isenção de IR", () => {
  it("considera completo somente o conjunto atual sem bloqueadores", () => {
    expect(deriveIrReadiness(base)).toMatchObject({ score: 100, level: "ready", pendingRequired: 0, inconsistentDocuments: 0 });
  });

  it("prioriza checklist obrigatório antes da análise profissional", () => {
    const data = structuredClone(base);
    data.context.checklist_states[0].state = "pending";
    data.context.assessment_is_current = false;
    const result = deriveIrReadiness(data);
    expect(result.pendingRequired).toBe(1);
    expect(result.nextAction).toContain("item(ns) obrigatório(s)");
    expect(result.level).not.toBe("ready");
  });

  it("escapa conteúdo privado e explica que prontidão não é direito", () => {
    const data = structuredClone(base);
    data.evidence[0].description = '<script>alert("laudo")</script>';
    const html = buildIrCaseDossier(data, "Caso <reservado>", new Date("2026-09-12T12:00:00Z"));
    expect(html).not.toContain('<script>alert("laudo")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;laudo&quot;)&lt;/script&gt;");
    expect(html).toContain("Não determina direito, probabilidade de êxito ou valor recuperável");
    expect(html).toContain("Revisão de entrada 4");
  });
});
