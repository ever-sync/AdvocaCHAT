import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  listIrIncomeSources,
  listIrPayers,
  saveIrIncomeSource,
  saveIrPayer,
} from "@/lib/api/legal-ir";
import type {
  IrIncomePayload,
  IrIncomeSource,
  IrPayer,
  IrPayerPayload,
} from "@/types/legal-ir";
import { LegalField } from "../LegalShared";
import { legalDate, selectClassName, useLegalAction } from "../legal-ui";
import { OperationPanel, OperationRecords } from "../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "./IrShared";
import {
  INCOME_KINDS,
  PAYER_TYPES,
  REGIMES,
  WITHHOLDING,
  PRODUCT_TYPES,
  PENSION_KINDS,
  INCOME_EVENTS,
  irKey,
  type IrPanelProps,
} from "./ir-ui";

function PayerDialog({
  props,
  payer,
  onClose,
}: {
  props: IrPanelProps;
  payer?: IrPayer;
  onClose: () => void;
}) {
  const [form, setForm] = useState<IrPayerPayload>({
    name: payer?.name ?? "",
    payer_type: payer?.payer_type ?? "inss",
    registry_number: payer?.registry_number ?? "",
    notes: payer?.notes ?? "",
  });
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () =>
          saveIrPayer(
            props.legalCase.id,
            { ...form, name: form.name.trim() },
            payer?.id,
          ),
        "Fonte pagadora registrada",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title={payer ? "Editar fonte pagadora" : "Nova fonte pagadora"}
      description="Dados fiscais deste caso. Cada pagador mantém seus próprios rendimentos e documentos."
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <LegalField label="Nome da fonte pagadora">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={200}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          )}
        </LegalField>
        <LegalField label="Tipo da fonte">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.payer_type}
              onChange={(event) =>
                setForm({
                  ...form,
                  payer_type: event.target
                    .value as IrPayerPayload["payer_type"],
                })
              }
            >
              {Object.entries(PAYER_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField
          label="CNPJ ou identificação da fonte"
          hint="Copie a identificação do documento, se disponível."
        >
          {(id) => (
            <Input
              id={id}
              maxLength={40}
              value={form.registry_number}
              onChange={(event) =>
                setForm({ ...form, registry_number: event.target.value })
              }
            />
          )}
        </LegalField>
        <LegalField
          label="Observações fiscais da fonte"
          hint="Dados de saúde devem permanecer no dossiê médico."
        >
          {(id) => (
            <Textarea
              id={id}
              maxLength={2000}
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || !form.name.trim()}>
            Salvar fonte pagadora
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

function IncomeDialog({
  props,
  income,
  payers,
  onClose,
}: {
  props: IrPanelProps;
  income?: IrIncomeSource;
  payers: IrPayer[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<IrIncomePayload>({
    payer_id: income?.payer_id ?? "",
    income_kind: income?.income_kind ?? "retirement",
    regime: income?.regime ?? "unknown",
    product_type: income?.product_type ?? "unknown",
    pension_kind: income?.pension_kind ?? "unknown",
    income_event: income?.income_event ?? "unknown",
    benefit_number: income?.benefit_number ?? "",
    benefit_start_date: income?.benefit_start_date ?? null,
    withholding_reported: income?.withholding_reported ?? "unknown",
    notes: income?.notes ?? "",
  });
  const action = useLegalAction();
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      await action.run(
        () => saveIrIncomeSource(props.legalCase.id, form, income?.id),
        "Rendimento registrado para análise individual",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title={income ? "Editar rendimento" : "Novo rendimento ou benefício"}
      description="A classificação organiza o fato informado. Ela não atribui isenção ou valores recuperáveis."
      onClose={onClose}
      pending={action.pending}
    >
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <LegalField label="Fonte pagadora do rendimento">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              required
              value={form.payer_id}
              onChange={(event) =>
                setForm({ ...form, payer_id: event.target.value })
              }
            >
              <option value="">Selecione a fonte</option>
              {payers.map((payer) => (
                <option key={payer.id} value={payer.id}>
                  {payer.name}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField
          label="Natureza do rendimento"
          hint="Identifique a natureza e detalhe o tipo de pensão ou produto nos campos próprios."
        >
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.income_kind}
              onChange={(event) =>
                setForm({
                  ...form,
                  income_kind: event.target
                    .value as IrIncomePayload["income_kind"],
                })
              }
            >
              {Object.entries(INCOME_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField label="Regime informado">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.regime}
              onChange={(event) =>
                setForm({
                  ...form,
                  regime: event.target.value as IrIncomePayload["regime"],
                })
              }
            >
              {Object.entries(REGIMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <div className="grid gap-3 sm:grid-cols-3">
          <LegalField label="Produto de previdência">
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                value={form.product_type}
                onChange={(event) =>
                  setForm({
                    ...form,
                    product_type: event.target
                      .value as IrIncomePayload["product_type"],
                  })
                }
              >
                {Object.entries(PRODUCT_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </LegalField>
          <LegalField label="Tipo de pensão">
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                value={form.pension_kind}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pension_kind: event.target
                      .value as IrIncomePayload["pension_kind"],
                  })
                }
              >
                {Object.entries(PENSION_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </LegalField>
          <LegalField label="Periodicidade / evento">
            {(id) => (
              <select
                id={id}
                className={selectClassName}
                value={form.income_event}
                onChange={(event) =>
                  setForm({
                    ...form,
                    income_event: event.target
                      .value as IrIncomePayload["income_event"],
                  })
                }
              >
                {Object.entries(INCOME_EVENTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </LegalField>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <LegalField label="Número do benefício">
            {(id) => (
              <Input
                id={id}
                maxLength={100}
                value={form.benefit_number}
                onChange={(event) =>
                  setForm({ ...form, benefit_number: event.target.value })
                }
              />
            )}
          </LegalField>
          <LegalField
            label="Início do benefício"
            hint="Deixe vazio quando desconhecido."
          >
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.benefit_start_date ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    benefit_start_date: event.target.value || null,
                  })
                }
              />
            )}
          </LegalField>
        </div>
        <LegalField label="Retenção de IR informada">
          {(id) => (
            <select
              id={id}
              className={selectClassName}
              value={form.withholding_reported}
              onChange={(event) =>
                setForm({
                  ...form,
                  withholding_reported: event.target
                    .value as IrIncomePayload["withholding_reported"],
                })
              }
            >
              {Object.entries(WITHHOLDING).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </LegalField>
        <LegalField
          label="Descrição e particularidades do rendimento"
          hint="Identifique produto, evento, periodicidade e o que ainda precisa ser confirmado. Use apenas dados fiscais."
        >
          {(id) => (
            <Textarea
              id={id}
              maxLength={2000}
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || !form.payer_id}>
            Salvar rendimento
          </Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}

export function IrIncome(props: IrPanelProps) {
  const payers = useQuery({
    queryKey: irKey(props, "payers"),
    queryFn: () => listIrPayers(props.legalCase.id),
    enabled: props.ir.can_fiscal,
  });
  const incomes = useQuery({
    queryKey: irKey(props, "incomes"),
    queryFn: () => listIrIncomeSources(props.legalCase.id),
    enabled: props.ir.can_fiscal,
  });
  const [payerForm, setPayerForm] = useState<IrPayer | "new" | null>(null);
  const [incomeForm, setIncomeForm] = useState<IrIncomeSource | "new" | null>(
    null,
  );
  if (!props.ir.can_fiscal)
    return (
      <IrAccessNotice>
        Seu acesso não inclui os dados fiscais deste caso. O responsável pode
        revisar suas permissões na aba Equipe.
      </IrAccessNotice>
    );
  return (
    <div className="space-y-4">
      <OperationPanel
        title="Fontes pagadoras"
        description="Cadastre separadamente cada pagador identificado nos documentos."
        actions={
          props.canEdit ? (
            <Button size="sm" onClick={() => setPayerForm("new")}>
              Nova fonte pagadora
            </Button>
          ) : null
        }
      >
        <OperationRecords
          pending={payers.isPending}
          error={payers.error}
          retry={() => void payers.refetch()}
          empty="Nenhuma fonte pagadora cadastrada"
          count={payers.data?.length ?? 0}
        >
          {payers.data?.map((payer) => (
            <div key={payer.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-medium">{payer.name}</p>
                <Badge variant="outline">{PAYER_TYPES[payer.payer_type]}</Badge>
              </div>
              {payer.registry_number ? (
                <p className="break-words text-sm">
                  Identificação: {payer.registry_number}
                </p>
              ) : null}
              {payer.notes ? (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {payer.notes}
                </p>
              ) : null}
              {props.canEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPayerForm(payer)}
                >
                  Editar fonte<span className="sr-only"> {payer.name}</span>
                </Button>
              ) : null}
            </div>
          ))}
        </OperationRecords>
      </OperationPanel>
      <OperationPanel
        title="Rendimentos e benefícios"
        description="Salário, aluguel, aposentadoria e outros rendimentos permanecem em registros próprios. A análise de um não altera os demais."
        actions={
          props.canEdit ? (
            <Button
              size="sm"
              disabled={!payers.data?.length}
              onClick={() => setIncomeForm("new")}
            >
              Novo rendimento
            </Button>
          ) : null
        }
      >
        <OperationRecords
          pending={incomes.isPending}
          error={incomes.error}
          retry={() => void incomes.refetch()}
          empty="Cadastre uma fonte pagadora e os rendimentos que serão examinados"
          count={incomes.data?.length ?? 0}
        >
          {incomes.data?.map((income) => (
            <div key={income.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {INCOME_KINDS[income.income_kind]}
                </p>
                <Badge variant="outline">
                  {WITHHOLDING[income.withholding_reported]}
                </Badge>
              </div>
              <p className="break-words text-sm">
                {payers.data?.find((payer) => payer.id === income.payer_id)
                  ?.name ?? "Fonte do caso"}{" "}
                · {REGIMES[income.regime]}
              </p>
              <p className="text-xs text-muted-foreground">
                Produto: {PRODUCT_TYPES[income.product_type]} · Pensão:{" "}
                {PENSION_KINDS[income.pension_kind]} · Evento:{" "}
                {INCOME_EVENTS[income.income_event]}
              </p>
              <p className="text-xs text-muted-foreground">
                {income.benefit_number
                  ? `Benefício ${income.benefit_number} · `
                  : ""}
                Início:{" "}
                {income.benefit_start_date
                  ? legalDate(`${income.benefit_start_date}T12:00:00`)
                  : "Desconhecido"}
              </p>
              {income.notes ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {income.notes}
                </p>
              ) : null}
              {props.canEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIncomeForm(income)}
                >
                  Editar rendimento
                  <span className="sr-only">
                    {" "}
                    {INCOME_KINDS[income.income_kind]}
                  </span>
                </Button>
              ) : null}
            </div>
          ))}
        </OperationRecords>
      </OperationPanel>
      {payerForm ? (
        <PayerDialog
          props={props}
          payer={payerForm === "new" ? undefined : payerForm}
          onClose={() => setPayerForm(null)}
        />
      ) : null}
      {incomeForm ? (
        <IncomeDialog
          props={props}
          income={incomeForm === "new" ? undefined : incomeForm}
          payers={payers.data ?? []}
          onClose={() => setIncomeForm(null)}
        />
      ) : null}
    </div>
  );
}
