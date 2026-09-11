import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BookingWidget } from "./BookingWidget";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps contact details out of lookup URLs and submits them only in the booking body", async () => {
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true,
    json: async () => options?.method === "POST" ? { id: "appointment" } : fetchMock.mock.calls.length === 1 ? {
      config: { titulo: "Consulta jurídica" },
      services: [{ id: "service", nome: "Consulta inicial", duracaoMin: 30, preco: null,
        providers: [{ id: "provider", name: "Advogado", duracaoMin: 30 }] }],
    } : { days: [{ slots: [{ startsAt: "2026-09-12T10:00:00", endsAt: "2026-09-12T10:30:00" }] }] },
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<BookingWidget slug="escritorio" />);
  fireEvent.click(await screen.findByRole("button", { name: /Consulta inicial/ }));
  fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
  fireEvent.click(await screen.findByRole("button", { name: "10:00" }));
  vi.useFakeTimers();
  fireEvent.change(screen.getByPlaceholderText("+55 XX XXXXX-XXXX *"), { target: { value: "11999990000" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByPlaceholderText("Seu nome *")).toHaveValue("");
  expect(screen.getByPlaceholderText("E-mail (opcional)")).toHaveValue("");
  vi.useRealTimers();
  fireEvent.change(screen.getByPlaceholderText("Seu nome *"), { target: { value: "Cliente sintético" } });
  fireEvent.change(screen.getByPlaceholderText("E-mail (opcional)"), { target: { value: "synthetic@example.invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar agendamento" }));
  expect(await screen.findByText("Agendamento confirmado!")).toBeInTheDocument();
  const [url, options] = fetchMock.mock.calls[2];
  expect(url).not.toMatch(/telefone|999990000|synthetic|Cliente/);
  expect(options?.method).toBe("POST");
  expect(JSON.parse(String(options?.body)).customer).toEqual({
    nome: "Cliente sintético", telefone: "+5511999990000", email: "synthetic@example.invalid",
  });
});
