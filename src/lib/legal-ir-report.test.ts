import { describe, expect, it } from "vitest";
import { buildIrCalculationReport, type PrintableIrReport } from "./legal-ir-report";
import type { IrTaxComputation } from "@/types/legal-ir-calculations";

function fixture(): PrintableIrReport {
  const memory: IrTaxComputation = {
    taxable: "6000.00", legal_deductions: "649.60", simplified_deduction_raw: "607.200000", simplified_rounding: "half_up_2", simplified_deduction: "607.20", deduction_used: "649.60", base: "5350.40", rate: "0.275", bracket_deduction: "908.73", tax_before_reduction: "562.63", reduction_raw: "179.750000", reduction_used: "179.75", tax_due: "382.88", boundary_formula_residual: "0.00", rounding: { mode: "half_up", scale: 2, tax_stage: "before_reduction", reduction_stage: "round" },
  };
  return {
    is_current: true, generated_at: "2026-09-11T12:00:00Z",
    calculation: {
      id: "calculation", case_id: "case", tenant_id: "tenant", version_number: 2, assessment_id: "assessment", periodicity: "monthly", calendar_year: 2026, month: 1, deduction_mode: "most_favorable", tax_residency: "resident", input_hash: "a".repeat(64),
      snapshot: { engine_version: "ordinary_numeric_v1", assessment: { version_number: 1, snapshot: { payers: [{ id: "payer", name: "Fonte sintética" }], document_reviews: [{ diagnostic_text: "SECRET_MEDICAL_REVIEW_NOT_SELECTED" }] } }, imports: [{ id: "import", title: "Informe original", document_id: "private-document" }], entries: [{ id: "line", import_id: "import", payment_date: "2026-01-02", competence: "2025-12", source_page: 1, source_line: "2", gross: "6000.00", taxable: "6000.00", withheld: "382.88", legal_deductions: "649.60", raw_data: { internal: "SECRET_RAW_CONTENT_NOT_SELECTED" } }], parameters: [{ id: "parameter", title: "Tabela mensal", version_number: 1, valid_from: "2026-01-01", valid_until: "2026-12-31", body: { validity_note: "Conferência sintética", reduction: { boundary: "zero_at_upper" }, sources: [{ url: "https://www.gov.br/receitafederal/", checked_on: "2026-09-11" }] } }] },
      adjustments: [], result: { scope: "monthly_by_payer", baseline_tax: "382.88", proposed_tax: "382.88", hypothesis_difference: "0.00", withheld_reported: "382.88", recognized_credit: null, received: null, groups: [{ parameter_version_id: "parameter", payer_id: "payer", period: "2026-01", entry_ids: ["line"], baseline: memory, proposed: memory }], monetary_update: { status: "not_calculated", reason: "Atualização monetária não calculada." } },
      refusals: [], status: "approved", inventory_complete: true, completeness_note: "Inventário sintético conferido.", created_by: "author", created_at: "2026-09-11T10:00:00Z", reviewer_id: "reviewer", review_note: "Revisão sintética.", reviewed_at: "2026-09-11T11:00:00Z",
    },
  };
}

describe("reserved IR calculation report", () => {
  it("shows exact money, source rows, parameter version and rounding without exposing the raw medical snapshot", () => {
    const input = fixture();
    input.calculation.result.hypothesis_difference = "90071992547409.01";
    const html = buildIrCalculationReport(input);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.body.textContent).toContain("R$ 90.071.992.547.409,01");
    expect(doc.body.textContent).toContain("27,5%");
    expect(doc.body.textContent).toContain("179.750000");
    expect(doc.body.textContent).toContain("2025-12");
    expect(doc.body.textContent).toContain("Informe original");
    expect(doc.body.textContent).toContain("Tabela mensal · versão 1");
    expect(doc.body.textContent).toContain("Desconto simplificado: arredondado antes da base");
    expect(html).not.toContain("SECRET_MEDICAL_REVIEW_NOT_SELECTED");
    expect(html).not.toContain("SECRET_RAW_CONTENT_NOT_SELECTED");
  });

  it("renders untrusted titles, notes and source URLs as inert content with no script or remote asset", () => {
    const input = fixture();
    const payload = '<img src="https://evil.invalid/x" onerror="alert(1)"><script>alert(1)</script>';
    input.calculation.review_note = payload;
    input.calculation.snapshot = { parameters: [{ title: payload, body: { sources: [{ url: "javascript:alert(1)", title: payload }, { url: "https://user:password@example.invalid/" }] } }] };
    const doc = new DOMParser().parseFromString(buildIrCalculationReport(input, payload), "text/html");
    expect(doc.querySelector("script, img, iframe, link, form")).toBeNull();
    expect(doc.querySelector("a")).toBeNull();
    expect(doc.body.textContent).toContain(payload);
    expect(doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content")).toContain("default-src 'none'");
    expect(doc.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
  });

  it("marks outdated approved versions and never presents an incomplete scenario as a zero total", () => {
    const input = fixture();
    input.is_current = false;
    expect(buildIrCalculationReport(input)).toContain("Versão desatualizada");
    input.calculation.status = "incomplete";
    input.calculation.refusals = [{ code: "residency_not_covered", message: "Residência ainda não confirmada." }];
    const html = buildIrCalculationReport(input);
    expect(html).toContain("Sem resultado total");
    expect(html).toContain("Residência ainda não confirmada");
    expect(html).not.toContain("Imposto do cenário documental");
    expect(html).not.toContain("Imposto calculado</th>");
  });
});
