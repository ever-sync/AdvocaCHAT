import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { listIrAssessmentVersions, listIrPayers } from "@/lib/api/legal-ir";
import { createIrClaim, linkIrClaimOverlap, listIrCalculationVersions, listIrClaimEvents, listIrClaimOverlaps, listIrClaims, recordIrClaimEvent, reviewIrClaimStrategy, updateIrClaimDraft } from "@/lib/api/legal-ir-calculations";
import { formatIrMoney, normalizeIrMoney } from "@/lib/legal-ir-import";
import type { LegalCaseDocument } from "@/types/legal";
import type { IrAssessmentVersion, IrPayer } from "@/types/legal-ir";
import type { IrCalculationVersion, IrClaim, IrClaimEventPayload, IrClaimPayload } from "@/types/legal-ir-calculations";
import { legalDate, useLegalAction } from "../../legal-ui";
import { OperationPanel, OperationRecords } from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "../IrShared";
import { irCategoryAllowed, isIrOwner, personName } from "../ir-ui";
import { financialKey, type FinancialPanelProps } from "./financial-ui";
import { OperationSaveFooter, OperationSelectField, OperationTextField } from "./IrOperationFields";

const STATUS: Record<IrClaim["status"], string> = { draft: "Preparação", submitted: "Protocolado com prova", awaiting: "Aguardando providência", partially_granted: "Deferimento parcial", granted: "Deferido", denied: "Indeferido", closed: "Encerrado" };
const CHANNELS: Record<IrClaim["channel"], string> = { source: "Fonte pagadora", dirpf: "Declaração IRPF", perdcomp: "PER/DCOMP", court: "Judicial", other: "Outro canal conferido" };
const EVENTS: Record<IrClaimEventPayload["event_type"], string> = { protocol: "Protocolo realizado", requirement: "Exigência / providência", appeal: "Recurso apresentado", decision_granted: "Decisão favorável", decision_partial: "Decisão parcialmente favorável", decision_denied: "Decisão desfavorável", closed: "Encerramento", note: "Anotação de acompanhamento" };

function ClaimDialog({ props, payers, assessments, calculations, claim, onClose }: { props: FinancialPanelProps; payers: IrPayer[]; assessments: IrAssessmentVersion[]; calculations: IrCalculationVersion[]; claim?: IrClaim; onClose: () => void }) {
  const [form, setForm] = useState<IrClaimPayload>({ payer_id: claim?.payer_id ?? "", route: claim?.route ?? "administrative", channel: claim?.channel ?? "source", claim_kind: claim?.claim_kind ?? "cessation", title: claim?.title ?? "", assessment_id: claim?.assessment_id && assessments.some((item) => item.id === claim.assessment_id) ? claim.assessment_id : null, calculation_id: claim?.calculation_id && calculations.some((item) => item.id === claim.calculation_id) ? claim.calculation_id : null });
  const action = useLegalAction();
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(() => claim ? updateIrClaimDraft(claim.id, form) : createIrClaim(props.legalCase.id, form), claim ? "Preparação atualizada; revise novamente a estratégia" : "Pedido criado para preparação")) onClose(); }
  return <IrDialog title={claim ? "Completar preparação do pedido" : "Preparar pedido por fonte pagadora"} description="A rota é escolhida pelo advogado. O fluxo judicial pode ser preparado sem indeferimento administrativo prévio. Atos externos são registrados depois com comprovante." onClose={onClose} pending={action.pending}><form className="space-y-4" onSubmit={(event) => void save(event)}>
    {claim ? <p className="rounded-lg border p-3 text-sm">A alteração exige nova revisão da estratégia. Vínculos anteriores que perderam atualidade devem ser escolhidos novamente; não serão substituídos automaticamente.</p> : null}
    <OperationTextField label="Título do pedido" value={form.title} onChange={(title) => setForm((current) => ({ ...current, title }))} maxLength={200} required />
    <OperationSelectField label="Fonte pagadora" value={form.payer_id} onChange={(payer_id) => setForm((current) => ({ ...current, payer_id }))} options={payers.map((payer) => ({ value: payer.id, label: payer.name }))} required />
    <OperationSelectField label="Rota do pedido" value={form.route} onChange={(route) => setForm((current) => ({ ...current, route: route as IrClaim["route"], channel: route === "judicial" ? "court" : "source" }))} options={[{ value: "administrative", label: "Administrativa" }, { value: "judicial", label: "Judicial" }]} required />
    <OperationSelectField label="Canal examinado" value={form.channel} onChange={(channel) => setForm((current) => ({ ...current, channel: channel as IrClaim["channel"] }))} options={Object.entries(CHANNELS).filter(([value]) => form.route === "judicial" ? value === "court" : value !== "court").map(([value, label]) => ({ value, label }))} hint="Escolha pela natureza do crédito. Retenção informada não determina o uso de PER/DCOMP." required />
    <OperationSelectField label="Objeto" value={form.claim_kind} onChange={(claim_kind) => setForm((current) => ({ ...current, claim_kind: claim_kind as IrClaim["claim_kind"] }))} options={[{ value: "cessation", label: "Cessação de retenção" }, { value: "restitution", label: "Restituição" }, { value: "combined", label: "Cessação e restituição" }]} required />
    <OperationSelectField label="Avaliação jurídica atual aprovada" value={form.assessment_id ?? ""} onChange={(assessment_id) => setForm((current) => ({ ...current, assessment_id: assessment_id || null }))} options={assessments.map((assessment) => ({ value: assessment.id, label: `Análise versão ${assessment.version_number}` }))} hint="O pedido pode começar como preparação. Complete os fundamentos antes de revisar a estratégia." />
    <OperationSelectField label="Cálculo atual revisado" value={form.calculation_id ?? ""} onChange={(calculation_id) => setForm((current) => ({ ...current, calculation_id: calculation_id || null }))} options={calculations.map((calculation) => ({ value: calculation.id, label: `Versão ${calculation.version_number} · ${calculation.calendar_year}${calculation.month ? `/${String(calculation.month).padStart(2, "0")}` : " anual"}` }))} />
    <OperationSaveFooter pending={action.pending} onClose={onClose} label={claim ? "Salvar preparação e solicitar nova revisão" : "Criar preparação do pedido"} />
  </form></IrDialog>;
}

function StrategyDialog({ claim, onClose }: { claim: IrClaim; onClose: () => void }) {
  const [jurisdiction, setJurisdiction] = useState(claim.jurisdiction);
  const [standing, setStanding] = useState(claim.standing);
  const [note, setNote] = useState(claim.strategy_note);
  const action = useLegalAction();
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(() => reviewIrClaimStrategy(claim.id, jurisdiction.trim(), standing.trim(), note.trim()), "Estratégia revisada pelo responsável")) onClose(); }
  return <IrDialog title="Revisar competência, legitimidade e estratégia" description="Registre a análise profissional deste pedido e suas limitações. Não há decisão automática sobre foro, partes ou viabilidade." onClose={onClose} pending={action.pending}><form className="space-y-4" onSubmit={(event) => void save(event)}>
    <OperationTextField label="Competência / órgão competente" value={jurisdiction} onChange={setJurisdiction} maxLength={2000} multiline required />
    <OperationTextField label="Legitimidade e partes examinadas" value={standing} onChange={setStanding} maxLength={2000} multiline required />
    <OperationTextField label="Estratégia, documentos e limites da revisão" value={note} onChange={setNote} multiline required />
    <OperationSaveFooter pending={action.pending} disabled={!jurisdiction.trim() || !standing.trim() || !note.trim()} onClose={onClose} label="Registrar revisão da estratégia" />
  </form></IrDialog>;
}

function ClaimEventDialog({ props, claim, documents, onClose }: { props: FinancialPanelProps; claim: IrClaim; documents: LegalCaseDocument[]; onClose: () => void }) {
  const [form, setForm] = useState({ event_type: "note" as IrClaimEventPayload["event_type"], description: "", occurred_on: "", document_id: "", protocol_reference: "", recognized_amount: "", due_at: "", assignee_id: "", substitute_id: "" });
  const action = useLegalAction();
  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const proofRequired = ["protocol", "appeal", "decision_granted", "decision_partial", "decision_denied"].includes(form.event_type);
  const favorable = ["decision_granted", "decision_partial"].includes(form.event_type);
  const needsTask = form.event_type === "requirement" || form.event_type === "appeal";
  const members = new Set([props.legalCase.owner_id, ...(props.members ?? []).map((member) => member.profile_id)]);
  const people = props.workspace.collaborators.filter((person) => members.has(person.id)).map((person) => ({ value: person.id, label: person.nome }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(async () => {
      const amount = favorable ? normalizeIrMoney(form.recognized_amount, "pt-BR") : null;
      if (favorable && amount === null) throw new Error("Informe o valor reconhecido na decisão, inclusive zero se ela tratar apenas da cessação.");
      return recordIrClaimEvent(claim.id, { event_type: form.event_type, description: form.description, occurred_on: form.occurred_on, document_id: form.document_id || null, protocol_reference: form.protocol_reference, recognized_amount: amount, due_at: needsTask && form.due_at ? new Date(form.due_at).toISOString() : null, assignee_id: needsTask ? form.assignee_id || null : null, substitute_id: needsTask ? form.substitute_id || null : null });
    }, "Evento do pedido registrado com evidência")) onClose();
  }
  return <IrDialog title={`Registrar evento · ${claim.title}`} description="Informe o que foi realizado ou recebido, com sua origem. Decisão e protocolo não confirmam cessação de retenção nem recebimento de valores." onClose={onClose} pending={action.pending} wide><form className="space-y-4" onSubmit={(event) => void save(event)}>
    <OperationSelectField label="Tipo de evento" value={form.event_type} onChange={(value) => change("event_type", value)} options={Object.entries(EVENTS).map(([value, label]) => ({ value, label }))} required />
    <OperationTextField label="Data do evento" type="date" value={form.occurred_on} onChange={(value) => change("occurred_on", value)} required />
    <OperationTextField label="Descrição e providência" value={form.description} onChange={(value) => change("description", value)} multiline required />
    <OperationSelectField label="Documento comprobatório" value={form.document_id} onChange={(value) => change("document_id", value)} options={documents.map((document) => ({ value: document.id, label: document.display_name }))} required={proofRequired} />
    <OperationTextField label="Referência / protocolo / processo" value={form.protocol_reference} onChange={(value) => change("protocol_reference", value)} maxLength={200} required={form.event_type === "protocol"} />
    {favorable ? <OperationTextField label="Valor reconhecido na decisão (R$)" value={form.recognized_amount} onChange={(value) => change("recognized_amount", value)} hint="Formato 1.234,56. Não preencha com retenções somadas ou projeção não reconhecida." required /> : null}
    {needsTask ? <fieldset className="space-y-4 rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Providência e prazo informado manualmente</legend><p className="text-sm text-muted-foreground">Confira a data na fonte e registre o fundamento na descrição. O sistema não realiza contagem judicial neste formulário.</p><OperationTextField label="Data e horário informados" type="datetime-local" value={form.due_at} onChange={(value) => change("due_at", value)} /><OperationSelectField label="Responsável pela providência" value={form.assignee_id} onChange={(value) => change("assignee_id", value)} options={people} required={Boolean(form.due_at)} /><OperationSelectField label="Substituto" value={form.substitute_id} onChange={(value) => change("substitute_id", value)} options={people.filter((person) => person.value !== form.assignee_id)} /></fieldset> : null}
    <OperationSaveFooter pending={action.pending} onClose={onClose} label="Registrar evento" />
  </form></IrDialog>;
}

function OverlapDialog({ claim, others, onClose }: { claim: IrClaim; others: IrClaim[]; onClose: () => void }) {
  const [otherId, setOtherId] = useState("");
  const [reason, setReason] = useState("");
  const action = useLegalAction();
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(() => linkIrClaimOverlap(claim.id, otherId, reason.trim()), "Sobreposição dos pedidos registrada")) onClose(); }
  return <IrDialog title="Relacionar pedidos sobrepostos" description="Identifique o período, principal ou objeto comum. O vínculo ajuda a revisão; os valores continuam sujeitos aos bloqueios da conciliação." pending={action.pending} onClose={onClose}><form className="space-y-4" onSubmit={(event) => void save(event)}><OperationSelectField label="Pedido relacionado" value={otherId} onChange={setOtherId} options={others.map((other) => ({ value: other.id, label: other.title }))} required /><OperationTextField label="Objeto comum e análise da sobreposição" value={reason} onChange={setReason} multiline required /><OperationSaveFooter pending={action.pending} disabled={!otherId || !reason.trim()} onClose={onClose} label="Relacionar pedidos" /></form></IrDialog>;
}

export function IrClaims(props: FinancialPanelProps) {
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "strategy" | "event" | "overlap" | "edit"; claim: IrClaim } | null>(null);
  const allowed = props.financial.can_calculate && props.ir.can_medical && props.ir.can_fiscal;
  const claims = useQuery({ queryKey: financialKey(props, "claims"), queryFn: () => listIrClaims(props.legalCase.id), enabled: allowed });
  const events = useQuery({ queryKey: financialKey(props, "claim-events"), queryFn: () => listIrClaimEvents(props.legalCase.id), enabled: allowed });
  const overlaps = useQuery({ queryKey: financialKey(props, "claim-overlaps"), queryFn: () => listIrClaimOverlaps(props.legalCase.id), enabled: allowed });
  const payers = useQuery({ queryKey: financialKey(props, "payers"), queryFn: () => listIrPayers(props.legalCase.id), enabled: allowed });
  const documents = useQuery({ queryKey: financialKey(props, "documents"), queryFn: () => listLegalDocuments(props.legalCase.id), enabled: allowed });
  const assessments = useQuery({ queryKey: financialKey(props, "assessments"), queryFn: () => listIrAssessmentVersions(props.legalCase.id), enabled: allowed });
  const calculations = useQuery({ queryKey: financialKey(props, "calculations"), queryFn: () => listIrCalculationVersions(props.legalCase.id), enabled: allowed });
  if (!allowed) return <IrAccessNotice>Pedidos e estratégia exigem acesso médico e fiscal ao caso.</IrAccessNotice>;
  const inputPending = payers.isPending || documents.isPending || assessments.isPending || calculations.isPending;
  const inputError = payers.error || documents.error || assessments.error || calculations.error;
  const editable = props.canEdit && isIrOwner(props);
  const availableDocuments = (documents.data ?? []).filter((document) => document.status === "ready" && irCategoryAllowed(props, document.category));
  const currentCalculations = (calculations.data ?? []).filter((calculation) => calculation.status === "approved" && props.financial.calculation_states.some((state) => state.id === calculation.id && state.is_current));
  const currentAssessments = (assessments.data ?? []).filter((assessment) => assessment.status === "approved" && assessment.id === props.ir.latest_assessment_id && props.ir.assessment_is_current);
  const retry = () => { void claims.refetch(); void events.refetch(); void overlaps.refetch(); void payers.refetch(); void documents.refetch(); void assessments.refetch(); void calculations.refetch(); };
  return <OperationPanel title="Pedidos por fonte e rota" description="Protocolos, exigências, recursos e decisões independentes. A revisão profissional define competência, legitimidade e estratégia de cada pedido." actions={props.canEdit ? <Button size="sm" onClick={() => setCreating(true)} disabled={inputPending || Boolean(inputError)}>Preparar pedido</Button> : null}>
    <OperationRecords pending={claims.isPending || events.isPending || overlaps.isPending || inputPending} error={claims.error || events.error || overlaps.error || inputError} retry={retry} empty="Nenhum pedido preparado" count={claims.data?.length ?? 0}>
      {[...(claims.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((claim) => <article key={claim.id} className="space-y-3 rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{claim.title}</p><Badge variant="outline">{STATUS[claim.status]}</Badge></div><p className="text-sm">{payers.data?.find((payer) => payer.id === claim.payer_id)?.name ?? "Fonte do caso"} · {claim.route === "judicial" ? "Judicial" : "Administrativa"} · {CHANNELS[claim.channel]}</p><p className="text-sm">Valor reconhecido informado: {formatIrMoney(claim.recognized_amount)}. Recebimentos constam na conciliação.</p>
        {claim.strategy_reviewed_at ? <div className="space-y-1 rounded-lg bg-muted/20 p-3 text-sm"><p className="whitespace-pre-wrap break-words"><strong>Competência:</strong> {claim.jurisdiction}</p><p className="whitespace-pre-wrap break-words"><strong>Legitimidade:</strong> {claim.standing}</p><p className="whitespace-pre-wrap break-words">{claim.strategy_note}</p><p className="text-xs text-muted-foreground">Revisado por {personName(props, claim.strategy_reviewer_id)} · {legalDate(claim.strategy_reviewed_at, true)}</p></div> : <p className="text-sm text-muted-foreground">Estratégia aguardando revisão do responsável.</p>}
        {(overlaps.data ?? []).filter((overlap) => overlap.claim_a_id === claim.id || overlap.claim_b_id === claim.id).map((overlap) => <p key={overlap.id} className="rounded-lg border border-amber-300 p-2 text-sm">Sobreposição com {claims.data?.find((other) => other.id === (overlap.claim_a_id === claim.id ? overlap.claim_b_id : overlap.claim_a_id))?.title ?? "outro pedido"}: {overlap.reason}</p>)}
        <details><summary className="cursor-pointer text-sm font-medium">Eventos e comprovantes ({events.data?.filter((event) => event.claim_id === claim.id).length ?? 0})</summary><div className="mt-3 space-y-3">{[...(events.data ?? [])].filter((event) => event.claim_id === claim.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => <div key={event.id} className="space-y-1 border-l-2 pl-3 text-sm"><p className="font-medium">{EVENTS[event.event_type]} · {legalDate(event.occurred_on)}</p><p className="whitespace-pre-wrap break-words">{event.description}</p>{event.protocol_reference ? <p>Referência: {event.protocol_reference}</p> : null}{event.document_id ? <p className="text-xs text-muted-foreground">Documento: {availableDocuments.find((document) => document.id === event.document_id)?.display_name ?? "Comprovante do caso"}</p> : null}{event.recognized_amount !== null ? <p>Reconhecido: {formatIrMoney(event.recognized_amount)}</p> : null}{event.task_id ? <p className="text-xs text-muted-foreground">Providência vinculada às tarefas do caso. Prazo informado manualmente.</p> : null}<p className="text-xs text-muted-foreground">{personName(props, event.created_by)} · registrado em {legalDate(event.created_at, true)}</p></div>)}</div></details>
        {editable ? <div className="flex flex-wrap gap-2">{claim.status === "draft" ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "edit", claim })}>Completar preparação</Button> : null}<Button size="sm" variant="outline" onClick={() => setDialog({ kind: "strategy", claim })}>Revisar estratégia</Button><Button size="sm" onClick={() => setDialog({ kind: "event", claim })}>Registrar evento</Button><Button size="sm" variant="outline" disabled={(claims.data?.length ?? 0) < 2} onClick={() => setDialog({ kind: "overlap", claim })}>Relacionar sobreposição</Button></div> : null}
      </article>)}
    </OperationRecords>
    {creating && props.canEdit ? <ClaimDialog key={`${props.legalCase.id}:${allowed}`} props={props} payers={payers.data ?? []} assessments={currentAssessments} calculations={currentCalculations} onClose={() => setCreating(false)} /> : null}
    {dialog && editable && dialog.kind === "edit" ? <ClaimDialog key={dialog.claim.id} props={props} payers={payers.data ?? []} assessments={currentAssessments} calculations={currentCalculations} claim={dialog.claim} onClose={() => setDialog(null)} /> : null}
    {dialog && editable && dialog.kind === "strategy" ? <StrategyDialog key={dialog.claim.id} claim={dialog.claim} onClose={() => setDialog(null)} /> : null}
    {dialog && editable && dialog.kind === "event" ? <ClaimEventDialog key={dialog.claim.id} props={props} claim={dialog.claim} documents={availableDocuments} onClose={() => setDialog(null)} /> : null}
    {dialog && editable && dialog.kind === "overlap" ? <OverlapDialog key={dialog.claim.id} claim={dialog.claim} others={(claims.data ?? []).filter((claim) => claim.id !== dialog.claim.id)} onClose={() => setDialog(null)} /> : null}
  </OperationPanel>;
}
export default IrClaims;
