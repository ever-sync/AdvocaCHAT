import type {
  IrAssessmentVersion,
  IrCaseContext,
  IrChecklistItem,
  IrDocumentReview,
  IrEvidenceEvent,
  IrIncomeSource,
  IrPayer,
} from "@/types/legal-ir";

export type IrDossierData = {
  context: IrCaseContext;
  payers: IrPayer[];
  incomes: IrIncomeSource[];
  evidence: IrEvidenceEvent[];
  reviews: IrDocumentReview[];
  checklist: IrChecklistItem[];
  assessments: IrAssessmentVersion[];
};

export type IrReadiness = {
  score: number;
  level: "initial" | "attention" | "review" | "ready";
  pendingRequired: number;
  inconsistentDocuments: number;
  sourcesWithoutWithholdingAnswer: number;
  evidenceWithoutExactDate: number;
  nextAction: string;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);

export function deriveIrReadiness(data: IrDossierData): IrReadiness {
  const checklistState = new Map(data.context.checklist_states.map((item) => [item.item_id, item.state]));
  const pendingRequired = data.checklist.filter((item) =>
    item.required && !["approved", "waived"].includes(checklistState.get(item.id) ?? "pending"),
  ).length;
  const inconsistentDocuments = data.reviews.filter((item) => item.result === "inconsistent").length;
  const sourcesWithoutWithholdingAnswer = data.incomes.filter((item) => item.withholding_reported === "unknown").length;
  const evidenceWithoutExactDate = data.evidence.filter((item) => item.date_precision !== "exact").length;
  const hasCurrentAssessment = Boolean(data.context.latest_assessment_id && data.context.assessment_is_current);
  const blockers = pendingRequired + inconsistentDocuments + sourcesWithoutWithholdingAnswer;
  const completeness = [data.payers.length > 0, data.incomes.length > 0, data.evidence.length > 0, data.checklist.length > 0, hasCurrentAssessment]
    .filter(Boolean).length;
  const score = Math.max(0, Math.min(100, completeness * 20 - Math.min(50, blockers * 10)));
  const level = score >= 90 && blockers === 0 ? "ready" : score >= 60 ? "review" : score >= 30 ? "attention" : "initial";
  const nextAction = data.payers.length === 0
    ? "Cadastrar a primeira fonte pagadora"
    : data.incomes.length === 0
      ? "Cadastrar os rendimentos de cada fonte"
      : pendingRequired > 0
        ? `Resolver ${pendingRequired} item(ns) obrigatório(s) do checklist`
        : inconsistentDocuments > 0
          ? `Revisar ${inconsistentDocuments} divergência(s) documental(is)`
          : sourcesWithoutWithholdingAnswer > 0
            ? "Confirmar a retenção informada nos rendimentos"
            : !hasCurrentAssessment
              ? "Preparar uma análise profissional atualizada"
              : "Revisar o conjunto e definir a próxima providência do caso";
  return { score, level, pendingRequired, inconsistentDocuments, sourcesWithoutWithholdingAnswer, evidenceWithoutExactDate, nextAction };
}

export function buildIrCaseDossier(data: IrDossierData, caseTitle: string, generatedAt = new Date()): string {
  const readiness = deriveIrReadiness(data);
  const payerName = new Map(data.payers.map((item) => [item.id, item.name]));
  const rows = (values: string[], empty: string) => values.length ? `<ul>${values.join("")}</ul>` : `<p>${empty}</p>`;
  const assessment = data.assessments.find((item) => item.id === data.context.latest_assessment_id);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'"><title>Dossiê IR · ${escapeHtml(caseTitle)}</title><style>body{font:14px/1.55 system-ui,sans-serif;color:#172132;max-width:920px;margin:32px auto;padding:0 24px}h1{font-size:26px}h2{margin-top:28px;font-size:18px}li{margin:7px 0;overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.card{border:1px solid #d8dee8;border-radius:8px;padding:12px}.notice{border-left:4px solid #b45309;background:#fff8e8;padding:12px}.small{font-size:12px;color:#526071}@media print{body{margin:0;padding:0;font-size:10pt}.print-help{display:none}@page{size:A4;margin:16mm}}</style></head><body><header><p class="small">AdvocaCHAT · Documento reservado e sujeito à revisão profissional</p><h1>Dossiê assistido de isenção de IR</h1><p>${escapeHtml(caseTitle)}</p><p class="small">Gerado em ${escapeHtml(generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }))} (São Paulo).</p></header><p class="print-help">Use Imprimir no navegador para salvar uma cópia em PDF.</p><section><h2>Prontidão operacional</h2><div class="summary"><div class="card"><strong>${readiness.score}%</strong><br>Índice de organização</div><div class="card"><strong>Próxima ação</strong><br>${escapeHtml(readiness.nextAction)}</div><div class="card"><strong>${readiness.pendingRequired}</strong><br>Itens obrigatórios pendentes</div><div class="card"><strong>${readiness.inconsistentDocuments}</strong><br>Divergências documentais</div></div><p class="notice">O índice mede organização do dossiê. Não determina direito, probabilidade de êxito ou valor recuperável.</p></section><section><h2>Fontes e rendimentos</h2>${rows(data.incomes.map((item) => `<li><strong>${escapeHtml(payerName.get(item.payer_id) ?? "Fonte pagadora")}</strong> · ${escapeHtml(item.income_kind)} · retenção informada: ${escapeHtml(item.withholding_reported)}</li>`), "Nenhum rendimento acessível cadastrado.")}</section><section><h2>Cronologia e evidências</h2>${rows(data.evidence.map((item) => `<li>${escapeHtml(item.event_date ?? "Data não informada")} · ${escapeHtml(item.description)} · precisão: ${escapeHtml(item.date_precision)}</li>`), "Nenhum fato acessível registrado.")}</section><section><h2>Checklist</h2>${rows(data.checklist.map((item) => `<li>${escapeHtml(item.title)} · ${escapeHtml(data.context.checklist_states.find((state) => state.item_id === item.id)?.state ?? "pending")}${item.required ? " · obrigatório" : ""}</li>`), "Nenhum checklist aplicado.")}</section><section><h2>Análise profissional</h2>${assessment ? `<p>Versão ${assessment.version_number} · ${escapeHtml(assessment.status)}</p><p>${escapeHtml(assessment.summary)}</p>` : "<p>Nenhuma análise atual acessível.</p>"}<p class="small">A análise interna não comprova concessão externa, cessação de retenção ou recebimento.</p></section><footer class="small"><p>Revisão de entrada ${data.context.control.input_revision}. A situação atual deve ser conferida no caso antes de qualquer providência.</p></footer></body></html>`;
}

export function downloadIrCaseDossier(data: IrDossierData, caseTitle: string): void {
  const url = URL.createObjectURL(new Blob([buildIrCaseDossier(data, caseTitle)], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dossie-ir-${caseTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "caso"}.html`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
