import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listLegalDocuments } from "@/lib/api/legal";
import { listIrIncomeSources, listIrPayers } from "@/lib/api/legal-ir";
import { listIrCessationRecords, recordIrCessation } from "@/lib/api/legal-ir-calculations";
import { normalizeIrMoney, formatIrMoney } from "@/lib/legal-ir-import";
import type { LegalCaseDocument } from "@/types/legal";
import type { IrIncomeSource, IrPayer } from "@/types/legal-ir";
import { legalDate, useLegalAction } from "../../legal-ui";
import { OperationPanel, OperationRecords } from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "../IrShared";
import { INCOME_KINDS, PRODUCT_TYPES, PENSION_KINDS, INCOME_EVENTS, isIrOwner, personName } from "../ir-ui";
import { financialKey, type FinancialPanelProps } from "./financial-ui";
import { OperationSaveFooter, OperationSelectField, OperationTextField } from "./IrOperationFields";

function sourceLabel(source: IrIncomeSource, payers: IrPayer[]) {
  return [payers.find((payer) => payer.id === source.payer_id)?.name ?? "Fonte", INCOME_KINDS[source.income_kind], source.product_type !== "unknown" ? PRODUCT_TYPES[source.product_type] : "", source.income_kind === "pension" && source.pension_kind !== "unknown" ? PENSION_KINDS[source.pension_kind] : "", source.income_event !== "unknown" ? INCOME_EVENTS[source.income_event] : "", source.benefit_number].filter(Boolean).join(" · ");
}
function CessationDialog({ props, sources, payers, documents, onClose }: { props: FinancialPanelProps; sources: IrIncomeSource[]; payers: IrPayer[]; documents: LegalCaseDocument[]; onClose: () => void }) {
  const [form, setForm] = useState({ source_id: "", observed_on: "", competence: "", previous_withheld: "", current_withheld: "", before_document_id: "", after_document_id: "", review_note: "" });
  const change = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await action.run(async () => {
      const previous = normalizeIrMoney(form.previous_withheld, "pt-BR");
      const current = normalizeIrMoney(form.current_withheld, "pt-BR");
      if (previous === null || current === null) throw new Error("Confira os dois valores nos comprovantes; ausência de informação não é zero.");
      if (form.before_document_id === form.after_document_id) throw new Error("Selecione os comprovantes anterior e posterior distintos.");
      return recordIrCessation(props.legalCase.id, { ...form, previous_withheld: previous, current_withheld: current });
    }, "Retenção posterior conferida e registrada")) onClose();
  }
  const documentsOptions = documents.map((document) => ({ value: document.id, label: document.display_name }));
  return <IrDialog title="Conferir retenção no benefício" description="Compare documentos da mesma fonte e benefício. A decisão do pedido, sozinha, não comprova cessação da retenção." pending={action.pending} onClose={onClose}><form className="space-y-4" onSubmit={(event) => void save(event)}>
    <OperationSelectField label="Rendimento ou benefício" value={form.source_id} onChange={(value) => change("source_id", value)} options={sources.map((source) => ({ value: source.id, label: sourceLabel(source, payers) }))} required />
    <div className="grid gap-4 sm:grid-cols-2"><OperationTextField label="Data da conferência" value={form.observed_on} onChange={(value) => change("observed_on", value)} type="date" required /><OperationTextField label="Competência do documento posterior" value={form.competence} onChange={(value) => change("competence", value)} type="month" required /></div>
    <OperationSelectField label="Comprovante anterior" value={form.before_document_id} onChange={(value) => change("before_document_id", value)} options={documentsOptions} required />
    <OperationTextField label="IR retido anteriormente (R$)" value={form.previous_withheld} onChange={(value) => change("previous_withheld", value)} hint="Formato 1.234,56" required />
    <OperationSelectField label="Comprovante posterior" value={form.after_document_id} onChange={(value) => change("after_document_id", value)} options={documentsOptions.filter((document) => document.value !== form.before_document_id)} required />
    <OperationTextField label="IR retido no documento posterior (R$)" value={form.current_withheld} onChange={(value) => change("current_withheld", value)} hint="Informe zero somente quando verificado no documento." required />
    <OperationTextField label="Conferência do responsável" value={form.review_note} onChange={(value) => change("review_note", value)} multiline required hint="Registre fonte, benefício, competência e eventual diferença. Retenção positiva precisa de acompanhamento." />
    <OperationSaveFooter pending={action.pending} onClose={onClose} label="Registrar conferência" />
  </form></IrDialog>;
}

export function IrCessation(props: FinancialPanelProps) {
  const [creating, setCreating] = useState(false);
  const allowed = props.financial.can_fiscal && props.ir.can_fiscal;
  const records = useQuery({ queryKey: financialKey(props, "cessations"), queryFn: () => listIrCessationRecords(props.legalCase.id), enabled: allowed });
  const documents = useQuery({ queryKey: financialKey(props, "documents"), queryFn: () => listLegalDocuments(props.legalCase.id), enabled: allowed });
  const sources = useQuery({ queryKey: financialKey(props, "income-sources"), queryFn: () => listIrIncomeSources(props.legalCase.id), enabled: allowed });
  const payers = useQuery({ queryKey: financialKey(props, "payers"), queryFn: () => listIrPayers(props.legalCase.id), enabled: allowed });
  if (!allowed) return <IrAccessNotice>É necessário acesso fiscal para conferir as retenções deste caso.</IrAccessNotice>;
  const editable = props.canEdit && isIrOwner(props);
  const available = (documents.data ?? []).filter((document) => document.category === "fiscal" && document.status === "ready");
  const inputPending = documents.isPending || sources.isPending || payers.isPending;
  const inputError = documents.error || sources.error || payers.error;
  const retry = () => { void records.refetch(); void documents.refetch(); void sources.refetch(); void payers.refetch(); };
  return <OperationPanel title="Cessação e retenções posteriores" description="Conferência por fonte, benefício e competência. Retenção observada e recebimento de restituição são acompanhamentos distintos." actions={editable ? <Button size="sm" onClick={() => setCreating(true)} disabled={inputPending || Boolean(inputError)}>Conferir retenção</Button> : null}>
    <OperationRecords pending={records.isPending || inputPending} error={records.error || inputError} retry={retry} empty="Nenhuma folha posterior conferida" count={records.data?.length ?? 0}>
      {[...(records.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((record) => { const source = sources.data?.find((item) => item.id === record.source_id); return <article key={record.id} className="space-y-2 rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{source ? sourceLabel(source, payers.data ?? []) : "Rendimento do caso"} · {record.competence}</p><Badge variant={record.status === "verified" ? "outline" : "secondary"}>{record.status === "verified" ? "Sem retenção no documento conferido" : "Retenção positiva — acompanhar"}</Badge></div><p className="text-sm">Anterior: {formatIrMoney(record.previous_withheld)} · posterior: {formatIrMoney(record.current_withheld)}</p><p className="whitespace-pre-wrap break-words text-sm">{record.review_note}</p><p className="text-xs text-muted-foreground">Conferência em {legalDate(record.observed_on)} · {personName(props, record.reviewer_id)}</p></article>; })}
    </OperationRecords>
    {creating && editable ? <CessationDialog key={`${props.legalCase.id}:${allowed}`} props={props} sources={sources.data ?? []} payers={payers.data ?? []} documents={available} onClose={() => setCreating(false)} /> : null}
  </OperationPanel>;
}
export default IrCessation;
