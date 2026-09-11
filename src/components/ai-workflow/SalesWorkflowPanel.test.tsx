import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SalesWorkflowPanel } from "./SalesWorkflowPanel";
import { DEFAULT_SALES_WORKFLOW } from "@/lib/api/ai-sales-workflow";

const mocks = vi.hoisted(() => ({
  role: "admin",
  save: vi.fn(),
  get: vi.fn(),
  overview: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "owner", role: mocks.role } }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));
vi.mock("@/lib/api/ai-agent", () => ({
  useTenantAiConfig: () => ({ data: { provider: "off" } }),
  useAiChannels: () => ({ data: [] }),
}));
vi.mock("@/lib/api/ai-sales-workflow", async (original) => ({
  ...(await original<object>()),
  getSalesWorkflowConfig: mocks.get,
  saveSalesWorkflowConfig: mocks.save,
  getSalesWorkflowOverview: mocks.overview,
}));
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SalesWorkflowPanel />
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.get.mockResolvedValue({ ...DEFAULT_SALES_WORKFLOW });
  mocks.overview.mockResolvedValue([]);
  mocks.save.mockImplementation(async (value) => ({ ...value, revision: 1 }));
});
describe("Sales workflow configuration", () => {
  it("does not expose configuration controls to non-admins", () => {
    mocks.role = "atendimento";
    show();
    expect(screen.getByText(/reservada ao administrador/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("makes missing channel and signature integration explicit", async () => {
    show();
    expect(
      await screen.findByText(/configure a IA nativa e habilite um canal/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/não envia contratos para assinar nem aprova laudos/),
    ).toBeInTheDocument();
  });
  it("changing commercial terms clears template approval before saving", async () => {
    mocks.get.mockResolvedValue({
      ...DEFAULT_SALES_WORKFLOW,
      revision: 4,
      contract_template: "Contrato",
      fee_terms: "Condição original",
      template_approved: true,
    });
    show();
    const fees = await screen.findByLabelText(
      "Honorários e condições permitidas",
    );
    fireEvent.change(fees, { target: { value: "Nova condição" } });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar equipe e condições" }),
    );
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 4,
          template_approved: false,
          fee_terms: "Nova condição",
        }),
      ),
    );
  });
  it("does not display success when a stale configuration is refused", async () => {
    mocks.save.mockRejectedValue(new Error("A configuração mudou"));
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Salvar equipe e condições" }),
    );
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Não foi possível salvar",
          description: "A configuração mudou",
        }),
      ),
    );
  });
});
