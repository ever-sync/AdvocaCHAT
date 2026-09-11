import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { listIrAssessmentVersions, listIrIncomeSources, listIrPayers } from "@/lib/api/legal-ir";
import { listIrPeriodReviews, recordIrPeriodReview } from "@/lib/api/legal-ir-calculations";
import type { LegalCaseDocument } from "@/types/legal";
import type { IrAssessmentVersion, IrIncomeSource, IrPayer } from "@/types/legal-ir";
import type { IrPeriodReviewPayload } from "@/types/legal-ir-calculations";
import { legalDate, useLegalAction } from "../../legal-ui";
import { OperationPanel, OperationRecords } from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "../IrShared";
import { INCOME_KINDS, PRODUCT_TYPES, PENSION_KINDS, INCOME_EVENTS, irCategoryAllowed, isIrOwner, personName } from "../ir-ui";
import { financialKey, type FinancialPanelProps } from "./financial-ui";
import { OperationSaveFooter, OperationSelectField, OperationTextField } from "./IrOperationFields";

const DECISIONS: Record<IrPeriodReviewPayload["decision"], string> = { include: "Inclusão proposta e revisada", exclude: "Exclusão revisada", needs_review: "Análise pendente" };
function periodSourceLabel(source: IrIncomeSource, payers: IrPayer[]) {
  return [payers.find((payer) => payer.id === source.payer_id)?.name ?? "Fonte", INCOME_KINDS[source.income_kind], source.product_type !== "unknown" ? PRODUCT_TYPES[source.product_type] : "", source.income_kind === "pension" && source.pension_kind !== "unknown" ? PENSION_KINDS[source.pension_kind] : "", source.income_event !== "unknown" ? INCOME_EVENTS[source.income_event] : "", source.benefit_number].filter(Boolean).join(" · ");
}

function PeriodDialog({ props, sources, payers, assessment, documents, onClose }: { props: FinancialPanelProps; sources: IrIncomeSource[]; payers: IrPayer[]; assessment: IrAssessmentVersion; documents: LegalCaseDocument[]; onClose: () => void }) {
  const [form, setForm] = useState<IrPeriodReviewPayload>({ source_id: "", assessment_id: assessment.id, period_start: "", period_end: "", landmark_date: "", decision: "needs_review", basis: "", limitations: "", document_id: "" });
  const action = useLegalAction();
  const change = (field: keyof IrPeriodReviewPayload, value: string) => setForm((current) => ({ ...current, [field]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(async () => {
      if (form.period_end < form.period_start) throw new Error("O final do período deve ser igual ou posterior ao início.");
      return recordIrPeriodReview(props.legalCase.id, form);
    }, "Análise profissional do período registrada")) onClose();
  }
  return <IrDialog title="Revisar período e marco" description="Registre o período examinado, fundamento e marco específicos. O sistema não seleciona os últimos cinco anos nem usa automaticamente a data de um laudo." pending={action.pending} onClose={onClose} wide><form onSubmit={(event) => void save(event)} className="space-y-4">
    <p className="text-sm text-muted-foreground">Avaliação jurídica atual: versão {assessment.version_number}. O vínculo ficará preservado neste registro.</p>
    <OperationSelectField label="Rendimento ou benefício examinado" value={form.source_id} onChange={(value) => change("source_id", value)} options={sources.map((source) => ({ value: source.id, label: periodSourceLabel(source, payers) }))} required />
    <div className="grid gap-4 sm:grid-cols-2"><OperationTextField label="Início do período examinado" type="date" value={form.period_start} onChange={(value) => change("period_start", value)} required /><OperationTextField label="Fim do período examinado" type="date" value={form.period_end} onChange={(value) => change("period_end", value)} required /></div>
    <OperationTextField label="Marco jurídico escolhido pelo responsável" type="date" value={form.landmark_date} onChange={(value) => change("landmark_date", value)} hint="Explique qual fato esta data representa. Doença, benefício, pagamento, protocolo e trânsito não são intercambiáveis." required />
    <OperationSelectField label="Decisão profissional sobre o período" value={form.decision} onChange={(value) => change("decision", value)} options={Object.entries(DECISIONS).map(([value, label]) => ({ value, label }))} required />
    <OperationTextField label="Fundamento e relação entre marco e período" value={form.basis} onChange={(value) => change("basis", value)} multiline required />
    <OperationTextField label="Limitações, divergências e pendências" value={form.limitations} onChange={(value) => change("limitations", value)} multiline hint="Prescrição, retificação e recuperação de valores precisam de análise própria; não há prazo universal aplicado pelo formulário." />
    <OperationSelectField label="Documento que sustenta a análise" value={form.document_id} onChange={(value) => change("document_id", value)} options={documents.map((document) => ({ value: document.id, label: document.display_name }))} required />
    <OperationSaveFooter pending={action.pending} onClose={onClose} label="Registrar revisão do período" />
  </form></IrDialog>;
}

export function IrPeriods(props: FinancialPanelProps) {
  const [creating, setCreating] = useState(false);
  const allowed = props.financial.can_calculate && props.ir.can_medical && props.ir.can_fiscal;
  const records = useQuery({ queryKey: financialKey(props, "periods"), queryFn: () => listIrPeriodReviews(props.legalCase.id), enabled: allowed });
  const sources = useQuery({ queryKey: financialKey(props, "income-sources"), queryFn: () => listIrIncomeSources(props.legalCase.id), enabled: allowed });
  const payers = useQuery({ queryKey: financialKey(props, "payers"), queryFn: () => listIrPayers(props.legalCase.id), enabled: allowed });
  const documents = useQuery({ queryKey: financialKey(props, "documents"), queryFn: () => listLegalDocuments(props.legalCase.id), enabled: allowed });
  const assessments = useQuery({ queryKey: financialKey(props, "assessments"), queryFn: () => listIrAssessmentVersions(props.legalCase.id), enabled: allowed });
  if (!allowed) return <IrAccessNotice>A análise de períodos exige acesso médico e fiscal ao caso.</IrAccessNotice>;
  const current = assessments.data?.find((assessment) => assessment.id === props.ir.latest_assessment_id && assessment.status === "approved" && props.ir.assessment_is_current);
  const editable = props.canEdit && isIrOwner(props);
  const pending = sources.isPending || payers.isPending || documents.isPending || assessments.isPending;
  const error = sources.error || payers.error || documents.error || assessments.error;
  const retry = () => { void records.refetch(); void sources.refetch(); void payers.refetch(); void documents.refetch(); void assessments.refetch(); };
  const available = (documents.data ?? []).filter((document) => document.status === "ready" && irCategoryAllowed(props, document.category));
  return <OperationPanel title="Períodos e marcos examinados" description="Decisões fundamentadas por rendimento. Inclusão no estudo não significa crédito reconhecido nem quantia recebida." actions={editable ? <Button size="sm" onClick={() => setCreating(true)} disabled={!current || pending || Boolean(error)}>Revisar período</Button> : null}>
    {!pending && !error && !current ? <p className="text-sm text-muted-foreground">Conclua uma avaliação jurídica atual e aprovada antes de registrar a revisão do período.</p> : null}
    <OperationRecords pending={pending || records.isPending} error={error || records.error} retry={retry} empty="Nenhum período revisado" count={records.data?.length ?? 0}>
      {[...(records.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((record) => { const source = sources.data?.find((item) => item.id === record.source_id); return <article className="space-y-2 rounded-lg border p-4" key={record.id}><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{legalDate(record.period_start)} a {legalDate(record.period_end)}</p><Badge variant="outline">{DECISIONS[record.decision]}</Badge></div><p className="text-sm">{payers.data?.find((payer) => payer.id === source?.payer_id)?.name ?? "Rendimento do caso"}{source ? ` · ${INCOME_KINDS[source.income_kind]}` : ""} · marco examinado: {legalDate(record.landmark_date)}</p><p className="whitespace-pre-wrap break-words text-sm">{record.basis}</p>{record.limitations ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">Limitações: {record.limitations}</p> : null}{record.assessment_id !== current?.id ? <p className="text-sm text-muted-foreground">Registro histórico: avaliação vinculada não é a aprovação atual.</p> : null}<p className="text-xs text-muted-foreground">{personName(props, record.reviewer_id)} · {legalDate(record.created_at, true)}</p></article>; })}
    </OperationRecords>
    {creating && editable && current ? <PeriodDialog key={`${props.legalCase.id}:${current.id}`} props={props} sources={sources.data ?? []} payers={payers.data ?? []} documents={available} assessment={current} onClose={() => setCreating(false)} /> : null}
  </OperationPanel>;
}
export default IrPeriods;
