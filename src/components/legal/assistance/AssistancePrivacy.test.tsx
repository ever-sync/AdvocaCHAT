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
import type {
  AssistanceReadPage,
  AssistanceTextVersion,
} from "@/types/legal-assistance";
import type { LegalCaseDocument } from "@/types/legal";
import type { AssistanceProps } from "./assistance-ui";
const fake = vi.hoisted(() => ({
  context: vi.fn(),
  pages: vi.fn(),
  read: vi.fn(),
  original: vi.fn(),
  create: vi.fn(),
  review: vi.fn(),
  submit: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/lib/api/legal-assistance", () => ({
  getAssistanceContext: fake.context,
  listAssistanceTextPages: fake.pages,
  readAssistanceTextPage: fake.read,
  readAssistanceOriginal: fake.original,
  createAssistanceTextVersion: fake.create,
  reviewAssistanceTextPages: fake.review,
  submitAssistanceText: fake.submit,
  revokeAssistanceText: fake.revoke,
}));
import LegalAssistanceWorkspace from "./LegalAssistanceWorkspace";
import { AssistanceDialog } from "./AssistanceShared";
import {
  AssistanceTextReader,
  AssistanceTranscriptionDialog,
} from "./AssistanceTextReader";
const version: AssistanceTextVersion = {
  id: "version",
  tenant_id: "tenant",
  case_id: "case",
  category: "restricted",
  created_by: "owner",
  created_at: "2026-09-11T12:00:00Z",
  document_id: "doc",
  source_sha256: "a".repeat(64),
  version_number: 1,
  mode: "ocr",
  previous_version_id: null,
  ocr_job_id: "job",
  pages_total: 3,
  completeness: "partial",
  engine: {},
  state: "in_review",
  note: "",
  reviewed_by: null,
  reviewed_at: null,
  review_note: "",
};
const page: AssistanceReadPage = {
  version,
  is_current: true,
  page: {
    id: "page2",
    tenant_id: "tenant",
    case_id: "case",
    version_id: "version",
    category: "restricted",
    page_number: 2,
    page_status: "recognized",
    confidence_mean: "88.00",
    width: 100,
    height: 200,
    coordinate_system: "rendered_pixels",
    review_state: "unreviewed",
    reviewed_by: null,
    reviewed_at: null,
    text: "Conteúdo médico fiscal privado sintético",
    words: [],
    review_note: "",
  },
};
const original: LegalCaseDocument = {
  id: "doc",
  case_id: "case",
  category: "medical",
  display_name: "Documento privado sintético",
  file_name: "teste.pdf",
  mime_type: "application/pdf",
  size_bytes: 100,
  status: "ready",
  storage_path: "tenant/case/doc-synthetic",
  sha256: "a".repeat(64),
  uploaded_by: "owner",
  retention_hold: false,
  created_at: "2026-09-11T12:00:00Z",
};
const props = {
  workspace: { enabled: true, user_id: "member", tenant_id: "tenant" },
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" },
  canEdit: true,
  member: {
    profile_id: "member",
    can_edit: true,
    can_view_medical: true,
    can_view_fiscal: true,
  },
  members: [],
  context: {
    tenant_id: "tenant",
    user_id: "member",
    can_edit: true,
    can_review: true,
    can_manage: false,
  },
} as unknown as AssistanceProps;
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function reader(p: AssistanceProps, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <AssistanceTextReader
        props={p}
        version={version}
        document={original}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.pages.mockResolvedValue({ items: [page.page], has_more: false });
  fake.read.mockResolvedValue(page);
});
it("loads page text only after selection and removes the cached page after known ACL revocation", async () => {
  const cache = client(),
    view = render(reader(props, cache));
  await screen.findByRole("button", { name: /Página 2/ });
  expect(fake.read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Página 2/ }));
  await screen.findByText(page.page.text!);
  expect(fake.review).not.toHaveBeenCalled();
  view.rerender(
    reader(
      { ...props, member: { ...props.member!, can_view_fiscal: false } },
      cache,
    ),
  );
  expect(screen.queryByText(page.page.text!)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Confirmar revisão desta página" }),
  ).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("discards a late original before creating a download after access is revoked", async () => {
  let resolve!: (blob: Blob) => void;
  fake.original.mockReturnValue(
    new Promise<Blob>((r) => {
      resolve = r;
    }),
  );
  const objectUrl = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = objectUrl;
      static revokeObjectURL = vi.fn();
    },
  );
  const cache = client(),
    view = render(reader(props, cache));
  fireEvent.click(await screen.findByRole("button", { name: /Página 2/ }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Baixar original para conferir",
    }),
  );
  await waitFor(() => expect(fake.original).toHaveBeenCalledOnce());
  view.rerender(
    reader(
      { ...props, member: { ...props.member!, can_view_fiscal: false } },
      cache,
    ),
  );
  await act(async () => resolve(new Blob(["bytes privados sintéticos"])));
  expect(objectUrl).not.toHaveBeenCalled();
});
it("closes an open page approval when the refreshed version becomes stale", async () => {
  const cache = client();
  render(reader(props, cache));
  fireEvent.click(await screen.findByRole("button", { name: /Página 2/ }));
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Confirmar revisão desta página",
    }),
  );
  expect(
    screen.getByRole("button", { name: "Confirmar página conferida" }),
  ).toBeTruthy();
  fake.read.mockResolvedValue({ ...page, is_current: false });
  await act(async () => {
    await cache.invalidateQueries();
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Confirmar página conferida" }),
    ).toBeNull(),
  );
  expect(fake.review).not.toHaveBeenCalled();
});
it("preserves every previously transcribed page when saving a correction and leaves unprocessed pages absent", async () => {
  const second = {
    ...page,
    page: {
      ...page.page,
      id: "page3",
      page_number: 3,
      text: "Segundo trecho original",
    },
  };
  fake.pages.mockResolvedValue({
    items: [
      page.page,
      second.page,
      {
        ...page.page,
        id: "page1",
        page_number: 1,
        page_status: "not_processed",
      },
    ],
    has_more: false,
  });
  fake.read.mockImplementation((_version: string, number: number) =>
    Promise.resolve(number === 2 ? page : second),
  );
  fake.create.mockResolvedValue({ ...version, version_number: 2 });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client()}>
      <AssistanceTranscriptionDialog
        props={props}
        document={original}
        previous={version}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  const textarea = await screen.findByLabelText("Texto da página 2");
  fireEvent.change(textarea, {
    target: { value: "Trecho corrigido após leitura do original" },
  });
  fireEvent.change(
    screen.getByLabelText("Fundamento da transcrição ou correção"),
    {
      target: {
        value: "Correção sintética de uma página, preservando o restante.",
      },
    },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Salvar nova versão não revisada" }),
  );
  await waitFor(() => expect(fake.create).toHaveBeenCalledOnce());
  expect(fake.create.mock.calls[0][1].pages).toEqual([
    { page_number: 2, text: "Trecho corrigido após leitura do original" },
    { page_number: 3, text: "Segundo trecho original" },
  ]);
  expect(fake.create.mock.calls[0][1].pages_total).toBe(3);
  expect(fake.create.mock.calls[0][1].previous_version_id).toBe(version.id);
  expect(fake.review).not.toHaveBeenCalled();
});

it("submits only the explicit inner action when a confirmation is opened over an editor", async () => {
  const saveManual = vi.fn(async () => {}),
    requestAi = vi.fn(async () => {});
  render(
    <AssistanceDialog
      title="Rascunho"
      description="Editor"
      onClose={vi.fn()}
      onSubmit={saveManual}
      actionLabel="Salvar redação manual"
    >
      <AssistanceDialog
        title="Confirmar solicitação"
        description="Consumo do provedor"
        onClose={vi.fn()}
        onSubmit={requestAi}
        actionLabel="Confirmar geração"
      >
        <p>Fontes sintéticas</p>
      </AssistanceDialog>
    </AssistanceDialog>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirmar geração" }));
  await waitFor(() => expect(requestAi).toHaveBeenCalledOnce());
  expect(saveManual).not.toHaveBeenCalled();
});

it("does not fetch assistance for a case outside the physical workspace or for a revoked member", () => {
  const cache = client();
  const view = render(
    <QueryClientProvider client={cache}>
      <LegalAssistanceWorkspace
        {...props}
        workspace={{ ...props.workspace, tenant_id: "other-tenant" }}
      />
    </QueryClientProvider>,
  );
  expect(fake.context).not.toHaveBeenCalled();
  expect(screen.queryByRole("tablist")).toBeNull();
  view.rerender(
    <QueryClientProvider client={cache}>
      <LegalAssistanceWorkspace {...props} member={undefined} />
    </QueryClientProvider>,
  );
  expect(fake.context).not.toHaveBeenCalled();
  expect(screen.queryByRole("tablist")).toBeNull();
});
