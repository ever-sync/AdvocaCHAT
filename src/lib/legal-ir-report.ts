import type { IrCalculationVersion, IrTaxComputation } from "@/types/legal-ir-calculations";
import type { IrJson } from "@/types/legal-ir";
import { formatIrMoney } from "./legal-ir-import";

export interface PrintableIrReport {
  calculation: IrCalculationVersion;
  is_current: boolean;
  generated_at: string;
}

const escape = (value: unknown): string => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const record = (value: IrJson | undefined): Record<string, IrJson> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const records = (value: IrJson | undefined): Record<string, IrJson>[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: IrJson | undefined): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
const amount = (value: string | null | undefined) => escape(formatIrMoney(value));
const statusLabels = { incomplete: "Incompleto", draft: "Cenário para revisão", in_review: "Em revisão", approved: "Revisado internamente", superseded: "Versão substituída" };

function sourceLink(value: IrJson | undefined): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password) return `<a href="${escape(url.href)}" rel="noreferrer noopener">${escape(raw)}</a>`;
  } catch { /* Preserve an invalid reference as inert text for review. */ }
  return escape(raw);
}

function percentage(value: string): string {
  if (!/^\d+(\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const digits = whole + fraction.padEnd(2, "0");
  const integer = digits.slice(0, whole.length + 2).replace(/^0+(?=\d)/, "");
  const tail = digits.slice(whole.length + 2).replace(/0+$/, "");
  return `${integer}${tail ? `,${tail}` : ""}%`;
}

function computationRows(baseline: IrTaxComputation, proposed: IrTaxComputation): string {
  const fields: [keyof IrTaxComputation, string][] = [
    ["taxable", "Rendimento tributável"], ["legal_deductions", "Deduções legais informadas"],
    ["simplified_deduction_raw", "Desconto simplificado antes do arredondamento"],
    ["simplified_deduction", "Desconto simplificado após arredondamento"],
    ["deduction_used", "Dedução utilizada"], ["base", "Base progressiva"],
    ["rate", "Alíquota"], ["bracket_deduction", "Parcela a deduzir da tabela"],
    ["tax_before_reduction", "Imposto antes da redução"], ["reduction_raw", "Redução calculada"],
    ["reduction_used", "Redução utilizada, limitada ao imposto"], ["tax_due", "Imposto calculado"],
    ["boundary_formula_residual", "Resíduo da fórmula no limite superior"],
  ];
  return fields.map(([key, label]) => {
    const display = (value: IrTaxComputation[keyof IrTaxComputation]) => typeof value === "string" ? key === "rate" ? escape(percentage(value)) : amount(value) : "Não informado";
    return `<tr><th scope="row">${label}</th><td>${display(baseline[key])}</td><td>${display(proposed[key])}</td></tr>`;
  }).join("");
}

/** Static, escaped report from a freshly authorized/audited API read. No raw snapshot, scripts or remote assets. */
export function buildIrCalculationReport(report: PrintableIrReport, caseTitle = "Caso jurídico"): string {
  const c = report.calculation;
  const snapshot = record(c.snapshot);
  const assessment = record(snapshot.assessment);
  const legalSnapshot = record(assessment.snapshot);
  const payers = new Map(records(legalSnapshot.payers).map((payer) => [text(payer.id), text(payer.name)]));
  const selectedEntries = new Set(c.result.groups.flatMap((group) => group.entry_ids));
  const entries = records(snapshot.entries).filter((entry) => selectedEntries.has(text(entry.id)));
  const imports = new Map(records(snapshot.imports).map((item) => [text(item.id), item]));
  const parameterRecords = records(snapshot.parameters);
  const parametersById = new Map(parameterRecords.map((parameter) => [text(parameter.id), parameter]));
  const period = c.periodicity === "annual" ? `Ano-calendário ${c.calendar_year}; exercício ${c.calendar_year + 1}` : `Competência de apuração ${String(c.month).padStart(2, "0")}/${c.calendar_year}`;
  const refused = c.status === "incomplete" || c.refusals.length > 0;
  const generated = new Date(report.generated_at);
  const generatedLabel = Number.isNaN(generated.getTime()) ? report.generated_at : generated.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + " (São Paulo)";
  const summary = refused ? `<p class="notice">Sem resultado total. Resolva as pendências e crie outra versão.</p>` : `<table><tbody>
    <tr><th>Imposto do cenário documental</th><td>${amount(c.result.baseline_tax)}</td></tr>
    <tr><th>Imposto do cenário proposto</th><td>${amount(c.result.proposed_tax)}</td></tr>
    <tr><th>Diferença entre hipóteses</th><td>${amount(c.result.hypothesis_difference)}</td></tr>
    <tr><th>Retenção informada nos documentos</th><td>${amount(c.result.withheld_reported)}</td></tr>
    </tbody></table>`;
  const groups = refused ? "" : c.result.groups.map((group, index) => `<section><h2>${index + 1}. ${escape(group.payer_id ? payers.get(group.payer_id) || "Fonte pagadora vinculada" : "Conjunto anual de rendimentos ordinários")}</h2>
    <p>Período: ${escape(group.period)}. A redução considera o rendimento tributável antes das deduções.</p>
    <p>Tabela aplicada: ${escape(text(parametersById.get(group.parameter_version_id)?.title) || group.parameter_version_id)} · versão ${escape(text(parametersById.get(group.parameter_version_id)?.version_number))}.</p>
    <table><thead><tr><th>Operação</th><th>Documental</th><th>Proposto</th></tr></thead><tbody>${computationRows(group.baseline, group.proposed)}</tbody></table>
    <p class="small">Arredondamento: meio para cima, duas casas. Desconto simplificado: arredondado antes da base.
    Imposto: ${group.baseline.rounding.tax_stage === "before_reduction" ? "arredondado antes da redução" : "arredondado no resultado final"}.
    Redução: ${group.baseline.rounding.reduction_stage === "round" ? "arredondada antes da aplicação" : "decimal exato antes do resultado final"}.
    Valores intermediários com mais casas são preservados.</p></section>`).join("");
  const parameters = parameterRecords.map((parameter) => {
    const body = record(parameter.body), reduction = record(body.reduction);
    return `<section><h3>${escape(text(parameter.title))} · versão ${escape(text(parameter.version_number))}</h3>
      <p>${escape(text(parameter.valid_from))} a ${escape(text(parameter.valid_until))}. ${escape(text(body.validity_note))}</p>
      <p>Tratamento do limite superior da redução: ${reduction.boundary === "zero_at_upper" ? "zerar no limite superior" : "usar a fórmula no limite superior"}.</p>
      <ul>${records(body.sources).map((source) => `<li>${escape(text(source.title))} ${sourceLink(source.url)}<br>Consulta: ${escape(text(source.checked_on))}. ${escape(text(source.version_note))}</li>`).join("")}</ul></section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'">
    <meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Memória de cálculo IR · versão ${escape(c.version_number)}</title>
    <style>body{font:15px/1.55 system-ui,sans-serif;color:#172132;max-width:980px;margin:36px auto;padding:0 24px}h1{font-size:28px;margin-bottom:4px}h2{font-size:20px;margin-top:28px}h3{font-size:16px}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d5dce4;padding:8px 10px;text-align:left;overflow-wrap:anywhere}thead{background:#edf2f7}td{text-align:right;font-variant-numeric:tabular-nums}.small{font-size:12px;color:#475569}.notice{border-left:4px solid #a85508;padding:12px;background:#fff8e8}.badge{display:inline-block;border:1px solid #94a3b8;border-radius:5px;padding:4px 8px}a{color:#1d4ed8}code{overflow-wrap:anywhere;white-space:normal}@media print{body{margin:0;font-size:10pt;padding:0}.print-help{display:none}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}@page{size:A4;margin:16mm}}</style></head><body>
    <header><p class="small">AdvocaCHAT · Documento reservado ao caso</p><h1>Memória de cálculo de IR</h1><p>${escape(caseTitle)} · ${escape(period)}</p>
    <p class="badge">Versão ${escape(c.version_number)} · ${escape(statusLabels[c.status])}</p>
    <p class="small">Gerado em ${escape(generatedLabel)}. Referência: ${escape(c.id)}.</p></header>
    <p class="print-help">Use Imprimir no navegador para guardar uma cópia em PDF.</p>
    ${!report.is_current ? '<p class="notice">Versão desatualizada. Este documento preserva o histórico; uma nova versão deve ser revisada para orientar novas providências.</p>' : ""}
    <p>A comparação registra hipóteses de cálculo. Crédito reconhecido e dinheiro recebido são conferidos separadamente nos pedidos e na conciliação.</p>
    ${summary}${c.refusals.length ? `<h2>Pendências</h2><ul>${c.refusals.map((issue) => `<li>${escape(issue.message)}</li>`).join("")}</ul>` : ""}
    <p>${escape(c.result.monetary_update.reason)}</p>
    <h2>Abrangência e revisão</h2><p>${escape(c.completeness_note)}</p><p>Completude declarada: ${c.inventory_complete ? "sim" : "não"}. Residência: ${escape({ resident: "residente fiscal no Brasil", non_resident: "não residente fiscal", unknown: "não confirmada" }[c.tax_residency])}.</p>
    <p>Avaliação jurídica vinculada: versão ${escape(text(assessment.version_number))}. Revisão desta memória: ${escape(c.review_note || "Ainda não registrada")}</p>
    <p>Escolha de deduções: ${escape({ legal: "deduções legais", simplified: "desconto simplificado", most_favorable: "comparação das opções admitidas" }[c.deduction_mode])}.</p>
    ${groups}<h2>Entradas documentais utilizadas</h2>${entries.length ? `<table class="small"><thead><tr><th>Pagamento / competência</th><th>Bruto</th><th>Tributável</th><th>Retido</th><th>Deduções</th><th>Origem</th></tr></thead><tbody>${entries.map((entry) => {
      const origin = imports.get(text(entry.import_id));
      return `<tr><td>${escape(text(entry.payment_date))}<br>${escape(text(entry.competence))}</td><td>${amount(text(entry.gross))}</td><td>${amount(text(entry.taxable))}</td><td>${amount(text(entry.withheld))}</td><td>${amount(text(entry.legal_deductions))}</td><td>${escape(text(origin?.title) || text(entry.import_id))}<br>Página ${escape(text(entry.source_page) || "não informada")}, linha ${escape(text(entry.source_line) || text(entry.row_number))}<br>Documento: ${escape(text(origin?.document_id))}</td></tr>`;
    }).join("")}</tbody></table>` : '<p>Não há linhas de cálculo concluído nesta versão.</p>'}
    ${c.adjustments.length ? `<h2>Ajustes propostos pelo responsável</h2><ul>${c.adjustments.map((adjustment) => `<li>Linha ${escape(adjustment.entry_id)}: tributável proposto ${amount(adjustment.proposed_taxable)}${adjustment.proposed_legal_deductions !== undefined ? `; deduções propostas ${amount(adjustment.proposed_legal_deductions)}` : ""}. ${escape(adjustment.reason)}</li>`).join("")}</ul>` : ""}
    <h2>Parâmetros selecionados e referências</h2>${parameters || "<p>Nenhuma tabela selecionada nesta versão.</p>"}
    <footer class="small"><p>Versão do motor: ${escape(text(snapshot.engine_version))}. Identificador de integridade das entradas: <code>${escape(c.input_hash)}</code>.</p><p>Este arquivo é uma cópia estática da versão consultada. A situação atual é conferida no caso.</p></footer></body></html>`;
}

/** Call only with the report returned by the audited read, never a cached list row. */
export function downloadIrCalculationReport(report: PrintableIrReport, caseTitle?: string): void {
  const url = URL.createObjectURL(new Blob([buildIrCalculationReport(report, caseTitle)], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `memoria-ir-v${report.calculation.version_number}-${report.calculation.id.replace(/[^a-zA-Z0-9-]/g, "_")}.html`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
