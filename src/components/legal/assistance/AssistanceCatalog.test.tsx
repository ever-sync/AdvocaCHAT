import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistanceKnowledgeRead } from "@/types/legal-assistance";
import type { AssistanceProps } from "./assistance-ui";
const fake = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  review: vi.fn(),
  docs: vi.fn(),
  configure: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/api/legal-assistance", () => ({
  listAssistance: fake.list,
  readAssistanceKnowledge: fake.read,
  reviewAssistanceKnowledge: fake.review,
  configureAssistanceAi: fake.configure,
  createAssistanceKnowledge: fake.create,
  configureAssistanceOcr: vi.fn(),
  createAssistancePolicy: vi.fn(),
  reviewAssistancePolicy: vi.fn(),
}));
vi.mock("@/lib/api/legal", () => ({ listLegalDocuments: fake.docs }));
import AssistanceKnowledge from "./AssistanceKnowledge";
import AssistanceSettings from "./AssistanceSettings";
import { AssistanceKnowledgeForm } from "./AssistanceKnowledgeForm";
import {
  assistancePolicyDecimal,
  assistancePolicyUrl,
} from "./AssistanceSettingsValidation";

const reference: AssistanceKnowledgeRead = {
  is_current: false,
  version: {
    id: "knowledge",
    tenant_id: "tenant",
    knowledge_key: "source",
    source_sha256: "a".repeat(64),
    version_number: 1,
    title: "Referência sintética",
    kind: "note",
    source_url: "https://example.org/source",
    source_document_id: null,
    checked_on: "2026-09-11",
    version_note: "Origem conferida no ensaio",
    scope: "Escopo sintético",
    state: "draft",
    text: "<img src=x onerror=synthetic()> Referência privada",
    created_by: "owner",
    created_at: "2026-09-11T12:00:00Z",
    reviewed_by: null,
    reviewed_at: null,
    review_note: "",
  },
};
const props = {
  workspace: {
    enabled: true,
    user_id: "owner",
    tenant_id: "tenant",
    can_create: true,
  },
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" },
  canEdit: true,
  members: [],
  context: {
    tenant_id: "tenant",
    user_id: "owner",
    can_edit: true,
    can_review: true,
    can_manage: true,
    settings: {
      ocr_enabled: false,
      ocr_monthly_page_limit: 100,
      ocr_max_pages: 20,
      updated_at: "2026-09-11",
    },
    ocr_usage: { month: "2026-09-01", charged_pages: 0, monthly_limit: 100 },
    ai_connection: null,
    ai_usage: null,
  },
} as unknown as AssistanceProps;
function wrap(
  child: React.ReactNode,
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return <QueryClientProvider client={cache}>{child}</QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.list.mockResolvedValue({ items: [reference.version], has_more: false });
  fake.docs.mockResolvedValue([]);
  fake.read.mockResolvedValue(reference);
  fake.review.mockResolvedValue(reference.version);
});
afterEach(cleanup);

it("reads on demand, escapes content, requires explicit review and drops content after known access revocation", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(wrap(<AssistanceKnowledge {...props} />, cache));
  fireEvent.click(
    await screen.findByRole("button", { name: "Examinar referência" }),
  );
  await screen.findByText(reference.version.text);
  expect(document.querySelector("img")).toBeNull();
  expect(fake.review).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Revisar e aprovar" }));
  expect(
    screen.getByRole("button", { name: "Confirmar aprovação" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Justificativa da revisão"), {
    target: { value: "Fonte e escopo conferidos" },
  });
  fireEvent.click(
    screen.getByLabelText(
      "Examinei o texto, a origem, o escopo e as limitações desta versão",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Confirmar aprovação" }),
  ).not.toBeDisabled();
  view.rerender(
    wrap(
      <AssistanceKnowledge
        {...props}
        workspace={{ ...props.workspace, user_id: "outsider" }}
        context={{ ...props.context, user_id: "outsider" }}
      />,
      cache,
    ),
  );
  expect(screen.queryByText(reference.version.text)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Confirmar aprovação" }),
  ).toBeNull();
  expect(fake.review).not.toHaveBeenCalled();
});

it("hides a cached audited read after refresh rejects permission", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(<AssistanceKnowledge {...props} />, cache));
  fireEvent.click(
    await screen.findByRole("button", { name: "Examinar referência" }),
  );
  await screen.findByText(reference.version.text);
  fake.read.mockRejectedValue(new Error("permission denied"));
  await act(async () => {
    await cache.invalidateQueries();
  });
  await waitFor(() =>
    expect(screen.queryByText(reference.version.text)).toBeNull(),
  );
});

it("retains read-only consultation without mutation controls or provider calls", async () => {
  render(
    wrap(
      <AssistanceKnowledge
        {...props}
        workspace={{ ...props.workspace, can_create: false }}
        context={{ ...props.context, can_manage: false }}
      />,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Examinar referência" }),
  );
  await screen.findByText(reference.version.text);
  expect(screen.queryByRole("button", { name: "Nova referência" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Criar nova versão" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Revisar e aprovar" }),
  ).toBeNull();
  expect(fake.configure).not.toHaveBeenCalled();
});

it("copies content into a new draft without copying date, proof, or approval", () => {
  render(
    wrap(
      <AssistanceKnowledgeForm
        original={{
          ...reference.version,
          source_document_id: "unavailable",
          state: "approved",
        }}
        documents={[]}
        onClose={vi.fn()}
      />,
    ),
  );
  expect(screen.getByLabelText("Data de consulta da fonte")).toHaveValue("");
  expect(screen.getByLabelText("Prova documental geral")).toHaveValue("");
  expect(
    screen.getByLabelText(
      "Conferi que este conteúdo pode integrar a biblioteca do escritório",
    ),
  ).not.toBeChecked();
  expect(screen.getByLabelText("Texto da referência")).toHaveValue(
    reference.version.text,
  );
  expect(fake.create).not.toHaveBeenCalled();
});

it("never starts generation or fabricates rates in an unconfigured workspace", async () => {
  fake.list.mockResolvedValue({ items: [], has_more: false });
  render(wrap(<AssistanceSettings {...props} />));
  expect(
    screen.getByRole("button", { name: "Vincular política e habilitar" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Nova política de IA" }));
  expect(screen.getByLabelText("Identificador exato do modelo")).toHaveValue("");
  expect(fake.configure).not.toHaveBeenCalled();
});

it("keeps rate precision as decimal text and rejects ambiguous, zero, exponential and unsafe URL inputs", () => {
  expect(assistancePolicyDecimal("0,00000001", 8, 6)).toBe("0.00000001");
  expect(assistancePolicyDecimal("999999999.123456", 6, 9)).toBe(
    "999999999.123456",
  );
  for (const input of ["0", "-1", "1e4", "1.000,50", "NaN", "0.000000001"])
    expect(assistancePolicyDecimal(input, 8, 6)).toBeNull();
  expect(assistancePolicyUrl("https://example.org/source")).toBe(true);
  expect(assistancePolicyUrl("https://user:pass@example.org")).toBe(false);
  expect(assistancePolicyUrl("javascript:synthetic()")).toBe(false);
});
