import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldEditor } from "./FieldEditor";
import type { FormField } from "@/lib/marketing/form-types";

describe("FieldEditor", () => {
  it("mostra o controle de largura do campo", () => {
    const field: FormField = {
      id: "field-1",
      type: "text",
      name: "nome",
      label: "Nome",
      required: true,
      layoutWidth: 66,
    };

    render(<FieldEditor field={field} onUpdate={vi.fn()} />);

    expect(screen.getByText("Largura")).toBeInTheDocument();
    expect(screen.getByText("66% - 2/3 da linha")).toBeInTheDocument();
  });
});
