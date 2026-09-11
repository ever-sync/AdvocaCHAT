import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  listLegalDocuments,
  listLegalParties,
  downloadLegalDocument,
} from "@/lib/api/legal";
import { listIrIncomeSources, listIrPayers } from "@/lib/api/legal-ir";
import {
  allocateIrPrincipal,
  createIrPaymentPrincipal,
  listIrClaims,
  listIrPaymentPrincipals,
  listIrPrincipalAllocations,
  listIrRecoveries,
  recordIrRecovery,
  releaseIrAllocation,
  verifyIrPaymentPrincipal,
} from "@/lib/api/legal-ir-calculations";
import type { LegalCaseDocument } from "@/types/legal";
import type { IrIncomeSource, IrPayer } from "@/types/legal-ir";
import type {
  IrClaim,
  IrPaymentPrincipal,
  IrPrincipalAllocation,
  IrRecoveryPayload,
} from "@/types/legal-ir-calculations";
import { LegalField, LegalError } from "../../LegalShared";
import { legalDate, useLegalAction } from "../../legal-ui";
import {
  OperationPanel,
  OperationReasonDialog,
  OperationRecords,
} from "../../operations/OperationPanel";
import { IrAccessNotice, IrDialog } from "../IrShared";
import { INCOME_KINDS } from "../ir-ui";
import {
  financialKey,
  financialOwner,
  formatIrMoney,
  requiredMoney,
  type FinancialPanelProps,
} from "./financial-ui";
import { FinancialSelect, MoneyField } from "./FinancialShared";

const CHANNELS = {
  source_refund: "Devolução pela fonte",
  administrative_refund: "Restituição administrativa",
  judicial_payment: "Pagamento judicial",
} as const;
function PrincipalDialog({
  props,
  documents,
  sources,
  payers,
  taxpayers,
  onClose,
}: {
  props: FinancialPanelProps;
  documents: LegalCaseDocument[];
  sources: IrIncomeSource[];
  payers: IrPayer[];
  taxpayers: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [customer, setCustomer] = useState("");
  const [source, setSource] = useState("");
  const [document, setDocument] = useState("");
  const [proof, setProof] = useState("");
  const [reference, setReference] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [paid, setPaid] = useState("");
  const [amount, setAmount] = useState("");
  const action = useLegalAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(async () => {
        await createIrPaymentPrincipal(props.legalCase.id, {
          customer_id: customer,
          source_id: source,
          payment_document_id: document,
          proof_line: proof.trim(),
          payment_reference: reference.trim(),
          period_start: start,
          period_end: end,
          paid_on: paid,
          tax_code: "IRPF",
          amount: requiredMoney(amount),
        });
      }, "Pagamento registrado para conferência")
    )
      onClose();
  }
  return (
    <IrDialog
      wide
      title="Registrar pagamento principal"
      description="Identifique o contribuinte, o período e a localização exata da prova. Um pagamento registrado não constitui crédito reconhecido."
      pending={action.pending}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <FinancialSelect
          required
          label="Contribuinte vinculado ao caso"
          value={customer}
          onChange={setCustomer}
        >
          <option value="">Selecione</option>
          {taxpayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FinancialSelect>
        {!taxpayers.length ? (
          <p className="text-sm text-amber-800">
            Vincule o contribuinte como cliente ou parte do caso antes de
            registrar o pagamento.
          </p>
        ) : null}
        <FinancialSelect
          required
          label="Rendimento de origem do pagamento"
          value={source}
          onChange={setSource}
        >
          <option value="">Selecione</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {payers.find((p) => p.id === s.payer_id)?.name ?? "Fonte"} ·{" "}
              {INCOME_KINDS[s.income_kind]} ·{" "}
              {s.benefit_number || s.id.slice(0, 8)}
            </option>
          ))}
        </FinancialSelect>
        <FinancialSelect
          required
          label="Comprovante fiscal do pagamento"
          value={document}
          onChange={setDocument}
        >
          <option value="">Selecione</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </FinancialSelect>
        <div className="grid gap-4 sm:grid-cols-2">
          <LegalField label="Linha ou localização única no comprovante">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={80}
                value={proof}
                onChange={(e) => setProof(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Referência do pagamento">
            {(id) => (
              <Input
                id={id}
                required
                maxLength={200}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Início do período pago">
            {(id) => (
              <Input
                id={id}
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Fim do período pago">
            {(id) => (
              <Input
                id={id}
                required
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            )}
          </LegalField>
          <LegalField label="Data efetiva do pagamento">
            {(id) => (
              <Input
                id={id}
                required
                type="date"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
              />
            )}
          </LegalField>
          <MoneyField
            required
            label="Valor principal pago"
            value={amount}
            onChange={setAmount}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          O registro e sua prova são preservados para impedir que o mesmo
          principal seja apropriado em duplicidade. Datas de fatos efetivos são
          conferidas no fuso de Brasília.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Registrar para conferência</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function AllocationDialog({
  principal,
  claims,
  available,
  onClose,
}: {
  principal: IrPaymentPrincipal;
  claims: IrClaim[];
  available?: string;
  onClose: () => void;
}) {
  const [claim, setClaim] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const action = useLegalAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(
        () =>
          allocateIrPrincipal(
            principal.id,
            claim,
            requiredMoney(amount),
            key,
            reason.trim(),
          ),
        "Reserva vinculada ao pedido",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title="Reservar principal para um pedido"
      description="O saldo é controlado no servidor entre os pedidos. A reserva representa um vínculo interno, sem ordem bancária."
      pending={action.pending}
      onClose={onClose}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <p className="text-sm">
          {principal.payment_reference} · Disponível para reserva:{" "}
          {formatIrMoney(available)}
        </p>
        <FinancialSelect
          required
          label="Pedido que utilizará este principal"
          value={claim}
          onChange={setClaim}
        >
          <option value="">Selecione</option>
          {claims.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </FinancialSelect>
        <MoneyField
          required
          label="Valor a reservar"
          value={amount}
          onChange={setAmount}
        />
        <LegalField label="Fundamento da vinculação e período abrangido">
          {(id) => (
            <Textarea
              id={id}
              required
              maxLength={4000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Confirmar reserva</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
function RecoveryDialog({
  allocation,
  documents,
  onClose,
}: {
  allocation: IrPrincipalAllocation;
  documents: LegalCaseDocument[];
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [channel, setChannel] =
    useState<IrRecoveryPayload["channel"]>("source_refund");
  const [document, setDocument] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const action = useLegalAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      await action.run(
        () =>
          recordIrRecovery(allocation.id, {
            amount: requiredMoney(amount),
            received_on: date,
            channel,
            document_id: document,
            reference: reference.trim(),
            proof_line: proof.trim(),
            idempotency_key: key,
          }),
        "Recebimento comprovado conciliado",
      )
    )
      onClose();
  }
  return (
    <IrDialog
      title="Conciliar recebimento comprovado"
      description="Registre somente a entrada efetiva documentada. O valor é abatido do principal reservado, preservando o histórico."
      onClose={onClose}
      pending={action.pending}
    >
      <form className="space-y-4" onSubmit={(e) => void save(e)}>
        <MoneyField
          required
          label="Valor efetivamente recebido"
          value={amount}
          onChange={setAmount}
        />
        <LegalField label="Data efetiva do recebimento">
          {(id) => (
            <Input
              id={id}
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </LegalField>
        <FinancialSelect
          label="Origem do recebimento"
          value={channel}
          onChange={(v) => setChannel(v as typeof channel)}
        >
          {Object.entries(CHANNELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FinancialSelect>
        <FinancialSelect
          label="Comprovante fiscal da entrada"
          required
          value={document}
          onChange={setDocument}
        >
          <option value="">Selecione</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
            </option>
          ))}
        </FinancialSelect>
        <LegalField label="Localização única da entrada no comprovante">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={80}
              value={proof}
              onChange={(e) => setProof(e.target.value)}
            />
          )}
        </LegalField>
        <LegalField label="Referência do recebimento">
          {(id) => (
            <Input
              id={id}
              required
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}
        </LegalField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={action.pending}>Conciliar recebimento</Button>
        </DialogFooter>
      </form>
    </IrDialog>
  );
}
export function IrReconciliation(props: FinancialPanelProps) {
  const allowed = props.ir.can_fiscal && props.financial.can_fiscal;
  const dual = allowed && props.ir.can_medical && props.financial.can_calculate;
  const principals = useQuery({
    queryKey: financialKey(props, "principals"),
    queryFn: () => listIrPaymentPrincipals(props.legalCase.id),
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
  const parties = useQuery({
    queryKey: financialKey(props, "parties"),
    queryFn: () => listLegalParties(props.legalCase.id),
    enabled: allowed,
  });
  const claims = useQuery({
    queryKey: financialKey(props, "claims"),
    queryFn: () => listIrClaims(props.legalCase.id),
    enabled: dual,
  });
  const allocations = useQuery({
    queryKey: financialKey(props, "allocations"),
    queryFn: () => listIrPrincipalAllocations(props.legalCase.id),
    enabled: dual,
  });
  const recoveries = useQuery({
    queryKey: financialKey(props, "recoveries"),
    queryFn: () => listIrRecoveries(props.legalCase.id),
    enabled: dual,
  });
  const [create, setCreate] = useState(false);
  const [verify, setVerify] = useState<IrPaymentPrincipal>();
  const [allocate, setAllocate] = useState<IrPaymentPrincipal>();
  const [release, setRelease] = useState<IrPrincipalAllocation>();
  const [recovery, setRecovery] = useState<IrPrincipalAllocation>();
  const action = useLegalAction();
  if (!allowed)
    return (
      <IrAccessNotice>
        É necessário acesso fiscal para examinar pagamentos e comprovantes.
      </IrAccessNotice>
    );
  const docs = (documents.data ?? []).filter(
    (d) => d.category === "fiscal" && d.status === "ready",
  );
  const taxpayers = [
    ...(props.legalCase.customer_id
      ? [{ id: props.legalCase.customer_id, name: "Cliente principal do caso" }]
      : []),
    ...(parties.data ?? [])
      .filter(
        (p) => p.customer_id && p.customer_id !== props.legalCase.customer_id,
      )
      .map((p) => ({ id: p.customer_id!, name: p.name })),
  ].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
  const commonError =
    documents.error ?? sources.error ?? payers.error ?? parties.error;
  const dualError = dual
    ? (claims.error ?? allocations.error ?? recoveries.error)
    : null;
  return (
    <OperationPanel
      title="Principal, reservas e recebimentos"
      description="Conciliação baseada em comprovantes, com saldo por pagamento para evitar apropriação duplicada entre pedidos."
      actions={
        props.canEdit ? (
          <Button onClick={() => setCreate(true)}>Registrar pagamento</Button>
        ) : undefined
      }
    >
      {commonError ? <LegalError error={commonError} /> : null}
      {dualError ? <LegalError error={dualError} /> : null}
      <p className="text-sm text-muted-foreground">
        O saldo disponível é o principal ainda não reservado nem recebido.
        Liberar uma reserva preserva todos os recebimentos já conciliados.
      </p>
      <OperationRecords
        pending={principals.isPending}
        error={principals.error}
        retry={() => void principals.refetch()}
        count={principals.data?.length ?? 0}
        empty="Nenhum pagamento principal registrado"
      >
        {principals.data?.map((p) => {
          const balance = props.financial.principal_balances.find(
            (b) => b.id === p.id,
          );
          const doc = docs.find((d) => d.id === p.payment_document_id);
          const ownAllocations = dual
            ? (allocations.data ?? []).filter((a) => a.principal_id === p.id)
            : [];
          return (
            <article key={p.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h4 className="min-w-0 break-words font-medium">
                  {p.payment_reference}
                </h4>
                <Badge variant="outline">
                  {p.status === "verified"
                    ? "Comprovante conferido"
                    : "Conferência pendente"}
                </Badge>
              </div>
              <p className="text-sm">
                Pagamento {legalDate(p.paid_on)} · Período{" "}
                {legalDate(p.period_start)} a {legalDate(p.period_end)} ·
                Localização: {p.proof_line}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Principal documentado", p.amount],
                  ["Reservado e não recebido", balance?.allocated],
                  ["Recebimento conciliado", balance?.received],
                  ["Disponível para reserva", balance?.available],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/30 p-3">
                    <dt className="text-xs text-muted-foreground">{l}</dt>
                    <dd className="break-all font-mono">{formatIrMoney(v)}</dd>
                  </div>
                ))}
              </dl>
              {p.review_note ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  Conferência: {p.review_note}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
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
                    Baixar prova do pagamento
                  </Button>
                ) : null}
                {financialOwner(props) && p.status === "draft" ? (
                  <Button size="sm" onClick={() => setVerify(p)}>
                    Conferir comprovante
                  </Button>
                ) : null}
                {financialOwner(props) && dual && p.status === "verified" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(dualError)}
                    onClick={() => setAllocate(p)}
                  >
                    Reservar para pedido
                  </Button>
                ) : null}
              </div>
              {dual
                ? ownAllocations.map((a) => (
                    <section
                      key={a.id}
                      className="space-y-3 rounded-lg border p-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="min-w-0 break-words text-sm font-medium">
                          {claims.data?.find((c) => c.id === a.claim_id)
                            ?.title ?? "Pedido vinculado"}{" "}
                          · Reserva {formatIrMoney(a.amount)}
                        </p>
                        <Badge variant="outline">
                          {a.status === "active"
                            ? "Reserva ativa"
                            : "Saldo não recebido liberado"}
                        </Badge>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {a.reason}
                      </p>
                      {a.status === "released" ? (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          Liberação em {legalDate(a.released_at)}:{" "}
                          {a.release_reason ??
                            "Justificativa preservada no histórico"}
                        </p>
                      ) : null}
                      {(recoveries.data ?? [])
                        .filter((r) => r.allocation_id === a.id)
                        .map((r) => (
                          <div
                            key={r.id}
                            className="space-y-1 rounded-lg bg-muted/30 p-3 text-sm"
                          >
                            <p className="font-medium">
                              Recebido {formatIrMoney(r.amount)} ·{" "}
                              {legalDate(r.received_on)}
                            </p>
                            <p>
                              {CHANNELS[r.channel]} · {r.reference} ·
                              Localização {r.proof_line}
                            </p>
                            {docs.find((d) => d.id === r.document_id) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void action.run(
                                    () =>
                                      downloadLegalDocument(
                                        docs.find(
                                          (d) => d.id === r.document_id,
                                        )!,
                                      ),
                                    "Download solicitado",
                                  )
                                }
                              >
                                Baixar comprovante da entrada
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      {financialOwner(props) && a.status === "active" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => setRecovery(a)}>
                            Conciliar entrada
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRelease(a)}
                          >
                            Liberar saldo não recebido
                          </Button>
                        </div>
                      ) : null}
                    </section>
                  ))
                : null}
            </article>
          );
        })}
      </OperationRecords>
      {!dual ? (
        <IrAccessNotice>
          Os saldos fiscais permanecem disponíveis. Os vínculos com pedidos e os
          detalhes de recuperações exigem também acesso médico, pois relacionam
          a estratégia jurídica.
        </IrAccessNotice>
      ) : null}
      {create && props.canEdit ? (
        <PrincipalDialog
          props={props}
          documents={docs}
          sources={sources.data ?? []}
          payers={payers.data ?? []}
          taxpayers={taxpayers}
          onClose={() => setCreate(false)}
        />
      ) : null}
      {verify && financialOwner(props) ? (
        <OperationReasonDialog
          open
          title="Conferir comprovante de pagamento"
          description="Confronte contribuinte, período, valor e localização na prova. A conferência libera a reserva do principal."
          onClose={() => setVerify(undefined)}
          pending={action.pending}
          onSave={(note) =>
            action.run(
              () => verifyIrPaymentPrincipal(verify.id, note),
              "Comprovante conferido",
            )
          }
        />
      ) : null}
      {allocate && financialOwner(props) && dual ? (
        <AllocationDialog
          principal={allocate}
          claims={claims.data ?? []}
          available={
            props.financial.principal_balances.find((b) => b.id === allocate.id)
              ?.available
          }
          onClose={() => setAllocate(undefined)}
        />
      ) : null}
      {release && financialOwner(props) && dual ? (
        <OperationReasonDialog
          open
          title="Liberar saldo não recebido"
          description="Apenas a reserva ainda não recebida voltará a ficar disponível. Recebimentos efetivos permanecem consumindo o principal."
          onClose={() => setRelease(undefined)}
          pending={action.pending}
          onSave={(note) =>
            action.run(
              () => releaseIrAllocation(release.id, note),
              "Reserva não recebida liberada",
            )
          }
        />
      ) : null}
      {recovery && financialOwner(props) && dual ? (
        <RecoveryDialog
          allocation={recovery}
          documents={docs}
          onClose={() => setRecovery(undefined)}
        />
      ) : null}
    </OperationPanel>
  );
}
