import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CaseFinancialData } from "@/types/legal-case-finance";
import { financeRpc } from "@/lib/api/legal-case-finance";
import type { CareMembership } from "../client-care/types";
import { FinanceStatements } from "./FinanceStatements";
import { FinanceCharges } from "./FinanceCharges";

vi.mock("@/lib/api/legal-case-finance", () => ({ financeRpc: vi.fn() }));
vi.mock("../legal-ui", () => ({ selectClassName: "", useLegalAction: () => ({ pending: false, run: async (action: () => Promise<unknown>) => { try { await action(); return true; } catch { return false; } } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const baseRow = { case_id: "case", tenant_id: "tenant", created_at: "2026-09-11T12:00:00Z" };
const empty = (): CaseFinancialData => ({ agreements: [], bases: [], obligations: [], transactions: [], allocations: [], statements: [], releases: [], connections: [], charges: [], receipts: [], context: { client_balance: "0.00", office_balance: "0.00", obligations: [], transactions: [] } });
const membership = { id: "member", case_id: "case", tenant_id: "tenant", public_title: "Destinatário autorizado", verified_email: "fixture@example.test", state: "active", expires_at: "2099-01-01T00:00:00Z", allow_fiscal: true, allow_medical: false, scopes: ["statements:read"], revision: 1 } as CareMembership;
const statement = { ...baseRow, id: "statement", title: "Prestação conferida", version_number: 1, period_start: "2026-09-01", period_end: "2026-09-11", public_note: '<img src=x onerror="alert(1)">', status: "approved" as const,
  snapshot: { currency: "BRL" as const, opening: { client: "1.00", office: "2.00" }, closing: { client: "1.00", office: "2.00" }, generated_at: baseRow.created_at, obligations_basis: "current_at_generation" as const, movements: [], obligations: [] } };
function chargeData(): CaseFinancialData {
  return { ...empty(), obligations: [{ ...baseRow, id: "obligation", title: "Honorários aprovados", category: "fee", direction: "receivable", funds_owner: "office", beneficiary: "office", amount: "120.00", due_on: "2026-09-20", agreement_id: "agreement", basis_id: "basis", status: "approved", notes: "" }],
    connections: [{ id: "connection", tenant_id: "tenant", label: "Conta de teste", account_id: "fixture", provider: "asaas", environment: "sandbox", status: "not_configured" }], context: { ...empty().context, obligations: [{ id: "obligation", paid: "0.00", remaining: "120.00" }] } };
}
it("renders statement content as text and excludes cached statements from another case", () => {
  const data = { ...empty(), statements: [statement, { ...statement, id: "other", case_id: "other-case", title: "Segredo de outro caso" }] };
  const view = render(<FinanceStatements caseId="case" data={data} owner={false} memberships={[membership]} />);
  expect(screen.getByText(statement.public_note)).toBeInTheDocument(); expect(view.container.querySelector("img")).toBeNull();
  expect(screen.queryByText(/Segredo de outro caso/)).not.toBeInTheDocument(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("only offers current individual fiscal statement grants and removes an open release form after revocation", () => {
  const invalid = [
    { ...membership, id: "revoked", state: "revoked" as const, public_title: "Revogado" },
    { ...membership, id: "expired", expires_at: "2000-01-01T00:00:00Z", public_title: "Expirado" },
    { ...membership, id: "no-fiscal", allow_fiscal: false, public_title: "Sem fiscal" },
    { ...membership, id: "no-scope", scopes: [], public_title: "Sem escopo" },
  ];
  const data = { ...empty(), statements: [statement] };
  const view = render(<FinanceStatements caseId="case" data={data} owner memberships={[membership, ...invalid]} />);
  fireEvent.click(screen.getByRole("button", { name: "Liberar para uma pessoa" }));
  expect(screen.getByRole("option", { name: /Destinatário autorizado/ })).toBeInTheDocument();
  for (const name of ["Revogado", "Expirado", "Sem fiscal", "Sem escopo"]) expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
  view.rerender(<FinanceStatements caseId="case" data={data} owner memberships={invalid} />);
  expect(screen.queryByLabelText("Conta individual autorizada")).not.toBeInTheDocument();
});
it("removes all finance mutations when ownership is revoked, including workspace administration", () => {
  const data = chargeData();
  const view = render(<FinanceCharges caseId="case" data={data} owner memberships={[]} workspaceAdmin />);
  fireEvent.click(screen.getByRole("button", { name: "Registrar identificação da conta" }));
  expect(screen.getByLabelText("Nome para identificar a conta")).toBeInTheDocument();
  view.rerender(<FinanceCharges caseId="case" data={data} owner={false} memberships={[]} workspaceAdmin />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(screen.getByText("Conta de teste · Teste")).toBeInTheDocument();
});
it("preserves charge idempotency through timeout retries and keeps exact user-entered cents", async () => {
  vi.mocked(financeRpc).mockRejectedValue(new Error("ambiguous timeout"));
  render(<FinanceCharges caseId="case" data={chargeData()} owner memberships={[]} workspaceAdmin={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Preparar cobrança" }));
  for (const [label, value] of [["Obrigação aprovada", "obligation"], ["Conta de recebimento", "connection"], ["Identificador do cliente no Asaas", "cus_fixture"], ["Valor desta cobrança (R$)", "120,00"], ["Forma de pagamento", "PIX"]]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" })); await waitFor(() => expect(financeRpc).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" })); await waitFor(() => expect(financeRpc).toHaveBeenCalledTimes(2));
  const first = vi.mocked(financeRpc).mock.calls[0][1]; const second = vi.mocked(financeRpc).mock.calls[1][1];
  expect(first).toEqual(second); expect(first.p_payload).toMatchObject({ amount: "120.00", provider_customer_id: "cus_fixture" });
});
it("reconciliation offers only a documented movement allocated to this obligation and never follows an arbitrary provider URL", () => {
  const data = chargeData();
  data.charges = [{ ...baseRow, id: "attempt", obligation_id: "obligation", connection_id: "connection", amount: "120.00", provider_customer_id: "cus_fixture", billing_type: "PIX", due_on: "2026-09-20", status: "provider_accepted", provider_url: "https://sandbox.asaas.com.attacker.test/", provider_charge_id: "pay_fixture" }];
  data.receipts = [{ ...baseRow, id: "receipt", charge_id: "attempt", event_type: "PAYMENT_RECEIVED", provider_event_id: "evt_fixture", amount: "120.00", status: "needs_reconciliation", cash_transaction_id: null }];
  const transaction = { ...baseRow, id: "proper", from_owner: "external" as const, to_owner: "office" as const, amount: "120.00", occurred_on: "2026-09-11", reference: "Movimento comprovado", proof_line: "1", document_id: "document", reason: "Conferido", reverses_id: null, transfer_obligation_id: null };
  data.transactions = [transaction, { ...transaction, id: "other", reference: "Outra obrigação" }, { ...transaction, id: "client", reference: "Recurso do cliente", to_owner: "client" }];
  data.allocations = [transaction.id, "client"].map((id) => ({ ...baseRow, id: `allocation-${id}`, cash_transaction_id: id, obligation_id: "obligation", kind: "settlement", original_allocation_id: null, amount: "120.00", reason: "Conferido" }));
  render(<FinanceCharges caseId="case" data={data} owner memberships={[]} workspaceAdmin={false} />);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Conciliar com comprovante" }));
  expect(screen.getByRole("option", { name: /Movimento comprovado/ })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: /Outra obrigação|Recurso do cliente/ })).not.toBeInTheDocument();
});
