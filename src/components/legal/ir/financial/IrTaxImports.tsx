import { useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  listLegalDocuments,
  uploadLegalDocument,
  downloadLegalDocument,
} from "@/lib/api/legal";
import { listIrIncomeSources, listIrPayers } from "@/lib/api/legal-ir";
import {
  createIrTaxImport,
  listIrTaxEntries,
  listIrTaxImports,
  listIrTaxImportReviews,
  reviewIrTaxImport,
  updateIrTaxEntry,
} from "@/lib/api/legal-ir-calculations";
import { IR_TAX_CSV_HEADERS, parseIrTaxCsv } from "@/lib/legal-ir-import";
import type {
  IrTaxEntry,
  IrTaxEntryPayload,
  IrTaxImport,
} from "@/types/legal-ir-calculations";
import type { IrIncomeSource, IrPayer } from "@/types/legal-ir";
import type { LegalCaseDocument } from "@/types/legal";
import { LegalField, LegalError } from "../../LegalShared";
import { legalDate, useLegalAction } from "../../legal-ui";
import {
  OperationPanel,
  OperationRecords,
  OperationReasonDialog,
} from "../../operations/OperationPanel";
import { IrDialog, IrAccessNotice } from "../IrShared";
import {
  INCOME_KINDS,
  PRODUCT_TYPES,
  PENSION_KINDS,
  INCOME_EVENTS,
} from "../ir-ui";
import { FinancialSelect } from "./FinancialShared";
import {
  financialKey,
  financialOwner,
  formatIrMoney,
  IMPORT_STATUS,
  moneyInput,
  optionalMoney,
  TAX_KINDS,
  type FinancialPanelProps,
} from "./financial-ui";

const blankLine = (): IrTaxEntryPayload => ({
  row_number: 1,
  income_tax_kind: "unknown",
  gross: null,
  taxable: null,
  withheld: null,
  legal_deductions: null,
});
function sourceLabel(source: IrIncomeSource, payers: IrPayer[]) {
  return `${payers.find((p) => p.id === source.payer_id)?.name ?? "Fonte"} · ${INCOME_KINDS[source.income_kind]}${source.product_type !== "unknown" && source.product_type !== "none" ? ` · ${PRODUCT_TYPES[source.product_type]}` : ""}${source.income_kind === "pension" && source.pension_kind !== "unknown" ? ` · ${PENSION_KINDS[source.pension_kind]}` : ""}${source.income_event !== "unknown" ? ` · ${INCOME_EVENTS[source.income_event]}` : ""}${source.benefit_number ? ` · ${source.benefit_number}` : ""}`;
}
function entryComplete(row: IrTaxEntryPayload) {
  return Boolean(
    row.source_id &&
    row.source_line?.trim() &&
    row.payment_date &&
    row.competence &&
    row.calendar_year &&
    row.exercise &&
    row.income_tax_kind !== "unknown" &&
    [row.gross, row.taxable, row.withheld, row.legal_deductions].every(
      (v) => v != null,
    ) &&
    row.payment_date.slice(0, 4) === String(row.calendar_year),
  );
}

function EntryFields({
  value,
  onChange,
  sources,
  payers,
}: {
  value: IrTaxEntryPayload;
  onChange: (value: IrTaxEntryPayload) => void;
  sources: IrIncomeSource[];
  payers: IrPayer[];
}) {
  const patch = (p: Partial<IrTaxEntryPayload>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-4">
      <FinancialSelect
        label="Rendimento vinculado"
        value={value.source_id ?? ""}
        onChange={(v) => patch({ source_id: v || null })}
      >
        <option value="">Ainda não identificado</option>
        {sources.map((s) => (
          <option value={s.id} key={s.id}>
            {sourceLabel(s, payers)}
          </option>
        ))}
      </FinancialSelect>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Data do pagamento">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={value.payment_date ?? ""}
              onChange={(e) => patch({ payment_date: e.target.value || null })}
            />
          )}
        </LegalField>
        <LegalField label="Competência">
          {(id) => (
            <Input
              id={id}
              type="month"
              value={value.competence ?? ""}
              onChange={(e) => patch({ competence: e.target.value || null })}
            />
          )}
        </LegalField>
        <LegalField label="Ano-calendário">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1900}
              max={2200}
              value={value.calendar_year ?? ""}
              onChange={(e) =>
                patch({
                  calendar_year: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          )}
        </LegalField>
        <LegalField label="Exercício">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1900}
              max={2201}
              value={value.exercise ?? ""}
              onChange={(e) =>
                patch({
                  exercise: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          )}
        </LegalField>
      </div>
      <FinancialSelect
        label="Natureza tributária"
        value={value.income_tax_kind}
        onChange={(v) =>
          patch({ income_tax_kind: v as IrTaxEntryPayload["income_tax_kind"] })
        }
      >
        {Object.entries(TAX_KINDS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </FinancialSelect>
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["gross", "Rendimento bruto"],
            ["taxable", "Rendimento tributável"],
            ["withheld", "IR retido"],
            ["legal_deductions", "Deduções legais"],
          ] as const
        ).map(([key, label]) => (
          <LegalField
            label={label}
            key={key}
            hint="Decimal em reais; vazio permanece desconhecido."
          >
            {(id) => (
              <Input
                id={id}
                name={key}
                inputMode="decimal"
                defaultValue={moneyInput(value[key])}
                maxLength={24}
              />
            )}
          </LegalField>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <LegalField label="Página no documento">
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={value.source_page ?? ""}
              onChange={(e) =>
                patch({
                  source_page: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          )}
        </LegalField>
        <LegalField
          label="Linha ou localização no original"
          hint="Obrigatória antes de confirmar a conferência."
        >
          {(id) => (
            <Input
              id={id}
              maxLength={80}
              value={value.source_line ?? ""}
              onChange={(e) => patch({ source_line: e.target.value || null })}
            />
          )}
        </LegalField>
      </div>
      <LegalField label="Observações da conferência">
        {(id) => (
          <Textarea
            id={id}
            value={value.notes ?? ""}
            maxLength={2000}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        )}
      </LegalField>
    </div>
  );
}
function formMoney(form: HTMLFormElement) {
  const data = new FormData(form);
  return Object.fromEntries(
    ["gross", "taxable", "withheld", "legal_deductions"].map((k) => [
      k,
      optionalMoney(String(data.get(k) ?? "")),
    ]),
  ) as Pick<
    IrTaxEntryPayload,
    "gross" | "taxable" | "withheld" | "legal_deductions"
  >;
}

function ImportDialog({
  props,
  documents,
  sources,
  payers,
  previous,
  onClose,
}: {
  props: FinancialPanelProps;
  documents: LegalCaseDocument[];
  sources: IrIncomeSource[];
  payers: IrPayer[];
  previous?: IrTaxImport;
  onClose: () => void;
}) {
  const action = useLegalAction();
  const [mode, setMode] = useState<"manual" | "csv">("csv");
  const [title, setTitle] = useState(
    previous ? `${previous.title} — revisão` : "",
  );
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState<File>();
  const [text, setText] = useState("");
  const [delimiter, setDelimiter] = useState<";" | ",">(";");
  const [decimal, setDecimal] = useState<"pt-BR" | "canonical">("pt-BR");
  const [row, setRow] = useState(blankLine);
  const [readError, setReadError] = useState<unknown>();
  const [uploadedId, setUploadedId] = useState<string>();
  const [mappedSource, setMappedSource] = useState("");
  const fileGeneration = useRef(0);
  const parsed = text
    ? parseIrTaxCsv(text, { delimiter, decimalFormat: decimal })
    : null;
  async function chooseFile(next?: File) {
    if (action.pending) return;
    const generation = ++fileGeneration.current;
    setFile(next);
    setText("");
    setUploadedId(undefined);
    setReadError(undefined);
    if (!next) return;
    try {
      if (next.size > 1048576) throw new Error("O CSV deve ter até 1 MiB.");
      const value = new TextDecoder("utf-8", { fatal: true }).decode(
        await next.arrayBuffer(),
      );
      if (generation === fileGeneration.current) setText(value);
    } catch (error) {
      if (generation !== fileGeneration.current) return;
      setReadError(
        error instanceof TypeError
          ? new Error("Salve o CSV como UTF-8 antes de importar.")
          : error,
      );
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await action.run(async () => {
        let lines: IrTaxEntryPayload[];
        let sourceDoc = documentId;
        if (mode === "csv") {
          if (!file || !parsed?.canImport)
            throw new Error("Corrija os erros do CSV antes de importar.");
          lines = parsed.rows.map((line) =>
            mappedSource && !line.source_id
              ? { ...line, source_id: mappedSource }
              : line,
          );
          if (!uploadedId) {
            const uploaded = await uploadLegalDocument(props.legalCase.id, {
              file,
              category: "fiscal",
              display_name: file.name.slice(0, 200),
            });
            sourceDoc = uploaded.id;
            setUploadedId(sourceDoc);
          } else sourceDoc = uploadedId;
        } else {
          lines = [{ ...row, ...formMoney(form) }];
        }
        if (!sourceDoc)
          throw new Error("Selecione o documento fiscal original.");
        await createIrTaxImport(
          props.legalCase.id,
          sourceDoc,
          title.trim(),
          mode,
          lines,
          previous?.id,
        );
      }, "Importação registrada para conferência")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={
        previous
          ? "Revisar importação preservando a anterior"
          : "Importar documento fiscal"
      }
      description="O original permanece no dossiê. As linhas só participam de cálculos após conferência explícita do responsável."
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <LegalField label="Título da importação">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </LegalField>
        <FinancialSelect
          label="Forma de registro"
          value={mode}
          onChange={(v) => setMode(v as typeof mode)}
        >
          <option value="csv">Importar CSV e preservar o original</option>
          <option value="manual">
            Transcrever uma linha de documento existente
          </option>
        </FinancialSelect>
        {mode === "csv" ? (
          <>
            <LegalField
              label="Arquivo CSV em UTF-8"
              hint="Até 500 linhas e 1 MiB. Fórmulas não são executadas."
            >
              {(id) => (
                <Input
                  id={id}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={action.pending}
                  onChange={(e) => void chooseFile(e.target.files?.[0])}
                />
              )}
            </LegalField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FinancialSelect
                label="Separador das colunas"
                value={delimiter}
                onChange={(v) => setDelimiter(v as typeof delimiter)}
              >
                <option value=";">Ponto e vírgula</option>
                <option value=",">Vírgula</option>
              </FinancialSelect>
              <FinancialSelect
                label="Formato dos valores no arquivo"
                value={decimal}
                onChange={(v) => setDecimal(v as typeof decimal)}
              >
                <option value="pt-BR">Brasileiro: 1.234,56</option>
                <option value="canonical">Decimal com ponto: 1234.56</option>
              </FinancialSelect>
            </div>
            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Colunas e modelo de CSV
              </summary>
              <p className="mt-2 break-words text-xs">
                {IR_TAX_CSV_HEADERS.join(" · ")}
              </p>
              <p className="mt-2 text-muted-foreground">
                Valores vazios continuam desconhecidos. Identifique o rendimento
                por source_id ou selecione abaixo um vínculo explícito para
                linhas sem identificação.
              </p>
            </details>
            <FinancialSelect
              label="Vincular linhas sem rendimento identificado"
              value={mappedSource}
              onChange={setMappedSource}
            >
              <option value="">Manter pendentes para conferência</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {sourceLabel(s, payers)}
                </option>
              ))}
            </FinancialSelect>
            {readError ? <LegalError error={readError} /> : null}
            {parsed ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {parsed.rows.length} linhas interpretadas ·{" "}
                  {parsed.errors.length} erros
                </p>
                {parsed.errors.length ? (
                  <ul
                    role="alert"
                    className="max-h-48 list-disc overflow-y-auto rounded-lg border border-destructive/30 p-4 pl-7 text-sm text-destructive"
                  >
                    {parsed.errors.map((e, i) => (
                      <li key={i}>
                        Linha {e.line}
                        {e.field ? `, ${e.field}` : ""}: {e.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="max-h-56 overflow-auto rounded-lg border">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">
                        Prévia dos valores fiscais importados
                      </caption>
                      <thead>
                        <tr>
                          {[
                            "Linha",
                            "Competência",
                            "Bruto",
                            "Tributável",
                            "Retido",
                            "Deduções",
                          ].map((h) => (
                            <th className="whitespace-nowrap p-2" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{r.row_number}</td>
                            <td className="p-2">
                              {r.competence ?? "Pendente"}
                            </td>
                            {[
                              r.gross,
                              r.taxable,
                              r.withheld,
                              r.legal_deductions,
                            ].map((v, k) => (
                              <td className="whitespace-nowrap p-2" key={k}>
                                {formatIrMoney(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <FinancialSelect
              label="Documento fiscal original"
              required
              value={documentId}
              onChange={setDocumentId}
            >
              <option value="">Selecione</option>
              {documents.map((d) => (
                <option value={d.id} key={d.id}>
                  {d.display_name}
                </option>
              ))}
            </FinancialSelect>
            <EntryFields
              value={row}
              onChange={setRow}
              sources={sources}
              payers={payers}
            />
          </>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={action.pending}
          >
            Cancelar
          </Button>
          <Button
            disabled={action.pending || (mode === "csv" && !parsed?.canImport)}
          >
            {action.pending
              ? "Preservando e registrando…"
              : "Registrar para conferência"}
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function EditEntryDialog({
  entry,
  sources,
  payers,
  onClose,
}: {
  entry: IrTaxEntry;
  sources: IrIncomeSource[];
  payers: IrPayer[];
  onClose: () => void;
}) {
  const action = useLegalAction();
  const [row, setRow] = useState<IrTaxEntryPayload>(entry);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (
      await action.run(async () => {
        const {
          id: _id,
          tenant_id: _tenant,
          case_id: _case,
          import_id: _import,
          ...payload
        } = row as IrTaxEntry;
        await updateIrTaxEntry(entry.id, { ...payload, ...formMoney(form) });
      }, "Linha fiscal corrigida")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={`Conferir linha ${entry.row_number}`}
      description="Corrija a transcrição. Os valores e campos originais importados ficam preservados para rastreabilidade."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <EntryFields
          value={row}
          onChange={setRow}
          sources={sources}
          payers={payers}
        />
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Salvar correção</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
export function IrTaxImports(props: FinancialPanelProps) {
  const allowed = props.ir.can_fiscal && props.financial.can_fiscal;
  const imports = useQuery({
    queryKey: financialKey(props, "imports"),
    queryFn: () => listIrTaxImports(props.legalCase.id),
    enabled: allowed,
  });
  const reviews = useQuery({
    queryKey: financialKey(props, "import-reviews"),
    queryFn: () => listIrTaxImportReviews(props.legalCase.id),
    enabled: allowed,
  });
  const entries = useQuery({
    queryKey: financialKey(props, "entries"),
    queryFn: () => listIrTaxEntries(props.legalCase.id),
    enabled: allowed,
  });
  const documents = useQuery({
    queryKey: financialKey(props, "documents"),
    queryFn: () => listLegalDocuments(props.legalCase.id),
    enabled: allowed,
  });
  const sources = useQuery({
    queryKey: financialKey(props, "sources"),
    queryFn: () => listIrIncomeSources(props.legalCase.id),
    enabled: allowed,
  });
  const payers = useQuery({
    queryKey: financialKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
    enabled: allowed,
  });
  const [creating, setCreating] = useState(false);
  const [previous, setPrevious] = useState<IrTaxImport>();
  const [editing, setEditing] = useState<IrTaxEntry>();
  const [review, setReview] = useState<{
    row: IrTaxImport;
    decision: "reviewed" | "rejected";
  }>();
  const action = useLegalAction();
  if (!allowed)
    return (
      <IrAccessNotice>
        O acesso fiscal é necessário para visualizar as importações e suas
        linhas.
      </IrAccessNotice>
    );
  const docs = (documents.data ?? []).filter(
    (d) => d.category === "fiscal" && d.status === "ready",
  );
  const error =
    reviews.error ??
    entries.error ??
    documents.error ??
    sources.error ??
    payers.error;
  return (
    <OperationPanel
      title="Documentos e competências"
      description="Transcrição revisável, vinculada ao original e ao rendimento de cada fonte pagadora."
      actions={
        props.canEdit ? (
          <Button onClick={() => setCreating(true)}>Nova importação</Button>
        ) : undefined
      }
    >
      {error ? <LegalError error={error} /> : null}
      <p className="text-sm text-muted-foreground">
        Células vazias não equivalem a zero. Rendimentos sem classificação e
        dados de pagamento incompletos impedem a conferência.
      </p>
      <OperationRecords
        pending={imports.isPending || entries.isPending}
        error={imports.error}
        retry={() => void imports.refetch()}
        empty="Nenhuma importação fiscal registrada"
        count={imports.data?.length ?? 0}
      >
        {imports.data?.map((record) => {
          const rows = (entries.data ?? [])
            .filter((r) => r.import_id === record.id)
            .sort((a, b) => a.row_number - b.row_number);
          const missing = rows.filter((r) => !entryComplete(r)).length;
          const doc = docs.find((d) => d.id === record.document_id);
          return (
            <article
              className="space-y-3 rounded-lg border p-4"
              key={record.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="break-words font-medium">{record.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    {legalDate(record.created_at)} · {rows.length} linhas
                  </p>
                </div>
                <Badge variant="outline">{IMPORT_STATUS[record.status]}</Badge>
              </div>
              {doc ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void action.run(
                      () => downloadLegalDocument(doc),
                      "Download solicitado",
                    )
                  }
                >
                  Baixar original
                </Button>
              ) : null}
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Conferir {rows.length} linhas{" "}
                  {missing ? `· ${missing} incompletas` : ""}
                </summary>
                <div className="mt-3 space-y-2">
                  {rows.map((row) => (
                    <section
                      key={row.id}
                      className="space-y-2 rounded-lg bg-muted/30 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          Linha {row.row_number} ·{" "}
                          {row.competence ?? "Competência pendente"}
                        </p>
                        {props.canEdit && record.status === "draft" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(row)}
                          >
                            Conferir linha {row.row_number}
                          </Button>
                        ) : null}
                      </div>
                      <p className="break-words">
                        {sources.data?.find((s) => s.id === row.source_id)
                          ? sourceLabel(
                              sources.data.find((s) => s.id === row.source_id)!,
                              payers.data ?? [],
                            )
                          : "Rendimento não identificado"}
                      </p>
                      <p>
                        {TAX_KINDS[row.income_tax_kind]} · Pagamento:{" "}
                        {legalDate(row.payment_date)} · Ano{" "}
                        {row.calendar_year ?? "?"} / exercício{" "}
                        {row.exercise ?? "?"}
                      </p>
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["Bruto", row.gross],
                          ["Tributável", row.taxable],
                          ["IR retido", row.withheld],
                          ["Deduções", row.legal_deductions],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <dt className="text-xs text-muted-foreground">
                              {l}
                            </dt>
                            <dd className="break-all">{formatIrMoney(v)}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs text-muted-foreground">
                        Página {row.source_page ?? "não indicada"} · Localização{" "}
                        {row.source_line ?? "não indicada"}
                      </p>
                      {row.notes ? (
                        <p className="whitespace-pre-wrap break-words">
                          {row.notes}
                        </p>
                      ) : null}
                    </section>
                  ))}
                </div>
              </details>
              {record.review_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Conferência: {record.review_note}
                </p>
              ) : null}
              {(reviews.data ?? []).filter((r) => r.import_id === record.id)
                .length ? (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Histórico de conferência do lote
                  </summary>
                  <div className="mt-3 space-y-2">
                    {(reviews.data ?? [])
                      .filter((r) => r.import_id === record.id)
                      .map((r) => (
                        <section
                          key={r.id}
                          className="space-y-1 rounded-lg bg-muted/30 p-3 text-sm"
                        >
                          <p>
                            {legalDate(r.created_at)} ·{" "}
                            {IMPORT_STATUS[r.from_status]} →{" "}
                            {r.decision === "reviewed"
                              ? "Conferida"
                              : "Desconsiderada / correção necessária"}
                          </p>
                          <p className="whitespace-pre-wrap break-words">
                            {r.note}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Responsável:{" "}
                            {props.workspace.collaborators.find(
                              (p) => p.id === r.reviewer_id,
                            )?.nome ?? "Profissional do escritório"}
                          </p>
                        </section>
                      ))}
                  </div>
                </details>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {financialOwner(props) && record.status === "draft" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={missing > 0 || Boolean(error)}
                      onClick={() =>
                        setReview({ row: record, decision: "reviewed" })
                      }
                    >
                      Confirmar conferência
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReview({ row: record, decision: "rejected" })
                      }
                    >
                      Solicitar correção
                    </Button>
                  </>
                ) : null}
                {financialOwner(props) && record.status === "reviewed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setReview({ row: record, decision: "rejected" })
                    }
                  >
                    Desconsiderar lote
                  </Button>
                ) : null}
                {props.canEdit &&
                ["reviewed", "rejected"].includes(record.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPrevious(record);
                      setCreating(true);
                    }}
                  >
                    Nova importação revisada
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </OperationRecords>
      {creating && props.canEdit ? (
        <ImportDialog
          props={props}
          documents={docs}
          sources={sources.data ?? []}
          payers={payers.data ?? []}
          previous={previous}
          onClose={() => {
            setCreating(false);
            setPrevious(undefined);
          }}
        />
      ) : null}
      {editing &&
      props.canEdit &&
      imports.data?.find((i) => i.id === editing.import_id)?.status ===
        "draft" ? (
        <EditEntryDialog
          entry={editing}
          sources={sources.data ?? []}
          payers={payers.data ?? []}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {review && financialOwner(props) ? (
        <OperationReasonDialog
          open
          title={
            review.decision === "reviewed"
              ? "Concluir conferência fiscal"
              : review.row.status === "reviewed"
                ? "Desconsiderar lote conferido"
                : "Solicitar correção da importação"
          }
          description="Registre o que foi confrontado com o original. Após a decisão, as linhas ficam imutáveis; uma correção exige nova importação."
          pending={action.pending}
          onClose={() => setReview(undefined)}
          onSave={(note) =>
            action.run(
              () => reviewIrTaxImport(review.row.id, review.decision, note),
              "Conferência registrada",
            )
          }
        />
      ) : null}
    </OperationPanel>
  );
}
