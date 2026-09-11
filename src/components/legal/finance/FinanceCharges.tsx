import { financeRpc } from "@/lib/api/legal-case-finance";
import type { CashTransaction, CaseFinancialData, ChargeAttempt, PaymentReceipt } from "@/types/legal-case-finance";
import type { CareMembership } from "../client-care/types";
import { FinanceForm, FinanceRecord } from "./FinanceShared";
import { canonicalMoney, money, noteField, today } from "./finance-ui";

export interface FinanceChargesProps { caseId: string; data: CaseFinancialData; owner: boolean; memberships: CareMembership[]; workspaceAdmin: boolean }
const billingNames = { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão na página do provedor" };
const receiptNames: Record<string, string> = { PAYMENT_CREATED: "Cobrança criada", PAYMENT_UPDATED: "Cobrança atualizada", PAYMENT_CONFIRMED: "Pagamento confirmado pelo provedor", PAYMENT_RECEIVED: "Recebimento informado pelo provedor", PAYMENT_RECEIVED_IN_CASH: "Recebimento em dinheiro informado", PAYMENT_OVERDUE: "Vencimento ultrapassado", PAYMENT_DELETED: "Cobrança removida", PAYMENT_RESTORED: "Cobrança restaurada", PAYMENT_REFUNDED: "Estorno informado", PAYMENT_PARTIALLY_REFUNDED: "Estorno parcial informado", PAYMENT_CHARGEBACK_REQUESTED: "Contestação de pagamento informada" };
function safeInvoiceUrl(attempt: ChargeAttempt, data: CaseFinancialData): string | null {
  if (!attempt.provider_url) return null;
  try { const url = new URL(attempt.provider_url); const environment = data.connections.find((connection) => connection.id === attempt.connection_id)?.environment;
    const allowed = environment === "sandbox" ? ["sandbox.asaas.com", "www.sandbox.asaas.com"] : environment === "production" ? ["asaas.com", "www.asaas.com"] : [];
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed.includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}
function reconciliationCandidates(receipt: PaymentReceipt, attempt: ChargeAttempt, data: CaseFinancialData): CashTransaction[] {
  const received = ["PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"].includes(receipt.event_type);
  const reversed = ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED"].includes(receipt.event_type);
  return data.transactions.filter((transaction) => transaction.case_id === attempt.case_id && !!transaction.document_id && data.allocations.some((allocation) => allocation.case_id === attempt.case_id && allocation.obligation_id === attempt.obligation_id && allocation.cash_transaction_id === transaction.id) && ((received && transaction.from_owner === "external" && transaction.to_owner === "office" && !transaction.reverses_id) || (reversed && transaction.from_owner === "office" && transaction.to_owner === "external" && !!transaction.reverses_id)) && !data.receipts.some((other) => other.status === "reconciled" && other.cash_transaction_id === transaction.id && other.charge_id !== attempt.id));
}
function PrepareCharge({ caseId, data }: Pick<FinanceChargesProps, "caseId" | "data">) {
  const obligations = data.obligations.filter((obligation) => obligation.case_id === caseId && obligation.status === "approved" && obligation.direction === "receivable" && obligation.funds_owner === "office" && obligation.category !== "advance" && (data.context.obligations.find((balance) => balance.id === obligation.id)?.remaining ?? "0.00") !== "0.00" && !data.charges.some((attempt) => attempt.obligation_id === obligation.id && !["failed", "cancelled", "reconciled"].includes(attempt.status)));
  const connections = data.connections.filter((connection) => connection.status !== "disabled");
  if (!obligations.length || !connections.length) return <p className="text-sm text-muted-foreground">Para preparar uma cobrança, cadastre a identificação da conta e uma obrigação aprovada a receber para o escritório, com saldo disponível.</p>;
  return <FinanceForm title="Preparar cobrança" description="Confira o cliente já cadastrado no provedor e o valor desta obrigação. A criação do rascunho não envia cobrança." fields={[
    { key: "obligation", label: "Obrigação aprovada", kind: "select", options: obligations.map((obligation) => ({ value: obligation.id, label: `${obligation.title} · restante ${money(data.context.obligations.find((balance) => balance.id === obligation.id)?.remaining ?? "0.00")}` })) },
    { key: "connection", label: "Conta de recebimento", kind: "select", options: connections.map((connection) => ({ value: connection.id, label: `${connection.label} · ${connection.environment === "sandbox" ? "Teste" : "Produção"}${connection.status === "not_configured" ? " · Não configurada" : ""}` })) },
    { key: "customer", label: "Identificador do cliente no Asaas", hint: "Use o cadastro individual conferido na mesma conta de recebimento (cus_…). Não informe CPF, e-mail ou dados de cartão." },
    { key: "amount", label: "Valor desta cobrança (R$)", kind: "money" }, { key: "due", label: "Vencimento", kind: "date", initial: today() },
    { key: "billing", label: "Forma de pagamento", kind: "select", options: Object.entries(billingNames).map(([value, label]) => ({ value, label })) },
  ]} onSave={async (values, { idempotencyKey }) => { if (!/^cus_[A-Za-z0-9_-]{1,170}$/.test(values.customer.trim())) throw new Error("Informe o identificador do cliente cadastrado no Asaas.");
    return await financeRpc("legal_prepare_charge", { p_obligation_id: values.obligation, p_payload: { connection_id: values.connection, amount: canonicalMoney(values.amount), provider_customer_id: values.customer.trim(), due_on: values.due, billing_type: values.billing, idempotency_key: idempotencyKey } });
  }} />;
}

export function FinanceCharges({ caseId, data, owner, workspaceAdmin }: FinanceChargesProps) {
  const attempts = data.charges.filter((attempt) => attempt.case_id === caseId).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Cobranças usam a conta própria do escritório. Uma cobrança criada ou um evento do provedor não baixa valores automaticamente: o recebimento exige movimento comprovado e conciliação.</p>
    {owner && workspaceAdmin ? <FinanceForm title="Registrar identificação da conta" description="Registra somente a conta e o ambiente. Credenciais, vínculo do escritório e habilitação do envio são configurados separadamente no servidor após validação da integração." fields={[
      { key: "label", label: "Nome para identificar a conta" }, { key: "account", label: "Identificador da conta no Asaas", hint: "Não informe chave de API, senha ou token." },
      { key: "environment", label: "Ambiente", kind: "select", options: [{ value: "sandbox", label: "Teste (sandbox)" }, { value: "production", label: "Produção" }] },
    ]} onSave={(values) => financeRpc("legal_save_payment_connection", { p_label: values.label.trim(), p_account_id: values.account.trim(), p_environment: values.environment })} /> : null}
    {data.connections.map((connection) => <FinanceRecord key={connection.id} title={`${connection.label} · ${connection.environment === "sandbox" ? "Teste" : "Produção"}`} status={connection.status}><p className="text-sm break-words">Conta {connection.account_id}</p>{connection.status === "not_configured" ? <p className="text-sm text-muted-foreground">Cadastro salvo; envio indisponível até a configuração e a validação da conta.</p> : null}</FinanceRecord>)}
    {owner ? <PrepareCharge key={caseId} caseId={caseId} data={data} /> : null}
    {!attempts.length ? <p className="text-sm text-muted-foreground">Nenhuma tentativa de cobrança registrada.</p> : attempts.map((attempt) => {
      const obligation = data.obligations.find((item) => item.id === attempt.obligation_id && item.case_id === caseId);
      const url = safeInvoiceUrl(attempt, data); const receipts = data.receipts.filter((receipt) => receipt.case_id === caseId && receipt.charge_id === attempt.id);
      return <FinanceRecord key={attempt.id} title={obligation?.title ?? "Cobrança do caso"} status={attempt.status}>
        <p className="text-sm">{money(attempt.amount)} · {billingNames[attempt.billing_type]} · vence em {attempt.due_on}</p><p className="text-sm break-words">Cliente conferido no provedor: {attempt.provider_customer_id}</p>
        {attempt.status === "unknown" ? <p className="rounded border border-amber-500/30 p-3 text-sm">O resultado do envio é incerto. Confira a cobrança no provedor antes de qualquer nova tentativa; o sistema não repete o envio automaticamente.</p> : attempt.status === "not_configured" ? <p className="text-sm text-muted-foreground">A tentativa permanece registrada. O envio depende da configuração da conta correta no servidor.</p> : null}
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-block text-sm text-primary underline">Abrir cobrança no Asaas</a> : null}
        {owner && attempt.status === "draft" ? <FinanceForm title="Revisar valor e destino" button="Aprovar cobrança" description="Ao aprovar, você autoriza o envio quando a integração desta conta estiver habilitada. Confira valor, cliente, vencimento e conta de recebimento." fields={[noteField]} onSave={(values) => financeRpc("legal_review_charge", { p_attempt_id: attempt.id, p_note: values.note.trim() })} /> : null}
        {owner && ["draft", "approved", "not_configured", "failed"].includes(attempt.status) && !attempt.provider_charge_id ? <FinanceForm title="Cancelar tentativa não enviada" button="Cancelar tentativa" fields={[{ ...noteField, label: "Motivo do cancelamento" }]} onSave={(values) => financeRpc("legal_cancel_unsent_charge", { p_attempt_id: attempt.id, p_reason: values.note.trim() })} /> : null}
        {receipts.map((receipt) => { const candidates = reconciliationCandidates(receipt, attempt, data); return <FinanceRecord key={receipt.id} title={receiptNames[receipt.event_type] ?? "Evento recebido do provedor"} status={receipt.status}>
          <p className="text-sm">Valor informado: {receipt.amount === null ? "Não informado neste evento" : money(receipt.amount)}</p>
          {receipt.status === "reconciled" ? <p className="text-sm">Vinculado ao movimento comprovado: {data.transactions.find((transaction) => transaction.case_id === caseId && transaction.id === receipt.cash_transaction_id)?.reference ?? "Movimento registrado"}</p> : null}
          {owner && receipt.status === "needs_reconciliation" ? candidates.length ? <FinanceForm title="Conciliar com comprovante" button="Registrar conciliação" description="Selecione um movimento já comprovado e alocado a esta obrigação. A conferência vincula o evento ao registro; não cria outra entrada de caixa." fields={[
            { key: "transaction", label: "Movimento documentado compatível", kind: "select", options: candidates.map((transaction) => ({ value: transaction.id, label: `${transaction.occurred_on} · ${transaction.reference} · ${money(transaction.amount)}` })) }, noteField,
          ]} onSave={(values) => financeRpc("legal_reconcile_payment_receipt", { p_receipt_id: receipt.id, p_cash_transaction_id: values.transaction, p_note: values.note.trim() })} /> : <p className="text-sm text-muted-foreground">Este evento aguarda conferência. Para recebimento ou estorno, registre o movimento com comprovante e aloque-o à obrigação na aba Caixa.</p> : null}
        </FinanceRecord>; })}
      </FinanceRecord>;
    })}
  </div>;
}
export default FinanceCharges;
