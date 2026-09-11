import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { LegalCaseDocument, LegalCaseParty } from "@/types/legal";
import {
  ExpansionSuccessionForm,
  type SuccessionVersionInput,
} from "./ExpansionSuccessionForm";
const parties: LegalCaseParty[] = [
  {
    id: "deceased",
    case_id: "case",
    name: "Pessoa falecida sintética",
    party_role: "client",
    customer_id: null,
  },
  {
    id: "interested",
    case_id: "case",
    name: "Pessoa interessada sintética",
    party_role: "other",
    customer_id: null,
  },
];
const document = {
  id: "proof",
  case_id: "case",
  display_name: "Prova sintética",
  status: "ready",
  category: "general",
} as LegalCaseDocument;
afterEach(cleanup);
it("starts uncertain facts as unknown and adds a person without inferring capacity or powers", () => {
  const save = vi.fn();
  render(
    <ExpansionSuccessionForm
      parties={parties}
      documents={[]}
      proceedings={[]}
      representations={[]}
      pending={false}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  expect(screen.getByLabelText("Bens a inventariar")).toHaveValue("unknown");
  expect(
    screen.getByLabelText("Dependência previdenciária ou militar"),
  ).toHaveValue("unknown");
  expect(screen.getByLabelText("Situação informada do pagamento")).toHaveValue(
    "unknown",
  );
  expect(screen.getByLabelText("Data do falecimento informada")).toHaveValue(
    "",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Adicionar pessoa interessada" }),
  );
  expect(screen.getByLabelText("Qualidade declarada da pessoa 1")).toHaveValue(
    "unknown",
  );
  expect(
    screen.getByLabelText("Representação cadastrada da pessoa 1"),
  ).toHaveValue("");
  expect(save).not.toHaveBeenCalled();
});
it("does not preserve an approval when facts are changed or a selected proof becomes unavailable", () => {
  const original: SuccessionVersionInput & { id: string } = {
    id: "version",
    succession_key: "test",
    title: "Dossiê sintético",
    category: "restricted",
    previous_version_id: null,
    deceased_party_id: "deceased",
    death_on: null,
    death_document_id: "proof",
    assets_status: "unknown",
    dependency_status: "unknown",
    payment_location: "unknown",
    proceeding_id: null,
    notes: "Conferir fatos",
    persons: [],
  };
  const properties = {
    original,
    parties,
    documents: [document],
    proceedings: [],
    representations: [],
    pending: false,
    onClose: vi.fn(),
    onSave: vi.fn(),
  };
  const view = render(<ExpansionSuccessionForm {...properties} />);
  const confirm = screen.getByLabelText(
    "Conferi os fatos declarados e as pendências; o cadastro será salvo como rascunho",
  );
  expect(confirm).not.toBeChecked();
  fireEvent.click(confirm);
  expect(
    screen.getByRole("button", { name: "Salvar rascunho" }),
  ).not.toBeDisabled();
  fireEvent.change(screen.getByLabelText("Bens a inventariar"), {
    target: { value: "declared_present" },
  });
  expect(confirm).not.toBeChecked();
  fireEvent.click(confirm);
  view.rerender(<ExpansionSuccessionForm {...properties} documents={[]} />);
  expect(
    screen.getByRole("button", { name: "Salvar rascunho" }),
  ).toBeDisabled();
  expect(properties.onSave).not.toHaveBeenCalled();
});
it("uses a closed payload and sends a draft only after explicit confirmation", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <ExpansionSuccessionForm
      parties={parties}
      documents={[]}
      proceedings={[]}
      representations={[]}
      pending={false}
      onClose={vi.fn()}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText("Identificador do dossiê"), {
    target: { value: "synthetic" },
  });
  fireEvent.change(screen.getByLabelText("Título do dossiê"), {
    target: { value: "Dossiê sintético" },
  });
  fireEvent.change(screen.getByLabelText("Pessoa falecida informada"), {
    target: { value: "deceased" },
  });
  fireEvent.change(
    screen.getByLabelText("Notas, dúvidas e limitações do dossiê"),
    { target: { value: "Aguardando prova" } },
  );
  fireEvent.click(
    screen.getByLabelText(
      "Conferi os fatos declarados e as pendências; o cadastro será salvo como rascunho",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
  expect(save).toHaveBeenCalledWith({
    succession_key: "synthetic",
    title: "Dossiê sintético",
    previous_version_id: null,
    category: "restricted",
    deceased_party_id: "deceased",
    death_on: null,
    death_document_id: null,
    assets_status: "unknown",
    dependency_status: "unknown",
    payment_location: "unknown",
    proceeding_id: null,
    notes: "Aguardando prova",
    persons: [],
  });
});
