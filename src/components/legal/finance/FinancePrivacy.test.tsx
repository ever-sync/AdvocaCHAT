import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import LegalCaseFinance from "./LegalCaseFinance";
import { FinanceForm } from "./FinanceShared";
import { getCaseFinance, getFinanceReferences } from "@/lib/api/legal-case-finance";
vi.mock("@/lib/api/legal-case-finance", () => ({ getCaseFinance: vi.fn(), getFinanceReferences: vi.fn(), financeRpc: vi.fn() }));
vi.mock("../client-care/api", () => ({ getClientCareContext: vi.fn() }));
vi.mock("../legal-ui", async (original) => ({ ...(await original<Record<string, unknown>>()), useLegalAction: () => ({ pending: false, run: async (operation: () => Promise<unknown>) => { try { await operation(); return true; } catch { return false; } } }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const props: ComponentProps<typeof LegalCaseFinance> = {
  legalCase: { id: "case-a", tenant_id: "office-a", owner_id: "owner", customer_id: null, negotiation_id: null, title: "Synthetic fiscal case", area: "Tributário", case_type: "consultivo", status: "ativo", next_action: "Review", next_action_due_at: null, wait_reason: "", created_at: "2026-09-11T12:00:00Z", updated_at: "2026-09-11T12:00:00Z" },
  workspace: { user_id: "fiscal-member", tenant_id: "office-a", enabled: true, can_activate: false, can_create: false, professional_profile: null, collaborators: [] },
  member: { case_id: "case-a", profile_id: "fiscal-member", can_edit: true, can_view_fiscal: true, can_view_medical: false }, canEdit: true,
};
const fresh = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const wrap = (client: QueryClient, child: ReactNode) => <QueryClientProvider client={client}>{child}</QueryClientProvider>;
it("hides cached balances and open drafts immediately when fiscal permission is revoked", () => {
  const client = fresh(); const key = ["legal", "fiscal-member", "office-a", "case", "case-a", "case-finance", true, false];
  client.setQueryData(key, { agreements: [], bases: [], obligations: [], transactions: [], allocations: [], statements: [], releases: [], connections: [], charges: [], receipts: [], context: { client_balance: "173.29", office_balance: "43.71", obligations: [], transactions: [] } });
  client.setQueryData([...key, "references", false], { documents: [], contracts: [], signatures: [], recoveries: [], claims: [] });
  const view = render(wrap(client, <LegalCaseFinance {...props} />));
  expect(screen.getByText(/173,29/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Criar obrigação ou parcela" }));
  fireEvent.change(screen.getByLabelText("Descrição"), { target: { value: "Rascunho fiscal confidencial" } });
  view.rerender(wrap(client, <LegalCaseFinance {...props} member={{ ...props.member!, can_view_fiscal: false }} />));
  expect(screen.queryByText(/173,29/)).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("Rascunho fiscal confidencial")).not.toBeInTheDocument();
  expect(screen.getByText("Acesso financeiro restrito")).toBeInTheDocument();
  expect(getCaseFinance).not.toHaveBeenCalled();expect(getFinanceReferences).not.toHaveBeenCalled();
});
it("does not retrieve money or IR sources without a fiscal grant", () => {
  render(wrap(fresh(), <LegalCaseFinance {...props} member={undefined} />));
  expect(getCaseFinance).not.toHaveBeenCalled();expect(getFinanceReferences).not.toHaveBeenCalled();
});
it("preserves idempotency after a timeout and renews only after a confirmed successful save", async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error("ambiguous timeout")).mockResolvedValue({});
  render(<FinanceForm title="Lançar movimento" button="Confirmar" fields={[{ key: "amount", label: "Valor", initial: "10,00" }]} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "Lançar movimento" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const first = save.mock.calls[0][1].idempotencyKey;
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument());
  expect(save.mock.calls[1][1].idempotencyKey).toBe(first);
  fireEvent.click(screen.getByRole("button", { name: "Lançar movimento" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
  expect(save.mock.calls[2][1].idempotencyKey).not.toBe(first);
});
