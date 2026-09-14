import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IrEvidence } from "./IrEvidence";
import { IrChecklists } from "./IrChecklists";
import { IrAssessments } from "./IrAssessments";
import { irKey, irWorkspaceKey, type IrPanelProps } from "./ir-ui";

const assistanceApi = vi.hoisted(() => ({
  listAssistance: vi.fn(),
  listAssistanceTextPages: vi.fn(),
  readAssistanceTextPage: vi.fn(),
}));

vi.mock("@/lib/api/legal", () => ({
  listLegalDocuments: vi.fn(),
  downloadLegalDocument: vi.fn(),
}));
vi.mock("@/lib/api/legal-operations", () => ({
  listLegalDocumentRequests: vi.fn(),
}));
vi.mock("@/lib/api/legal-assistance", () => assistanceApi);
vi.mock("@/lib/api/legal-ir", () => ({
  listIrDocumentReviews: vi.fn(),
  listIrEvidenceEvents: vi.fn(),
  addIrEvidenceEvent: vi.fn(),
  recordIrDocumentReview: vi.fn(),
  listIrChecklistVersions: vi.fn(),
  listIrChecklistItems: vi.fn(),
  listIrPayers: vi.fn(),
  applyIrChecklist: vi.fn(),
  createIrChecklistVersion: vi.fn(),
  linkIrChecklistRequest: vi.fn(),
  waiveIrChecklistItem: vi.fn(),
  listIrAssessmentVersions: vi.fn(),
  listIrIncomeSources: vi.fn(),
  listIrRuleVersions: vi.fn(),
  createIrAssessmentVersion: vi.fn(),
  reviewIrAssessment: vi.fn(),
  submitIrAssessmentReview: vi.fn(),
}));

afterEach(cleanup);
const initial: IrPanelProps = {
  legalCase: { id: "case", owner_id: "owner" } as IrPanelProps["legalCase"],
  workspace: {
    user_id: "member",
    tenant_id: "workspace",
    can_create: false,
    collaborators: [],
  } as unknown as IrPanelProps["workspace"],
  canEdit: true,
  ir: {
    control: {
      case_id: "case",
      tenant_id: "workspace",
      input_revision: 1,
      workflow_status: "incomplete",
      updated_at: "2026-09-11T12:00:00Z",
    },
    can_fiscal: true,
    can_medical: true,
    can_assess: true,
    latest_assessment_id: null,
    assessment_is_current: null,
    checklist_states: [],
    representation_states: [],
  },
};
const restricted = {
  ...initial,
  ir: {
    ...initial.ir,
    can_medical: false,
    can_fiscal: false,
    can_assess: false,
  },
};
const client = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
const wrap = (queryClient: QueryClient, content: React.ReactNode) => (
  <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
);

it("hides cached medical evidence and clears an open protected draft when access is revoked", async () => {
  const queryClient = client();
  queryClient.setQueryData(irKey(initial, "documents"), [
    { id: "doc", category: "medical", display_name: "Arquivo médico privado" },
  ]);
  queryClient.setQueryData(irKey(initial, "evidence"), [
    {
      id: "fact",
      category: "medical",
      event_type: "diagnosis_reported",
      date_precision: "unknown",
      description: "Fato médico privado",
      created_by: "member",
    },
  ]);
  queryClient.setQueryData(irKey(initial, "document-reviews"), []);
  const view = render(wrap(queryClient, <IrEvidence {...initial} />));
  expect(screen.getByText("Fato médico privado")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Registrar fato" }));
  fireEvent.change(screen.getByLabelText("Tipo de fato"), {
    target: { value: "diagnosis_reported" },
  });
  fireEvent.change(
    screen.getByLabelText("Descrição do fato e de quem o informou"),
    { target: { value: "Rascunho médico privado" } },
  );
  view.rerender(wrap(queryClient, <IrEvidence {...restricted} />));
  await waitFor(() =>
    expect(screen.queryByText("Fato médico privado")).not.toBeInTheDocument(),
  );
  expect(screen.queryByText("Arquivo médico privado")).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue("Rascunho médico privado"),
  ).not.toBeInTheDocument();
  expect(queryClient.getQueryData(irKey(initial, "documents"))).toHaveLength(1);
});

it("mostra os indícios por página e exige que o advogado confirme o tipo", async () => {
  assistanceApi.listAssistance.mockResolvedValue({
    items: [
      {
        id: "version",
        document_id: "doc",
        is_current: true,
        state: "approved",
      },
    ],
    has_more: false,
  });
  assistanceApi.listAssistanceTextPages.mockResolvedValue({
    items: [{ page_number: 1 }, { page_number: 2 }],
    has_more: false,
  });
  assistanceApi.readAssistanceTextPage
    .mockResolvedValueOnce({
      page: {
        page_number: 1,
        page_status: "recognized",
        text: "Laudo médico. Paciente identificado. Histórico clínico.",
      },
    })
    .mockResolvedValueOnce({
      page: {
        page_number: 2,
        page_status: "recognized",
        text: "Conclusão. CRM/SP 123456. Assinado digitalmente em 10/09/2026.",
      },
    });
  const queryClient = client();
  const ownerProps = {
    ...initial,
    workspace: { ...initial.workspace, user_id: "owner" },
  };
  queryClient.setQueryData(irKey(ownerProps, "documents"), [
    {
      id: "doc",
      case_id: "case",
      category: "medical",
      display_name: "Documento médico",
    },
  ]);
  queryClient.setQueryData(irKey(ownerProps, "evidence"), []);
  queryClient.setQueryData(irKey(ownerProps, "document-reviews"), []);
  render(wrap(queryClient, <IrEvidence {...ownerProps} />));
  fireEvent.click(screen.getByRole("button", { name: /Conferir documento/ }));
  expect(
    await screen.findByText(/Provável laudo ou relatório médico/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Registro CRM identificável · página\(s\) 2/),
  ).toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "Registrar conferência" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Tipo confirmado pelo advogado"), {
    target: { value: "medical_report" },
  });
  fireEvent.change(
    screen.getByLabelText("Fundamento da conferência e pendências"),
    { target: { value: "Original conferido pelo responsável" } },
  );
  expect(submit).toBeEnabled();
});

it("hides cached restricted checklist items, payer names and open linking dialog after revocation", async () => {
  const queryClient = client();
  queryClient.setQueryData(irWorkspaceKey(initial, "checklist-versions"), []);
  queryClient.setQueryData(irKey(initial, "payers"), [
    { id: "payer", name: "Pagador fiscal privado" },
  ]);
  queryClient.setQueryData(irKey(initial, "checklist-items"), [
    {
      id: "medical-item",
      title: "Requisito médico privado",
      category: "medical",
      gating_stage: "intake",
      required: true,
      payer_id: null,
    },
    {
      id: "general-item",
      title: "Requisito geral",
      category: "general",
      gating_stage: "intake",
      required: true,
      payer_id: "payer",
    },
  ]);
  queryClient.setQueryData(irKey(initial, "checklist-requests"), [
    { id: "request", title: "Solicitação médica privada", category: "medical" },
  ]);
  const view = render(wrap(queryClient, <IrChecklists {...initial} />));
  expect(screen.getByText(/Pagador fiscal privado/)).toBeInTheDocument();
  fireEvent.click(
    screen.getAllByRole("button", { name: "Vincular solicitação" })[0],
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  view.rerender(wrap(queryClient, <IrChecklists {...restricted} />));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByText("Requisito médico privado"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Pagador fiscal privado/)).not.toBeInTheDocument();
  expect(screen.getByText("Requisito geral")).toBeInTheDocument();
});

it("does not render a cached combined assessment after either protected permission is revoked", () => {
  const queryClient = client();
  queryClient.setQueryData(irKey(initial, "assessments"), [
    {
      id: "analysis",
      version_number: 1,
      status: "draft",
      summary: "Análise privada combinada",
      strategy: "documents_first",
      source_proposals: [],
      snapshot: {},
    },
  ]);
  for (const key of ["incomes", "payers", "evidence", "documents"])
    queryClient.setQueryData(irKey(initial, key), []);
  queryClient.setQueryData(irWorkspaceKey(initial, "rules"), []);
  const view = render(wrap(queryClient, <IrAssessments {...initial} />));
  expect(screen.getByText("Análise privada combinada")).toBeInTheDocument();
  view.rerender(
    wrap(
      queryClient,
      <IrAssessments
        {...{
          ...initial,
          ir: { ...initial.ir, can_medical: false, can_assess: false },
        }}
      />,
    ),
  );
  expect(
    screen.queryByText("Análise privada combinada"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/É necessário acesso explícito às duas categorias/),
  ).toBeInTheDocument();
});
