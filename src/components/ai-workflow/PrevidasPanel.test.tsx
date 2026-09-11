import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { PrevidasPanel } from "./PrevidasPanel";
const mocks = vi.hoisted(() => ({
  role: "admin",
  get: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "owner", role: mocks.role } }),
}));
vi.mock("@/lib/api/previdas", async (original) => ({
  ...(await original<object>()),
  getPrevidas: mocks.get,
  updatePrevidas: mocks.update,
}));
const row = {
  chat_id: "chat",
  display_name: "Contato de teste",
  status: "requested",
  availability: "Manhã",
  appointment_at: null,
  confirmation_ref: null,
  next_action_at: "2020-01-01T12:00:00Z",
  revision: 1,
  documents: [],
  events: [],
};
function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PrevidasPanel customerId="customer" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.get.mockResolvedValue([row]);
});
it("scopes the CRM query to its customer and distinguishes pending from confirmed", async () => {
  show();
  expect(await screen.findByText("Agendamento pendente")).toBeInTheDocument();
  expect(mocks.get).toHaveBeenCalledWith("customer");
  expect(screen.getByText("Ação atrasada")).toBeInTheDocument();
  expect(screen.queryByText(/^Consulta:/)).not.toBeInTheDocument();
});
it("does not expose operational records to non admins", () => {
  mocks.role = "atendimento";
  show();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("keeps the form open and reports a stale save without displaying confirmation", async () => {
  mocks.update.mockRejectedValue(
    new Error("O acompanhamento mudou. Recarregue."),
  );
  show();
  fireEvent.click(await screen.findByText("Registrar evento confirmado"));
  fireEvent.change(screen.getByLabelText("Data e hora da consulta"), {
    target: { value: "2026-12-01T12:00" },
  });
  fireEvent.change(
    screen.getByLabelText("Referência da confirmação do parceiro"),
    { target: { value: "ref" } },
  );
  fireEvent.change(screen.getByLabelText("Prazo da próxima ação"), {
    target: { value: "2026-12-01T11:00" },
  });
  fireEvent.submit(screen.getByText("Salvar registro").closest("form")!);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O acompanhamento mudou",
    ),
  );
  expect(screen.getByText("Agendamento pendente")).toBeInTheDocument();
});
