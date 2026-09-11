import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { listIrTaxReturns, recordIrTaxReturn, listIrTaxReturnEvents, updateIrTaxReturnStatus } from "@/lib/api/legal-ir-calculations";
import { normalizeIrMoney, formatIrMoney } from "@/lib/legal-ir-import";
import type { LegalCaseDocument } from "@/types/legal";
import type { IrTaxReturn, IrTaxReturnPayload } from "@/types/legal-ir-calculations";
import { legalDate, useLegalAction } from "../../legal-ui";
import { OperationPanel, OperationRecords } from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "../IrShared";
import { isIrOwner, personName } from "../ir-ui";
import { financialKey, type FinancialPanelProps } from "./financial-ui";
import { OperationSaveFooter, OperationSelectField, OperationTextField } from "./IrOperationFields";

const STATUS: Record<IrTaxReturn["status"], string> = { draft: "Rascunho", filed: "Transmissão comprovada", processing: "Em processamento", settled: "Situação liquidada informada", cancelled: "Cancelada" };

function ReturnStatusDialog({ record, documents, onClose }: { record: IrTaxReturn; documents: LegalCaseDocument[]; onClose: () => void }) {
  const [status, setStatus] = useState<IrTaxReturn["status"]>(record.status === "draft" ? "filed" : record.status);
  const [receiptDocumentId, setReceiptDocumentId] = useState(record.receipt_document_id ?? "");
  const [receiptNumber, setReceiptNumber] = useState(record.receipt_number);
  const [note, setNote] = useState("");
  const action = useLegalAction();
  const progression = ["draft", "filed", "processing", "settled"];
  const statusOptions = Object.entries(STATUS).filter(([value]) => value !== "draft" && (value === "cancelled" || progression.indexOf(value) >= progression.indexOf(record.status))).map(([value, label]) => ({ value, label }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(() => updateIrTaxReturnStatus(record.id, status, receiptDocumentId || null, receiptNumber.trim() || null, note.trim()), "Situação atualizada com histórico preservado")) onClose();
  }
  return <IrDialog title={`Atualizar situação · exercício ${record.exercise}`} description="Atualize o mesmo registro após conferir a fonte. O arquivo e os valores originais permanecem preservados; esta ação não transmite nem registra recebimento." onClose={onClose} pending={action.pending}><form onSubmit={(event) => void save(event)} className="space-y-4">
    <OperationSelectField label="Nova situação conferida" value={status} onChange={(value) => setStatus(value as IrTaxReturn["status"])} options={statusOptions} required />
    <OperationSelectField label="Recibo ou evidência fiscal" value={receiptDocumentId} onChange={setReceiptDocumentId} options={documents.map((document) => ({ value: document.id, label: document.display_name }))} required />
    <OperationTextField label="Número do recibo conferido" value={receiptNumber} onChange={setReceiptNumber} maxLength={200} required />
    <OperationTextField label="Origem da atualização e justificativa" value={note} onChange={setNote} multiline required />
    <OperationSaveFooter pending={action.pending} disabled={!note.trim()} onClose={onClose} label="Atualizar situação e preservar histórico" />
  </form></IrDialog>;
}

function ReturnDialog({ props, records, documents, onClose }: { props: FinancialPanelProps; records: IrTaxReturn[]; documents: LegalCaseDocument[]; onClose: () => void }) {
  const [form, setForm] = useState({ calendar_year: "", exercise: "", return_kind: "original" as IrTaxReturn["return_kind"], previous_return_id: "", document_id: "", receipt_document_id: "", receipt_number: "", status: "draft" as IrTaxReturn["status"], reported_tax: "", reported_refund: "", paid_quotas: "", notes: "" });
  const action = useLegalAction();
  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const needsReceipt = form.status !== "draft";
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(async () => {
      if (!/^\d{4}$/.test(form.calendar_year) || !/^\d{4}$/.test(form.exercise) || Number(form.exercise) !== Number(form.calendar_year) + 1) throw new Error("Confira o ano-calendário e o exercício seguinte.");
      const money = (value: string) => { const result = normalizeIrMoney(value, "pt-BR"); if (result === null) throw new Error("Informe cada valor fiscal, inclusive zero quando comprovado."); return result; };
      const payload: IrTaxReturnPayload = { ...form, calendar_year: Number(form.calendar_year), exercise: Number(form.exercise), previous_return_id: form.previous_return_id || null, receipt_document_id: form.receipt_document_id || null, reported_tax: money(form.reported_tax), reported_refund: money(form.reported_refund), paid_quotas: money(form.paid_quotas) };
      return recordIrTaxReturn(props.legalCase.id, payload);
    }, "Declaração registrada com suas evidências")) onClose();
  }
  const documentOptions = documents.map((document) => ({ value: document.id, label: document.display_name }));
  return <IrDialog title="Registrar declaração" description="Registre a declaração e a situação conferida fora do produto. Salvar não transmite à Receita nem confirma um recebimento." onClose={onClose} pending={action.pending} wide><form onSubmit={(event) => void save(event)} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><OperationTextField label="Ano-calendário" value={form.calendar_year} onChange={(value) => change("calendar_year", value)} maxLength={4} required /><OperationTextField label="Exercício" value={form.exercise} onChange={(value) => change("exercise", value)} maxLength={4} required /></div>
    <OperationSelectField label="Tipo de declaração" value={form.return_kind} onChange={(value) => change("return_kind", value)} required options={[{ value: "original", label: "Original" }, { value: "amending", label: "Retificadora" }]} />
    <OperationSelectField label="Registro anterior" value={form.previous_return_id} onChange={(value) => change("previous_return_id", value)} required={form.return_kind === "amending"} hint="Correções e atualizações preservam o registro anterior. Retificadora exige o vínculo." options={records.filter((record) => String(record.calendar_year) === form.calendar_year).map((record) => ({ value: record.id, label: `${record.exercise} · ${record.return_kind === "amending" ? "Retificadora" : "Original"} · ${STATUS[record.status]} · ${legalDate(record.created_at, true)}` }))} />
    <OperationSelectField label="Documento da declaração" value={form.document_id} onChange={(value) => change("document_id", value)} options={documentOptions} required />
    <OperationSelectField label="Situação conferida" value={form.status} onChange={(value) => change("status", value)} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} required />
    <OperationSelectField label="Comprovante de transmissão" value={form.receipt_document_id} onChange={(value) => change("receipt_document_id", value)} options={documentOptions} required={needsReceipt} />
    <OperationTextField label="Número do recibo" value={form.receipt_number} onChange={(value) => change("receipt_number", value)} required={needsReceipt} maxLength={200} />
    <div className="grid gap-4 sm:grid-cols-3"><OperationTextField label="Imposto declarado (R$)" value={form.reported_tax} onChange={(value) => change("reported_tax", value)} hint="Formato 1.234,56" required /><OperationTextField label="Restituição declarada (R$)" value={form.reported_refund} onChange={(value) => change("reported_refund", value)} hint="Saldo declarado, ainda não recebido" required /><OperationTextField label="Quotas pagas (R$)" value={form.paid_quotas} onChange={(value) => change("paid_quotas", value)} required /></div>
    <OperationTextField label="Conferência e observações fiscais" value={form.notes} onChange={(value) => change("notes", value)} multiline hint="Informe fiscalização, retificação, quotas e pendências. Informações clínicas ficam no dossiê protegido." />
    <OperationSaveFooter pending={action.pending} onClose={onClose} label="Registrar declaração" />
  </form></IrDialog>;
}

export function IrTaxReturns(props: FinancialPanelProps) {
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<IrTaxReturn | null>(null);
  const allowed = props.financial.can_fiscal && props.ir.can_fiscal;
  const records = useQuery({ queryKey: financialKey(props, "tax-returns"), queryFn: () => listIrTaxReturns(props.legalCase.id), enabled: allowed });
  const events = useQuery({ queryKey: financialKey(props, "tax-return-events"), queryFn: () => listIrTaxReturnEvents(props.legalCase.id), enabled: allowed });
  const documents = useQuery({ queryKey: financialKey(props, "documents"), queryFn: () => listLegalDocuments(props.legalCase.id), enabled: allowed });
  if (!allowed) return <IrAccessNotice>É necessário acesso fiscal para consultar declarações deste caso.</IrAccessNotice>;
  const available = (documents.data ?? []).filter((document) => document.category === "fiscal" && document.status === "ready");
  const editable = props.canEdit && isIrOwner(props);
  return <OperationPanel title="Declarações e recibos" description="Originais, retificadoras e situações fiscais com evidência. O saldo declarado não é um recebimento confirmado." actions={editable ? <Button size="sm" onClick={() => setCreating(true)} disabled={documents.isPending || Boolean(documents.error)}>Registrar declaração</Button> : null}>
    <OperationRecords pending={records.isPending || events.isPending} error={records.error || documents.error || events.error} retry={() => { void records.refetch(); void documents.refetch(); void events.refetch(); }} empty="Nenhuma declaração registrada" count={records.data?.length ?? 0}>
      {[...(records.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((record) => <article className="space-y-3 rounded-lg border p-4" key={record.id}>
        <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">Exercício {record.exercise} · ano-calendário {record.calendar_year}</p><Badge variant="outline">{STATUS[record.status]}</Badge></div>
        <p className="text-sm">{record.return_kind === "amending" ? "Retificadora" : "Original"}{record.receipt_number ? ` · recibo ${record.receipt_number}` : ""}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Imposto declarado</dt><dd>{formatIrMoney(record.reported_tax)}</dd></div><div><dt className="text-muted-foreground">Restituição declarada</dt><dd>{formatIrMoney(record.reported_refund)}</dd></div><div><dt className="text-muted-foreground">Quotas pagas informadas</dt><dd>{formatIrMoney(record.paid_quotas)}</dd></div></dl>
        {record.notes ? <p className="whitespace-pre-wrap break-words text-sm">{record.notes}</p> : null}
        <p className="text-xs text-muted-foreground">{personName(props, record.created_by)} · {legalDate(record.created_at, true)}</p>
        <details><summary className="cursor-pointer text-sm font-medium">Histórico de situações</summary><div className="mt-2 space-y-2">{[...(events.data ?? [])].filter((event) => event.return_id === record.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((event) => <div key={event.id} className="space-y-1 border-l-2 pl-3 text-sm"><p>{event.from_status ? `${STATUS[event.from_status]} → ` : ""}{STATUS[event.to_status]}</p><p className="whitespace-pre-wrap break-words">{event.note}</p>{event.receipt_number ? <p>Recibo: {event.receipt_number}</p> : null}<p className="text-xs text-muted-foreground">{personName(props, event.actor_id)} · {legalDate(event.created_at, true)}</p></div>)}</div></details>
        {editable && record.status !== "cancelled" ? <Button size="sm" variant="outline" onClick={() => setUpdating(record)}>Atualizar situação</Button> : null}
      </article>)}
    </OperationRecords>
    {creating && editable ? <ReturnDialog key={`${props.legalCase.id}:${allowed}`} props={props} records={records.data ?? []} documents={available} onClose={() => setCreating(false)} /> : null}
    {updating && editable ? <ReturnStatusDialog key={updating.id} record={updating} documents={available} onClose={() => setUpdating(null)} /> : null}
  </OperationPanel>;
}
export default IrTaxReturns;
