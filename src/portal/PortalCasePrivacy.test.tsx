import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { PortalCase, PortalMembership } from "./types";
const fake = vi.hoisted(() => ({
  access: vi.fn(),
  download: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./api", () => ({
  portalAccess: fake.access,
  downloadPortalDocument: fake.download,
  downloadPortalExport: vi.fn(),
  uploadPortalDocument: vi.fn(),
  PortalApiError: class extends Error {
    status = 403;
  },
}));
vi.mock("./format", async (original) => ({
  ...(await original<object>()),
  portalDownload: fake.save,
}));
import { PortalCaseView } from "./PortalCaseView";
const membership: PortalMembership = {
  id: "member",
  case_id: "case",
  access_kind: "client",
  scopes: ["case_summary:read", "documents:read"],
  allow_medical: true,
  allow_fiscal: false,
  revision: 1,
  expires_at: "2099-01-01T00:00:00Z",
  public_title: "Atendimento sintético",
};
const data: PortalCase = {
  membership,
  publications: [
    {
      id: "pub",
      category: "medical",
      publication_kind: "update",
      title: "Laudo sintético privado",
      body: "Conteúdo clínico sintético",
      created_at: "2026-01-01",
      reviewed_at: "2026-01-01",
    },
  ],
  agenda: [],
  documents: [
    {
      id: "doc-release",
      document_id: "doc",
      category: "medical",
      display_name: "Arquivo clínico sintético",
      file_name: "sintetico.txt",
      mime_type: "text/plain",
      size_bytes: 5,
      sha256: "abc",
      purpose: "Conferência sintética",
      expires_at: "2099-01-01T00:00:00Z",
    },
  ],
  requests: [],
  messages: [],
  exports: [],
};
function wrapper(children: React.ReactNode, cache: QueryClient) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.access.mockResolvedValue(data);
});
it("hides previously cached medical content as soon as the known membership loses medical permission", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    wrapper(
      <PortalCaseView membership={membership} identityId="external" />,
      cache,
    ),
  );
  await screen.findByText("Laudo sintético privado");
  fake.access.mockImplementation(() => new Promise(() => {}));
  view.rerender(
    wrapper(
      <PortalCaseView
        membership={{ ...membership, allow_medical: false, revision: 2 }}
        identityId="external"
      />,
      cache,
    ),
  );
  expect(screen.queryByText("Laudo sintético privado")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Conteúdo clínico sintético"),
  ).not.toBeInTheDocument();
});
it("does not save a document response that resolves after leaving or losing the case view", async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  fake.download.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    wrapper(
      <PortalCaseView membership={membership} identityId="external" />,
      cache,
    ),
  );
  await screen.findByText("Laudo sintético privado");
  fireEvent.click(screen.getByRole("tab", { name: "Documentos" }));
  fireEvent.click(screen.getByRole("button", { name: "Baixar" }));
  await waitFor(() => expect(fake.download).toHaveBeenCalled());
  view.unmount();
  await act(async () =>
    resolve({
      blob: new Blob(["synthetic-private"]),
      filename: "synthetic.txt",
    }),
  );
  expect(fake.save).not.toHaveBeenCalled();
});
