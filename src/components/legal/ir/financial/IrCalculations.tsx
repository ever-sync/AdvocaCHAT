import { downloadIrCalculationReport } from "@/lib/legal-ir-report";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { listIrAssessmentVersions, listIrPayers } from "@/lib/api/legal-ir";
import {
  createIrCalculationVersion,
  listIrCalculationVersions,
  listIrPeriodReviews,
  listIrTaxEntries,
  listIrTaxImports,
  listIrTaxParameterVersions,
  reviewIrCalculation,
  submitIrCalculationReview,
  readIrCalculationReport,
} from "@/lib/api/legal-ir-calculations";
import type { IrAssessmentVersion, IrJson, IrPayer } from "@/types/legal-ir";
import type {
  IrCalculationPayload,
  IrCalculationVersion,
  IrPeriodReview,
  IrTaxEntry,
  IrTaxImport,
  IrTaxParameterVersion,
} from "@/types/legal-ir-calculations";
import { LegalField, LegalError } from "../../LegalShared";
import { legalDate, useLegalAction } from "../../legal-ui";
import {
  OperationPanel,
  OperationRecords,
} from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog, IrSelection } from "../IrShared";
import {
  CALCULATION_STATUS,
  DEDUCTION_MODES,
  financialKey,
  financialWorkspaceKey,
  financialOwner,
  formatIrMoney,
  moneyInput,
  PERIODICITY,
  requiredMoney,
  TAX_RESIDENCY,
  type FinancialPanelProps,
} from "./financial-ui";
import {
  ComputationDetails,
  FinancialSelect,
  MoneyField,
} from "./FinancialShared";

function snapshotRows<T>(snapshot: IrJson, key: string): T[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return [];
  return Array.isArray(snapshot[key]) ? (snapshot[key] as unknown as T[]) : [];
}
function configuration(snapshot?: IrJson): Partial<IrCalculationPayload> {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return {};
  const value = snapshot.configuration;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as Partial<IrCalculationPayload>)
    : {};
}
const payerName = (payers: IrPayer[], id?: string | null) =>
  id
    ? (payers.find((p) => p.id === id)?.name ?? "Fonte pagadora vinculada")
    : "Conjunto anual de fontes";
function CalculationDialog({
  props,
  assessments,
  imports,
  entries,
  parameters,
  periods,
  previous,
  onClose,
}: {
  props: FinancialPanelProps;
  assessments: IrAssessmentVersion[];
  imports: IrTaxImport[];
  entries: IrTaxEntry[];
  parameters: IrTaxParameterVersion[];
  periods: IrPeriodReview[];
  previous?: IrCalculationVersion;
  onClose: () => void;
}) {
  const old = configuration(previous?.snapshot);
  const action = useLegalAction();
  const [assessment, setAssessment] = useState("");
  const [periodicity, setPeriodicity] = useState<
    IrCalculationPayload["periodicity"]
  >(previous?.periodicity ?? "monthly");
  const [year, setYear] = useState(
    previous ? String(previous.calendar_year) : "",
  );
  const [month, setMonth] = useState(
    previous?.month ? String(previous.month) : "",
  );
  const [deduction, setDeduction] = useState<
    IrCalculationPayload["deduction_mode"]
  >(previous?.deduction_mode ?? "legal");
  const [residency, setResidency] =
    useState<IrCalculationPayload["tax_residency"]>("unknown");
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);
  const [complete, setComplete] = useState(false);
  const [note, setNote] = useState("");
  const [adjustments, setAdjustments] = useState<
    Record<
      string,
      { taxable: string; deductions: string; reason: string; period: string }
    >
  >({});
  const periodEntries = entries.filter(
    (e) =>
      selectedImports.includes(e.import_id) &&
      e.payment_date?.slice(0, 4) === year &&
      (periodicity === "annual" ||
        e.payment_date?.slice(5, 7) === month.padStart(2, "0")),
  );
  const currentAssessment = assessments.filter(
    (a) =>
      a.status === "approved" &&
      a.id === props.ir.latest_assessment_id &&
      props.ir.assessment_is_current === true,
  );
  const changeAdjustment = (
    id: string,
    patch: Partial<{
      taxable: string;
      deductions: string;
      reason: string;
      period: string;
    }>,
  ) =>
    setAdjustments({ ...adjustments, [id]: { ...adjustments[id], ...patch } });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(async () => {
        await createIrCalculationVersion(props.legalCase.id, {
          assessment_id: assessment,
          periodicity,
          calendar_year: Number(year),
          ...(periodicity === "monthly" ? { month: Number(month) } : {}),
          import_ids: selectedImports,
          parameter_ids: selectedParameters,
          deduction_mode: deduction,
          tax_residency: residency,
          inventory_complete: complete,
          completeness_note: note.trim(),
          adjustments: periodEntries
            .filter((entry) => adjustments[entry.id])
            .map((entry) => {
              const a = adjustments[entry.id];
              return {
                entry_id: entry.id,
                proposed_taxable: requiredMoney(a.taxable),
                ...(a.deductions.trim()
                  ? { proposed_legal_deductions: requiredMoney(a.deductions) }
                  : {}),
                reason: a.reason.trim(),
                ...(a.period ? { period_review_id: a.period } : {}),
              };
            }),
        });
      }, "Versão fiscal registrada; confira o resultado e eventuais recusas")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={
        previous
          ? "Reexaminar e criar cenário atualizado"
          : "Novo cenário de cálculo"
      }
      description="O servidor calcula com precisão decimal e recusa resultados parciais quando o período, a cobertura ou a prova são insuficientes."
      pending={action.pending}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        {previous ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Reexamine a versão {previous.version_number}. As seleções, ajustes e
            declarações de abrangência precisam ser confirmados novamente. A
            versão anterior usou {(old.import_ids ?? []).length} importações e{" "}
            {(old.parameter_ids ?? []).length} tabelas.
          </p>
        ) : null}
        <FinancialSelect
          label="Análise jurídica aprovada e atual"
          required
          value={assessment}
          onChange={(value) => {
            setAssessment(value);
            setAdjustments({});
          }}
        >
          <option value="">Selecione a análise revisada</option>
          {currentAssessment.map((a) => (
            <option key={a.id} value={a.id}>
              Versão {a.version_number} · {legalDate(a.reviewed_at)}
            </option>
          ))}
        </FinancialSelect>
        {!currentAssessment.length ? (
          <p className="text-sm text-amber-800">
            Conclua uma análise jurídica atual na área “Análise do advogado”
            para preparar o cálculo.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <FinancialSelect
            label="Abrangência do cenário"
            value={periodicity}
            onChange={(v) => {
              setPeriodicity(v as typeof periodicity);
              setSelectedParameters([]);
              setAdjustments({});
            }}
          >
            {Object.entries(PERIODICITY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </FinancialSelect>
          <LegalField label="Ano-calendário do cenário">
            {(id) => (
              <Input
                id={id}
                required
                type="number"
                min={1900}
                max={2200}
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setSelectedParameters([]);
                  setAdjustments({});
                }}
              />
            )}
          </LegalField>
          {periodicity === "monthly" ? (
            <FinancialSelect
              label="Mês de pagamento"
              required
              value={month}
              onChange={(v) => {
                setMonth(v);
                setAdjustments({});
              }}
            >
              <option value="">Selecione</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option value={String(i + 1)} key={i}>
                  {String(i + 1).padStart(2, "0")}
                </option>
              ))}
            </FinancialSelect>
          ) : null}
          <FinancialSelect
            label="Residência fiscal"
            value={residency}
            onChange={(v) => setResidency(v as typeof residency)}
          >
            {Object.entries(TAX_RESIDENCY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </FinancialSelect>
          <FinancialSelect
            label="Tratamento das deduções"
            value={deduction}
            onChange={(v) => setDeduction(v as typeof deduction)}
          >
            {Object.entries(DEDUCTION_MODES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </FinancialSelect>
        </div>
        <IrSelection
          label="Importações para este período"
          values={imports
            .filter((i) => i.status === "reviewed")
            .map((i) => ({ id: i.id, label: i.title }))}
          selected={selectedImports}
          onChange={(values) => {
            setSelectedImports(values);
            setAdjustments({});
          }}
          empty="Conclua a conferência de uma importação."
        />
        <IrSelection
          label="Tabelas aprovadas que cobrem os pagamentos"
          values={parameters
            .filter(
              (p) =>
                p.status === "approved" &&
                p.periodicity === periodicity &&
                String(p.calendar_year) === year,
            )
            .map((p) => ({
              id: p.id,
              label: `${p.title} · v${p.version_number} · ${legalDate(p.valid_from)} a ${legalDate(p.valid_until)}`,
            }))}
          selected={selectedParameters}
          onChange={setSelectedParameters}
          empty="Não há tabela aprovada para a periodicidade e o ano informados."
        />
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">
            Hipóteses por linha documentada
          </legend>
          <p className="text-xs text-muted-foreground">
            Sem ajuste, o cenário mantém o valor tributável documentado. Reduzir
            rendimentos exige análise aplicável e período de inclusão revisado.
            Deduções propostas exigem fundamentação própria.
          </p>
          {periodEntries.map((entry) => {
            const a = adjustments[entry.id];
            return (
              <section
                key={entry.id}
                className="space-y-3 rounded-lg bg-muted/30 p-3"
              >
                <label className="flex items-start gap-2 text-sm">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={Boolean(a)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setAdjustments({
                          ...adjustments,
                          [entry.id]: {
                            taxable: moneyInput(entry.taxable),
                            deductions: "",
                            reason: "",
                            period: "",
                          },
                        });
                      else {
                        const next = { ...adjustments };
                        delete next[entry.id];
                        setAdjustments(next);
                      }
                    }}
                  />
                  <span>
                    {imports.find((i) => i.id === entry.import_id)?.title} ·
                    linha {entry.row_number} · {legalDate(entry.payment_date)} ·
                    tributável {formatIrMoney(entry.taxable)}
                  </span>
                </label>
                {a ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MoneyField
                        required
                        label={`Tributável proposto da linha ${entry.row_number}`}
                        value={a.taxable}
                        onChange={(v) =>
                          changeAdjustment(entry.id, { taxable: v })
                        }
                      />
                      <MoneyField
                        label={`Deduções propostas da linha ${entry.row_number}`}
                        value={a.deductions}
                        onChange={(v) =>
                          changeAdjustment(entry.id, { deductions: v })
                        }
                        hint="Vazio preserva as deduções documentadas desta linha."
                      />
                    </div>
                    <FinancialSelect
                      label={`Período jurídico da linha ${entry.row_number}`}
                      value={a.period}
                      onChange={(v) =>
                        changeAdjustment(entry.id, { period: v })
                      }
                    >
                      <option value="">Sem revisão de período vinculada</option>
                      {periods
                        .filter(
                          (p) =>
                            p.source_id === entry.source_id &&
                            p.assessment_id === assessment &&
                            p.decision === "include" &&
                            entry.payment_date &&
                            entry.payment_date >= p.period_start &&
                            entry.payment_date <= p.period_end,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {legalDate(p.period_start)} a{" "}
                            {legalDate(p.period_end)} · marco{" "}
                            {legalDate(p.landmark_date)}
                          </option>
                        ))}
                    </FinancialSelect>
                    <LegalField
                      label={`Fundamento do ajuste da linha ${entry.row_number}`}
                    >
                      {(id) => (
                        <Textarea
                          id={id}
                          required
                          maxLength={4000}
                          value={a.reason}
                          onChange={(e) =>
                            changeAdjustment(entry.id, {
                              reason: e.target.value,
                            })
                          }
                        />
                      )}
                    </LegalField>
                  </>
                ) : null}
              </section>
            );
          })}
          {!periodEntries.length ? (
            <p className="text-sm text-muted-foreground">
              Selecione o período e as importações para examinar as linhas
              abrangidas.
            </p>
          ) : null}
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
          />
          <span>
            Conferi todas as fontes, naturezas e pagamentos do período; a
            documentação permite avaliar sua abrangência integral.
          </span>
        </label>
        <LegalField
          label="Abrangência conferida e limitações conhecidas"
          hint="Se a abrangência não foi confirmada, o resultado registrará recusa sem apresentar total parcial."
        >
          {(id) => (
            <Textarea
              id={id}
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </LegalField>
        <p className="text-xs text-muted-foreground">
          RRA, 13º, tributação regressiva, rendimentos do exterior e tributação
          mínima exigem tratamento específico. Juros e atualização monetária não
          são calculados por este motor.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending || !assessment}>
            Registrar cenário e memória
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function CalculationReviewDialog({
  version,
  onClose,
}: {
  version: IrCalculationVersion;
  onClose: () => void;
}) {
  const [decision, setDecision] = useState<"approved" | "returned">("returned");
  const [complete, setComplete] = useState(false);
  const [note, setNote] = useState("");
  const action = useLegalAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(
        () => reviewIrCalculation(version.id, decision, note.trim(), complete),
        "Revisão fiscal registrada",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title="Revisão profissional do cenário"
      description="Examine o inventário integral, os ajustes, parâmetros e memória. Esta decisão não reconhece crédito nem recebimento externo."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <FinancialSelect
          label="Decisão da revisão"
          value={decision}
          onChange={(v) => setDecision(v as typeof decision)}
        >
          <option value="returned">Devolver para reexame</option>
          <option value="approved">Aprovar a revisão interna</option>
        </FinancialSelect>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={complete}
            onChange={(e) => setComplete(e.target.checked)}
          />
          <span>
            Conferi a abrangência integral das fontes e pagamentos, a memória e
            as limitações deste período.
          </span>
        </label>
        <LegalField label="Fundamentação da revisão">
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={action.pending || (decision === "approved" && !complete)}
          >
            Registrar decisão
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function SnapshotDetails({ version }: { version: IrCalculationVersion }) {
  const entries = snapshotRows<IrTaxEntry>(version.snapshot, "entries"),
    imports = snapshotRows<IrTaxImport>(version.snapshot, "imports"),
    parameters = snapshotRows<IrTaxParameterVersion>(
      version.snapshot,
      "parameters",
    );
  const cfg = configuration(version.snapshot);
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Conferir entradas preservadas desta versão
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="break-all text-xs text-muted-foreground">
          Identificação da memória: {version.input_hash}
        </p>
        <p>
          Ano {cfg.calendar_year},{" "}
          {cfg.periodicity === "monthly" ? `mês ${cfg.month}` : "ajuste anual"}.
          Importações selecionadas: {cfg.import_ids?.length ?? 0}.
        </p>
        {imports.map((i) => (
          <p key={i.id}>
            {i.title} ·{" "}
            {cfg.import_ids?.includes(i.id)
              ? "selecionada"
              : "inventário examinado"}{" "}
            ·{" "}
            {i.status === "reviewed"
              ? "conferida"
              : "situação preservada no momento do cálculo"}
          </p>
        ))}
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Linhas do inventário preservado
            </caption>
            <thead>
              <tr>
                {[
                  "Origem",
                  "Pagamento",
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
              {entries.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">
                    {imports.find((i) => i.id === e.import_id)?.title} ·{" "}
                    {e.row_number}
                  </td>
                  <td className="whitespace-nowrap p-2">
                    {legalDate(e.payment_date)}
                  </td>
                  {[e.taxable, e.withheld, e.legal_deductions].map((v, k) => (
                    <td className="whitespace-nowrap p-2" key={k}>
                      {formatIrMoney(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {parameters.map((p) => (
          <section className="space-y-1 rounded-lg bg-muted/30 p-3" key={p.id}>
            <p className="font-medium">
              {p.title} · versão {p.version_number}
            </p>
            <p>
              {legalDate(p.valid_from)} a {legalDate(p.valid_until)} ·{" "}
              {p.body.validity_note}
            </p>
            {p.body.brackets.map((b, i) => (
              <p key={i}>
                Faixa {i + 1}:{" "}
                {b.upper_bound === null
                  ? "sem limite"
                  : formatIrMoney(b.upper_bound)}{" "}
                · fração {b.rate} · dedução {formatIrMoney(b.deduction)}
              </p>
            ))}
          </section>
        ))}
        {version.adjustments.map((a) => (
          <section key={a.entry_id} className="rounded-lg bg-muted/30 p-3">
            <p>
              Ajuste da linha{" "}
              {entries.find((e) => e.id === a.entry_id)?.row_number ??
                "preservada"}
              : tributável {formatIrMoney(a.proposed_taxable)}
              {a.proposed_legal_deductions !== undefined
                ? ` · deduções ${formatIrMoney(a.proposed_legal_deductions)}`
                : ""}
            </p>
            <p className="whitespace-pre-wrap break-words">{a.reason}</p>
          </section>
        ))}
      </div>
    </details>
  );
}
export function IrCalculations(props: FinancialPanelProps) {
  const allowed =
    props.ir.can_medical &&
    props.ir.can_fiscal &&
    props.financial.can_calculate;
  const exportScope = [
    props.workspace.user_id,
    props.workspace.tenant_id,
    props.legalCase.id,
  ].join(":");
  const exportAccess = useRef({ scope: exportScope, allowed });
  useEffect(() => {
    exportAccess.current = { scope: exportScope, allowed };
    return () => {
      exportAccess.current = { scope: exportScope, allowed: false };
    };
  }, [exportScope, allowed]);
  const versions = useQuery({
    queryKey: financialKey(props, "calculations"),
    queryFn: () => listIrCalculationVersions(props.legalCase.id),
    enabled: allowed,
  });
  const imports = useQuery({
    queryKey: financialKey(props, "imports"),
    queryFn: () => listIrTaxImports(props.legalCase.id),
    enabled: allowed,
  });
  const entries = useQuery({
    queryKey: financialKey(props, "entries"),
    queryFn: () => listIrTaxEntries(props.legalCase.id),
    enabled: allowed,
  });
  const assessments = useQuery({
    queryKey: financialKey(props, "assessments"),
    queryFn: () => listIrAssessmentVersions(props.legalCase.id),
    enabled: allowed,
  });
  const periods = useQuery({
    queryKey: financialKey(props, "periods"),
    queryFn: () => listIrPeriodReviews(props.legalCase.id),
    enabled: allowed,
  });
  const parameters = useQuery({
    queryKey: financialWorkspaceKey(props, "parameters"),
    queryFn: listIrTaxParameterVersions,
    enabled: allowed,
  });
  const payers = useQuery({
    queryKey: financialKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
    enabled: allowed,
  });
  const [create, setCreate] = useState(false);
  const [previous, setPrevious] = useState<IrCalculationVersion>();
  const [review, setReview] = useState<IrCalculationVersion>();
  const action = useLegalAction();
  if (!allowed)
    return (
      <IrAccessNotice>
        Os cenários relacionam fundamentos jurídicos, saúde e dados fiscais. É
        necessário acesso às duas categorias.
      </IrAccessNotice>
    );
  const error =
    imports.error ??
    entries.error ??
    assessments.error ??
    periods.error ??
    parameters.error ??
    payers.error;
  return (
    <OperationPanel
      title="Cenários e memória de cálculo"
      description="Hipóteses revisáveis, com entradas imutáveis, cobertura declarada e recusas explícitas."
      actions={
        props.canEdit ? (
          <Button onClick={() => setCreate(true)} disabled={Boolean(error)}>
            Novo cenário
          </Button>
        ) : undefined
      }
    >
      {error ? <LegalError error={error} /> : null}
      <p className="text-sm text-muted-foreground">
        Diferença entre cenários é uma hipótese matemática. Crédito reconhecido
        vem de decisão comprovada; recebimento vem de comprovante conciliado. O
        IR retido informado não é somado à diferença como valor recuperável.
      </p>
      <OperationRecords
        pending={versions.isPending}
        error={versions.error}
        retry={() => void versions.refetch()}
        count={versions.data?.length ?? 0}
        empty="Nenhum cenário de cálculo registrado"
      >
        {versions.data?.map((v) => {
          const current =
            props.financial.calculation_states.find((s) => s.id === v.id)
              ?.is_current === true;
          return (
            <article className="space-y-4 rounded-lg border p-4" key={v.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-medium">
                    Cenário {v.version_number} ·{" "}
                    {v.periodicity === "monthly"
                      ? `${String(v.month).padStart(2, "0")}/`
                      : ""}
                    {v.calendar_year}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {PERIODICITY[v.periodicity]} ·{" "}
                    {DEDUCTION_MODES[v.deduction_mode]} ·{" "}
                    {TAX_RESIDENCY[v.tax_residency]}
                  </p>
                </div>
                <Badge variant="outline">{CALCULATION_STATUS[v.status]}</Badge>
              </div>
              {!current ? (
                <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  Os dados ou parâmetros mudaram desde esta memória. Preserve o
                  histórico e crie uma nova versão para continuar.
                </p>
              ) : null}
              {v.refusals.length ? (
                <div className="space-y-2 rounded-lg border border-amber-300 p-3">
                  <h5 className="font-medium">O cálculo não produziu totais</h5>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {v.refusals.map((r, i) => (
                      <li key={`${r.code}-${i}`}>{r.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Imposto no cenário documentado", v.result.baseline_tax],
                      ["Imposto na hipótese proposta", v.result.proposed_tax],
                      [
                        "Diferença hipotética entre cenários",
                        v.result.hypothesis_difference,
                      ],
                      [
                        "Retenção informada nos documentos",
                        v.result.withheld_reported,
                      ],
                    ].map(([l, a]) => (
                      <div className="rounded-lg bg-muted/30 p-3" key={l}>
                        <dt className="text-xs text-muted-foreground">{l}</dt>
                        <dd className="break-all font-mono text-lg">
                          {formatIrMoney(a)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm">
                    Crédito reconhecido: não determinado por este cálculo.
                    Recebimento: não determinado por este cálculo.
                  </p>
                  {v.result.groups.map((g, i) => (
                    <details className="rounded-lg border p-3" key={i}>
                      <summary className="cursor-pointer break-words text-sm font-medium">
                        {payerName(payers.data ?? [], g.payer_id)} · {g.period}{" "}
                        · {g.entry_ids.length} linhas
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <ComputationDetails
                          value={g.baseline}
                          title="Cenário documentado"
                        />
                        <ComputationDetails
                          value={g.proposed}
                          title="Hipótese proposta"
                        />
                      </div>
                    </details>
                  ))}
                </>
              )}
              <p className="text-sm text-muted-foreground">
                {v.result.monetary_update.reason}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                Abrangência declarada: {v.completeness_note || "Não informada"}
              </p>
              {v.review_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Revisão: {v.review_note}
                </p>
              ) : null}
              <SnapshotDetails version={v} />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.pending}
                  onClick={() =>
                    void action.run(async () => {
                      const report = await readIrCalculationReport(v.id);
                      if (
                        !exportAccess.current.allowed ||
                        exportAccess.current.scope !== exportScope
                      )
                        throw new Error(
                          "Seu acesso à memória mudou durante a consulta. O download foi interrompido.",
                        );
                      downloadIrCalculationReport(
                        report,
                        props.legalCase.title,
                      );
                    }, "Memória autorizada e preparada para download")
                  }
                >
                  Baixar memória
                </Button>
                {props.canEdit ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrevious(v);
                      setCreate(true);
                    }}
                  >
                    Criar nova versão do cenário
                  </Button>
                ) : null}
                {props.canEdit && current && v.status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(
                        () => submitIrCalculationReview(v.id),
                        "Cenário enviado para revisão",
                      )
                    }
                  >
                    Submeter cenário à revisão
                  </Button>
                ) : null}
                {financialOwner(props) &&
                current &&
                v.status === "in_review" ? (
                  <Button size="sm" onClick={() => setReview(v)}>
                    Revisar cenário
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </OperationRecords>
      {create && props.canEdit ? (
        <CalculationDialog
          props={props}
          assessments={assessments.data ?? []}
          imports={imports.data ?? []}
          entries={entries.data ?? []}
          parameters={parameters.data ?? []}
          periods={periods.data ?? []}
          previous={previous}
          onClose={() => {
            setCreate(false);
            setPrevious(undefined);
          }}
        />
      ) : null}
      {review &&
      financialOwner(props) &&
      props.financial.calculation_states.find((s) => s.id === review.id)
        ?.is_current ? (
        <CalculationReviewDialog
          version={review}
          onClose={() => setReview(undefined)}
        />
      ) : null}
    </OperationPanel>
  );
}
