import type { IrIncomeTaxKind, IrTaxEntryPayload } from "@/types/legal-ir-calculations";

export type IrDecimalFormat = "canonical" | "pt-BR";
export interface IrCsvOptions { delimiter: ";" | ","; decimalFormat: IrDecimalFormat }
export interface IrImportError { line: number; field?: string; message: string }
export interface IrParsedTaxCsv { rows: IrTaxEntryPayload[]; errors: IrImportError[]; canImport: boolean }

export const IR_IMPORT_MAX_BYTES = 1_048_576;
export const IR_IMPORT_MAX_ROWS = 500;
export const IR_TAX_CSV_HEADERS = ["source_id", "payment_date", "competence", "calendar_year", "exercise", "income_tax_kind", "gross", "taxable", "withheld", "legal_deductions", "source_page", "source_line", "notes"] as const;
const moneyFields = ["gross", "taxable", "withheld", "legal_deductions"] as const;
const incomeKinds: IrIncomeTaxKind[] = ["ordinary", "thirteenth", "rra", "regressive", "foreign", "other", "unknown"];

/** No binary arithmetic, implicit locale detection, exponent notation or missing-as-zero. */
export function normalizeIrMoney(input: string, format: IrDecimalFormat = "canonical"): string | null {
  const value = input.trim();
  if (!value) return null;
  const valid = format === "canonical"
    ? /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)
    : /^(?:(?:0|[1-9]\d*)|(?:[1-9]\d{0,2}(?:\.\d{3})+))(?:,\d{1,2})?$/.test(value);
  if (!valid) throw new Error("Informe valor não negativo com até duas casas e o separador escolhido.");
  const canonical = format === "pt-BR" ? value.split(".").join("").replace(",", ".") : value;
  const [whole, fraction = ""] = canonical.split(".");
  if (whole.length > 14) throw new Error("Valor excede o limite de 14 dígitos inteiros.");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

/** Display only: preserve decimal text without converting financial amounts to Number. */
export function formatIrMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return "Não informado";
  if (!/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) return value;
  const [whole, fraction] = value.split(".");
  return `R$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}

interface CsvRecord { cells: string[]; line: number }
function parseTable(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let closed = false;
  let line = 1;
  let startLine = 1;
  const finishCell = () => { cells.push(cell); cell = ""; closed = false; };
  const finishRow = () => {
    finishCell();
    if (cells.some((value) => value.trim() !== "")) records.push({ cells, line: startLine });
    cells = [];
    if (records.length > IR_IMPORT_MAX_ROWS + 1) throw new Error(`Importação excede ${IR_IMPORT_MAX_ROWS} linhas de dados.`);
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; }
        else { quoted = false; closed = true; }
      } else {
        cell += char;
        if (char === "\n" || (char === "\r" && text[index + 1] !== "\n")) line++;
      }
      continue;
    }
    if (char === delimiter) { finishCell(); continue; }
    if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && text[index + 1] === "\n") index++;
      line++;
      startLine = line;
      continue;
    }
    if (closed) throw new Error(`Linha ${line}: texto inesperado após fechar aspas.`);
    if (char === '"') {
      if (cell !== "") throw new Error(`Linha ${line}: aspas devem envolver a célula inteira.`);
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error(`Linha ${startLine}: aspas não foram fechadas.`);
  if (cell !== "" || cells.length || closed) finishRow();
  return records;
}

function positiveInteger(value: string, maximum: number): number | null {
  if (!value) return null;
  if (!/^[1-9]\d{0,6}$/.test(value)) throw new Error("Informe um inteiro positivo sem separadores.");
  const integer = Number(value); // Nonfinancial row/date metadata only.
  if (integer > maximum) throw new Error("Inteiro excede o limite permitido.");
  return integer;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function parseIrTaxCsv(input: string, options: IrCsvOptions): IrParsedTaxCsv {
  const failure = (message: string): IrParsedTaxCsv => ({ rows: [], errors: [{ line: 0, message }], canImport: false });
  if (new TextEncoder().encode(input).byteLength > IR_IMPORT_MAX_BYTES) return failure("Arquivo excede 1 MiB.");
  for (const char of input) {
    const code = char.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return failure("Arquivo contém caracteres de controle não permitidos.");
  }
  if (![";", ","].includes(options.delimiter) || !["canonical", "pt-BR"].includes(options.decimalFormat)) return failure("Escolha explicitamente o delimitador e o formato decimal.");
  let table: CsvRecord[];
  try { table = parseTable(input.replace(/^\uFEFF/, ""), options.delimiter); }
  catch (error) { return failure(error instanceof Error ? error.message : "CSV inválido."); }
  if (table.length < 2) return failure("Inclua cabeçalho e pelo menos uma linha de dados.");
  const header = table[0].cells.map((value) => value.trim());
  if (new Set(header).size !== header.length) return failure("Cabeçalho contém colunas repetidas.");
  if (header.some((column) => !IR_TAX_CSV_HEADERS.includes(column as typeof IR_TAX_CSV_HEADERS[number]))) return failure("Cabeçalho possui coluna desconhecida. Utilize o modelo de importação.");
  if (moneyFields.some((field) => !header.includes(field))) return failure("Inclua as quatro colunas monetárias do modelo; células desconhecidas podem ficar vazias.");
  const rows: IrTaxEntryPayload[] = [];
  const errors: IrImportError[] = [];
  for (const [index, record] of table.slice(1).entries()) {
    if (record.cells.length !== header.length) {
      errors.push({ line: record.line, message: "Quantidade de células difere do cabeçalho; confira delimitador e aspas." });
      continue;
    }
    const raw = Object.fromEntries(header.map((field, column) => [field, record.cells[column]]));
    const value = (field: string) => (raw[field] ?? "").trim();
    const entry: IrTaxEntryPayload = { row_number: index + 1, source_id: null, payment_date: null, competence: null, calendar_year: null, exercise: null, income_tax_kind: "unknown", gross: null, taxable: null, withheld: null, legal_deductions: null, source_page: null, source_line: String(record.line), notes: raw.notes ?? "", raw_data: raw };
    const check = (field: string, run: () => void) => {
      try { run(); }
      catch (error) { errors.push({ line: record.line, field, message: error instanceof Error ? error.message : "Campo inválido." }); }
    };
    for (const field of moneyFields) check(field, () => { entry[field] = normalizeIrMoney(value(field), options.decimalFormat); });
    check("source_id", () => {
      if (!value("source_id")) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value("source_id"))) throw new Error("Selecione o identificador de um rendimento do caso.");
      entry.source_id = value("source_id");
    });
    check("payment_date", () => {
      if (!value("payment_date")) return;
      if (!validDate(value("payment_date"))) throw new Error("Informe uma data existente no formato AAAA-MM-DD.");
      entry.payment_date = value("payment_date");
    });
    check("competence", () => {
      if (!value("competence")) return;
      if (!validDate(`${value("competence")}-01`)) throw new Error("Informe a competência no formato AAAA-MM.");
      entry.competence = value("competence");
    });
    for (const field of ["calendar_year", "exercise"] as const) check(field, () => {
      const year = positiveInteger(value(field), field === "calendar_year" ? 9998 : 9999);
      if (year !== null && year < 1900) throw new Error("Informe ano a partir de 1900.");
      entry[field] = year;
    });
    check("source_page", () => {
      if (value("source_page")) entry.source_page = positiveInteger(value("source_page"), 1_000_000);
    });
    check("source_line", () => {
      if (value("source_line").length > 80) throw new Error("Referência da linha excede 80 caracteres.");
      if (value("source_line")) entry.source_line = value("source_line");
    });
    check("income_tax_kind", () => {
      if (!value("income_tax_kind")) return;
      if (!incomeKinds.includes(value("income_tax_kind") as IrIncomeTaxKind)) throw new Error("Natureza fiscal não reconhecida; classifique ou informe unknown.");
      entry.income_tax_kind = value("income_tax_kind") as IrIncomeTaxKind;
    });
    if (entry.notes && entry.notes.length > 2000) errors.push({ line: record.line, field: "notes", message: "Observações excedem 2.000 caracteres." });
    if (entry.exercise !== null && (entry.calendar_year === null || entry.exercise !== entry.calendar_year! + 1)) errors.push({ line: record.line, field: "exercise", message: "O exercício informado deve ser o ano-calendário mais um." });
    if (entry.gross !== null && entry.taxable !== null && BigInt(entry.taxable.replace(".", "")) > BigInt(entry.gross.replace(".", ""))) errors.push({ line: record.line, field: "taxable", message: "Valor tributável não pode exceder o valor bruto da linha." });
    rows.push(entry);
  }
  // A faulty row never causes a partial import. The caller may still display the preview.
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > IR_IMPORT_MAX_BYTES) errors.push({ line: 0, message: "Dados convertidos e textos de origem excedem 1 MiB. Divida o lote preservando as referências." });
  return { rows, errors, canImport: rows.length > 0 && errors.length === 0 };
}
