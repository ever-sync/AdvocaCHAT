import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { reviewJudicialCalendar, reviewJudicialRule } from "@/lib/api/legal-judicial";
import type { JudicialCalendarVersion, JudicialRuleVersion, JudicialSource } from "@/types/legal-judicial";
import { OperationPanel } from "../operations/OperationPanel";
import { useLegalAction } from "../legal-ui";
import { JudicialAccessNotice, JudicialCheck, JudicialDialog, JudicialText } from "./JudicialShared";
import { JUDICIAL_STATES, judicialCaseAccess, judicialDate, judicialKey, judicialVisibleContext, type JudicialProps } from "./judicial-ui";
import { JudicialCalendarForm } from "./JudicialCalendarForm";
import { JudicialRuleForm } from "./JudicialRuleForm";

type CatalogRecord = JudicialCalendarVersion | JudicialRuleVersion;
type Kind = "calendar" | "rule";
type Decision = "approved" | "rejected" | "revoked";
type Selection = { kind: Kind; id: string | null };

export function JudicialCatalog(props: JudicialProps) {
  const context = judicialVisibleContext(props, props.context);
  const access = judicialCaseAccess(props) && context.tenant_id === props.workspace.tenant_id && context.user_id === props.workspace.user_id;
  const [editing, setEditing] = useState<Selection | null>(null);
  const [review, setReview] = useState<(Selection & { id: string; decision: Decision }) | null>(null);
  const docs = useQuery({ queryKey: judicialKey(props, "catalog-documents"), queryFn: () => listLegalDocuments(props.legalCase.id), enabled: access && context.can_edit_catalog });
  const documents = access ? (docs.data ?? []).filter((row) => row.case_id === props.legalCase.id && row.category === "general" && row.status === "ready") : [];
  const calendars = context.calendars.filter((row) => row.tenant_id === props.workspace.tenant_id);
  const rules = context.rules.filter((row) => row.tenant_id === props.workspace.tenant_id);
  const editOriginal = editing?.id ? (editing.kind === "calendar" ? calendars : rules).find((row) => row.id === editing.id) : undefined;
  const reviewRecord = review ? (review.kind === "calendar" ? calendars : rules).find((row) => row.id === review.id) : undefined;
  const editingAllowed = access && context.can_edit_catalog && editing && (!editing.id || editOriginal);
  const reviewAllowed = access && context.can_approve_catalog && review && reviewRecord && (review.decision === "revoked" ? reviewRecord.state === "approved" : reviewRecord.state === "draft");
  const dialogKey = `${props.workspace.user_id}:${props.workspace.tenant_id}:${props.legalCase.id}:${context.can_edit_catalog}:${context.can_approve_catalog}`;
  if (!access) return <JudicialAccessNotice />;
  const edit = (kind: Kind, id: string | null) => setEditing({ kind, id });
  const decide = (kind: Kind, id: string, decision: Decision) => setReview({ kind, id, decision });
  return <div className="space-y-4">
    <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">O catálogo pertence ao escritório. Cada versão tem órgão, vigência, fontes e revisão próprios. Citar o CPC ou um ato oficial não aprova a configuração nem define sozinho um prazo.</p>
    <OperationPanel title="Calendários de expediente" description="Dias de expediente, exceções e suspensões com efeitos separados sobre curso, início e vencimento." actions={context.can_edit_catalog && <Button onClick={() => edit("calendar", null)}>Novo calendário</Button>}>
      {!calendars.length && <p className="text-sm text-muted-foreground">Nenhum calendário cadastrado. Não há calendário nacional presumido.</p>}
      {calendars.map((row) => <CatalogCard key={row.id} record={row} canEdit={context.can_edit_catalog} canReview={context.can_approve_catalog} onCopy={() => edit("calendar", row.id)} onReview={(decision) => decide("calendar", row.id, decision)} />)}
    </OperationPanel>
    <OperationPanel title="Regras de contagem" description="Interpretação examinada, modalidade, destinatário, marco e operações explícitas. A duração do prazo é informada em cada caso." actions={context.can_edit_catalog && <Button onClick={() => edit("rule", null)}>Nova regra</Button>}>
      {!rules.length && <p className="text-sm text-muted-foreground">Nenhuma regra cadastrada. A aprovação precisa ser registrada por pessoa autorizada.</p>}
      {rules.map((row) => <CatalogCard key={row.id} record={row} canEdit={context.can_edit_catalog} canReview={context.can_approve_catalog} onCopy={() => edit("rule", row.id)} onReview={(decision) => decide("rule", row.id, decision)} />)}
    </OperationPanel>
    {editingAllowed && editing.kind === "calendar" && <JudicialCalendarForm key={`${dialogKey}:calendar:${editing.id ?? "new"}`} original={editOriginal as JudicialCalendarVersion | undefined} documents={documents} onClose={() => setEditing(null)} />}
    {editingAllowed && editing.kind === "rule" && <JudicialRuleForm key={`${dialogKey}:rule:${editing.id ?? "new"}`} original={editOriginal as JudicialRuleVersion | undefined} documents={documents} onClose={() => setEditing(null)} />}
    {reviewAllowed && <CatalogReview key={`${dialogKey}:${review.id}:${review.decision}`} kind={review.kind} record={reviewRecord} decision={review.decision} onClose={() => setReview(null)} />}
  </div>;
}

function CatalogCard({ record, canEdit, canReview, onCopy, onReview }: { record: CatalogRecord; canEdit: boolean; canReview: boolean; onCopy(): void; onReview(decision: Decision): void }) {
  return <article className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-medium">{record.title}</h3><p className="text-xs text-muted-foreground">Versão {record.version_number} · {judicialDate(record.valid_from)} a {judicialDate(record.valid_until)}</p></div><Badge variant="outline">{JUDICIAL_STATES[record.state] ?? record.state}</Badge></div>
    <p className="break-words text-sm">{record.scope.court} · {record.scope.degree} · {record.scope.unit} · {record.scope.territory}</p>
    <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">Examinar configuração e fontes</summary><CatalogDetails record={record} /></details>
    {record.reviewed_at && <p className="text-xs text-muted-foreground">Revisão registrada em {judicialDate(record.reviewed_at)}. Justificativa: {record.review_note}</p>}
    {(canEdit || canReview) && <div className="flex flex-wrap gap-2">{canEdit && <Button size="sm" variant="outline" onClick={onCopy}>Criar nova versão</Button>}{canReview && record.state === "draft" && <><Button size="sm" onClick={() => onReview("approved")}>Revisar e aprovar</Button><Button size="sm" variant="outline" onClick={() => onReview("rejected")}>Rejeitar rascunho</Button></>}{canReview && record.state === "approved" && <Button size="sm" variant="outline" onClick={() => onReview("revoked")}>Revogar versão</Button>}</div>}
  </article>;
}

function CatalogDetails({ record }: { record: CatalogRecord }) {
  const yesNo = (value: boolean) => value === true ? "Sim" : value === false ? "Não" : "Não informado";
  const days = (value: string) => value === "business_days" ? "dias úteis" : value === "calendar_days" ? "dias corridos" : "unidade não informada";
  const adjustment = (value: string) => value === "none" ? "Sem deslocamento" : value === "next_business_day" ? "Próximo dia com expediente permitido" : "Não informado";
  return <div className="space-y-3 text-sm">
    {"calendar_key" in record ? <>
      <p>Fuso: {record.timezone}. Expediente semanal: {record.body.working_weekdays.map((day) => ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"][day]).join(", ") || "Não informado"}.</p>
      {record.body.exceptions.map((item, index) => <p key={`exception:${index}`} className="rounded border p-2">{judicialDate(item.on)} · Expediente: {item.working_day === undefined ? "conforme semana" : yesNo(item.working_day)} · Suspende curso: {yesNo(item.suspend_count)} · Permite início: {yesNo(item.allow_start)} · Permite vencimento: {yesNo(item.allow_due)}. {item.reason} · Fonte {item.source_index + 1}</p>)}
      {record.body.suspensions.map((item, index) => <p key={`suspension:${index}`} className="rounded border p-2">{judicialDate(item.from)} até {judicialDate(item.until)}, inclusive · Suspende curso: {yesNo(item.suspend_count)} · Permite início: {yesNo(item.allow_start)} · Permite vencimento: {yesNo(item.allow_due)}. {item.reason} · Fonte {item.source_index + 1}</p>)}
      {!record.body.exceptions.length && !record.body.suspensions.length && <p>Nenhuma exceção ou suspensão informada nesta versão.</p>}
    </> : <>
      <p>Regime: {record.body.regime === "civil_procedure" ? "Processo civil" : record.body.regime}. Natureza: {record.body.nature === "procedural" ? "Processual" : record.body.nature}. Modalidade: {record.body.modality}. Destinatário: {record.body.recipient_kind}.</p>
      <p className="whitespace-pre-wrap">Condições: {record.body.conditions}</p><p className="whitespace-pre-wrap">Exclusões: {record.body.exclusions}</p><p className="whitespace-pre-wrap">Vigência e transição: {record.body.validity_note}</p><p>Transição conferida: {yesNo(record.body.transition_resolved)}.</p>
      <p>Prova do marco: {record.body.input_kind === "timestamp" ? "Instante com fuso" : record.body.input_kind === "civil_date" ? "Data civil" : "Não informado"} · Identificador: {record.body.anchor_kind}. Deslocamento: {record.body.marker_offset_count ?? "Não informado"} {days(record.body.marker_offset_unit)}. Ajuste do marco: {adjustment(record.body.marker_adjustment)}.</p>
      <p>Excluir o dia do marco: {yesNo(record.body.exclude_marker)}. Contar em {days(record.body.count_unit)}. Aplicar suspensões: {yesNo(record.body.apply_suspensions)}. Ajuste do vencimento: {adjustment(record.body.due_adjustment)}. Horário local: {record.body.due_time || "Não informado"}.</p>
    </>}
    <div className="space-y-2"><h4 className="font-medium">Fontes e provas</h4>{!record.sources.length && <p>Sem fontes documentadas; versão ainda não pode ser aprovada.</p>}{record.sources.map((source, index) => <CatalogSource key={index} source={source} index={index} />)}</div>
  </div>;
}

function CatalogSource({ source, index }: { source: JudicialSource; index: number }) {
  let href: string | null = null;
  try { const parsed = new URL(source.url); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) href = parsed.href; } catch { /* Invalid source is readable, never executable. */ }
  return <div className="break-words rounded border p-2"><p>Fonte {index + 1}: {href ? <a className="text-primary underline" href={href} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</p><p className="text-xs text-muted-foreground">Consultada em {judicialDate(source.checked_on)} · {source.document_id ? "Prova documental vinculada; acesso revalidado na aprovação" : "Prova documental ausente"}</p>{source.version_note && <p className="whitespace-pre-wrap">{source.version_note}</p>}</div>;
}

function CatalogReview({ kind, record, decision, onClose }: { kind: Kind; record: CatalogRecord; decision: Decision; onClose(): void }) {
  const action = useLegalAction();
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const verb = decision === "approved" ? "Aprovar" : decision === "rejected" ? "Rejeitar" : "Revogar";
  const sourceReady = record.sources.length > 0 && record.sources.every((source) => source.document_id && source.title.trim() && source.checked_on && source.url.startsWith("https://"));
  const ruleReady = !("rule_key" in record) || (record.body.transition_resolved === true && record.body.regime === "civil_procedure" && record.body.nature === "procedural");
  async function save() {
    if (!confirmed || note.trim().length < 3 || (decision === "approved" && (!sourceReady || !ruleReady))) return;
    const request = kind === "calendar" ? reviewJudicialCalendar : reviewJudicialRule;
    if (await action.run(() => request(record.id, decision, note.trim()), "Revisão do catálogo registrada")) onClose();
  }
  return <JudicialDialog title={`${verb} versão ${record.version_number}`} description={`${record.title}. A decisão ficará vinculada ao seu usuário. Versões anteriores e prazos já calculados conservam seu histórico.`} onClose={onClose} onSubmit={save} pending={action.pending} actionLabel={`${verb} versão`} disabled={!confirmed || note.trim().length < 3 || (decision === "approved" && (!sourceReady || !ruleReady))}>
    <CatalogDetails record={record} />
    {decision === "approved" && !sourceReady && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Faltam fontes, consulta ou prova documental. Crie uma nova versão com os dados para revisão.</p>}
    {decision === "approved" && !ruleReady && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">A transição está pendente ou o regime está fora da cobertura do contador. Crie uma versão conferida antes de aprovar.</p>}
    <JudicialText label="Justificativa da revisão" value={note} onChange={setNote} required multiline maxLength={4000} />
    <JudicialCheck label={decision === "approved" ? "Examinei as fontes, a vigência, o órgão e todos os efeitos desta versão" : "Conferi esta versão e os motivos da decisão"} checked={confirmed} onChange={setConfirmed} />
  </JudicialDialog>;
}

export default JudicialCatalog;
