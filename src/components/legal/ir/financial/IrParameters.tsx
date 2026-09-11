import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DialogFooter } from "@/components/ui/dialog";
import {
  createIrTaxParameterVersion,
  listIrParameterValidations,
  listIrTaxParameterVersions,
  recordIrParameterValidation,
  reviewIrTaxParameterVersion,
} from "@/lib/api/legal-ir-calculations";
import type {
  IrDeductionMode,
  IrTaxParameterBody,
  IrTaxParameterVersion,
  IrTaxPeriodicity,
} from "@/types/legal-ir-calculations";
import { LegalField, LegalError } from "../../LegalShared";
import { legalDate, useLegalAction } from "../../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../../operations/OperationPanel";
import { IrDialog } from "../IrShared";
import { safeReferenceUrl } from "../ir-ui";
import {
  coefficient,
  DEDUCTION_MODES,
  financialWorkspaceKey,
  formatIrMoney,
  moneyInput,
  PERIODICITY,
  requiredMoney,
  type FinancialPanelProps,
} from "./financial-ui";
import {
  ComputationDetails,
  FinancialSelect,
  MoneyField,
} from "./FinancialShared";

function ParameterDialog({
  previous,
  onClose,
}: {
  previous?: IrTaxParameterVersion;
  onClose: () => void;
}) {
  const action = useLegalAction();
  const old = previous?.body;
  const [key, setKey] = useState(previous?.parameter_key ?? "");
  const [title, setTitle] = useState(previous?.title ?? "");
  const [periodicity, setPeriodicity] = useState<IrTaxPeriodicity>(
    previous?.periodicity ?? "monthly",
  );
  const [from, setFrom] = useState(previous?.valid_from ?? "");
  const [until, setUntil] = useState(previous?.valid_until ?? "");
  const [year, setYear] = useState(
    previous ? String(previous.calendar_year) : "",
  );
  const [exercise, setExercise] = useState(
    previous ? String(previous.exercise) : "",
  );
  const [validity, setValidity] = useState(old?.validity_note ?? "");
  const [brackets, setBrackets] = useState(
    () =>
      old?.brackets.map((b) => ({
        upper: moneyInput(b.upper_bound),
        rate: b.rate.replace(".", ","),
        deduction: moneyInput(b.deduction),
      })) ?? [{ upper: "", rate: "", deduction: "" }],
  );
  const [simplified, setSimplified] = useState({
    fixed: moneyInput(old?.simplified.fixed),
    percent: old?.simplified.percent.replace(".", ",") ?? "",
    cap: moneyInput(old?.simplified.cap),
  });
  const [reduction, setReduction] = useState({
    enabled: old?.reduction.enabled ?? false,
    zero_until: moneyInput(old?.reduction.zero_until),
    phaseout_until: moneyInput(old?.reduction.phaseout_until),
    full_cap: moneyInput(old?.reduction.full_cap),
    intercept: moneyInput(old?.reduction.intercept),
    slope: old?.reduction.slope.replace(".", ",") ?? "",
    boundary: old?.reduction.boundary ?? "formula",
  });
  const [rounding, setRounding] = useState<IrTaxParameterBody["rounding"]>(
    old?.rounding ?? {
      mode: "half_up",
      scale: 2,
      tax_stage: "before_reduction",
      reduction_stage: "round",
    },
  );
  const [sources, setSources] = useState(
    old?.sources ?? [{ url: "", checked_on: "", version_note: "" }],
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(async () => {
        const body: IrTaxParameterBody = {
          jurisdiction: "BR",
          coverage: "ordinary_resident",
          brackets: brackets.map((b, i) => ({
            upper_bound:
              i === brackets.length - 1
                ? null
                : requiredMoney(b.upper, `Limite da faixa ${i + 1}`),
            rate: coefficient(b.rate, `Alíquota da faixa ${i + 1}`),
            deduction: requiredMoney(b.deduction, `Parcela da faixa ${i + 1}`),
          })),
          simplified: {
            fixed: requiredMoney(simplified.fixed),
            percent: coefficient(simplified.percent),
            cap: requiredMoney(simplified.cap),
          },
          reduction: reduction.enabled
            ? {
                ...reduction,
                zero_until: requiredMoney(reduction.zero_until),
                phaseout_until: requiredMoney(reduction.phaseout_until),
                full_cap: requiredMoney(reduction.full_cap),
                intercept: requiredMoney(reduction.intercept),
                slope: coefficient(reduction.slope),
              }
            : {
                enabled: false,
                zero_until: "0.00",
                phaseout_until: "0.00",
                full_cap: "0.00",
                intercept: "0.00",
                slope: "0",
                boundary: reduction.boundary,
              },
          rounding,
          validity_note: validity.trim(),
          sources: sources.map((s) => ({
            url: s.url.trim(),
            checked_on: s.checked_on,
            ...(s.version_note?.trim()
              ? { version_note: s.version_note.trim() }
              : {}),
          })),
        };
        await createIrTaxParameterVersion({
          parameter_key: key.trim(),
          title: title.trim(),
          periodicity,
          valid_from: from,
          valid_until: until,
          calendar_year: Number(year),
          exercise: Number(exercise),
          body,
        });
      }, "Versão de parâmetros criada para validação")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title={
        previous
          ? "Nova versão dos parâmetros"
          : "Definir parâmetros tributários"
      }
      description="Transcreva uma fonte oficial. A versão nasce sem aprovação e exige exemplos conferidos de forma independente."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-5" onSubmit={(e) => void save(e)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <LegalField
            label="Identificador da série"
            hint="Use a mesma identificação para versões da mesma tabela."
          >
            {(id) => (
              <Input
                id={id}
                required
                maxLength={100}
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Título legível">
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
            label="Periodicidade"
            value={periodicity}
            onChange={(v) => setPeriodicity(v as IrTaxPeriodicity)}
          >
            {Object.entries(PERIODICITY).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </FinancialSelect>
          <LegalField label="Ano-calendário">
            {(id) => (
              <Input
                id={id}
                required
                type="number"
                min={1900}
                max={2200}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Exercício">
            {(id) => (
              <Input
                id={id}
                required
                type="number"
                min={1901}
                max={2201}
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Início de vigência">
            {(id) => (
              <Input
                id={id}
                required
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Fim de vigência">
            {(id) => (
              <Input
                id={id}
                required
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            )}
          </LegalField>
        </div>
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">Faixas de tributação</legend>
          <p className="text-xs text-muted-foreground">
            Limites crescentes. A última faixa não tem limite superior. Informe
            alíquotas como fração: 0,275 representa 27,5%.
          </p>
          {brackets.map((b, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/30 p-3">
              <p className="text-sm font-medium">
                Faixa {i + 1}
                {i === brackets.length - 1 ? " · sem limite superior" : ""}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {i < brackets.length - 1 ? (
                  <MoneyField
                    required
                    label={`Limite superior da faixa ${i + 1}`}
                    value={b.upper}
                    onChange={(v) =>
                      setBrackets(
                        brackets.map((r, k) =>
                          k === i ? { ...r, upper: v } : r,
                        ),
                      )
                    }
                  />
                ) : (
                  <p className="self-center text-sm text-muted-foreground">
                    Abrange valores acima da faixa anterior.
                  </p>
                )}
                <LegalField label={`Alíquota da faixa ${i + 1} (fração)`}>
                  {(id) => (
                    <Input
                      id={id}
                      required
                      inputMode="decimal"
                      value={b.rate}
                      onChange={(e) =>
                        setBrackets(
                          brackets.map((r, k) =>
                            k === i ? { ...r, rate: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  )}
                </LegalField>
                <MoneyField
                  required
                  label={`Parcela a deduzir da faixa ${i + 1}`}
                  value={b.deduction}
                  onChange={(v) =>
                    setBrackets(
                      brackets.map((r, k) =>
                        k === i ? { ...r, deduction: v } : r,
                      ),
                    )
                  }
                />
              </div>
              {brackets.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setBrackets(brackets.filter((_, k) => k !== i))
                  }
                >
                  Remover faixa {i + 1}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={brackets.length >= 20}
            onClick={() =>
              setBrackets([...brackets, { upper: "", rate: "", deduction: "" }])
            }
          >
            Adicionar faixa
          </Button>
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">Desconto simplificado</legend>
          <p className="text-xs text-muted-foreground">
            Parcela fixa + percentual do rendimento, limitado ao teto. Informe
            zero explicitamente nos componentes que a norma não prevê.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyField
              required
              label="Parcela fixa do desconto"
              value={simplified.fixed}
              onChange={(v) => setSimplified({ ...simplified, fixed: v })}
            />
            <LegalField label="Percentual do desconto (fração)">
              {(id) => (
                <Input
                  id={id}
                  required
                  inputMode="decimal"
                  value={simplified.percent}
                  onChange={(e) =>
                    setSimplified({ ...simplified, percent: e.target.value })
                  }
                />
              )}
            </LegalField>
            <MoneyField
              required
              label="Teto do desconto"
              value={simplified.cap}
              onChange={(v) => setSimplified({ ...simplified, cap: v })}
            />
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">Redução do imposto</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reduction.enabled}
              onChange={(e) =>
                setReduction({ ...reduction, enabled: e.target.checked })
              }
            />
            A norma prevê redução adicional nesta versão
          </label>
          {reduction.enabled ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["zero_until", "Rendimento até o qual há redução integral"],
                    ["phaseout_until", "Limite final da redução"],
                    ["full_cap", "Teto da redução integral"],
                    ["intercept", "Constante da fórmula"],
                  ] as const
                ).map(([k, l]) => (
                  <MoneyField
                    key={k}
                    required
                    label={l}
                    value={reduction[k]}
                    onChange={(v) => setReduction({ ...reduction, [k]: v })}
                  />
                ))}
                <LegalField label="Coeficiente de redução (fração)">
                  {(id) => (
                    <Input
                      id={id}
                      required
                      inputMode="decimal"
                      value={reduction.slope}
                      onChange={(e) =>
                        setReduction({ ...reduction, slope: e.target.value })
                      }
                    />
                  )}
                </LegalField>
              </div>
              <FinancialSelect
                label="Tratamento exato do limite superior"
                value={reduction.boundary}
                onChange={(v) =>
                  setReduction({
                    ...reduction,
                    boundary: v as typeof reduction.boundary,
                  })
                }
              >
                <option value="formula">Aplicar a fórmula no limite</option>
                <option value="zero_at_upper">
                  Redução zero ao atingir o limite
                </option>
              </FinancialSelect>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Esta versão será registrada sem redução adicional.
            </p>
          )}
        </fieldset>
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">Arredondamento</legend>
          <p className="text-xs text-muted-foreground">
            Decimal, 2 casas, metade para cima. Registre na fundamentação se
            esta política coincide com a fonte.
          </p>
          <FinancialSelect
            label="Momento do arredondamento do imposto"
            value={rounding.tax_stage}
            onChange={(v) =>
              setRounding({
                ...rounding,
                tax_stage: v as typeof rounding.tax_stage,
              })
            }
          >
            <option value="before_reduction">Antes de aplicar a redução</option>
            <option value="final_only">Somente no imposto final</option>
          </FinancialSelect>
          <FinancialSelect
            label="Arredondamento da redução"
            value={rounding.reduction_stage}
            onChange={(v) =>
              setRounding({
                ...rounding,
                reduction_stage: v as typeof rounding.reduction_stage,
              })
            }
          >
            <option value="round">Arredondar a redução</option>
            <option value="exact">Manter exata até o imposto final</option>
          </FinancialSelect>
        </fieldset>
        <LegalField label="Vigência, alcance da norma e ressalvas">
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={validity}
              onChange={(e) => setValidity(e.target.value)}
            />
          )}
        </LegalField>
        <fieldset className="space-y-3 rounded-lg border p-3">
          <legend className="px-1 font-medium">
            Fontes oficiais consultadas
          </legend>
          {sources.map((s, i) => (
            <div className="space-y-3 rounded-lg bg-muted/30 p-3" key={i}>
              <LegalField label={`Link oficial ${i + 1}`}>
                {(id) => (
                  <Input
                    id={id}
                    type="url"
                    required
                    maxLength={2000}
                    value={s.url}
                    onChange={(e) =>
                      setSources(
                        sources.map((r, k) =>
                          k === i ? { ...r, url: e.target.value } : r,
                        ),
                      )
                    }
                  />
                )}
              </LegalField>
              <LegalField label={`Data de consulta ${i + 1}`}>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    required
                    value={s.checked_on}
                    onChange={(e) =>
                      setSources(
                        sources.map((r, k) =>
                          k === i ? { ...r, checked_on: e.target.value } : r,
                        ),
                      )
                    }
                  />
                )}
              </LegalField>
              <LegalField label={`Versão e observações da fonte ${i + 1}`}>
                {(id) => (
                  <Input
                    id={id}
                    maxLength={1000}
                    value={s.version_note ?? ""}
                    onChange={(e) =>
                      setSources(
                        sources.map((r, k) =>
                          k === i ? { ...r, version_note: e.target.value } : r,
                        ),
                      )
                    }
                  />
                )}
              </LegalField>
              {sources.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSources(sources.filter((_, k) => k !== i))}
                >
                  Remover fonte {i + 1}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            variant="outline"
            type="button"
            disabled={sources.length >= 20}
            onClick={() =>
              setSources([
                ...sources,
                { url: "", checked_on: "", version_note: "" },
              ])
            }
          >
            Adicionar fonte oficial
          </Button>
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Salvar versão para validar</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function ValidationDialog({
  version,
  onClose,
}: {
  version: IrTaxParameterVersion;
  onClose: () => void;
}) {
  const action = useLegalAction();
  const [taxable, setTaxable] = useState("");
  const [deductions, setDeductions] = useState("");
  const [expected, setExpected] = useState("");
  const [mode, setMode] = useState<IrDeductionMode>("legal");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(async () => {
        await recordIrParameterValidation(version.id, {
          taxable: requiredMoney(taxable),
          legal_deductions: requiredMoney(deductions),
          expected_tax: requiredMoney(expected),
          deduction_mode: mode,
          expected_source: source.trim(),
          review_note: note.trim(),
        });
      }, "Comparação independente registrada")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title="Conferir exemplo independente"
      description="Informe o resultado obtido fora deste motor e sua fonte. Uma divergência exige corrigir os parâmetros em nova versão."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <p className="text-sm font-medium">
          {version.title} · versão {version.version_number}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            required
            label="Rendimento tributável do exemplo"
            value={taxable}
            onChange={setTaxable}
          />
          <MoneyField
            required
            label="Deduções legais do exemplo"
            value={deductions}
            onChange={setDeductions}
          />
          <MoneyField
            required
            label="Imposto esperado, apurado independentemente"
            value={expected}
            onChange={setExpected}
          />
        </div>
        <FinancialSelect
          label="Modalidade de dedução do exemplo"
          value={mode}
          onChange={(v) => setMode(v as IrDeductionMode)}
        >
          {Object.entries(DEDUCTION_MODES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FinancialSelect>
        <LegalField label="Fonte do resultado esperado">
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          )}
        </LegalField>
        <LegalField label="Conferência realizada e limitações">
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
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Comparar e registrar</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
export function IrParameters(props: FinancialPanelProps) {
  const versions = useQuery({
    queryKey: financialWorkspaceKey(props, "parameters"),
    queryFn: listIrTaxParameterVersions,
  });
  const validations = useQuery({
    queryKey: financialWorkspaceKey(props, "validations"),
    queryFn: listIrParameterValidations,
  });
  const [create, setCreate] = useState(false);
  const [previous, setPrevious] = useState<IrTaxParameterVersion>();
  const [validate, setValidate] = useState<IrTaxParameterVersion>();
  const [review, setReview] = useState<{
    row: IrTaxParameterVersion;
    decision: "approved" | "rejected";
  }>();
  const action = useLegalAction();
  return (
    <OperationPanel
      title="Parâmetros e validação"
      description="Tabelas transcritas pelo escritório, com vigência e revisão de exemplos independentes. Nenhuma tabela nasce aprovada."
      actions={
        props.workspace.can_create ? (
          <Button onClick={() => setCreate(true)}>Novos parâmetros</Button>
        ) : undefined
      }
    >
      <p className="text-sm text-muted-foreground">
        A cobertura deste motor é o IR ordinário de residente fiscal no Brasil.
        Conferir exemplos e aprovar parâmetros registra uma revisão interna; a
        homologação profissional do produto continua sendo uma etapa distinta.
      </p>
      {validations.error ? <LegalError error={validations.error} /> : null}
      <OperationRecords
        pending={versions.isPending || validations.isPending}
        error={versions.error}
        retry={() => void versions.refetch()}
        count={versions.data?.length ?? 0}
        empty="Nenhuma versão de parâmetros cadastrada"
      >
        {versions.data?.map((v) => {
          const tests = (validations.data ?? []).filter(
            (t) => t.parameter_version_id === v.id,
          );
          const matched =
            tests.some((t) => t.matches_expected) &&
            tests.every((t) => t.matches_expected);
          return (
            <article key={v.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h4 className="min-w-0 break-words font-medium">
                  {v.title} · versão {v.version_number}
                </h4>
                <Badge variant="outline">
                  {v.status === "approved"
                    ? "Aprovada pelo escritório"
                    : v.status === "rejected"
                      ? "Rejeitada"
                      : "Em validação"}
                </Badge>
              </div>
              <p className="text-sm">
                {PERIODICITY[v.periodicity]} · Ano {v.calendar_year}, exercício{" "}
                {v.exercise} · Vigência {legalDate(v.valid_from)} a{" "}
                {legalDate(v.valid_until)}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {v.body.validity_note}
              </p>
              <details className="rounded-lg bg-muted/20 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Tabela e critérios preservados
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {v.body.brackets.map((b, i) => (
                    <p key={i}>
                      Faixa {i + 1}:{" "}
                      {b.upper_bound === null
                        ? "sem limite superior"
                        : `até ${formatIrMoney(b.upper_bound)}`}{" "}
                      · alíquota {b.rate} (fração) · dedução{" "}
                      {formatIrMoney(b.deduction)}
                    </p>
                  ))}
                  <p>
                    Desconto simplificado: fixo{" "}
                    {formatIrMoney(v.body.simplified.fixed)} + fração{" "}
                    {v.body.simplified.percent}, teto{" "}
                    {formatIrMoney(v.body.simplified.cap)}.
                  </p>
                  <p>
                    Redução adicional:{" "}
                    {v.body.reduction.enabled
                      ? `integral até ${formatIrMoney(v.body.reduction.zero_until)}; limite ${formatIrMoney(v.body.reduction.phaseout_until)}, teto ${formatIrMoney(v.body.reduction.full_cap)}; fórmula ${v.body.reduction.intercept} − ${v.body.reduction.slope} × rendimento; limite ${v.body.reduction.boundary === "formula" ? "pela fórmula" : "zero ao atingir o limite"}.`
                      : "não prevista nesta versão"}
                  </p>
                  <p>
                    Arredondamento: metade para cima, duas casas; imposto{" "}
                    {v.body.rounding.tax_stage === "before_reduction"
                      ? "antes da redução"
                      : "somente ao final"}
                    ; redução{" "}
                    {v.body.rounding.reduction_stage === "round"
                      ? "arredondada"
                      : "exata"}
                    .
                  </p>
                  {v.body.sources.map((s, i) => (
                    <p key={i} className="break-words">
                      {safeReferenceUrl(s.url) ? (
                        <a
                          className="underline"
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Fonte oficial {i + 1}
                        </a>
                      ) : (
                        "Link inválido"
                      )}{" "}
                      · Consultada {legalDate(s.checked_on)}{" "}
                      {s.version_note ? `· ${s.version_note}` : ""}
                    </p>
                  ))}
                </div>
              </details>
              <div className="space-y-2">
                {tests.map((t) => (
                  <details key={t.id} className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t.matches_expected
                        ? "Exemplo conferido"
                        : "Divergência identificada"}{" "}
                      · Esperado {formatIrMoney(t.expected_tax)} · Obtido{" "}
                      {formatIrMoney(t.result.tax_due)}
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="whitespace-pre-wrap break-words text-sm">
                        Fonte independente: {t.expected_source}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {t.review_note}
                      </p>
                      <ComputationDetails
                        title="Memória do exemplo"
                        value={t.result}
                      />
                    </div>
                  </details>
                ))}
              </div>
              {v.review_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Decisão: {v.review_note}
                </p>
              ) : null}
              {v.status === "draft" && !matched ? (
                <p className="text-sm text-amber-800">
                  Aprovação pendente: registre pelo menos um exemplo
                  independente coincidente e resolva divergências em nova
                  versão.
                </p>
              ) : null}
              {props.workspace.can_create ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPrevious(v);
                      setCreate(true);
                    }}
                  >
                    Criar nova versão
                  </Button>
                  {v.status === "draft" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setValidate(v)}
                      >
                        Conferir exemplo
                      </Button>
                      <Button
                        size="sm"
                        disabled={!matched || Boolean(validations.error)}
                        onClick={() =>
                          setReview({ row: v, decision: "approved" })
                        }
                      >
                        Aprovar parâmetros
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setReview({ row: v, decision: "rejected" })
                        }
                      >
                        Rejeitar versão
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </OperationRecords>
      {create && props.workspace.can_create ? (
        <ParameterDialog
          previous={previous}
          onClose={() => {
            setCreate(false);
            setPrevious(undefined);
          }}
        />
      ) : null}
      {validate && props.workspace.can_create ? (
        <ValidationDialog
          version={validate}
          onClose={() => setValidate(undefined)}
        />
      ) : null}
      {review && props.workspace.can_create ? (
        <OperationReasonDialog
          open
          title={
            review.decision === "approved"
              ? "Aprovar versão dos parâmetros"
              : "Rejeitar versão dos parâmetros"
          }
          description="Registre a revisão profissional da fonte, vigência, arredondamento e exemplos. O histórico será preservado."
          pending={action.pending}
          onClose={() => setReview(undefined)}
          onSave={(note) =>
            action.run(
              () =>
                reviewIrTaxParameterVersion(
                  review.row.id,
                  review.decision,
                  note,
                ),
              "Revisão dos parâmetros registrada",
            )
          }
        />
      ) : null}
    </OperationPanel>
  );
}
