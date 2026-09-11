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
import type { ExpansionProps } from "./expansion-ui";
import type {
  ExpansionActRead,
  ExpansionDiligenceRead,
  ExpansionMetadata,
} from "@/types/legal-expansion";
const fake = vi.hoisted(() => ({
  list: vi.fn(),
  actRead: vi.fn(),
  review: vi.fn(),
  attempt: vi.fn(),
  diligenceRead: vi.fn(),
  issue: vi.fn(),
  download: vi.fn(),
  context: vi.fn(),
}));
vi.mock("@/lib/api/legal-expansion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/legal-expansion")>()),
  listExpansion: fake.list,
  readExternalAct: fake.actRead,
  reviewExternalAct: fake.review,
  prepareExternalAttempt: fake.attempt,
  readDiligence: fake.diligenceRead,
  issueDiligenceLink: fake.issue,
  readDiligenceDocument: fake.download,
  getExpansionContext: fake.context,
}));
import ExpansionActs from "./ExpansionActs";
import ExpansionDiligences from "./ExpansionDiligences";
import ExpansionWorkspace from "./ExpansionWorkspace";
const props = {
  workspace: {
    enabled: true,
    user_id: "member",
    tenant_id: "tenant",
    collaborators: [],
  },
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
    external_execution_enabled: false,
  },
} as unknown as ExpansionProps;
const metadata: ExpansionMetadata = {
  id: "version",
  tenant_id: "tenant",
  case_id: "case",
  title: "Ato privado sintético",
  category: "restricted",
  state: "in_review",
  created_at: "2026-09-11T12:00:00Z",
  created_by: "owner",
  version_number: 1,
};
const actData = {
  version: {
    ...metadata,
    act_key: "act",
    act_kind: "petition",
    recipient: "Órgão fictício",
    channel: "Canal manual fictício",
    purpose: "<img src=x onerror=alert(1)> Conteúdo protegido",
    authority_basis: "Poder conferido apenas neste ensaio",
    checks: {
      documents_complete: true,
      recipient_verified: true,
      representation_reviewed: true,
      signature_checked: true,
      channel_authorized: true,
      legal_consequences_reviewed: true,
    },
    source_document_ids: [],
    review_note: "",
    state: "in_review",
  },
  is_current: true,
  missing: [],
  attempts: [],
  receipts: [],
} as unknown as ExpansionActRead;
const diligenceData = {
  version: {
    ...metadata,
    title: "Diligência privada sintética",
    diligence_key: "task",
    instructions: "Instrução restrita sintética",
    supervisor_id: "owner",
    expires_at: "2099-10-10T12:00:00Z",
    source_document_ids: [],
    state: "approved",
  },
  is_current: true,
  invites: [
    {
      id: "invite",
      version_id: "version",
      email: "synthetic@example.invalid",
      scopes: ["instruction:read"],
      state: "approved",
      expires_at: "2099-10-10T12:00:00Z",
    },
  ],
  grants: [],
  deliveries: [
    {
      id: "delivery",
      document_id: "doc",
      description: "Entrega privada sintética",
      state: "submitted",
    },
  ],
  messages: [],
} as unknown as ExpansionDiligenceRead;
function cache() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function renderWith(element: React.ReactNode, c: QueryClient) {
  return <QueryClientProvider client={c}>{element}</QueryClientProvider>;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.list.mockResolvedValue({ items: [metadata], has_more: false });
  fake.actRead.mockResolvedValue(actData);
  fake.diligenceRead.mockResolvedValue(diligenceData);
});
it("does not read private act content before an explicit action; escaped content disappears after known category revocation", async () => {
  const c = cache(),
    view = render(renderWith(<ExpansionActs {...props} />, c));
  await screen.findByRole("button", { name: "Conferir ato e recibos" });
  expect(fake.actRead).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Conferir ato e recibos" }),
  );
  await screen.findByText(actData.version.purpose);
  expect(document.querySelector("img")).toBeNull();
  view.rerender(
    renderWith(
      <ExpansionActs
        {...props}
        member={{ ...props.member!, can_view_fiscal: false }}
      />,
      c,
    ),
  );
  expect(screen.queryByText(actData.version.purpose)).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("removes a review dialog if the source snapshot becomes stale after opening it", async () => {
  const c = cache();
  render(renderWith(<ExpansionActs {...props} />, c));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir ato e recibos" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Revisar preparo interno" }),
  );
  await screen.findByRole("button", { name: "Confirmar preparo conferido" });
  fake.actRead.mockResolvedValue({ ...actData, is_current: false });
  await act(async () => {
    await c.invalidateQueries({ queryKey: ["legal"] });
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Confirmar preparo conferido" }),
    ).toBeNull(),
  );
  expect(fake.review).not.toHaveBeenCalled();
});
it("keeps uncertain attempts visible and does not offer or start another attempt", async () => {
  fake.actRead.mockResolvedValue({
    ...actData,
    version: { ...actData.version, state: "ready" },
    attempts: [
      {
        id: "attempt",
        version_id: "version",
        state: "unknown",
        note: "Resposta externa desconhecida",
        created_at: "2026-09-11T12:00:00Z",
      },
    ],
  });
  render(renderWith(<ExpansionActs {...props} />, cache()));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir ato e recibos" }),
  );
  await screen.findByText("Resposta externa desconhecida");
  expect(
    screen.queryByRole("button", { name: "Preparar tentativa manual" }),
  ).toBeNull();
  expect(fake.attempt).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "Declarar não enviado" }),
  ).toBeNull();
});
it("hides previously loaded content after an audited read fails", async () => {
  const c = cache();
  render(renderWith(<ExpansionActs {...props} />, c));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir ato e recibos" }),
  );
  await screen.findByText(actData.version.purpose);
  fake.actRead.mockRejectedValue(new Error("Prova indisponível"));
  await act(async () => {
    await c.invalidateQueries({ queryKey: ["legal"] });
  });
  await waitFor(() =>
    expect(screen.queryByText(actData.version.purpose)).toBeNull(),
  );
});
it("discards a delayed invite link after access is disabled and never exposes an auth credential", async () => {
  let resolve!: (v: {
    activation_path: string;
    expires_at: string;
    revision: number;
  }) => void;
  fake.issue.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const c = cache(),
    view = render(renderWith(<ExpansionDiligences {...props} />, c));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir diligência" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Gerar link de acesso" }),
  );
  await waitFor(() => expect(fake.issue).toHaveBeenCalledTimes(1));
  view.rerender(
    renderWith(
      <ExpansionDiligences
        {...props}
        workspace={{ ...props.workspace, enabled: false }}
      />,
      c,
    ),
  );
  await act(async () =>
    resolve({
      activation_path: "/portal/diligencias/ativar#invite=" + "a".repeat(64),
      expires_at: "2099-10-10T12:00:00Z",
      revision: 1,
    }),
  );
  expect(screen.queryByText(/#invite=/)).toBeNull();
  expect(screen.queryByText("Instrução restrita sintética")).toBeNull();
});
it("discards delayed private delivery bytes after current category access is revoked", async () => {
  let resolve!: (v: { blob: Blob; file_name: string }) => void;
  fake.download.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const createObjectURL = vi.fn();
  class LocalURL extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = vi.fn();
  }
  vi.stubGlobal("URL", LocalURL);
  const c = cache(),
    view = render(renderWith(<ExpansionDiligences {...props} />, c));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir diligência" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Baixar entrega para conferir" }),
  );
  await waitFor(() => expect(fake.download).toHaveBeenCalledTimes(1));
  view.rerender(
    renderWith(
      <ExpansionDiligences
        {...props}
        member={{ ...props.member!, can_view_medical: false }}
      />,
      c,
    ),
  );
  await act(async () =>
    resolve({ blob: new Blob(["privado"]), file_name: "sintetico.txt" }),
  );
  expect(createObjectURL).not.toHaveBeenCalled();
});
it("does not fetch the workspace for a different physical tenant", () => {
  render(
    renderWith(
      <ExpansionWorkspace
        {...props}
        legalCase={{ ...props.legalCase, tenant_id: "other" }}
      />,
      cache(),
    ),
  );
  expect(fake.context).not.toHaveBeenCalled();
  expect(screen.queryByRole("tablist")).toBeNull();
});
it("honors a series-wide confirmed receipt even when the selected version has no local attempts", async () => {
  fake.actRead.mockResolvedValue({
    ...actData,
    version: { ...actData.version, state: "ready" },
    can_prepare_attempt: false,
    attempt_blockers: ["confirmed_receipt"],
  });
  render(renderWith(<ExpansionActs {...props} />, cache()));
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir ato e recibos" }),
  );
  await screen.findByText(/já possui protocolo ou ciência conferidos/);
  expect(
    screen.queryByRole("button", { name: "Preparar tentativa manual" }),
  ).toBeNull();
  expect(fake.attempt).not.toHaveBeenCalled();
});
