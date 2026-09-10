import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { sanitizeCustomerSearchForPostgrestOrIlike } from "@/lib/customer-search-sanitize";
import { fallbackCustomerDisplayName } from "@/lib/customer-display-name";
import { fetchCepDetails, onlyDigits } from "@/lib/brasil-api";
import { listRoutes } from "@/lib/api/routes";
import { requireSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { getCurrentTenantId } from "@/lib/api/tenant";
import { SafeStringRecordSchema } from "@/lib/safe-json-schema";
import { normalizePhone } from "@/lib/phone";
import type { Customer, CustomerFilters, CustomerUpsertInput, DeliveryRoute } from "@/types/domain";

const CUSTOMERS_STORAGE_KEY = "distribuibot-customers";
const CUSTOMER_SELECT = [
  "id",
  "codigo",
  "origem",
  "nome",
  "telefone",
  "celular",
  "phone_e164",
  "phone_digits",
  "phone_jid",
  "perfil",
  "rota",
  "ultimo_pedido",
  "status",
  "email",
  "cnpj",
  "endereco",
  "vendedor",
  "ticket_medio",
  "frequencia_compra",
  "total_gasto",
  "tipo",
  "razao_social",
  "inscricao_estadual",
  "inscricao_municipal",
  "cpf",
  "rg",
  "nascimento",
  "nome_social",
  "fax",
  "canal",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "zone",
  "complemento",
  "cidade",
  "estado",
  "ativo",
  "observacoes",
  "cadastrado_em",
  "source_columns",
].join(", ");

type CustomerRow = {
  id: string;
  codigo: string | null;
  origem: Customer["origem"] | null;
  nome: string;
  telefone: string;
  celular: string | null;
  phone_e164: string | null;
  phone_digits: string | null;
  phone_jid: string | null;
  perfil: Customer["perfil"];
  rota: string;
  ultimo_pedido: string;
  status: Customer["status"];
  email: string;
  cnpj: string;
  endereco: string;
  vendedor: string;
  ticket_medio: number;
  frequencia_compra: string;
  total_gasto: number;
  tipo: string | null;
  razao_social: string | null;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  cpf: string | null;
  rg: string | null;
  nascimento: string | null;
  nome_social: string | null;
  fax: string | null;
  canal: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  zone: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  ativo: boolean | null;
  observacoes: string | null;
  cadastrado_em: string | null;
  source_columns: Record<string, unknown> | null;
};



function toE164Phone(value?: string | null) {
  const normalized = normalizePhone(value ?? "");
  return normalized.e164 ?? (value ?? "").trim();
}

function normalizeCustomerInputPhones(input: CustomerUpsertInput): CustomerUpsertInput {
  return {
    ...input,
    telefone: toE164Phone(input.telefone),
    celular: input.celular?.trim() ? toE164Phone(input.celular) : input.celular,
  };
}

export function mapRowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    codigo: row.codigo ?? undefined,
    origem: row.origem ?? undefined,
    nome: row.nome,
    telefone: row.phone_e164 ?? toE164Phone(row.telefone),
    celular: row.celular ? toE164Phone(row.celular) : undefined,
    phoneE164: row.phone_e164,
    phoneDigits: row.phone_digits,
    phoneJid: row.phone_jid,
    perfil: row.perfil,
    rota: row.rota,
    ultimoPedido: row.ultimo_pedido,
    status: row.status,
    email: row.email,
    cnpj: row.cnpj,
    endereco: row.endereco,
    vendedor: row.vendedor,
    ticketMedio: row.ticket_medio,
    frequenciaCompra: row.frequencia_compra,
    totalGasto: row.total_gasto,
    tipo: row.tipo ?? undefined,
    razaoSocial: row.razao_social ?? undefined,
    inscricaoEstadual: row.inscricao_estadual ?? undefined,
    inscricaoMunicipal: row.inscricao_municipal ?? undefined,
    cpf: row.cpf ?? undefined,
    rg: row.rg ?? undefined,
    nascimento: row.nascimento ?? undefined,
    nomeSocial: row.nome_social ?? undefined,
    fax: row.fax ?? undefined,
    canal: row.canal ?? undefined,
    cep: row.cep ?? undefined,
    logradouro: row.logradouro ?? undefined,
    numero: row.numero ?? undefined,
    bairro: row.bairro ?? undefined,
    zone: row.zone ?? undefined,
    complemento: row.complemento ?? undefined,
    cidade: row.cidade ?? undefined,
    estado: row.estado ?? undefined,
    ativo: row.ativo ?? undefined,
    observacoes: row.observacoes ?? undefined,
    cadastradoEm: row.cadastrado_em ?? undefined,
    sourceColumns: SafeStringRecordSchema.parse(row.source_columns),
  };
}

function mapInputToRow(input: CustomerUpsertInput): Omit<CustomerRow, "id"> {
  const normalizedInput = normalizeCustomerInputPhones(input);
  const normalizedPhone = normalizePhone(normalizedInput.telefone);
  const nome = fallbackCustomerDisplayName(normalizedInput.telefone, normalizedInput.nome);

  return {
    codigo: normalizedInput.codigo ?? null,
    origem: normalizedInput.origem ?? null,
    nome,
    telefone: normalizedInput.telefone,
    celular: normalizedInput.celular ?? null,
    phone_e164: normalizedPhone.e164,
    phone_digits: normalizedPhone.digits,
    phone_jid: normalizedPhone.jid,
    perfil: normalizedInput.perfil,
    rota: normalizedInput.rota,
    ultimo_pedido: normalizedInput.ultimoPedido,
    status: normalizedInput.status,
    email: normalizedInput.email,
    cnpj: normalizedInput.cnpj,
    endereco: normalizedInput.endereco,
    vendedor: normalizedInput.vendedor,
    ticket_medio: normalizedInput.ticketMedio,
    frequencia_compra: normalizedInput.frequenciaCompra,
    total_gasto: normalizedInput.totalGasto,
    tipo: normalizedInput.tipo ?? null,
    razao_social: normalizedInput.razaoSocial ?? null,
    inscricao_estadual: normalizedInput.inscricaoEstadual ?? null,
    inscricao_municipal: normalizedInput.inscricaoMunicipal ?? null,
    cpf: normalizedInput.cpf ?? null,
    rg: normalizedInput.rg ?? null,
    nascimento: normalizedInput.nascimento ?? null,
    nome_social: normalizedInput.nomeSocial ?? null,
    fax: normalizedInput.fax ?? null,
    canal: normalizedInput.canal ?? null,
    cep: normalizedInput.cep ?? null,
    logradouro: normalizedInput.logradouro ?? null,
    numero: normalizedInput.numero ?? null,
    bairro: normalizedInput.bairro ?? null,
    zone: normalizedInput.zone ?? null,
    complemento: normalizedInput.complemento ?? null,
    cidade: normalizedInput.cidade ?? null,
    estado: normalizedInput.estado ?? null,
    ativo: normalizedInput.ativo ?? true,
    observacoes: normalizedInput.observacoes ?? null,
    cadastrado_em: normalizedInput.cadastradoEm ?? null,
    source_columns: normalizedInput.sourceColumns ?? {},
  };
}

function getCustomerPhoneKey(customer: Pick<Customer, "telefone" | "phoneJid">) {
  return customer.phoneJid ?? normalizePhone(customer.telefone).jid;
}

function dedupeCustomerInputsByPhone(inputs: CustomerUpsertInput[]) {
  const withoutPhone: CustomerUpsertInput[] = [];
  const byPhone = new Map<string, CustomerUpsertInput>();

  for (const input of inputs) {
    const phoneKey = normalizePhone(input.telefone).jid;
    if (!phoneKey) {
      withoutPhone.push(input);
      continue;
    }

    byPhone.set(phoneKey, input);
  }

  return [...withoutPhone, ...byPhone.values()];
}

type CustomerPhoneLookupRow = {
  id: string;
  nome: string;
};

async function findExistingCustomerByPhone(
  supabase: ReturnType<typeof requireSupabase>,
  tenantId: string,
  phone: ReturnType<typeof normalizePhone>,
  excludeId?: string,
) {
  if (!phone.jid) {
    return null;
  }

  const localDigits = phone.digits.replace(/^55/, "");
  const candidates = [
    { field: "phone_jid", value: phone.jid },
    { field: "phone_digits", value: phone.digits },
    { field: "phone_digits", value: localDigits },
  ].filter((candidate) => candidate.value);

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, nome")
      .eq("tenant_id", tenantId)
      .eq(candidate.field, candidate.value)
      .limit(excludeId ? 2 : 1);

    if (error) {
      throw new Error(error.message);
    }

    const match = ((data ?? []) as CustomerPhoneLookupRow[]).find((customer) => customer.id !== excludeId);
    if (match) {
      return match;
    }
  }

  return null;
}

function buildDuplicatePhoneMessage(phone: string, customerName: string) {
  return `Telefone ${phone} ja esta cadastrado para ${customerName}.`;
}

export function toCustomerUpsertInput(customer: Customer): CustomerUpsertInput {
  return {
    codigo: customer.codigo,
    origem: customer.origem,
    nome: customer.nome,
    telefone: customer.telefone,
    celular: customer.celular,
    email: customer.email,
    cnpj: customer.cnpj,
    endereco: customer.endereco,
    perfil: customer.perfil,
    rota: customer.rota,
    status: customer.status,
    vendedor: customer.vendedor,
    ultimoPedido: customer.ultimoPedido,
    ticketMedio: customer.ticketMedio,
    frequenciaCompra: customer.frequenciaCompra,
    totalGasto: customer.totalGasto,
    tipo: customer.tipo,
    razaoSocial: customer.razaoSocial,
    inscricaoEstadual: customer.inscricaoEstadual,
    inscricaoMunicipal: customer.inscricaoMunicipal,
    cpf: customer.cpf,
    rg: customer.rg,
    nascimento: customer.nascimento,
    nomeSocial: customer.nomeSocial,
    fax: customer.fax,
    canal: customer.canal,
    cep: customer.cep,
    logradouro: customer.logradouro,
    numero: customer.numero,
    bairro: customer.bairro,
    zone: customer.zone,
    complemento: customer.complemento,
    cidade: customer.cidade,
    estado: customer.estado,
    ativo: customer.ativo,
    observacoes: customer.observacoes,
    cadastradoEm: customer.cadastradoEm,
    sourceColumns: customer.sourceColumns,
  };
}

function getSeedCustomers(): Customer[] {
  return [];
}

function readLocalCustomers() {
  if (typeof window === "undefined") {
    return getSeedCustomers();
  }

  const storedCustomers = window.localStorage.getItem(CUSTOMERS_STORAGE_KEY);
  if (!storedCustomers) {
    const seededCustomers = getSeedCustomers();
    window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(seededCustomers));
    return seededCustomers;
  }

  try {
    return JSON.parse(storedCustomers) as Customer[];
  } catch {
    const seededCustomers = getSeedCustomers();
    window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(seededCustomers));
    return seededCustomers;
  }
}

function writeLocalCustomers(customers: Customer[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function inferCustomerZone(customer: Customer) {
  const source = [
    customer.bairro,
    customer.endereco,
    customer.complemento,
    customer.observacoes,
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedSource = normalizeText(source);

  if (!normalizedSource) {
    return "";
  }

  if (normalizedSource.includes("zona norte") || /\bnorte\b/.test(normalizedSource)) {
    return "Zona Norte";
  }

  if (normalizedSource.includes("zona sul") || /\bsul\b/.test(normalizedSource)) {
    return "Zona Sul";
  }

  if (normalizedSource.includes("zona leste") || /\bleste\b/.test(normalizedSource)) {
    return "Zona Leste";
  }

  if (normalizedSource.includes("zona oeste") || /\boeste\b/.test(normalizedSource)) {
    return "Zona Oeste";
  }

  if (normalizedSource.includes("centro")) {
    return "Centro";
  }

  if (normalizedSource.includes("metropolitana")) {
    return "Regiao Metropolitana";
  }

  if (normalizedSource.includes("litoral") || normalizedSource.includes("praia")) {
    return "Litoral";
  }

  if (normalizedSource.includes("interior")) {
    return "Interior";
  }

  if (
    normalizedSource.includes("area rural") ||
    normalizedSource.includes("rural") ||
    normalizedSource.includes("sitio") ||
    normalizedSource.includes("fazenda") ||
    normalizedSource.includes("chacara")
  ) {
    return "Area Rural";
  }

  const cep = Number.parseInt(onlyDigits(customer.cep ?? ""), 10);
  const customerState = normalizeText(customer.estado);
  const customerCity = normalizeText(customer.cidade);

  if (customerState === "sp" && customerCity === "sao paulo" && Number.isFinite(cep)) {
    if (cep >= 1000000 && cep <= 1999999) {
      return "Centro";
    }

    if (cep >= 2000000 && cep <= 2999999) {
      return "Zona Norte";
    }

    if ((cep >= 3000000 && cep <= 3999999) || (cep >= 8000000 && cep <= 8499999)) {
      return "Zona Leste";
    }

    if (cep >= 4000000 && cep <= 4999999) {
      return "Zona Sul";
    }

    if (cep >= 5000000 && cep <= 5999999) {
      return "Zona Oeste";
    }
  }

  return "";
}

function findBestRouteMatch(customer: Customer, routes: DeliveryRoute[]) {
  const customerState = normalizeText(customer.estado);
  const customerCity = normalizeText(customer.cidade);
  const customerZone = normalizeText(customer.zone?.trim() || inferCustomerZone(customer));

  const candidates = routes
    .filter((route) => route.status === "ativo")
    .map((route) => {
      const routeState = normalizeText(route.estado);
      const routeCity = normalizeText(route.cidade);
      const routeZone = normalizeText(route.zona);

      if (routeState && routeState !== customerState) {
        return null;
      }

      if (routeCity && routeCity !== customerCity) {
        return null;
      }

      if (routeZone && routeZone !== customerZone) {
        return null;
      }

      let score = 0;
      if (routeState && routeState === customerState) {
        score += 40;
      }
      if (routeCity && routeCity === customerCity) {
        score += 35;
      }
      if (routeZone && routeZone === customerZone) {
        score += 30;
      }

      score += [routeState, routeCity, routeZone].filter(Boolean).length * 10;

      return { route, score };
    })
    .filter((candidate): candidate is { route: DeliveryRoute; score: number } => candidate !== null)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.route ?? null;
}

async function enrichCustomerAddress(customer: Customer) {
  const cep = onlyDigits(customer.cep ?? "");
  if (cep.length !== 8) {
    return customer;
  }

  const hasState = Boolean(customer.estado?.trim());
  const hasCity = Boolean(customer.cidade?.trim());
  const hasNeighborhood = Boolean(customer.bairro?.trim());
  const hasStreet = Boolean(customer.logradouro?.trim());

  if (hasState && hasCity && hasNeighborhood && hasStreet) {
    return customer;
  }

  try {
    const address = await fetchCepDetails(cep);
    const nextLogradouro = customer.logradouro?.trim() || address.street || "";
    const nextBairro = customer.bairro?.trim() || address.neighborhood || "";
    const nextCidade = customer.cidade?.trim() || address.city || "";
    const nextEstado = customer.estado?.trim() || address.state || "";
    const nextEndereco =
      customer.endereco?.trim() ||
      [nextLogradouro, customer.numero?.trim(), nextBairro].filter(Boolean).join(", ");

    return {
      ...customer,
      cep: customer.cep || address.cep,
      logradouro: nextLogradouro,
      bairro: nextBairro,
      cidade: nextCidade,
      estado: nextEstado,
      endereco: nextEndereco,
    };
  } catch {
    return customer;
  }
}

export type CustomerRouteSyncResult = {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  cepEnriched: number;
};

export async function syncCustomersToRoutes(customerIds?: string[]) {
  const filters = customerIds?.length ? { selectedCustomerIds: customerIds } : {};
  const [customers, routes] = await Promise.all([listCustomers(filters), listRoutes()]);

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let cepEnriched = 0;

  for (const originalCustomer of customers) {
    try {
      const customer = await enrichCustomerAddress(originalCustomer);
      if (customer !== originalCustomer) {
        cepEnriched += 1;
      }
      const matchedRoute = findBestRouteMatch(customer, routes);

      if (!matchedRoute) {
        skipped += 1;
        continue;
      }

      await updateCustomer(customer.id, {
        ...toCustomerUpsertInput(customer),
        rota: matchedRoute.nome,
      });

      synced += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    total: customers.length,
    synced,
    skipped,
    failed,
    cepEnriched,
  } satisfies CustomerRouteSyncResult;
}

function inferRegionKey(customer: Customer): CustomerFilters["regiao"] {
  const value = normalizeText(customer.zone?.trim() || inferCustomerZone(customer));
  if (!value) {
    return "outros";
  }
  if (value.includes("norte")) return "norte";
  if (value.includes("sul")) return "sul";
  if (value.includes("leste")) return "leste";
  if (value.includes("oeste")) return "oeste";
  if (value.includes("centro")) return "centro";
  if (value.includes("metropolitana")) return "metropolitana";
  if (value.includes("litoral")) return "litoral";
  if (value.includes("interior")) return "interior";
  if (value.includes("rural")) return "rural";
  return "outros";
}

function extractCustomerTags(customer: Customer): string[] {
  const tags = new Set<string>();
  const sourceColumns = customer.sourceColumns ?? {};

  const capture = (value?: string | null) => {
    const cleaned = normalizeText(value ?? "");
    if (!cleaned) return;
    for (const token of cleaned.split(/[,\n;|]/)) {
      const trimmed = token.trim();
      if (trimmed.length >= 2) tags.add(trimmed);
    }
  };

  capture(customer.observacoes);
  for (const [key, value] of Object.entries(sourceColumns)) {
    const normalizedKey = normalizeText(key);
    if (normalizedKey.includes("tag")) {
      capture(value);
    }
  }

  return [...tags];
}

function applyFilters(customers: Customer[], filters: CustomerFilters = {}) {
  const normalizedSearch = sanitizeCustomerSearchForPostgrestOrIlike(filters.search ?? "").toLowerCase();
  const tagNeedle = normalizeText(filters.tag ?? "");

  return customers.filter((customer) => {
    const matchesSearch =
      !normalizedSearch ||
      customer.nome.toLowerCase().includes(normalizedSearch) ||
      customer.telefone.toLowerCase().includes(normalizedSearch) ||
      (customer.celular ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.phoneE164 ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.phoneDigits ?? "").includes(normalizedSearch) ||
      (customer.phoneJid ?? "").toLowerCase().includes(normalizedSearch) ||
      customer.email.toLowerCase().includes(normalizedSearch) ||
      customer.cnpj.toLowerCase().includes(normalizedSearch) ||
      (customer.cpf ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.codigo ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.razaoSocial ?? "").toLowerCase().includes(normalizedSearch) ||
      (customer.observacoes ?? "").toLowerCase().includes(normalizedSearch);
    const matchesPerfil = !filters.perfil || filters.perfil === "todos" || customer.perfil === filters.perfil;
    const matchesStatus = !filters.status || filters.status === "todos" || customer.status === filters.status;
    const matchesRota = !filters.rota || filters.rota === "todos" || customer.rota === filters.rota;
    const matchesRegiao =
      !filters.regiao || filters.regiao === "todos" || inferRegionKey(customer) === filters.regiao;
    const bairroNeedle = sanitizeCustomerSearchForPostgrestOrIlike(filters.bairro ?? "").toLowerCase();
    const zoneNeedle = sanitizeCustomerSearchForPostgrestOrIlike(filters.zone ?? "").toLowerCase();
    const matchesBairro =
      !bairroNeedle || (customer.bairro ?? "").toLowerCase().includes(bairroNeedle);
    const matchesZone =
      !zoneNeedle || (customer.zone ?? "").toLowerCase().includes(zoneNeedle);
    const cidadeNeedle = sanitizeCustomerSearchForPostgrestOrIlike(filters.cidade ?? "").toLowerCase();
    const matchesCidade =
      !cidadeNeedle || (customer.cidade ?? "").toLowerCase().includes(cidadeNeedle);
    const matchesAtivoComercial =
      !filters.ativoComercial ||
      filters.ativoComercial === "todos" ||
      (filters.ativoComercial === "sim" ? customer.ativo !== false : customer.ativo === false);
    const obsNeedle = sanitizeCustomerSearchForPostgrestOrIlike(filters.observacoesContem ?? "").toLowerCase();
    const matchesObs =
      !obsNeedle || (customer.observacoes ?? "").toLowerCase().includes(obsNeedle);
    const matchesTag =
      !tagNeedle ||
      extractCustomerTags(customer).some((tag) => tag.includes(tagNeedle));
    const matchesSelection =
      !filters.selectedCustomerIds?.length || filters.selectedCustomerIds.includes(customer.id);

    return (
      matchesSearch &&
      matchesPerfil &&
      matchesStatus &&
      matchesRota &&
      matchesRegiao &&
      matchesBairro &&
      matchesZone &&
      matchesCidade &&
      matchesAtivoComercial &&
      matchesObs &&
      matchesTag &&
      matchesSelection
    );
  });
}

/** Tags distintas no tenant (RPC `list_distinct_customer_tags`), para sugestões sem listar todos os clientes. */
export async function fetchDistinctCustomerTags(): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return [];
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("list_distinct_customer_tags");
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as unknown[];
  const tags = rows
    .map((x) => String(x ?? "").trim())
    .filter((t) => t.length >= 2);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function useDistinctCustomerTags(
  options?: Omit<UseQueryOptions<string[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["distinct-customer-tags"],
    queryFn: fetchDistinctCustomerTags,
    staleTime: 120_000,
    ...options,
  });
}

export async function listCustomers(filters: CustomerFilters = {}) {
  if (!isSupabaseConfigured) {
    return applyFilters(readLocalCustomers(), filters);
  }

  const supabase = requireSupabase();
  let query = supabase.from("customers").select(CUSTOMER_SELECT).order("nome");

  if (filters.perfil && filters.perfil !== "todos") {
    query = query.eq("perfil", filters.perfil);
  }

  if (filters.status && filters.status !== "todos") {
    query = query.eq("status", filters.status);
  }

  if (filters.rota && filters.rota !== "todos") {
    query = query.eq("rota", filters.rota);
  }

  if (filters.bairro?.trim()) {
    const b = sanitizeCustomerSearchForPostgrestOrIlike(filters.bairro);
    if (b.length > 0) {
      query = query.ilike("bairro", `%${b}%`);
    }
  }

  if (filters.zone?.trim()) {
    const z = sanitizeCustomerSearchForPostgrestOrIlike(filters.zone);
    if (z.length > 0) {
      query = query.ilike("zone", `%${z}%`);
    }
  }

  if (filters.cidade?.trim()) {
    const c = sanitizeCustomerSearchForPostgrestOrIlike(filters.cidade);
    if (c.length > 0) {
      query = query.ilike("cidade", `%${c}%`);
    }
  }

  if (filters.ativoComercial === "sim") {
    query = query.or("ativo.eq.true,ativo.is.null");
  } else if (filters.ativoComercial === "nao") {
    query = query.eq("ativo", false);
  }

  if (filters.observacoesContem?.trim()) {
    const obs = sanitizeCustomerSearchForPostgrestOrIlike(filters.observacoesContem);
    if (obs.length > 0) {
      query = query.ilike("observacoes", `%${obs}%`);
    }
  }

  if (filters.search?.trim()) {
    const search = sanitizeCustomerSearchForPostgrestOrIlike(filters.search);
    if (search.length > 0) {
      query = query.or(
        [
          `nome.ilike.%${search}%`,
          `telefone.ilike.%${search}%`,
          `celular.ilike.%${search}%`,
          `phone_e164.ilike.%${search}%`,
          `phone_digits.ilike.%${search}%`,
          `phone_jid.ilike.%${search}%`,
          `email.ilike.%${search}%`,
          `cnpj.ilike.%${search}%`,
          `cpf.ilike.%${search}%`,
          `razao_social.ilike.%${search}%`,
          `observacoes.ilike.%${search}%`,
          `codigo.ilike.%${search}%`,
        ].join(","),
      );
    }
  }

  if (filters.selectedCustomerIds?.length) {
    query = query.in("id", filters.selectedCustomerIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const customers = (data ?? []).map((row) => mapRowToCustomer(row as unknown as CustomerRow));
  return applyFilters(customers, filters);
}

export type PaginatedCustomers = {
  data: Customer[];
  count: number;
};

export async function listPaginatedCustomers(filters: CustomerFilters, page: number, limit: number): Promise<PaginatedCustomers> {
  if (!isSupabaseConfigured) {
    const all = applyFilters(readLocalCustomers(), filters);
    const from = (page - 1) * limit;
    return {
      data: all.slice(from, from + limit),
      count: all.length,
    };
  }

  const supabase = requireSupabase();
  let query = supabase.from("customers").select(CUSTOMER_SELECT, { count: "exact" }).order("nome");

  if (filters.perfil && filters.perfil !== "todos") {
    query = query.eq("perfil", filters.perfil);
  }

  if (filters.status && filters.status !== "todos") {
    query = query.eq("status", filters.status);
  }

  if (filters.rota && filters.rota !== "todos") {
    query = query.eq("rota", filters.rota);
  }

  if (filters.bairro?.trim()) {
    const b = sanitizeCustomerSearchForPostgrestOrIlike(filters.bairro);
    if (b.length > 0) {
      query = query.ilike("bairro", `%${b}%`);
    }
  }

  if (filters.zone?.trim()) {
    const z = sanitizeCustomerSearchForPostgrestOrIlike(filters.zone);
    if (z.length > 0) {
      query = query.ilike("zone", `%${z}%`);
    }
  }

  if (filters.cidade?.trim()) {
    const c = sanitizeCustomerSearchForPostgrestOrIlike(filters.cidade);
    if (c.length > 0) {
      query = query.ilike("cidade", `%${c}%`);
    }
  }

  if (filters.ativoComercial === "sim") {
    query = query.or("ativo.eq.true,ativo.is.null");
  } else if (filters.ativoComercial === "nao") {
    query = query.eq("ativo", false);
  }

  if (filters.observacoesContem?.trim()) {
    const obs = sanitizeCustomerSearchForPostgrestOrIlike(filters.observacoesContem);
    if (obs.length > 0) {
      query = query.ilike("observacoes", `%${obs}%`);
    }
  }

  if (filters.search?.trim()) {
    const search = sanitizeCustomerSearchForPostgrestOrIlike(filters.search);
    if (search.length > 0) {
      query = query.or(
        [
          `nome.ilike.%${search}%`,
          `telefone.ilike.%${search}%`,
          `celular.ilike.%${search}%`,
          `phone_e164.ilike.%${search}%`,
          `phone_digits.ilike.%${search}%`,
          `phone_jid.ilike.%${search}%`,
          `email.ilike.%${search}%`,
          `cnpj.ilike.%${search}%`,
          `cpf.ilike.%${search}%`,
          `razao_social.ilike.%${search}%`,
          `observacoes.ilike.%${search}%`,
          `codigo.ilike.%${search}%`,
        ].join(","),
      );
    }
  }

  if (filters.tag?.trim()) {
    const tag = sanitizeCustomerSearchForPostgrestOrIlike(filters.tag);
    if (tag.length > 0) {
      // Approximação server-side
      query = query.ilike("observacoes", `%${tag}%`);
    }
  }

  if (filters.regiao && filters.regiao !== "todos") {
    query = query.ilike("zone", `%${filters.regiao}%`);
  }

  if (filters.selectedCustomerIds?.length) {
    query = query.in("id", filters.selectedCustomerIds);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const customers = (data ?? []).map((row) => mapRowToCustomer(row as unknown as CustomerRow));
  return {
    data: customers,
    count: count ?? 0,
  };
}

export async function getCustomer(id: string) {
  if (!isSupabaseConfigured) {
    return readLocalCustomers().find((customer) => customer.id === id) ?? null;
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase.from("customers").select(CUSTOMER_SELECT).eq("id", id).single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }

    throw new Error(error.message);
  }

  return mapRowToCustomer(data as unknown as CustomerRow);
}

export async function createCustomer(input: CustomerUpsertInput) {
  const normalizedInput = normalizeCustomerInputPhones(input);
  const normalizedPhone = normalizePhone(normalizedInput.telefone);

  if (!isSupabaseConfigured) {
    const customers = readLocalCustomers();
    const duplicate = normalizedPhone.jid
      ? customers.find((customer) => getCustomerPhoneKey(customer) === normalizedPhone.jid)
      : undefined;

    if (duplicate) {
      throw new Error(buildDuplicatePhoneMessage(normalizedInput.telefone, duplicate.nome));
    }

    const nextCustomer: Customer = {
      id: crypto.randomUUID(),
      ...normalizedInput,
      nome: fallbackCustomerDisplayName(normalizedInput.telefone, normalizedInput.nome),
      phoneE164: normalizedPhone.e164,
      phoneDigits: normalizedPhone.digits,
      phoneJid: normalizedPhone.jid,
    };

    writeLocalCustomers([nextCustomer, ...customers]);
    return nextCustomer;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const duplicate = await findExistingCustomerByPhone(supabase, tenantId, normalizedPhone);

  if (duplicate) {
    throw new Error(buildDuplicatePhoneMessage(normalizedInput.telefone, duplicate.nome));
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...mapInputToRow(normalizedInput), tenant_id: tenantId })
    .select(CUSTOMER_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToCustomer(data as unknown as CustomerRow);
}

export async function updateCustomer(id: string, input: CustomerUpsertInput) {
  const normalizedInput = normalizeCustomerInputPhones(input);
  const normalizedPhone = normalizePhone(normalizedInput.telefone);

  if (!isSupabaseConfigured) {
    const customers = readLocalCustomers();
    const duplicate = normalizedPhone.jid
      ? customers.find(
          (customer) =>
            customer.id !== id && getCustomerPhoneKey(customer) === normalizedPhone.jid,
        )
      : undefined;

    if (duplicate) {
      throw new Error(buildDuplicatePhoneMessage(normalizedInput.telefone, duplicate.nome));
    }

    const updatedCustomers = customers.map((customer) =>
      customer.id === id
        ? {
            ...customer,
            ...normalizedInput,
            nome: fallbackCustomerDisplayName(normalizedInput.telefone, normalizedInput.nome),
            phoneE164: normalizedPhone.e164,
            phoneDigits: normalizedPhone.digits,
            phoneJid: normalizedPhone.jid,
          }
        : customer,
    );

    writeLocalCustomers(updatedCustomers);
    return updatedCustomers.find((customer) => customer.id === id) ?? null;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const duplicate = await findExistingCustomerByPhone(supabase, tenantId, normalizedPhone, id);

  if (duplicate) {
    throw new Error(buildDuplicatePhoneMessage(normalizedInput.telefone, duplicate.nome));
  }

  const { data, error } = await supabase
    .from("customers")
    .update(mapInputToRow(normalizedInput))
    .eq("id", id)
    .select(CUSTOMER_SELECT)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapRowToCustomer(data as unknown as CustomerRow);
}

/** Propaga nome do cadastro para conversas vinculadas e negociações do cliente. */
export async function syncCustomerNomeToChatsAndCrm(customerId: string, nome: string): Promise<void> {
  if (!isSupabaseConfigured || !customerId.trim()) {
    return;
  }

  const trimmed = nome.trim();
  if (trimmed.length < 2) {
    return;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();

  const { error: chatError } = await supabase
    .from("whatsapp_chats")
    .update({ display_name: trimmed })
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId);

  if (chatError) {
    throw new Error(chatError.message);
  }

  const { error: negError } = await supabase
    .from("crm_negotiations")
    .update({ title: trimmed })
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId);

  if (negError) {
    throw new Error(negError.message);
  }
}

export async function deleteCustomers(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (!uniqueIds.length) {
    return 0;
  }

  if (!isSupabaseConfigured) {
    const customers = readLocalCustomers();
    const idsToDelete = new Set(uniqueIds);
    const nextCustomers = customers.filter((customer) => !idsToDelete.has(customer.id));
    writeLocalCustomers(nextCustomers);
    return customers.length - nextCustomers.length;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { error, count } = await supabase
    .from("customers")
    .delete({ count: "exact" })
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? uniqueIds.length;
}

export async function importCustomers(inputs: CustomerUpsertInput[]) {
  if (!inputs.length) {
    return [];
  }

  const dedupedInputs = dedupeCustomerInputsByPhone(inputs.map(normalizeCustomerInputPhones));

  if (!isSupabaseConfigured) {
    const nextCustomers = readLocalCustomers();
    const importedCustomers: Customer[] = [];

    for (const input of dedupedInputs) {
      const normalizedInput = normalizeCustomerInputPhones(input);
      const normalizedPhone = normalizePhone(normalizedInput.telefone);
      const existingIndex = normalizedPhone.jid
        ? nextCustomers.findIndex((customer) => getCustomerPhoneKey(customer) === normalizedPhone.jid)
        : -1;

      if (existingIndex >= 0) {
        const updatedCustomer = {
          ...nextCustomers[existingIndex],
          ...normalizedInput,
          nome: fallbackCustomerDisplayName(normalizedInput.telefone, normalizedInput.nome),
          phoneE164: normalizedPhone.e164,
          phoneDigits: normalizedPhone.digits,
          phoneJid: normalizedPhone.jid,
        };
        nextCustomers[existingIndex] = updatedCustomer;
        importedCustomers.push(updatedCustomer);
        continue;
      }

      const nextCustomer = {
        id: crypto.randomUUID(),
        ...normalizedInput,
        nome: fallbackCustomerDisplayName(normalizedInput.telefone, normalizedInput.nome),
        phoneE164: normalizedPhone.e164,
        phoneDigits: normalizedPhone.digits,
        phoneJid: normalizedPhone.jid,
      };

      nextCustomers.unshift(nextCustomer);
      importedCustomers.push(nextCustomer);
    }

    writeLocalCustomers(nextCustomers);
    return importedCustomers;
  }

  const supabase = requireSupabase();
  const tenantId = await getCurrentTenantId();
  const { data, error } = await supabase
    .from("customers")
    .upsert(
      dedupedInputs.map((input) => ({ ...mapInputToRow(input), tenant_id: tenantId })),
      { onConflict: "tenant_id,phone_jid" },
    )
    .select(CUSTOMER_SELECT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRowToCustomer(row as unknown as CustomerRow));
}

export function useCustomers(
  filters: CustomerFilters,
  options?: Omit<UseQueryOptions<Customer[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customers", filters],
    queryFn: () => listCustomers(filters),
    ...options,
  });
}

export function usePaginatedCustomers(
  filters: CustomerFilters,
  page: number,
  limit: number,
  options?: Omit<UseQueryOptions<PaginatedCustomers, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customers", "paginated", filters, page, limit],
    queryFn: () => listPaginatedCustomers(filters, page, limit),
    ...options,
  });
}

// Colunas mínimas que o Kanban/cards do CRM realmente leem (nome, status, perfil,
// observações, telefones p/ dedup, source_columns p/ etapa/funil, email p/ busca).
const BOARD_CUSTOMER_SELECT = [
  "id",
  "nome",
  "status",
  "perfil",
  "observacoes",
  "email",
  "telefone",
  "celular",
  "phone_e164",
  "phone_digits",
  "phone_jid",
  "source_columns",
  "cadastrado_em",
].join(", ");

function mapBoardCustomerRow(row: Record<string, unknown>): Customer {
  const r = row as unknown as CustomerRow;
  return {
    id: r.id,
    nome: r.nome,
    telefone: r.phone_e164 ?? toE164Phone(r.telefone),
    celular: r.celular ? toE164Phone(r.celular) : undefined,
    phoneE164: r.phone_e164,
    phoneDigits: r.phone_digits,
    phoneJid: r.phone_jid,
    perfil: r.perfil,
    status: r.status,
    email: r.email ?? "",
    observacoes: r.observacoes ?? undefined,
    cadastradoEm: r.cadastrado_em ?? undefined,
    sourceColumns: SafeStringRecordSchema.parse(r.source_columns),
    // Campos não carregados no board recebem defaults seguros (shape completo).
    rota: "",
    ultimoPedido: "",
    cnpj: "",
    endereco: "",
    vendedor: "",
    ticketMedio: 0,
    frequenciaCompra: "",
    totalGasto: 0,
  };
}

/** Listagem enxuta para o board do CRM — evita carregar ~35 colunas por cliente. */
export async function listCustomersForBoard(): Promise<Customer[]> {
  if (!isSupabaseConfigured) {
    return readLocalCustomers();
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("customers")
    .select(BOARD_CUSTOMER_SELECT)
    .order("nome");
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapBoardCustomerRow(row as unknown as Record<string, unknown>));
}

export function useCustomersForBoard(
  options?: Omit<UseQueryOptions<Customer[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customers", "board"],
    queryFn: listCustomersForBoard,
    staleTime: 30_000,
    ...options,
  });
}

export function useCustomer(
  id: string | undefined,
  options?: Omit<UseQueryOptions<Customer | null, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => getCustomer(id as string),
    enabled: Boolean(id),
    ...options,
  });
}

export function useCreateCustomer(
  options?: UseMutationOptions<Customer, Error, CustomerUpsertInput>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCustomer,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["distinct-customer-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useUpdateCustomer(
  options?: UseMutationOptions<Customer | null, Error, { id: string; input: CustomerUpsertInput }>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => updateCustomer(id, input),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["customers", variables.id] });
      await queryClient.invalidateQueries({ queryKey: ["distinct-customer-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useDeleteCustomers(
  options?: UseMutationOptions<number, Error, string[]>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCustomers,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["distinct-customer-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useImportCustomers(
  options?: UseMutationOptions<Customer[], Error, CustomerUpsertInput[]>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importCustomers,
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["distinct-customer-tags"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}

export function useSyncCustomersToRoutes(
  options?: UseMutationOptions<CustomerRouteSyncResult, Error, string[] | undefined>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (customerIds) => syncCustomersToRoutes(customerIds),
    ...options,
    onSuccess: async (data, variables, context) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
