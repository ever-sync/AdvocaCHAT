import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import LegalReadinessPage from "./LegalReadinessPage";
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  metrics: vi.fn(),
  cases: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "owner" } }),
}));
vi.mock("@/components/layout/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/lib/api/legal", () => ({
  getLegalWorkspaceContext: mocks.workspace,
}));
vi.mock("@/lib/api/legal-readiness", () => ({
  readinessMetrics: mocks.metrics,
  readinessCases: mocks.cases,
  exportCaseManifest: vi.fn(),
  previewCaseImport: vi.fn(),
  applyCaseImport: vi.fn(),
  parseCaseImport: vi.fn(),
}));
vi.mock("./OperationalCostForm", () => ({ OperationalCostForm: () => null }));
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LegalReadinessPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
    client,
  };
}
const metric = {
  tenant_id: "a",
  user_id: "owner",
  measured_at: "2026-09-12T12:00:00Z",
  case_count: 2,
  active_cases: 1,
  waiting_cases: 1,
  closed_cases: 0,
  overdue_next_actions: 0,
  ir_visible_cases: 1,
  ir_claims: 1,
  ir_received_brl: "170.00",
  ir_recognized_by_claim_brl: "200.00",
  ir_cessation_verified_sources: 0,
  storage_visible_bytes: 100,
  cost_totals: [{ kind: "estimate", currency: "BRL", amount: "12.34" }],
  ir_warning: "Reconhecido pode ter sobreposição.",
  cost_warning: "Ausência não significa zero.",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({
    enabled: true,
    user_id: "owner",
    tenant_id: "a",
    can_create: true,
  });
  mocks.metrics.mockResolvedValue(metric);
  mocks.cases.mockResolvedValue({ items: [], total: 0 });
});
describe("operational metrics", () => {
  it("separates received, recognized and estimated costs", async () => {
    mount();
    expect(await screen.findByText("170.00")).toBeInTheDocument();
    expect(screen.getByText("200.00")).toBeInTheDocument();
    expect(screen.getByText(/Estimativa · BRL 12.34/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Efetivo documentado · BRL/),
    ).not.toBeInTheDocument();
  });
  it("does not query data when legal feature is off", async () => {
    mocks.workspace.mockResolvedValue({ enabled: false });
    mount();
    await screen.findByText(/Habilite a área jurídica/);
    expect(mocks.metrics).not.toHaveBeenCalled();
    expect(mocks.cases).not.toHaveBeenCalled();
  });
  it("hides prior metrics on refetch denial", async () => {
    const { client } = mount();
    await screen.findByText("170.00");
    mocks.metrics.mockRejectedValue(new Error("Access denied"));
    await client.invalidateQueries({
      queryKey: ["legal", "owner", "readiness"],
    });
    await waitFor(() =>
      expect(screen.queryByText("170.00")).not.toBeInTheDocument(),
    );
  });
});
