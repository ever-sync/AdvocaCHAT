import { describe, expect, it } from "vitest";
import type { JudicialDeadlineReport } from "@/types/legal-judicial";
import { renderJudicialDeadlineReport } from "./legal-judicial-report";

function fixture(): JudicialDeadlineReport {
  return {
    is_current: true, generated_at: "2026-09-11T15:00:00Z",
    calculation: {
      id: "deadline", case_id: "case", tenant_id: "tenant", category: "restricted", deadline_key: "key", version_number: 1,
      proceeding_id: "proceeding", inbox_id: null, rule_version_id: "rule", calendar_version_id: "calendar",
      input: { deadline_key: "key", title: "Contagem fictícia", proceeding_id: "proceeding", quantity: 3, unit: "business_days", anchor_kind: "publication", anchor_date: "2026-09-14", duration_basis: "Três dias fictícios", conditions_confirmed: true, coverage_confirmed: true, conflict_detected: false, scope: { court: "Órgão fictício", degree: "Grau", unit: "Unidade", territory: "UF" }, assignee_id: "assignee", note: "" },
      snapshot: { rule: { title: "Regra fictícia", version_number: 1, valid_from: "2026-01-01", valid_until: "2026-12-31", sources: [{ title: "Fonte exata", url: "https://example.invalid/source", document_id: "document", checked_on: "2026-09-11" }], body: { exclude_marker: true, due_time: "23:59:59" } }, calendar: { title: "Calendário fictício", version_number: 1, sources: [] } },
      snapshot_hash: "a".repeat(64), engine_version: "f6-v1", state: "reviewed", created_by: "author", created_at: "2026-09-11T15:00:00Z", reviewed_by: "reviewer", reviewed_at: "2026-09-11T15:00:00Z", review_note: "Conferência fictícia", task_id: "task", supersedes_version_id: null,
      result: { proposed_due_on: "2026-09-17", start_marker_on: "2026-09-14", first_counted_on: "2026-09-15", due_at: "2026-09-18T02:59:59Z", timezone: "America/Sao_Paulo", memory: [{ on: "2026-09-17", stage: "count", working_day: true, suspended: false, eligible: true, index: 3, reason: "Dia útil" }], refusals: [] },
    },
  };
}
describe("authorized judicial report rendering", () => {
  it("keeps civil dates and court time explicit with exact source/version and trace", () => {
    const html = renderJudicialDeadlineReport(fixture());
    expect(html).toContain("Vencimento revisado");
    expect(html).toContain("17/09/2026");
    expect(html).toContain("23:59:59 (America/Sao_Paulo)");
    expect(html).toContain('href="https://example.invalid/source"');
    expect(html).toContain("Fonte exata");
    expect(html).toContain("Contador da etapa");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script");
  });
  it("labels stale reviewed output as historical and never as a current reviewed deadline", () => {
    const report = fixture();report.is_current = false;
    const html = renderJudicialDeadlineReport(report);
    expect(html).toContain("Histórico desatualizado");
    expect(html).toContain("Vencimento histórico");
    expect(html).not.toContain("Vencimento revisado");
    expect(html).toContain("não é um prazo final autorizado");
  });
  it("never displays a final result for an incomplete or refused calculation", () => {
    const report = fixture();report.calculation.result.refusals = [{ code: "coverage_gap", message: "Calendário insuficiente" }];
    const html = renderJudicialDeadlineReport(report);
    expect(html).toContain("Nenhuma data final foi definida");
    expect(html).toContain("Calendário insuficiente");
    expect(html).not.toContain("23:59:59 (America/Sao_Paulo)");
    expect(html).not.toContain("<h2>Vencimento");
  });
  it("escapes source, notes and daily text; does not dump raw snapshots or create unsafe links", () => {
    const report = fixture();report.calculation.review_note = '<img src=x onerror="alert(1)">';
    report.calculation.result.memory[0].reason = "</td><script>bad()</script>";
    report.calculation.snapshot.rule = { title: "<svg onload=bad()>", sources: [{ title: "Fonte", url: "javascript:bad()" }] };
    report.calculation.snapshot.unrelated_secret = "DO_NOT_EXPORT_RAW_SNAPSHOT";
    const html = renderJudicialDeadlineReport(report);
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<img");expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("DO_NOT_EXPORT_RAW_SNAPSHOT");
  });
});
