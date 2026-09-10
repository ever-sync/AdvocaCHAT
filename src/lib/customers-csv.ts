import { fallbackCustomerDisplayName } from "@/lib/customer-display-name";
import type { Customer, CustomerStatus, CustomerUpsertInput } from "@/types/domain";
import { normalizePhone } from "@/lib/phone";

export type ParsedCustomerCsv = {
  rows: CustomerUpsertInput[];
  errors: string[];
};

type CsvColumnKey =
  | "codigo"
  | "origem"
  | "tipo"
  | "nome"
  | "razaoSocial"
  | "nomeSocial"
  | "cnpj"
  | "inscricaoEstadual"
  | "inscricaoMunicipal"
  | "cpf"
  | "rg"
  | "nascimento"
  | "status"
  | "telefone"
  | "celular"
  | "fax"
  | "email"
  | "canal"
  | "cep"
  | "logradouro"
  | "numero"
  | "endereco"
  | "bairro"
  | "zone"
  | "complemento"
  | "cidade"
  | "estado"
  | "vendedor"
  | "observacoes"
  | "cadastradoEm"
  | "perfil"
  | "rota"
  | "ativo"
  | "ultimoPedido"
  | "ticketMedio"
  | "frequenciaCompra"
  | "totalGasto";

const headerAliases: Record<CsvColumnKey, string[]> = {
  codigo: ["codigo", "código", "cod", "id externo", "codigo cliente"],
  origem: ["origem", "source", "fonte"],
  tipo: ["tipo"],
  nome: ["nome", "nome fantasia", "nome/nome fantasia", "cliente", "name"],
  razaoSocial: ["razao social", "razão social", "razao social/nome social"],
  nomeSocial: ["nome social"],
  cnpj: ["cnpj", "documento"],
  inscricaoEstadual: ["i.e.", "ie", "inscricao estadual"],
  inscricaoMunicipal: ["i.m.", "im", "inscricao municipal"],
  cpf: ["cpf"],
  rg: ["rg"],
  nascimento: ["nascimento", "data nascimento", "data de nascimento"],
  status: ["status", "situacao", "situacao cadastral"],
  telefone: ["telefone", "fone", "phone", "tel", "mobile", "cel"],
  celular: ["celular", "whatsapp", "telefone celular", "zap"],
  fax: ["fax"],
  email: ["email", "e-mail", "mail"],
  canal: ["canal"],
  cep: ["cep"],
  logradouro: ["logradouro", "rua"],
  numero: ["numero", "número", "num", "nro"],
  endereco: ["endereco", "logradouro", "rua"],
  bairro: ["bairro"],
  zone: ["zona", "zone"],
  complemento: ["complemento"],
  cidade: ["cidade"],
  estado: ["estado", "uf"],
  vendedor: ["vendedor", "responsavel", "vendedor/responsavel"],
  observacoes: ["observacoes", "observacao", "obs"],
  cadastradoEm: ["cadastrado em", "data cadastro", "criado em"],
  perfil: ["perfil", "profile"],
  rota: ["rota", "route"],
  ativo: ["ativo", "ativa", "ativo/inativo"],
  ultimoPedido: ["ultimo pedido", "ultimo_pedido", "last order"],
  ticketMedio: ["ticket medio", "ticket medio rs", "ticket medio r$", "ticket medio (r$)", "ticket"],
  frequenciaCompra: ["frequencia compra", "frequencia_compra", "frequencia"],
  totalGasto: ["total gasto", "total_gasto", "faturamento", "spent"],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cleanCell(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

function detectDelimiter(input: string) {
  const sample = input.slice(0, 4000);
  const semicolonCount = (sample.match(/;/g) ?? []).length;
  const commaCount = (sample.match(/,/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvTable(input: string, delimiter: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      currentRow.push(cleanCell(currentCell));
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      currentRow.push(cleanCell(currentCell));
      currentCell = "";

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(cleanCell(currentCell));
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseNumber(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const normalizedValue = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function normalizePerfil(value: string): CustomerUpsertInput["perfil"] {
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue === "A" || normalizedValue === "B" || normalizedValue === "C") {
    return normalizedValue;
  }

  return "B";
}

function normalizeStatus(value: string): CustomerStatus {
  const normalizedValue = normalizeHeader(value);
  if (normalizedValue.includes("bloque")) {
    return "bloqueado";
  }

  if (normalizedValue.includes("inativ")) {
    return "inativo";
  }

  return "ativo";
}

function normalizeAtivo(value: string) {
  const normalizedValue = normalizeHeader(value);
  if (!normalizedValue) {
    return undefined;
  }

  if (["nao", "não", "false", "0", "inativo", "desativado"].includes(normalizedValue)) {
    return false;
  }

  if (["sim", "true", "1", "ativo", "ativa"].includes(normalizedValue)) {
    return true;
  }

  return undefined;
}

function normalizeTipo(value: string, cpf: string, cnpj: string) {
  const normalizedValue = normalizeHeader(value);
  if (normalizedValue.includes("fis")) {
    return "pf";
  }

  if (normalizedValue.includes("jur")) {
    return "pj";
  }

  if (cpf && !cnpj) {
    return "pf";
  }

  return "pj";
}

function normalizeDateOnly(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  const brazilianDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilianDateMatch) {
    const [, day, month, year] = brazilianDateMatch;
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmedValue)) {
    return trimmedValue.slice(0, 10);
  }

  return "";
}

function findHeaderRowIndex(rows: string[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const normalizedCells = rows[rowIndex].map(normalizeHeader);
    let score = 0;

    for (const aliases of Object.values(headerAliases)) {
      if (normalizedCells.some((cell) => aliases.includes(cell))) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = rowIndex;
    }
  }

  /* Planilhas com poucas colunas (ex.: só WhatsApp) precisam de score >= 1; 3+ exige cabeçalho “rico”. */
  return bestScore >= 1 ? bestIndex : 0;
}

function getHeaderIndex(headers: string[], key: CsvColumnKey) {
  const aliases = headerAliases[key];
  return headers.findIndex((header) => aliases.includes(header));
}

function buildSourceColumns(rawHeaders: string[], rawRow: string[]) {
  return rawHeaders.reduce<Record<string, string>>((columns, header, index) => {
    const key = cleanCell(header);
    if (!key) {
      return columns;
    }

    columns[key] = cleanCell(rawRow[index] ?? "");
    return columns;
  }, {});
}

function parseCustomerTable(table: string[][]): ParsedCustomerCsv {
  if (table.length === 0) {
    return { rows: [], errors: ["O arquivo esta vazio."] };
  }

  const headerRowIndex = findHeaderRowIndex(table);
  const rawHeaders = table[headerRowIndex];
  const headers = rawHeaders.map(normalizeHeader);
  const rows: CustomerUpsertInput[] = [];
  const errors: string[] = [];
  const seenPhones = new Map<string, number>();

  for (let rowIndex = headerRowIndex + 1; rowIndex < table.length; rowIndex += 1) {
    const rawRow = table[rowIndex];
    const getValue = (key: CsvColumnKey) => {
      const index = getHeaderIndex(headers, key);
      return index >= 0 ? cleanCell(rawRow[index] ?? "") : "";
    };

    const nomeRaw = getValue("nome");
    const telefoneRaw = getValue("celular") || getValue("telefone");
    const normalizedPhone = normalizePhone(telefoneRaw);

    if (!normalizedPhone.jid) {
      errors.push(`Linha ${rowIndex + 1}: telefone obrigatorio ou invalido.`);
      continue;
    }

    const firstLine = seenPhones.get(normalizedPhone.jid);
    if (firstLine) {
      errors.push(
        `Linha ${rowIndex + 1}: telefone duplicado da linha ${firstLine}; registro ignorado.`,
      );
      continue;
    }
    seenPhones.set(normalizedPhone.jid, rowIndex + 1);

    const telefone = normalizedPhone.e164 ?? telefoneRaw;
    const nome = fallbackCustomerDisplayName(telefone, nomeRaw);

    const celularRaw = getValue("celular");
    const celular = celularRaw.trim() ? (normalizePhone(celularRaw).e164 ?? celularRaw) : "";
    const cpf = getValue("cpf");
    const cnpj = getValue("cnpj");
    const cadastradoEm = getValue("cadastradoEm");
    const ultimoPedido = normalizeDateOnly(getValue("ultimoPedido")) || normalizeDateOnly(cadastradoEm);
    const logradouro = getValue("logradouro");
    const endereco = getValue("endereco") || logradouro;

    rows.push({
      codigo: getValue("codigo"),
      origem: (() => {
        const rawOrigem = normalizeHeader(getValue("origem"));
        if (rawOrigem === "pago") {
          return "pago" as const;
        }
        if (rawOrigem === "organico") {
          return "organico" as const;
        }
        return undefined;
      })(),
      tipo: normalizeTipo(getValue("tipo"), cpf, cnpj),
      nome,
      telefone,
      celular,
      email: getValue("email"),
      cnpj,
      endereco,
      perfil: normalizePerfil(getValue("perfil")),
      rota: getValue("rota"),
      status: normalizeStatus(getValue("status")),
      vendedor: getValue("vendedor"),
      ultimoPedido: ultimoPedido || new Date().toISOString().slice(0, 10),
      ticketMedio: parseNumber(getValue("ticketMedio")),
      frequenciaCompra: getValue("frequenciaCompra") || "Quinzenal",
      totalGasto: parseNumber(getValue("totalGasto")),
      razaoSocial: getValue("razaoSocial"),
      nomeSocial: getValue("nomeSocial"),
      inscricaoEstadual: getValue("inscricaoEstadual"),
      inscricaoMunicipal: getValue("inscricaoMunicipal"),
      cpf,
      rg: getValue("rg"),
      nascimento: getValue("nascimento"),
      fax: getValue("fax"),
      canal: getValue("canal"),
      cep: getValue("cep"),
      logradouro,
      numero: getValue("numero"),
      bairro: getValue("bairro"),
      zone: getValue("zone"),
      complemento: getValue("complemento"),
      cidade: getValue("cidade"),
      estado: getValue("estado"),
      ativo: normalizeAtivo(getValue("ativo")),
      observacoes: getValue("observacoes"),
      cadastradoEm,
      sourceColumns: buildSourceColumns(rawHeaders, rawRow),
    });
  }

  return { rows, errors };
}

export function parseCustomersCsv(input: string): ParsedCustomerCsv {
  const delimiter = detectDelimiter(input);
  const table = parseCsvTable(input, delimiter);
  return parseCustomerTable(table);
}

export async function parseCustomersSpreadsheet(file: File): Promise<ParsedCustomerCsv> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    const text = await file.text();
    return parseCustomersCsv(text);
  }

  // Le a primeira aba como matriz de linhas/celulas. read-excel-file vem do npm
  // registry (auditavel) e nao carrega a superficie de ataque do SheetJS.
  const { default: readXlsxFile } = await import("read-excel-file");
  let jsonRows: unknown[][];
  try {
    jsonRows = (await readXlsxFile(file)) as unknown[][];
  } catch {
    return {
      rows: [],
      errors: ["Nao foi possivel ler a planilha. Salve como CSV e tente novamente."],
    };
  }

  if (jsonRows.length === 0) {
    return { rows: [], errors: ["A planilha nao possui dados validos."] };
  }

  const table = jsonRows.map((row) =>
    row.map((cell) => cleanCell(cell == null ? "" : String(cell))),
  );
  return parseCustomerTable(table);
}

function escapeCsvCell(value: string | number) {
  const text = String(value ?? "");
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Modelo minimal para importar leads: apenas telefone obrigatório; nome é opcional na segunda coluna. */
export function buildMinimalCustomerImportTemplateCsv() {
  const header = ["telefone", "nome"];
  const example = [
    "+5511999998888",
    "",
  ];
  const lines = [header, example].map((row) => row.map((cell) => escapeCsvCell(cell)).join(","));
  return lines.join("\n");
}

export function buildCustomersCsv(customers: Customer[]) {
  const headers = [
    "codigo",
    "tipo",
    "origem",
    "nome",
    "razao_social",
    "nome_social",
    "cnpj",
    "inscricao_estadual",
    "inscricao_municipal",
    "cpf",
    "rg",
    "nascimento",
    "status",
    "telefone",
    "celular",
    "email",
    "canal",
    "cep",
    "logradouro",
    "numero",
    "endereco",
    "bairro",
    "zona",
    "complemento",
    "cidade",
    "estado",
    "vendedor",
    "observacoes",
    "cadastrado_em",
    "perfil",
    "rota",
    "ativo",
    "ultimo_pedido",
    "ticket_medio",
    "frequencia_compra",
    "total_gasto",
    "source_columns_json",
  ];

  const rows = customers.map((customer) => [
    customer.codigo ?? "",
    customer.tipo ?? "",
    customer.origem ?? "",
    customer.nome,
    customer.razaoSocial ?? "",
    customer.nomeSocial ?? "",
    customer.cnpj,
    customer.inscricaoEstadual ?? "",
    customer.inscricaoMunicipal ?? "",
    customer.cpf ?? "",
    customer.rg ?? "",
    customer.nascimento ?? "",
    customer.status,
    customer.phoneE164 ?? normalizePhone(customer.telefone).e164 ?? customer.telefone,
    customer.celular ? (normalizePhone(customer.celular).e164 ?? customer.celular) : "",
    customer.email,
    customer.canal ?? "",
    customer.cep ?? "",
    customer.logradouro ?? "",
    customer.numero ?? "",
    customer.endereco,
    customer.bairro ?? "",
    customer.zone ?? "",
    customer.complemento ?? "",
    customer.cidade ?? "",
    customer.estado ?? "",
    customer.vendedor,
    customer.observacoes ?? "",
    customer.cadastradoEm ?? "",
    customer.perfil,
    customer.rota,
    customer.ativo == null ? "" : customer.ativo ? "Sim" : "Nao",
    customer.ultimoPedido,
    customer.ticketMedio,
    customer.frequenciaCompra,
    customer.totalGasto,
    JSON.stringify(customer.sourceColumns ?? {}),
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(";"))
    .join("\n");
}
