import { describe, expect, it } from "vitest";
import { groupFormFieldsIntoRows, type FormField } from "./form-types";

function field(id: string, width: 33 | 66 | 100, lineBreakBefore = false): FormField {
  return {
    id,
    type: "text",
    name: id,
    label: id,
    required: false,
    layoutWidth: width,
    lineBreakBefore,
  };
}

describe("groupFormFieldsIntoRows", () => {
  it("quebra em linhas por largura e por quebra explícita", () => {
    const rows = groupFormFieldsIntoRows([
      field("a", 66),
      field("b", 33),
      field("c", 100, true),
      field("d", 33),
      field("e", 66),
    ]);

    expect(rows.map((row) => row.map((f) => f.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d", "e"],
    ]);
  });

  it("em modo compacto, empilha tudo em uma coluna", () => {
    const rows = groupFormFieldsIntoRows([field("a", 66), field("b", 33)], true);
    expect(rows.map((row) => row.map((f) => f.id))).toEqual([["a"], ["b"]]);
  });
});
