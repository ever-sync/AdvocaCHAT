import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import type { DiligenceGrant, DiligenceRead } from "./diligence-types";
import { portalRequestScope } from "./request-scope";
const fake = vi.hoisted(() => ({
  access: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./api", () => ({
  diligenceAccess: fake.access,
  downloadDiligenceDocument: fake.download,
  uploadDiligenceDocument: fake.upload,
  PortalApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("./auth-context", () => ({
  usePortalAuth: () => ({
    session: { user: { id: "external" } },
    loading: false,
  }),
}));
import { PortalApiError } from "./api";
import { DiligenceDetail, DiligenceWorkspace } from "./DiligenceWorkspace";
const grant: DiligenceGrant = {
  grant_id: "grant",
  title: "Diligência sintética",
  category: "medical",
  due_at: null,
  expires_at: "2099-01-01T00:00:00Z",
  state: "active",
  scopes: [
    "instruction:read",
    "files:read",
    "delivery:upload",
    "message:write",
  ],
};
const data: DiligenceRead = {
  grant: { ...grant, id: grant.grant_id },
  instructions: "<script>conteúdo clínico sintético</script>",
  documents: [
    {
      id: "doc",
      file_name: "prova.txt",
      mime_type: "text/plain",
      size_bytes: 8,
      sha256: "a".repeat(64),
    },
  ],
  deliveries: [],
  messages: [],
};
function cache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}
function wrapper(children: React.ReactNode, client = cache()) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  portalRequestScope.invalidate();
  fake.access.mockResolvedValue(data);
  fake.upload.mockResolvedValue({ state: "submitted" });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: fake.save,
  });
});
it("renders instructions as escaped text and the delivery remains pending review", async () => {
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  await screen.findByText(data.instructions!);
  expect(document.querySelector("script")).toBeNull();
  expect(fake.access).toHaveBeenCalledWith(
    { action: "read", grant_id: "grant" },
    expect.any(AbortSignal),
  );
  fireEvent.change(screen.getByLabelText("Arquivo da diligência"), {
    target: {
      files: [
        new File(["evidence"], "comprovante.txt", { type: "text/plain" }),
      ],
    },
  });
  fireEvent.change(screen.getByLabelText("Descrição do comprovante"), {
    target: { value: "Comprovante sintético" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Entregar comprovante" })
      .closest("form")!,
  );
  await screen.findByText(/Comprovante recebido para conferência/);
  expect(fake.upload).toHaveBeenCalledOnce();
  expect(fake.access.mock.calls.every(([body]) => body.action === "read")).toBe(
    true,
  );
  expect(screen.queryByText("Diligência concluída")).not.toBeInTheDocument();
});
it("retains upload idempotency across an ambiguous failure and a manual retry", async () => {
  fake.upload.mockRejectedValueOnce(
    new Error("Resposta incerta. Atualize a lista."),
  );
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  await screen.findByText(data.instructions!);
  fireEvent.change(screen.getByLabelText("Arquivo da diligência"), {
    target: {
      files: [
        new File(["evidence"], "comprovante.txt", { type: "text/plain" }),
      ],
    },
  });
  fireEvent.change(screen.getByLabelText("Descrição do comprovante"), {
    target: { value: "Prova" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Entregar comprovante" })
      .closest("form")!,
  );
  await screen.findByText("Resposta incerta. Atualize a lista.");
  expect(fake.upload).toHaveBeenCalledTimes(1);
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Entregar comprovante" })
      .closest("form")!,
  );
  await waitFor(() => expect(fake.upload).toHaveBeenCalledTimes(2));
  expect(fake.upload.mock.calls[0][3]).toBe(fake.upload.mock.calls[1][3]);
});
it("known scope removal immediately hides instructions and actions despite older read response", async () => {
  const client = cache();
  const view = render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
      client,
    ),
  );
  await screen.findByText(data.instructions!);
  fake.access.mockImplementation(() => new Promise(() => undefined));
  view.rerender(
    wrapper(
      <DiligenceDetail
        grant={{ ...grant, scopes: [] }}
        identityId="external"
        fingerprint="two"
      />,
      client,
    ),
  );
  expect(screen.queryByText(data.instructions!)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Baixar arquivo" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText("Arquivo da diligência"),
  ).not.toBeInTheDocument();
});
it("leaving the view drops a download that finishes later", async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  fake.download.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar arquivo" }),
  );
  await waitFor(() => expect(fake.download).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () =>
    resolve({ blob: new Blob(["private"]), filename: "private.txt" }),
  );
  expect(fake.save).not.toHaveBeenCalled();
});
it("logout invalidates a delayed download before browser save", async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  fake.download.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar arquivo" }),
  );
  portalRequestScope.invalidate();
  await act(async () =>
    resolve({ blob: new Blob(["private"]), filename: "private.txt" }),
  );
  expect(fake.save).not.toHaveBeenCalled();
});
it("authorization refusal hides all previously read content and does not save bytes", async () => {
  fake.download.mockRejectedValue(new PortalApiError(403, "Acesso revogado"));
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  await screen.findByText(data.instructions!);
  fireEvent.click(screen.getByRole("button", { name: "Baixar arquivo" }));
  await screen.findByText(/O acesso a esta diligência foi encerrado/);
  expect(screen.queryByText(data.instructions!)).not.toBeInTheDocument();
  expect(fake.save).not.toHaveBeenCalled();
});
it("wrong grant response or expired grant never renders instruction text", async () => {
  fake.access.mockResolvedValue({
    ...data,
    grant: { ...data.grant, id: "other" },
  });
  const view = render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
    ),
  );
  await screen.findByText(/O acesso foi alterado/);
  expect(screen.queryByText(data.instructions!)).not.toBeInTheDocument();
  view.rerender(
    wrapper(
      <DiligenceDetail
        grant={{ ...grant, expires_at: "2000-01-01T00:00:00Z" }}
        identityId="external"
        fingerprint="two"
      />,
    ),
  );
  expect(screen.queryByText(data.instructions!)).not.toBeInTheDocument();
});
it("revoked grants disappear from the external workspace without requesting a case or tenant", async () => {
  fake.access.mockResolvedValue({
    identity_id: "external",
    status: "active",
    diligences: [{ ...grant, state: "revoked" }],
  });
  render(
    <MemoryRouter initialEntries={["/portal/diligencias/grant"]}>
      <QueryClientProvider client={cache()}>
        <Routes>
          <Route
            path="/portal/diligencias/:grantId"
            element={<DiligenceWorkspace login={<p>Login</p>} />}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await screen.findByText(/Esta diligência não está disponível/);
  expect(fake.access).toHaveBeenCalledTimes(1);
  expect(fake.access.mock.calls[0][0]).toEqual({ action: "context" });
});
it("drops a pending download when a refreshed read refuses authorization", async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  fake.download.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const client = cache();
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
      client,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar arquivo" }),
  );
  fake.access.mockRejectedValue(
    new PortalApiError(403, "Autorização alterada"),
  );
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText("Autorização alterada");
  await act(async () => {
    resolve({ blob: new Blob(["private"]), filename: "private.txt" });
  });
  expect(fake.save).not.toHaveBeenCalled();
});
it("drops pending download bytes after files scope is withdrawn by a fresh detail response", async () => {
  let resolve!: (value: { blob: Blob; filename: string }) => void;
  fake.download.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const client = cache();
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
      client,
    ),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar arquivo" }),
  );
  fake.access.mockResolvedValue({
    ...data,
    grant: { ...data.grant, scopes: ["instruction:read"] },
  });
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Baixar arquivo" })).toBeNull(),
  );
  await act(async () => {
    resolve({ blob: new Blob(["private"]), filename: "private.txt" });
  });
  expect(fake.save).not.toHaveBeenCalled();
});
it("does not repopulate upload success after an authorization error and subsequent recovery", async () => {
  let resolve!: (value: { state: string }) => void;
  fake.upload.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const client = cache();
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
      client,
    ),
  );
  await screen.findByText(data.instructions!);
  fireEvent.change(screen.getByLabelText("Arquivo da diligência"), {
    target: {
      files: [new File(["evidence"], "prova.txt", { type: "text/plain" })],
    },
  });
  fireEvent.change(screen.getByLabelText("Descrição do comprovante"), {
    target: { value: "Prova sintética" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Entregar comprovante" })
      .closest("form")!,
  );
  await waitFor(() => expect(fake.upload).toHaveBeenCalledOnce());
  fake.access.mockRejectedValue(
    new PortalApiError(403, "Autorização alterada"),
  );
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText("Autorização alterada");
  fake.access.mockResolvedValue(data);
  await act(async () => {
    await client.invalidateQueries();
  });
  await screen.findByText(data.instructions!);
  const calls = fake.access.mock.calls.length;
  await act(async () => {
    resolve({ state: "submitted" });
  });
  expect(
    screen.queryByText(/Comprovante recebido para conferência/),
  ).toBeNull();
  expect(fake.access).toHaveBeenCalledTimes(calls);
});
it("does not report a late reply after its write scope is removed", async () => {
  let resolve!: (value: { id: string }) => void;
  fake.access.mockImplementation((body: { action: string }) =>
    body.action === "reply"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(data),
  );
  const client = cache();
  render(
    wrapper(
      <DiligenceDetail grant={grant} identityId="external" fingerprint="one" />,
      client,
    ),
  );
  await screen.findByText(data.instructions!);
  fireEvent.change(screen.getByLabelText("Nova observação"), {
    target: { value: "Observação sintética" },
  });
  fireEvent.submit(
    screen
      .getByRole("button", { name: "Registrar observação" })
      .closest("form")!,
  );
  await waitFor(() =>
    expect(
      fake.access.mock.calls.some(([body]) => body.action === "reply"),
    ).toBe(true),
  );
  fake.access.mockResolvedValue({
    ...data,
    grant: { ...data.grant, scopes: ["instruction:read"] },
  });
  await act(async () => {
    await client.invalidateQueries();
  });
  await waitFor(() =>
    expect(screen.queryByLabelText("Nova observação")).toBeNull(),
  );
  const calls = fake.access.mock.calls.length;
  await act(async () => {
    resolve({ id: "reply" });
  });
  expect(
    screen.queryByText("Observação registrada nesta diligência."),
  ).toBeNull();
  expect(fake.access).toHaveBeenCalledTimes(calls);
});
