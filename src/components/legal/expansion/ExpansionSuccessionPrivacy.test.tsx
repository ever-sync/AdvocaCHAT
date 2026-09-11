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
import type { ExpansionSuccessionRead } from "@/types/legal-expansion";
const fake = vi.hoisted(() => ({
  list: vi.fn(),
  read: vi.fn(),
  docs: vi.fn(),
  parties: vi.fn(),
  review: vi.fn(),
  authority: vi.fn(),
}));
vi.mock("@/lib/api/legal-expansion", () => ({
  listExpansion: fake.list,
  readSuccession: fake.read,
  createSuccession: vi.fn(),
  submitSuccession: vi.fn(),
  reviewSuccession: fake.review,
  recordSuccessionAuthority: fake.authority,
  revokeSuccessionAuthority: vi.fn(),
  recordSuccessionEvent: vi.fn(),
}));
vi.mock("@/lib/api/legal", () => ({
  listLegalDocuments: fake.docs,
  listLegalParties: fake.parties,
  listLegalProceedings: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/api/legal-ir", () => ({
  listLegalRepresentations: vi.fn().mockResolvedValue([]),
  getIrCaseContext: vi.fn().mockResolvedValue({ representation_states: [] }),
}));
import ExpansionSuccession from "./ExpansionSuccession";
const text = "<script>fonteSintetica()</script> Conteúdo privado do dossiê";
const data: ExpansionSuccessionRead = {
  version: {
    id: "version",
    tenant_id: "tenant",
    case_id: "case",
    succession_key: "synthetic",
    version_number: 1,
    previous_version_id: null,
    category: "restricted",
    title: "Dossiê sintético",
    deceased_party_id: "deceased",
    death_on: null,
    death_document_id: null,
    assets_status: "unknown",
    dependency_status: "unknown",
    payment_location: "unknown",
    proceeding_id: null,
    notes: text,
    snapshot: {},
    snapshot_hash: "a".repeat(64),
    state: "in_review",
    created_at: "2026-09-11T12:00:00Z",
    created_by: "owner",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  },
  is_current: true,
  missing: [],
  persons: [],
  authorities: [],
  events: [],
};
const props = {
  workspace: {
    enabled: true,
    tenant_id: "tenant",
    user_id: "member",
    can_create: false,
    collaborators: [],
  },
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" },
  canEdit: true,
  member: {
    profile_id: "member",
    case_id: "case",
    can_edit: true,
    can_view_medical: true,
    can_view_fiscal: true,
  },
  members: [],
  context: {
    tenant_id: "tenant",
    user_id: "member",
    can_edit: true,
    can_review: false,
    can_manage: false,
    external_execution_enabled: false,
  },
} as unknown as ExpansionProps;
function wrap(value: ExpansionProps, cache: QueryClient) {
  return (
    <QueryClientProvider client={cache}>
      <ExpansionSuccession {...value} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.list.mockResolvedValue({ items: [data.version], has_more: false });
  fake.read.mockResolvedValue(data);
  fake.docs.mockResolvedValue([]);
  fake.parties.mockResolvedValue([
    {
      id: "deceased",
      case_id: "case",
      name: "Pessoa sintética",
      party_role: "client",
      customer_id: null,
    },
  ]);
});
afterEach(cleanup);
it("reads only on demand, escapes private text and hides the whole dossier after one sensitive grant is revoked", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(wrap(props, cache));
  const button = await screen.findByRole("button", { name: "Examinar dossiê" });
  expect(fake.read).not.toHaveBeenCalled();
  fireEvent.click(button);
  await screen.findByText(text);
  expect(document.querySelector("script")).toBeNull();
  expect(fake.review).not.toHaveBeenCalled();
  view.rerender(
    wrap(
      { ...props, member: { ...props.member!, can_view_fiscal: false } },
      cache,
    ),
  );
  expect(screen.queryByText(text)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Novo dossiê sucessório" }),
  ).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("does not keep an audited body visible after the server rejects its refreshed permission", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(props, cache));
  fireEvent.click(
    await screen.findByRole("button", { name: "Examinar dossiê" }),
  );
  await screen.findByText(text);
  fake.read.mockRejectedValue(new Error("permission denied"));
  await act(async () => {
    await cache.invalidateQueries();
  });
  await waitFor(() => expect(screen.queryByText(text)).toBeNull());
});
it("closes an open approval when a refreshed version is no longer current", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const owner = {
    ...props,
    workspace: { ...props.workspace, user_id: "owner" },
    context: { ...props.context, user_id: "owner", can_review: true },
  };
  render(wrap(owner, cache));
  fireEvent.click(
    await screen.findByRole("button", { name: "Examinar dossiê" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Conferir dossiê" }),
  );
  expect(
    screen.getByRole("button", { name: "Registrar dossiê conferido" }),
  ).toBeDisabled();
  fake.read.mockResolvedValue({ ...data, is_current: false });
  await act(async () => {
    await cache.invalidateQueries();
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Registrar dossiê conferido" }),
    ).toBeNull(),
  );
  expect(fake.review).not.toHaveBeenCalled();
});
