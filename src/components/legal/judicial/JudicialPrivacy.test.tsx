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
  JudicialContext,
  JudicialInbox as Inbox,
} from "@/types/legal-judicial";
import type { JudicialProps } from "./judicial-ui";
import { judicialVisibleContext } from "./judicial-ui";
const fake = vi.hoisted(() => ({
  original: vi.fn(),
  context: vi.fn(),
  documents: vi.fn(),
  proceedings: vi.fn(),
  report: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/api/legal-judicial", () => ({
  readJudicialOriginal: fake.original,
  readJudicialDeadlineReport: fake.report,
  createJudicialCheckTask: vi.fn(),
  createJudicialDeadline: vi.fn(),
  reviewJudicialDeadline: vi.fn(),
  submitJudicialDeadline: vi.fn(),
  getJudicialContext: fake.context,
  acceptJudicialAssignment: vi.fn(),
  assignJudicialItem: vi.fn(),
  recordJudicialManualEvent: vi.fn(),
  reviewJudicialAssociation: vi.fn(),
  updateJudicialTaskStatus: vi.fn(),
}));
vi.mock("@/lib/api/legal", () => ({
  listLegalDocuments: fake.documents,
  listLegalProceedings: fake.proceedings,
}));
vi.mock("@/lib/legal-judicial-report", () => ({
  downloadJudicialDeadlineReport: fake.download,
}));
import JudicialInbox from "./JudicialInbox";
import JudicialDeadlines from "./JudicialDeadlines";
import type {
  JudicialDeadlineVersion,
  JudicialDeadlineReport,
} from "@/types/legal-judicial";
const item = {
  id: "event",
  tenant_id: "tenant",
  case_id: "case",
  title: "Original clínico fiscal sintético",
  category: "restricted",
  provider: "manual",
  version_number: 1,
  captured_at: "2026-09-11T12:00:00Z",
  association_state: "confirmed",
  candidates: [],
  original_sha256: "hash",
  revision: 1,
  temporal_notes: "",
  review_note: "",
} as unknown as Inbox;
const ctx: JudicialContext = {
  tenant_id: "tenant",
  user_id: "reader",
  can_manage_sources: false,
  can_edit_catalog: false,
  can_approve_catalog: false,
  can_edit_case: false,
  can_review_case: false,
  sources: [],
  connections: [],
  coverages: [],
  jobs: [],
  inbox: [item],
  triage: [],
  calendars: [],
  rules: [],
  deadlines: [],
  deadline_states: [],
};
const props = {
  workspace: {
    user_id: "reader",
    tenant_id: "tenant",
    enabled: true,
    collaborators: [],
  },
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" },
  member: {
    profile_id: "reader",
    can_view_medical: true,
    can_view_fiscal: true,
  },
  members: [],
  canEdit: false,
  context: ctx,
} as unknown as JudicialProps;
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  fake.context.mockResolvedValue(ctx);
  fake.documents.mockResolvedValue([]);
  fake.proceedings.mockResolvedValue([]);
});
const wrapper = (p: JudicialProps, client: QueryClient) => (
  <QueryClientProvider client={client}>
    <JudicialInbox {...p} />
  </QueryClientProvider>
);
it("removes a restricted original and open dialog immediately after a known fiscal permission revocation", async () => {
  fake.original.mockResolvedValue({
    original_text: "Segredo sintético protegido",
    content_type: "text/plain",
    sha256: "hash",
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(wrapper(props, cache));
  fireEvent.click(screen.getByRole("button", { name: "Consultar original" }));
  await screen.findByText("Segredo sintético protegido");
  view.rerender(
    wrapper(
      { ...props, member: { ...props.member!, can_view_fiscal: false } },
      cache,
    ),
  );
  expect(screen.queryByText("Segredo sintético protegido")).toBeNull();
  expect(screen.queryByText(item.title)).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("does not reintroduce an original whose delayed read finishes after case access is removed", async () => {
  let resolve!: (value: unknown) => void;
  fake.original.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(wrapper(props, cache));
  fireEvent.click(screen.getByRole("button", { name: "Consultar original" }));
  await waitFor(() => expect(fake.original).toHaveBeenCalledTimes(1));
  view.rerender(wrapper({ ...props, member: undefined }, cache));
  await act(async () =>
    resolve({
      original_text: "Conteúdo tardio privado",
      content_type: "text/plain",
      sha256: "hash",
    }),
  );
  expect(screen.queryByText("Conteúdo tardio privado")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fake.context).not.toHaveBeenCalled();
});
it("purges related triage and deadline projections when current ACL or physical tenant no longer authorizes them", () => {
  const data = {
    ...ctx,
    jobs: [{ id: "job", case_id: "case" }],
    triage: [{ id: "triage", inbox_id: "event" }],
    deadlines: [{ id: "deadline", case_id: "case" }],
    deadline_states: [{ id: "deadline", is_current: true }],
  } as JudicialContext;
  const result = judicialVisibleContext(
    { ...props, member: { ...props.member!, can_view_fiscal: false } },
    data,
  );
  expect(result.inbox).toEqual([]);
  expect(result.triage).toEqual([]);
  expect(result.deadlines).toEqual([]);
  expect(result.jobs).toEqual([]);
  const wrong = judicialVisibleContext(props, {
    ...data,
    tenant_id: "different",
  });
  expect(wrong.inbox).toEqual([]);
  expect(wrong.can_manage_sources).toBe(false);
});

it("does not download a delayed deadline report after the known restricted permission is revoked", async () => {
  const row = {
    id: "deadline",
    case_id: "case",
    input: {
      title: "Prazo sintético",
      assignee_id: "reader",
      quantity: 3,
      unit: "business_days",
      duration_basis: "Ato fictício",
    },
    version_number: 1,
    state: "draft",
    result: {
      proposed_due_on: "2026-09-18",
      start_marker_on: "2026-09-14",
      first_counted_on: "2026-09-15",
      due_at: "2026-09-18T23:59:59-04:00",
      timezone: "America/Manaus",
      refusals: [],
      memory: [],
    },
    review_note: "",
    snapshot_hash: "hash",
  } as unknown as JudicialDeadlineVersion;
  const report = {
    calculation: row,
    is_current: true,
    generated_at: "2026-09-11T12:00:00Z",
  } as JudicialDeadlineReport;
  let resolve!: (value: JudicialDeadlineReport) => void;
  fake.report.mockResolvedValueOnce(report).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const p = {
    ...props,
    context: {
      ...ctx,
      deadlines: [row],
      deadline_states: [{ id: row.id, is_current: true }],
    },
  };
  const wrap = (value: JudicialProps) => (
    <QueryClientProvider client={cache}>
      <JudicialDeadlines {...value} />
    </QueryClientProvider>
  );
  const view = render(wrap(p));
  expect(screen.getByText(/18\/09\/2026, 23:59/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Conferir memória" }));
  await screen.findByRole("button", { name: "Baixar memória para impressão" });
  fireEvent.click(
    screen.getByRole("button", { name: "Baixar memória para impressão" }),
  );
  await waitFor(() => expect(fake.report).toHaveBeenCalledTimes(2));
  view.rerender(
    wrap({ ...p, member: { ...p.member!, can_view_fiscal: false } }),
  );
  await act(async () => resolve(report));
  expect(fake.download).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("closes an approval dialog when the current server projection marks its snapshot stale", async () => {
  const row = {
    id: "deadline",
    case_id: "case",
    input: { title: "Prazo sintético", assignee_id: "reader" },
    version_number: 1,
    state: "in_review",
    result: { refusals: [], memory: [] },
    review_note: "",
  } as unknown as JudicialDeadlineVersion;
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const p = {
    ...props,
    context: {
      ...ctx,
      can_review_case: true,
      deadlines: [row],
      deadline_states: [{ id: row.id, is_current: true }],
    },
  };
  const wrap = (value: JudicialProps) => (
    <QueryClientProvider client={cache}>
      <JudicialDeadlines {...value} />
    </QueryClientProvider>
  );
  const view = render(wrap(p));
  fireEvent.click(
    screen.getByRole("button", { name: "Registrar prazo revisado" }),
  );
  expect(
    screen.getByRole("button", { name: "Confirmar prazo revisado" }),
  ).toBeTruthy();
  view.rerender(
    wrap({
      ...p,
      context: {
        ...p.context,
        deadline_states: [{ id: row.id, is_current: false }],
      },
    }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Confirmar prazo revisado" }),
  ).toBeNull();
});
