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
import type { ExpansionSpecialtyPreview as Preview } from "@/types/legal-expansion";
const fake = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/api/legal-expansion", () => ({
  previewSpecialty: fake.preview,
  applySpecialty: fake.apply,
}));
import { ExpansionSpecialtyPreview } from "./ExpansionSpecialtyPreview";
const data: Preview = {
  version_id: "version",
  is_current: true,
  can_apply: true,
  missing: [],
  conflicts: [],
  additions: {
    stages: [{ key: "stage", label: "Etapa sintética" }],
    checklist: [],
    task_templates: [],
  },
  preview_hash: "a".repeat(64),
};
const props = {
  workspace: { enabled: true, tenant_id: "tenant", user_id: "owner" },
  legalCase: { id: "case", tenant_id: "tenant", owner_id: "owner" },
  canEdit: true,
  context: {
    tenant_id: "tenant",
    user_id: "owner",
    can_edit: true,
    can_review: true,
    can_manage: true,
    external_execution_enabled: false,
  },
} as unknown as ExpansionProps;
function wrap(value: ExpansionProps, cache: QueryClient, close = vi.fn()) {
  return (
    <QueryClientProvider client={cache}>
      <ExpansionSpecialtyPreview
        props={value}
        versionId="version"
        onClose={close}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.preview.mockResolvedValue(data);
});
afterEach(cleanup);
it("keeps the same idempotency key and preview hash after a lost response", async () => {
  fake.apply
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({
      installation_id: "installation",
      already_applied: true,
      items: [],
    });
  const close = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(props, cache, close));
  await screen.findByText("Etapa sintética");
  expect(fake.apply).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByLabelText(
      "Conferi os itens e autorizo a aplicação organizacional desta versão ao caso",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Aplicar pacote conferido" }),
  );
  await waitFor(() => expect(fake.apply).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Consultar ou repetir a mesma solicitação",
      }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: "Consultar ou repetir a mesma solicitação",
    }),
  );
  await waitFor(() => expect(fake.apply).toHaveBeenCalledTimes(2));
  expect(fake.apply.mock.calls[0]).toEqual(fake.apply.mock.calls[1]);
  expect(fake.apply.mock.calls[0].slice(0, 3)).toEqual([
    "case",
    "version",
    data.preview_hash,
  ]);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});
it("does not render a late preview after the owner grant is lost", async () => {
  let resolve!: (value: Preview) => void;
  fake.preview.mockReturnValue(
    new Promise<Preview>((done) => {
      resolve = done;
    }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(wrap(props, cache));
  await waitFor(() => expect(fake.preview).toHaveBeenCalledOnce());
  view.rerender(
    wrap(
      {
        ...props,
        workspace: { ...props.workspace, user_id: "member" },
        context: { ...props.context, user_id: "member", can_review: false },
      },
      cache,
    ),
  );
  await act(async () => resolve(data));
  expect(screen.queryByText("Etapa sintética")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Aplicar pacote conferido" }),
  ).toBeNull();
  expect(fake.apply).not.toHaveBeenCalled();
});
it("keeps an incomplete preview out of the apply path", async () => {
  fake.preview.mockResolvedValue({
    ...data,
    can_apply: false,
    conflicts: [{ reason: "same key exists" }],
    missing: ["source review required"],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(props, cache));
  await screen.findByText(/instalações anteriores serão preservados/);
  fireEvent.click(
    screen.getByLabelText(
      "Conferi os itens e autorizo a aplicação organizacional desta versão ao caso",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Aplicar pacote conferido" }),
  ).toBeDisabled();
  expect(fake.apply).not.toHaveBeenCalled();
});

it("requires a new confirmation when the reviewed preview changes", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(props, cache));
  await screen.findByText("Etapa sintética");
  const confirmation = screen.getByLabelText(
    "Conferi os itens e autorizo a aplicação organizacional desta versão ao caso",
  );
  fireEvent.click(confirmation);
  expect(
    screen.getByRole("button", { name: "Aplicar pacote conferido" }),
  ).not.toBeDisabled();
  fake.preview.mockResolvedValue({ ...data, preview_hash: "b".repeat(64) });
  await act(async () => {
    await cache.invalidateQueries();
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Aplicar pacote conferido" }),
    ).toBeDisabled(),
  );
  expect(confirmation).not.toBeChecked();
  expect(fake.apply).not.toHaveBeenCalled();
});

it("allows a new reviewed package version while preserving earlier installation items", async () => {
  fake.preview.mockResolvedValue({
    ...data,
    conflicts: [{ kind: "stage", item_key: "stage" }],
  });
  fake.apply.mockResolvedValue({
    installation_id: "installation",
    already_applied: false,
    items: [],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(wrap(props, cache));
  await screen.findByText(/instalações anteriores serão preservados/);
  fireEvent.click(
    screen.getByLabelText(
      "Conferi os itens e autorizo a aplicação organizacional desta versão ao caso",
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Aplicar pacote conferido" }),
  );
  await waitFor(() => expect(fake.apply).toHaveBeenCalledOnce());
});
