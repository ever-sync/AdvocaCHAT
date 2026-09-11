import type { JudicialDeadlineReport } from "@/types/legal-judicial";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value) : "Não informado";
const stages: Record<string, string> = { anchor: "Marco informado", marker_offset: "Deslocamento do marco", marker_adjustment: "Ajuste do marco", excluded_marker: "Marco excluído", count: "Contagem", due_adjustment: "Ajuste de vencimento", due: "Vencimento proposto" };
const states = { incomplete: "Incompleto", draft: "Proposta para revisão", in_review: "Em revisão", reviewed: "Revisado internamente", returned: "Devolvido para correção" };
const anchors: Record<string, string> = { made_available_on: "Disponibilização", published_on: "Publicação", awareness_effective_on: "Ciência efetiva documentada", decision_signed_at: "Assinatura da decisão", communication_sent_at: "Envio da comunicação", source_consulted_at: "Consulta documentada da fonte", manual_verified: "Marco conferido manualmente" };

function civilDate(value: unknown): string {
  if (typeof value !== "string") return "Não informado";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Data não disponível";
}
function instant(value: unknown, timezone = "UTC"): string {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não disponível";
  try {
    return `${new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "medium" }).format(date)} (${timezone})`;
  } catch { return "Fuso não disponível"; }
}
function sourceLink(value: unknown): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && !url.username && !url.password)
      return `<a href="${escape(url.href)}" rel="noreferrer noopener">${escape(raw)}</a>`;
  } catch { /* Invalid references remain inert text. */ }
  return escape(raw);
}
function versionSources(value: unknown, label: string): string {
  const version = object(value);
  if (!Object.keys(version).length) return `<h3>${label}</h3><p>Versão não selecionada.</p>`;
  const sources = Array.isArray(version.sources) ? version.sources.map(object) : [];
  return `<h3>${label}: ${escape(text(version.title))} · versão ${escape(text(version.version_number))}</h3>
    <p>Vigência: ${civilDate(version.valid_from)} a ${civilDate(version.valid_until)}.</p>
    <ul>${sources.map((s) => `<li>${escape(text(s.title))} · ${sourceLink(s.url)}<br>Consulta: ${civilDate(s.checked_on)}. Documento: ${escape(text(s.document_id))}. ${escape(typeof s.version_note === "string" ? s.version_note : "")}</li>`).join("") || "<li>Fontes não informadas.</li>"}</ul>`;
}

/** Render only a fresh report from legal_deadline_read_report, which checks access and records the read. */
export function renderJudicialDeadlineReport(report: JudicialDeadlineReport): string {
  const c = report.calculation, result = c.result, input = c.input;
  const complete = c.state !== "incomplete" && result.refusals.length === 0 && !!result.proposed_due_on && !!result.due_at;
  const reviewed = complete && c.state === "reviewed" && report.is_current;
  const timezone = result.timezone ?? "UTC";
  const rule = object(c.snapshot.rule), body = object(rule.body), evidence = object(c.snapshot.evidence), proceeding = object(c.snapshot.proceeding);
  const flag = (value: unknown) => value === true ? "Sim" : value === false ? "Não" : "Não informado";
  const unit = (value: unknown) => value === "business_days" ? "dias úteis" : value === "calendar_days" ? "dias corridos" : text(value);
  const adjustment = (value: unknown) => value === "none" ? "sem ajuste" : value === "next_business_day" ? "próximo dia útil permitido" : "Não informado";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'">
    <meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Memória de contagem · versão ${escape(c.version_number)}</title>
    <style>body{font:15px/1.55 system-ui,sans-serif;color:#172132;max-width:1000px;margin:32px auto;padding:0 22px}h1{font-size:26px}h2{font-size:20px;margin-top:28px}h3{font-size:16px}p,li,td,th,code{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #d4dce3;text-align:left;padding:8px}thead{background:#edf2f4}th{font-weight:600}.notice{border-left:4px solid #a85508;background:#fff8e8;padding:12px}.small{font-size:12px;color:#475569}code{white-space:normal}a{color:#1d4ed8}@media print{body{margin:0;padding:0;font-size:10pt}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}.print-help{display:none}}@page{size:A4 landscape;margin:14mm}</style></head><body>
    <header><p class="small">AdvocaCHAT · Documento reservado ao caso</p><h1>Memória de contagem assistida</h1><p>${escape(input.title)} · versão ${escape(c.version_number)}</p>
    <p>${escape(states[c.state])} · ${report.is_current ? "Fontes atuais na consulta" : "Versão desatualizada"}</p>
    <p class="small">Gerado em ${instant(report.generated_at)}. Referência: ${escape(c.id)}.</p></header>
    <p class="print-help">Use Imprimir no navegador para guardar uma cópia em PDF.</p>
    ${!report.is_current ? '<p class="notice">Histórico desatualizado. Esta versão não autoriza novas providências; crie e revise outra versão com as fontes atuais.</p>' : ""}
    ${!reviewed ? '<p class="notice">Este documento não é um prazo final autorizado. Propostas e pendências precisam de conferência pelo responsável.</p>' : '<p>Prazo revisado internamente a partir das fontes e condições abaixo. A consulta atual e eventuais alterações são conferidas no caso.</p>'}
    ${complete ? `<h2>${reviewed ? "Vencimento revisado" : report.is_current ? "Vencimento proposto" : "Vencimento histórico"}</h2><p>${civilDate(result.proposed_due_on)} · ${instant(result.due_at, timezone)}</p>` : '<h2>Contagem incompleta</h2><p>Nenhuma data final foi definida.</p>'}
    ${result.refusals.length ? `<h2>Pendências</h2><ul>${result.refusals.map((item) => `<li>${escape(item.message)} <span class="small">(${escape(item.code)})</span></li>`).join("")}</ul>` : ""}
    <h2>Origem, abrangência e condições</h2>
    <p>Órgão: ${escape(input.scope.court)}. Grau: ${escape(input.scope.degree)}. Unidade: ${escape(input.scope.unit)}. Território: ${escape(input.scope.territory)}.</p>
    <p>Número CNJ: ${escape(text(proceeding.cnj_number))}. Referência do processo: ${escape(c.proceeding_id)}. Evento: ${escape(c.inbox_id ?? "Não vinculado")}. Documento de prova: ${escape(input.evidence_document_id ?? text(evidence.id))}.</p>
    <p>Marco informado: ${input.anchor_date ? civilDate(input.anchor_date) : instant(input.anchor_at, timezone)}. Natureza do marco: ${escape(anchors[input.anchor_kind] ?? input.anchor_kind)}. Duração: ${escape(input.quantity)} ${escape(unit(input.unit))}.</p>
    ${input.manual_anchor_reason ? `<p>Justificativa do marco manual: ${escape(input.manual_anchor_reason)}</p>` : ""}
    <p>Base da duração: ${escape(input.duration_basis)}.</p>
    <p>Condições confirmadas: ${flag(input.conditions_confirmed)}. Cobertura confirmada: ${flag(input.coverage_confirmed)}. Divergência informada: ${flag(input.conflict_detected)}.</p>
    <p>Marco de início: ${civilDate(result.start_marker_on)}. Primeiro dia contado: ${civilDate(result.first_counted_on)}. Fuso do órgão: ${escape(result.timezone ?? "Não informado")}.</p>
    <h2>Efeitos da regra selecionada</h2>
    <p>Modalidade: ${escape(text(body.modality))}. Destinatário: ${escape(text(body.recipient_kind))}.</p>
    <p>Deslocamento do marco: ${escape(text(body.marker_offset_count))} ${escape(unit(body.marker_offset_unit))}. Excluir marco: ${flag(body.exclude_marker)}. Aplicar suspensões: ${flag(body.apply_suspensions)}.</p>
    <p>Ajuste do marco: ${adjustment(body.marker_adjustment)}. Ajuste do vencimento: ${adjustment(body.due_adjustment)}. Horário: ${escape(text(body.due_time))}.</p>
    <p>Condições: ${escape(text(body.conditions))}. Exclusões: ${escape(text(body.exclusions))}. Vigência/transição: ${escape(text(body.validity_note))}.</p>
    <h2>Memória por dia e etapa</h2>
    ${result.memory.length ? `<table class="small"><thead><tr><th>Data</th><th>Etapa</th><th>Dia útil</th><th>Suspensão</th><th>Elegível na etapa</th><th>Contador da etapa</th><th>Motivo</th></tr></thead><tbody>${result.memory.map((day) => `<tr><td>${civilDate(day.on)}</td><td>${escape(stages[day.stage] ?? day.stage)}</td><td>${flag(day.working_day)}</td><td>${flag(day.suspended)}</td><td>${flag(day.eligible)}</td><td>${escape(day.index)}</td><td>${escape(day.reason)}</td></tr>`).join("")}</tbody></table>` : '<p>Sem memória completa nesta versão.</p>'}
    <h2>Versões e fontes recuperáveis</h2>${versionSources(c.snapshot.rule, "Regra")}${versionSources(c.snapshot.calendar, "Calendário")}
    <h2>Revisão</h2><p>Responsável: ${escape(c.reviewed_by ?? "Ainda não registrado")}. Data: ${instant(c.reviewed_at, timezone)}.</p><p>${escape(c.review_note || "Revisão ainda não registrada.")}</p>
    <footer class="small"><p>Motor: ${escape(c.engine_version)}. Integridade do snapshot: <code>${escape(c.snapshot_hash)}</code>.</p><p>Cópia estática da versão consultada. Ler uma publicação ou este relatório no CRM não registra ciência judicial nem pratica ato no tribunal.</p></footer></body></html>`;
}

export function downloadJudicialDeadlineReport(report: JudicialDeadlineReport): void {
  const url = URL.createObjectURL(new Blob([renderJudicialDeadlineReport(report)], { type: "text/html;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `memoria-prazo-v${report.calculation.version_number}-${report.calculation.id.replace(/[^a-zA-Z0-9-]/g, "_")}.html`;
  anchor.rel = "noreferrer";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
