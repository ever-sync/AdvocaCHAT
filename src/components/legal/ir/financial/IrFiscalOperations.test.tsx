import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IrClaims } from "./IrClaims";
import { IrTaxReturns } from "./IrTaxReturns";
import { IrCessation } from "./IrCessation";
import { IrPeriods } from "./IrPeriods";
import { financialKey, type FinancialPanelProps } from "./financial-ui";
import { listLegalDocuments } from "@/lib/api/legal";
import { listIrTaxReturns, listIrTaxReturnEvents, recordIrTaxReturn, updateIrTaxReturnStatus } from "@/lib/api/legal-ir-calculations";
import type { IrTaxReturn } from "@/types/legal-ir-calculations";

vi.mock("@/lib/api/legal", () => ({ listLegalDocuments: vi.fn() }));
vi.mock("@/lib/api/legal-ir", () => ({ listIrPayers: vi.fn(), listIrAssessmentVersions: vi.fn(), listIrIncomeSources: vi.fn() }));
vi.mock("@/lib/api/legal-ir-calculations", () => ({ listIrTaxReturns: vi.fn(), recordIrTaxReturn: vi.fn(), listIrTaxReturnEvents: vi.fn(), updateIrTaxReturnStatus: vi.fn(), listIrClaims: vi.fn(), listIrClaimEvents: vi.fn(), listIrClaimOverlaps: vi.fn(), listIrCalculationVersions: vi.fn(), createIrClaim: vi.fn(), updateIrClaimDraft: vi.fn(), recordIrClaimEvent: vi.fn(), reviewIrClaimStrategy: vi.fn(), linkIrClaimOverlap: vi.fn(), listIrCessationRecords: vi.fn(), recordIrCessation: vi.fn(), listIrPeriodReviews: vi.fn(), recordIrPeriodReview: vi.fn() }));
afterEach(cleanup);
const props: FinancialPanelProps = {
  legalCase: { id: "case", owner_id: "owner" } as FinancialPanelProps["legalCase"],
  workspace: { user_id: "owner", tenant_id: "tenant", collaborators: [] } as unknown as FinancialPanelProps["workspace"],
  canEdit: true,
  ir: { can_medical: true, can_fiscal: true, can_assess: true, latest_assessment_id: "assessment", assessment_is_current: true } as FinancialPanelProps["ir"],
  financial: { can_fiscal: true, can_calculate: true, operational_timezone: "America/Sao_Paulo", calculation_states: [], principal_balances: [], overlaps: [] },
};
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const key of ["tax-returns", "tax-return-events", "documents", "payers", "assessments", "calculations", "claims", "claim-events", "claim-overlaps", "income-sources", "cessations", "periods"]) client.setQueryData(financialKey(props, key), []);
  return { client, wrap: (content: ReactNode) => <QueryClientProvider client={client}>{content}</QueryClientProvider> };
}
it("removes cached clinical claim strategy and an open draft when medical access is revoked", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "claims"), [{ id: "claim", title: "Pedido com dado protegido", route: "judicial", channel: "court", status: "draft", recognized_amount: "0.00", created_at: "2026-09-11T12:00:00Z" }]);
  const view = render(wrap(<IrClaims {...props} />));
  expect(screen.getByText("Pedido com dado protegido")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preparar pedido" }));
  fireEvent.change(screen.getByLabelText("Título do pedido"), { target: { value: "Rascunho protegido" } });
  view.rerender(wrap(<IrClaims {...props} ir={{ ...props.ir, can_medical: false }} />));
  expect(screen.queryByText("Pedido com dado protegido")).not.toBeInTheDocument();
  expect(screen.queryByDisplayValue("Rascunho protegido")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(client.getQueryData(financialKey(props, "claims"))).toHaveLength(1);
});
it("hides fiscal receipts and an open return form on revocation while preserving exact stored cents", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "tax-returns"), [{ id: "return", calendar_year: 2025, exercise: 2026, return_kind: "original", status: "filed", receipt_number: "RECIBO-PRIVADO", reported_tax: "99999999999999.99", reported_refund: "0.00", paid_quotas: "0.00", notes: "", created_at: "2026-09-11T12:00:00Z" }]);
  const view = render(wrap(<IrTaxReturns {...props} />));
  expect(screen.getByText("R$ 99.999.999.999.999,99")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Registrar declaração" }));
  view.rerender(wrap(<IrTaxReturns {...props} financial={{ ...props.financial, can_fiscal: false, can_calculate: false }} />));
  expect(screen.queryByText(/RECIBO-PRIVADO/)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("never presents an approved claim as observed cessation and removes cached observations on revocation", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "cessations"), [{ id: "observation", source_id: "source", competence: "2026-09", previous_withheld: "100.00", current_withheld: "80.00", status: "ongoing", review_note: "Folha ainda com retenção", observed_on: "2026-09-11", created_at: "2026-09-11T12:00:00Z" }]);
  const view = render(wrap(<IrCessation {...props} />));
  expect(screen.getByText(/Retenção positiva|Retenção mantida/)).toBeInTheDocument();
  expect(screen.queryByText("Sem retenção no documento conferido")).not.toBeInTheDocument();
  view.rerender(wrap(<IrCessation {...props} financial={{ ...props.financial, can_fiscal: false, can_calculate: false }} />));
  expect(screen.queryByText("Folha ainda com retenção")).not.toBeInTheDocument();
});
it("closes a period review when its approved assessment becomes stale", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "assessments"), [{ id: "assessment", version_number: 1, status: "approved" }]);
  const view = render(wrap(<IrPeriods {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Revisar período" }));
  fireEvent.change(screen.getByLabelText("Fundamento e relação entre marco e período"), { target: { value: "Fundamento em revisão" } });
  expect(screen.getByDisplayValue("Fundamento em revisão")).toBeInTheDocument();
  view.rerender(wrap(<IrPeriods {...props} ir={{ ...props.ir, assessment_is_current: false }} />));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Revisar período" })).toBeDisabled();
});
it("updates the same original declaration using a receipt and note without inventing an amending return", async () => {
  const { client, wrap } = setup();
  const original = { id: "original-return", calendar_year: 2025, exercise: 2026, return_kind: "original", status: "draft", receipt_document_id: null, receipt_number: "", reported_tax: "100.00", reported_refund: "0.00", paid_quotas: "100.00", notes: "", created_at: "2026-09-11T12:00:00Z" };
  client.setQueryData(financialKey(props, "tax-returns"), [original]);
  client.setQueryData(financialKey(props, "documents"), [{ id: "receipt", category: "fiscal", status: "ready", display_name: "Recibo conferido" }]);
  vi.mocked(updateIrTaxReturnStatus).mockResolvedValue({ ...original, status: "filed" } as IrTaxReturn);
  vi.mocked(listIrTaxReturns).mockResolvedValue([]);
  vi.mocked(listIrTaxReturnEvents).mockResolvedValue([]);
  vi.mocked(listLegalDocuments).mockResolvedValue([]);
  vi.mocked(recordIrTaxReturn).mockClear();
  render(wrap(<IrTaxReturns {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Atualizar situação" }));
  expect(screen.getByLabelText("Nova situação conferida")).toHaveValue("filed");
  fireEvent.change(screen.getByLabelText("Recibo ou evidência fiscal"), { target: { value: "receipt" } });
  fireEvent.change(screen.getByLabelText("Número do recibo conferido"), { target: { value: "REC-2026" } });
  fireEvent.change(screen.getByLabelText("Origem da atualização e justificativa"), { target: { value: "Conferido no recibo de transmissão." } });
  fireEvent.click(screen.getByRole("button", { name: "Atualizar situação e preservar histórico" }));
  await waitFor(() => expect(updateIrTaxReturnStatus).toHaveBeenCalledWith("original-return", "filed", "receipt", "REC-2026", "Conferido no recibo de transmissão."));
  expect(recordIrTaxReturn).not.toHaveBeenCalled();
});
