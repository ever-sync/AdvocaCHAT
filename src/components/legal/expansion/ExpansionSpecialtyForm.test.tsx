import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ExpansionSpecialtyForm,
  type SpecialtyVersionInput,
} from "./ExpansionSpecialtyForm";
afterEach(cleanup);
const original: SpecialtyVersionInput & { id: string } = {
  id: "package",
  package_key: "synthetic",
  previous_version_id: null,
  title: "Pacote sintético",
  specialty: "Organização",
  purpose: "Conferência nominal",
  scope: "Fluxo sintético",
  source_url: "https://example.org/source",
  checked_on: "2026-09-11",
  validity_note: "Conferir a cada uso",
  limitations: "Sem decisão jurídica",
  body: {
    stages: [{ key: "stage", label: "Organizar documentos" }],
    checklist: [],
    task_templates: [],
  },
};
it("adds a protected organizational template without a deadline, assignee or approval", () => {
  const save = vi.fn();
  render(
    <ExpansionSpecialtyForm pending={false} onClose={vi.fn()} onSave={save} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adicionar modelo de tarefa" }),
  );
  expect(screen.getByLabelText("Categoria da tarefa 1")).toHaveValue(
    "restricted",
  );
  expect(
    screen.queryByLabelText(/Prazo jurídico|Vencimento|Responsável/),
  ).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
it("requires a new source check and confirmation when copying a package", () => {
  const save = vi.fn();
  render(
    <ExpansionSpecialtyForm
      original={original}
      pending={false}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  expect(screen.getByLabelText("Data de consulta das referências")).toHaveValue(
    "",
  );
  expect(screen.getByLabelText("Identificador do pacote")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Salvar rascunho" }),
  ).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});
it("clears confirmation after edits and refuses duplicate keys across item kinds", () => {
  render(
    <ExpansionSpecialtyForm
      original={original}
      pending={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />,
  );
  const confirmation = screen.getByLabelText(
    "Conferi a organização proposta; este pacote será salvo como rascunho para revisão",
  );
  fireEvent.click(confirmation);
  expect(
    screen.getByRole("button", { name: "Salvar rascunho" }),
  ).not.toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Adicionar verificação" }),
  );
  expect(confirmation).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Chave da verificação 1"), {
    target: { value: "stage" },
  });
  fireEvent.change(screen.getByLabelText("Título da verificação 1"), {
    target: { value: "Conferir" },
  });
  fireEvent.change(screen.getByLabelText("Descrição da verificação 1"), {
    target: { value: "Conferir documento" },
  });
  fireEvent.click(confirmation);
  expect(
    screen.getByRole("button", { name: "Salvar rascunho" }),
  ).toBeDisabled();
});
