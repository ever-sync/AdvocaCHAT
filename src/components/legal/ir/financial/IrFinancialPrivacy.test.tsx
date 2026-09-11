import { readIrCalculationReport } from "@/lib/api/legal-ir-calculations";
import { downloadIrCalculationReport } from "@/lib/legal-ir-report";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IrTaxImports } from "./IrTaxImports";
import { IrCalculations } from "./IrCalculations";
import { IrReconciliation } from "./IrReconciliation";
import {
  financialKey,
  financialWorkspaceKey,
  type FinancialPanelProps,
} from "./financial-ui";
vi.mock("@/lib/api/legal", () => ({
  listLegalDocuments: vi.fn(),
  listLegalParties: vi.fn(),
  uploadLegalDocument: vi.fn(),
  downloadLegalDocument: vi.fn(),
}));
vi.mock("@/lib/api/legal-ir", () => ({
  listIrIncomeSources: vi.fn(),
  listIrPayers: vi.fn(),
  listIrAssessmentVersions: vi.fn(),
}));
vi.mock("@/lib/api/legal-ir-calculations", () => ({
  listIrTaxImports: vi.fn(),
  listIrTaxImportReviews: vi.fn(),
  listIrTaxEntries: vi.fn(),
  createIrTaxImport: vi.fn(),
  updateIrTaxEntry: vi.fn(),
  reviewIrTaxImport: vi.fn(),
  listIrCalculationVersions: vi.fn(),
  listIrPeriodReviews: vi.fn(),
  listIrTaxParameterVersions: vi.fn(),
  createIrCalculationVersion: vi.fn(),
  reviewIrCalculation: vi.fn(),
  submitIrCalculationReview: vi.fn(),
  readIrCalculationReport: vi.fn(),
  listIrClaims: vi.fn(),
  listIrPaymentPrincipals: vi.fn(),
  listIrPrincipalAllocations: vi.fn(),
  listIrRecoveries: vi.fn(),
  allocateIrPrincipal: vi.fn(),
  createIrPaymentPrincipal: vi.fn(),
  recordIrRecovery: vi.fn(),
  releaseIrAllocation: vi.fn(),
  verifyIrPaymentPrincipal: vi.fn(),
}));
vi.mock("@/lib/legal-ir-report", () => ({
  downloadIrCalculationReport: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const props: FinancialPanelProps = {
  legalCase: {
    id: "case",
    owner_id: "owner",
  } as FinancialPanelProps["legalCase"],
  workspace: {
    user_id: "owner",
    tenant_id: "tenant",
    collaborators: [],
  } as unknown as FinancialPanelProps["workspace"],
  canEdit: true,
  ir: {
    can_fiscal: true,
    can_medical: true,
    latest_assessment_id: null,
    assessment_is_current: null,
  } as FinancialPanelProps["ir"],
  financial: {
    can_fiscal: true,
    can_calculate: true,
    operational_timezone: "America/Sao_Paulo",
    calculation_states: [],
    principal_balances: [
      {
        id: "principal",
        principal: "99999999999999.99",
        allocated: "10.00",
        received: "1.00",
        available: "99999999999988.99",
      },
    ],
    overlaps: [],
  },
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  for (const key of [
    "imports",
    "import-reviews",
    "entries",
    "documents",
    "sources",
    "payers",
    "calculations",
    "periods",
    "assessments",
    "principals",
    "parties",
    "claims",
    "allocations",
    "recoveries",
  ])
    client.setQueryData(financialKey(props, key), []);
  client.setQueryData(financialWorkspaceKey(props, "parameters"), []);
  return {
    client,
    wrap: (children: ReactNode) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
it("removes fiscal import cache and an open CSV dialog when current fiscal access is revoked", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "imports"), [
    {
      id: "import",
      title: "Informe fiscal privado",
      status: "draft",
      created_at: "2026-09-11",
    },
  ]);
  const view = render(wrap(<IrTaxImports {...props} />));
  expect(screen.getByText("Informe fiscal privado")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Nova importação" }));
  view.rerender(
    wrap(<IrTaxImports {...props} ir={{ ...props.ir, can_fiscal: false }} />),
  );
  expect(screen.queryByText("Informe fiscal privado")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(client.getQueryData(financialKey(props, "imports"))).toHaveLength(1);
});
it("hides combined calculation content and draft controls when medical access is revoked", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "calculations"), [
    {
      id: "calculation",
      version_number: 1,
      calendar_year: 2025,
      periodicity: "annual",
      deduction_mode: "legal",
      tax_residency: "resident",
      status: "incomplete",
      refusals: [{ code: "x", message: "Fundamento sensível da recusa" }],
      result: { monetary_update: { reason: "Sem atualização" } },
      snapshot: {},
      adjustments: [],
      completeness_note: "",
    },
  ]);
  const view = render(wrap(<IrCalculations {...props} />));
  expect(screen.getByText("Fundamento sensível da recusa")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Novo cenário" }));
  view.rerender(
    wrap(
      <IrCalculations {...props} ir={{ ...props.ir, can_medical: false }} />,
    ),
  );
  expect(
    screen.queryByText("Fundamento sensível da recusa"),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("keeps exact neutral fiscal balances but removes cached claims and receipts when dual access is lost", () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "principals"), [
    {
      id: "principal",
      amount: "99999999999999.99",
      payment_reference: "Pagamento fiscal",
      status: "verified",
      paid_on: "2026-09-01",
      period_start: "2025-01-01",
      period_end: "2025-12-31",
      proof_line: "1",
    },
  ]);
  client.setQueryData(financialKey(props, "claims"), [
    { id: "claim", title: "Estratégia jurídica protegida" },
  ]);
  client.setQueryData(financialKey(props, "allocations"), [
    {
      id: "allocation",
      principal_id: "principal",
      claim_id: "claim",
      amount: "11.00",
      status: "active",
      reason: "Reserva protegida",
    },
  ]);
  client.setQueryData(financialKey(props, "recoveries"), [
    {
      id: "receipt",
      allocation_id: "allocation",
      amount: "1.00",
      received_on: "2026-09-01",
      channel: "source_refund",
      reference: "Recebimento protegido",
      proof_line: "1",
    },
  ]);
  const view = render(wrap(<IrReconciliation {...props} />));
  expect(screen.getByText(/Estratégia jurídica protegida/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Conciliar entrada" }));
  view.rerender(
    wrap(
      <IrReconciliation {...props} ir={{ ...props.ir, can_medical: false }} />,
    ),
  );
  expect(
    screen.queryByText(/Estratégia jurídica protegida/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Recebimento protegido/)).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("R$ 99.999.999.999.999,99")).toBeInTheDocument();
  expect(screen.getByText("R$ 99.999.999.999.988,99")).toBeInTheDocument();
});

it("keeps the current CSV original paired with its own preview when file reads finish out of order", async () => {
  const { wrap } = setup();
  render(wrap(<IrTaxImports {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Nova importação" }));
  let finishA!: (value: ArrayBuffer) => void;
  let finishB!: (value: ArrayBuffer) => void;
  const a = new File(["A"], "a.csv", { type: "text/csv" }),
    b = new File(["B"], "b.csv", { type: "text/csv" });
  Object.defineProperty(a, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        finishA = resolve;
      }),
  });
  Object.defineProperty(b, "arrayBuffer", {
    value: () =>
      new Promise<ArrayBuffer>((resolve) => {
        finishB = resolve;
      }),
  });
  const input = screen.getByLabelText("Arquivo CSV em UTF-8");
  fireEvent.change(input, { target: { files: [a] } });
  fireEvent.change(input, { target: { files: [b] } });
  await act(async () => {
    finishB(
      new TextEncoder().encode(
        "gross;taxable;withheld;legal_deductions\n200,00;200,00;20,00;0,00\n",
      ).buffer,
    );
  });
  expect(screen.getAllByText("R$ 200,00")).toHaveLength(2);
  await act(async () => {
    finishA(
      new TextEncoder().encode(
        "gross;taxable;withheld;legal_deductions\n100,00;100,00;10,00;0,00\n",
      ).buffer,
    );
  });
  expect(screen.getAllByText("R$ 200,00")).toHaveLength(2);
  expect(screen.queryByText("R$ 100,00")).not.toBeInTheDocument();
});

it("does not download an in-flight report after the current authorization was revoked", async () => {
  const { client, wrap } = setup();
  client.setQueryData(financialKey(props, "calculations"), [
    {
      id: "calculation",
      version_number: 1,
      calendar_year: 2025,
      periodicity: "annual",
      deduction_mode: "legal",
      tax_residency: "resident",
      status: "incomplete",
      refusals: [{ code: "x", message: "Recusa" }],
      result: { monetary_update: { reason: "Sem atualização" } },
      snapshot: {},
      adjustments: [],
      completeness_note: "",
    },
  ]);
  let finish!: (
    value: Awaited<ReturnType<typeof readIrCalculationReport>>,
  ) => void;
  vi.mocked(readIrCalculationReport).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(wrap(<IrCalculations {...props} />));
  fireEvent.click(screen.getByRole("button", { name: "Baixar memória" }));
  expect(readIrCalculationReport).toHaveBeenCalledWith("calculation");
  view.rerender(
    wrap(
      <IrCalculations {...props} ir={{ ...props.ir, can_medical: false }} />,
    ),
  );
  await act(async () => {
    finish({} as Awaited<ReturnType<typeof readIrCalculationReport>>);
  });
  expect(downloadIrCalculationReport).not.toHaveBeenCalled();
});
