import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PublicAnamnese from "@/pages/PublicAnamnese";
import PublicOrcamento from "@/pages/PublicOrcamento";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

it.each([
  ["/anamnese/preencher", PublicAnamnese],
  ["/orcamento/aprovar", PublicOrcamento],
] as const)("retires %s without loading/sending data and removes old PII from history", (path, Page) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", `${path}?nome=Private&fone=11999990000&sig=forged#secret`);
  const { container } = render(<Page />);
  expect(screen.getByRole("heading", { name: "Este link antigo foi descontinuado" })).toBeInTheDocument();
  expect(window.location.pathname).toBe(path);
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("");
  expect(fetchMock).not.toHaveBeenCalled();
  expect(container.querySelector("input, canvas, form")).toBeNull();
  expect(container).not.toHaveTextContent("Private");
});
