import { describe, expect, it } from "vitest";
import { parseCustomersCsv } from "./customers-csv";

describe("parseCustomersCsv", () => {
  it("aceita linha sem nome quando o telefone e valido e preenche nome automaticamente", () => {
    const csv = ["telefone;perfil", "+55 11 98765-4321;A"].join("\n");

    const result = parseCustomersCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].nome).toBe("+55 (11) 98765-4321");
  });

  it("ignora telefones duplicados mesmo quando o DDI muda", () => {
    const csv = [
      "nome;telefone;perfil",
      "Cliente A;(11) 98765-4321;A",
      "Cliente B;+55 11 98765-4321;B",
    ].join("\n");

    const result = parseCustomersCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].nome).toBe("Cliente A");
    expect(result.errors).toContain(
      "Linha 3: telefone duplicado da linha 2; registro ignorado.",
    );
  });
});
