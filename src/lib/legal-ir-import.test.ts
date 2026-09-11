import { describe, expect, it } from "vitest";
import { formatIrMoney, IR_IMPORT_MAX_ROWS, normalizeIrMoney, parseIrTaxCsv } from "./legal-ir-import";

const header = "gross;taxable;withheld;legal_deductions";
const options = { delimiter: ";", decimalFormat: "canonical" } as const;

describe("F4 decimal import", () => {
  it("preserves exact cents beyond Number's safe range", () => {
    expect(normalizeIrMoney("99999999999999.99")).toBe("99999999999999.99");
    expect(normalizeIrMoney("99.9")).toBe("99.90");
    expect(formatIrMoney("99999999999999.99")).toBe("R$ 99.999.999.999.999,99");
  });
  it("distinguishes unknown from explicit zero and requires the chosen locale", () => {
    expect(normalizeIrMoney("  ")).toBeNull();
    expect(normalizeIrMoney("0")).toBe("0.00");
    expect(normalizeIrMoney("1.234,56", "pt-BR")).toBe("1234.56");
    expect(() => normalizeIrMoney("1.234,56")).toThrow();
    expect(() => normalizeIrMoney("1234.56", "pt-BR")).toThrow();
    expect(() => normalizeIrMoney("12.34,56", "pt-BR")).toThrow();
  });
  it.each(["NaN", "Infinity", "1e3", "1.001", "-0.01", "+1", "0x10", "R$ 1,00", "1 000", "100000000000000", "=SUM(A1:A2)", "01.00"])("rejects malformed monetary text %s", (input) => {
    expect(() => normalizeIrMoney(input)).toThrow();
  });
  it("preserves unclassified and missing values as a draft, with the original cells", () => {
    const result = parseIrTaxCsv(`${header};source_line\n;10.00;0;;folha 3, linha B`, options);
    expect(result.canImport).toBe(true);
    expect(result.rows[0]).toMatchObject({ gross: null, taxable: "10.00", withheld: "0.00", legal_deductions: null, source_id: null, income_tax_kind: "unknown", calendar_year: null, source_line: "folha 3, linha B", raw_data: { gross: "", taxable: "10.00" } });
  });
  it("parses quoted separators, quotes and multiline descriptions without evaluating content", () => {
    const result = parseIrTaxCsv(`\uFEFF${header};notes\r\n10;10;0;0;"=1+1; texto ""literal""\nsegunda linha"\r\n20;20;0;0;final`, options);
    expect(result.canImport).toBe(true);
    expect(result.rows[0].notes).toBe('=1+1; texto "literal"\nsegunda linha');
    expect(result.rows[1].source_line).toBe("4");
  });
  it("does not permit partial import when a monetary field is malformed", () => {
    const result = parseIrTaxCsv(`${header}\n10;10;0;0\n20;20;1e2;0`, options);
    expect(result.canImport).toBe(false);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toMatchObject([{ line: 3, field: "withheld" }]);
    expect(result.rows[1].raw_data?.withheld).toBe("1e2");
  });
  it("validates real dates, exercise and gross versus taxable without floating point", () => {
    const valid = parseIrTaxCsv(`${header};payment_date;competence;calendar_year;exercise\n99999999999999.99;99999999999999.98;0;0;2024-02-29;2024-02;2024;2025`, options);
    expect(valid.canImport).toBe(true);
    const invalid = parseIrTaxCsv(`${header};payment_date;calendar_year;exercise\n10;10.01;0;0;2025-02-29;2025;2025`, options);
    expect(invalid.errors.map((error) => error.field)).toEqual(expect.arrayContaining(["payment_date", "exercise", "taxable"]));
    expect(invalid.canImport).toBe(false);
  });
  it.each([
    `${header};gross\n1;1;0;0;1`,
    `${header};tenant_id\n1;1;0;0;someone`,
    "gross;taxable\n1;1",
    `${header}\n1;1;0`,
    `${header};notes\n1;1;0;0;"unterminated`,
    `${header};notes\n1;1;0;0;"closed"unexpected`,
    `${header};notes\n1;1;0;0;not"quoted`,
    `${header}\n1;1;0;0\u0000`,
  ])("rejects malformed structure without executing or discarding columns", (input) => {
    expect(parseIrTaxCsv(input, options).canImport).toBe(false);
  });
  it("enforces resource limits without silently truncating", () => {
    const rows = Array.from({ length: IR_IMPORT_MAX_ROWS }, () => "1;1;0;0").join("\n");
    expect(parseIrTaxCsv(`${header}\n${rows}`, options).rows).toHaveLength(500);
    expect(parseIrTaxCsv(`${header}\n${rows}\n1;1;0;0`, options).canImport).toBe(false);
    expect(parseIrTaxCsv("é".repeat(600_000), options).canImport).toBe(false);
  });
  it("accounts for preserved source cells in the server payload limit", () => {
    const csv = `${header};notes\n${Array.from({ length: 300 }, () => `1;1;0;0;${"x".repeat(1900)}`).join("\n")}`;
    const result = parseIrTaxCsv(csv, options);
    expect(result.canImport).toBe(false);
    expect(result.errors).toContainEqual({ line: 0, message: "Dados convertidos e textos de origem excedem 1 MiB. Divida o lote preservando as referências." });
  });
});
