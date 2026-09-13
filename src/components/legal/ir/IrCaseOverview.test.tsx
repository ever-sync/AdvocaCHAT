import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IrCaseContext } from "@/types/legal-ir";
import type { LegalOperationsProps } from "../operations/operations-ui";
import { IrCaseOverview } from "./IrCaseOverview";

const context: IrCaseContext = {
  control: { case_id: "case", tenant_id: "tenant", input_revision: 3, workflow_status: "in_legal_review", updated_at: null },
  can_fiscal: true, can_medical: true, can_assess: true,
  latest_assessment_id: "assessment", assessment_is_current: true,
  checklist_states: [{ item_id: "item", document_request_id: null, state: "pending" }], representation_states: [],
};
const api = vi.hoisted(() => ({
  getIrCaseContext: vi.fn(), listIrPayers: vi.fn(), listIrIncomeSources: vi.fn(), listIrEvidenceEvents: vi.fn(),
  listIrDocumentReviews: vi.fn(), listIrChecklistItems: vi.fn(), listIrAssessmentVersions: vi.fn(),
}));
const financialApi = vi.hoisted(() => ({
  listIrTaxEntries: vi.fn(), listIrCalculationVersions: vi.fn(), listIrClaims: vi.fn(), listIrCessationRecords: vi.fn(),
}));
const downloadIrCaseDossier = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/legal-ir", () => api);
vi.mock("@/lib/api/legal-ir-calculations", () => financialApi);
vi.mock("@/lib/legal-ir-dossier", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/legal-ir-dossier")>(), downloadIrCaseDossier,
}));

const props = {
  legalCase: { id: "case", tenant_id: "tenant", title: "Caso piloto", owner_id: "owner" },
  workspace: { user_id: "owner", tenant_id: "tenant", collaborators: [] }, canEdit: true, ir: context,
} as unknown as LegalOperationsProps & { ir: IrCaseContext };

describe("visão consolidada de isenção de IR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getIrCaseContext.mockResolvedValue(context);
    api.listIrPayers.mockResolvedValue([{ id: "payer", name: "INSS" }]);
    api.listIrIncomeSources.mockResolvedValue([{ id: "income", payer_id: "payer", withholding_reported: "yes" }]);
    api.listIrEvidenceEvents.mockResolvedValue([{ id: "event", category: "medical", date_precision: "estimated", description: "Data relatada" }]);
    api.listIrDocumentReviews.mockResolvedValue([]);
    api.listIrChecklistItems.mockResolvedValue([{ id: "item", category: "medical", title: "Laudo", required: true }]);
    api.listIrAssessmentVersions.mockResolvedValue([{ id: "assessment", version_number: 1, status: "approved", summary: "Revisada" }]);
    financialApi.listIrTaxEntries.mockResolvedValue([{ id: "entry", calendar_year: 2025, competence: "2025-01", source_id: "payer", withheld: "1234.56" }]);
    financialApi.listIrCalculationVersions.mockResolvedValue([{ id: "calculation", status: "approved" }]);
    financialApi.listIrClaims.mockResolvedValue([{ id: "claim", status: "awaiting" }]);
    financialApi.listIrCessationRecords.mockResolvedValue([{ id: "cessation", status: "ongoing" }]);
    downloadIrCaseDossier.mockReset();
  });

  it("mostra pendências e revalida a autorização ao exportar", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IrCaseOverview {...props} /></QueryClientProvider>);
    expect(await screen.findByText("Visão de decisão do caso")).toBeInTheDocument();
    expect(await screen.findByText(/Resolver 1 item\(ns\) obrigatório\(s\)/)).toBeInTheDocument();
    expect(await screen.findByText("IR retido informado: R$ 1.234,56")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Baixar dossiê" }));
    await waitFor(() => expect(downloadIrCaseDossier).toHaveBeenCalledOnce());
    expect(api.getIrCaseContext).toHaveBeenCalledTimes(2);
  });

  it("cancela o arquivo quando o acesso muda durante a coleta", async () => {
    api.getIrCaseContext.mockResolvedValueOnce(context).mockResolvedValueOnce({ ...context, can_medical: false });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IrCaseOverview {...props} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Baixar dossiê" }));
    await waitFor(() => expect(api.getIrCaseContext).toHaveBeenCalledTimes(2));
    expect(downloadIrCaseDossier).not.toHaveBeenCalled();
  });

  it("remove imediatamente o panorama fiscal já armazenado quando o acesso é revogado", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><IrCaseOverview {...props} /></QueryClientProvider>);
    expect(await screen.findByText("IR retido informado: R$ 1.234,56")).toBeInTheDocument();
    view.rerender(<QueryClientProvider client={client}><IrCaseOverview {...props} ir={{ ...context, can_fiscal: false }} /></QueryClientProvider>);
    expect(screen.queryByText("IR retido informado: R$ 1.234,56")).not.toBeInTheDocument();
    expect(screen.queryByText("Panorama fiscal por ano")).not.toBeInTheDocument();
  });
  it("abre a etapa indicada pela fila automática", async () => {
    const onNavigate = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IrCaseOverview {...props} onNavigate={onNavigate} /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir etapa" }));
    expect(onNavigate).toHaveBeenCalledWith("checklist");
  });

});
