import { describe, expect, it } from "vitest";
import { DEFAULT_CRM_FUNNELS, type CrmFunnel } from "@/data/crm-funnels";
import { CRM_FUNNEL_ID_KEY, CRM_PIPELINE_STAGE_KEY } from "@/lib/crm-pipeline";
import type { CrmNegotiation, Customer } from "@/types/domain";
import type { CrmNegotiationRecord } from "@/types/domain";
import {
  buildLinkedCustomerIdsForKanban,
  buildSyntheticCustomerNegotiationCards,
  customerMatchesCrmFunnel,
  customerStatusToSyntheticNegotiationStatus,
  customerStageForFunnel,
  dedupeNegotiationsForKanban,
  isSyntheticCustomerCardId,
  parseCrmNegotiationStatus,
  parseSyntheticCustomerCardId,
  resolveKanbanCustomerKey,
  resolveKanbanStageId,
  syntheticCustomerCardId,
} from "./negotiation-model";

const baseCard = (): CrmNegotiation => ({
  id: "lead-1",
  funnelId: "comercial",
  stageId: "lead",
  status: "em_andamento",
  assigneeId: "u1",
  title: "Lead",
  starCount: 0,
  createdAt: "2026-01-01T12:00:00.000Z",
  qualification: 2,
  totalValue: 0,
});

const stages = new Set(["lead", "contato", "andamento", "contrato", "venda"]);

describe("resolveKanbanStageId", () => {
  it("usa estágio persistido quando funil bate", () => {
    const stageId = resolveKanbanStageId({
      base: baseCard(),
      funnelId: "comercial",
      validStageIds: stages,
      customer: undefined,
      stageOverride: undefined,
      persisted: { funnelId: "comercial", stageId: "venda" },
    });
    expect(stageId).toBe("venda");
  });

  it("ignora persistido se funil divergir", () => {
    const stageId = resolveKanbanStageId({
      base: baseCard(),
      funnelId: "comercial",
      validStageIds: stages,
      customer: undefined,
      stageOverride: undefined,
      persisted: { funnelId: "auxilio", stageId: "venda" },
    });
    expect(stageId).toBe("lead");
  });

  it("prioriza cliente vinculado sobre override", () => {
    const customer: Customer = {
      id: "c1",
      nome: "X",
      telefone: "",
      perfil: "B",
      rota: "",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
      sourceColumns: {
        crm_pipeline_stage: "contato",
        crm_funnel_id: "comercial",
      },
    };
    const stageId = resolveKanbanStageId({
      base: baseCard(),
      funnelId: "comercial",
      validStageIds: stages,
      customer,
      stageOverride: { funnel_id: "comercial", stage_id: "venda" },
      persisted: undefined,
    });
    expect(stageId).toBe("contato");
  });

  it("usa override quando não há cliente", () => {
    const stageId = resolveKanbanStageId({
      base: baseCard(),
      funnelId: "comercial",
      validStageIds: stages,
      customer: undefined,
      stageOverride: { funnel_id: "comercial", stage_id: "andamento" },
      persisted: undefined,
    });
    expect(stageId).toBe("andamento");
  });

  it("status perdido vai para etapa de perda mesmo com cliente na primeira etapa", () => {
    const customer: Customer = {
      id: "c1",
      nome: "Raphael",
      telefone: "",
      perfil: "B",
      rota: "",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
      sourceColumns: {
        crm_pipeline_stage: "lead",
        crm_funnel_id: "comercial",
      },
    };
    const stageId = resolveKanbanStageId({
      base: { ...baseCard(), status: "perdido", stageId: "perdido" },
      funnelId: "comercial",
      validStageIds: new Set([...stages, "lead-perdido"]),
      customer,
      stageOverride: undefined,
      persisted: { funnelId: "comercial", stageId: "perdido" },
      terminalStages: { lostStageId: "lead-perdido", saleStageId: "venda" },
    });
    expect(stageId).toBe("lead-perdido");
  });

  it("ignora etapa do cliente quando há negociação persistida", () => {
    const customer: Customer = {
      id: "c1",
      nome: "X",
      telefone: "",
      perfil: "B",
      rota: "",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
      sourceColumns: {
        crm_pipeline_stage: "contato",
        crm_funnel_id: "comercial",
      },
    };
    const stageId = resolveKanbanStageId({
      base: baseCard(),
      funnelId: "comercial",
      validStageIds: stages,
      customer,
      stageOverride: undefined,
      persisted: { funnelId: "comercial", stageId: "andamento" },
    });
    expect(stageId).toBe("andamento");
  });

  it("status vendido vai para etapa de venda configurada", () => {
    const stageId = resolveKanbanStageId({
      base: { ...baseCard(), status: "vendido" },
      funnelId: "comercial",
      validStageIds: new Set([...stages, "clientes"]),
      customer: undefined,
      stageOverride: undefined,
      persisted: { funnelId: "comercial", stageId: "lead" },
      terminalStages: { lostStageId: "perdido", saleStageId: "clientes" },
    });
    expect(stageId).toBe("clientes");
  });
});

describe("customerStageForFunnel", () => {
  it("retorna null se funil do cliente divergir", () => {
    const customer: Customer = {
      id: "c1",
      nome: "X",
      telefone: "",
      perfil: "B",
      rota: "",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
      sourceColumns: {
        crm_pipeline_stage: "contato",
        crm_funnel_id: "auxilio",
      },
    };
    expect(customerStageForFunnel(customer, "comercial", stages)).toBeNull();
  });
});

describe("customerMatchesCrmFunnel", () => {
  it("aceita cliente sem crm_funnel_id em qualquer funil", () => {
    const customer: Customer = {
      id: "c1",
      nome: "X",
      telefone: "",
      perfil: "B",
      rota: "",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
    };
    expect(customerMatchesCrmFunnel(customer, "comercial")).toBe(true);
  });
});

describe("parseCrmNegotiationStatus", () => {
  it("normaliza nao_pausado legado para em_andamento", () => {
    expect(parseCrmNegotiationStatus("nao_pausado")).toBe("em_andamento");
    expect(parseCrmNegotiationStatus("pausado")).toBe("pausado");
  });
});

describe("synthetic customer card id", () => {
  it("round-trips", () => {
    const id = syntheticCustomerCardId("abc");
    expect(id).toBe("customer:abc");
    expect(parseSyntheticCustomerCardId(id)).toBe("abc");
    expect(isSyntheticCustomerCardId(id)).toBe(true);
    expect(isSyntheticCustomerCardId("uuid-real")).toBe(false);
  });
});

describe("buildSyntheticCustomerNegotiationCards", () => {
  const funnels: CrmFunnel[] = [
    {
      id: "comercial",
      listName: "COMERCIAL",
      stages: [
        { id: "lead", title: "LEAD QUALIFICADA" },
        { id: "contato", title: "CONTATO FEITO" },
        { id: "andamento", title: "EM ANDAMENTO" },
        { id: "contrato", title: "ENVIO CONTRATO", requiredFields: ["total_value"] },
        { id: "venda", title: "VENDA", requiredFields: ["total_value"], isSaleStage: true },
      ],
    },
  ];

  function makeCustomer(overrides: Partial<Customer> & Pick<Customer, "id" | "nome">): Customer {
    return {
      telefone: "11999999999",
      perfil: "A",
      rota: "R1",
      ultimoPedido: "",
      status: "ativo",
      email: "",
      cnpj: "",
      endereco: "",
      vendedor: "",
      ticketMedio: 0,
      frequenciaCompra: "",
      totalGasto: 0,
      cadastradoEm: "2026-03-01T12:00:00.000Z",
      ...overrides,
    };
  }

  it("inclui cliente com etapa no cadastro sem negociação vinculada", () => {
    const customer = makeCustomer({
      id: "cust-1",
      nome: "Maria",
      sourceColumns: {
        [CRM_FUNNEL_ID_KEY]: "comercial",
        [CRM_PIPELINE_STAGE_KEY]: "contato",
      },
    });
    const cards = buildSyntheticCustomerNegotiationCards({
      customers: [customer],
      funnelId: "comercial",
      funnels,
      linkedCustomerIds: new Set(),
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("customer:cust-1");
    expect(cards[0].stageId).toBe("contato");
    expect(cards[0].customerId).toBe("cust-1");
    expect(cards[0].title).toBe("Maria");
  });

  it("omite cliente que já tem negociação no funil", () => {
    const customer = makeCustomer({
      id: "cust-2",
      nome: "João",
      sourceColumns: {
        [CRM_PIPELINE_STAGE_KEY]: "lead",
      },
    });
    const cards = buildSyntheticCustomerNegotiationCards({
      customers: [customer],
      funnelId: "comercial",
      funnels,
      linkedCustomerIds: new Set(["cust-2"]),
    });
    expect(cards).toHaveLength(0);
  });

  it("buildLinkedCustomerIdsForKanban vincula por título quando não há customer_id", () => {
    const customer = makeCustomer({
      id: "cust-fatima",
      nome: "Fátima Da Silva Ferreira",
      sourceColumns: { [CRM_PIPELINE_STAGE_KEY]: "lead" },
    });
    const row: CrmNegotiationRecord = {
      id: "neg-1",
      tenantId: "t1",
      title: "Fátima Da Silva Ferreira",
      funnelId: "comercial",
      stageId: "contato",
      status: "em_andamento",
      assigneeId: "user-1",
      customerId: null,
      starCount: 0,
      qualification: 0,
      totalValue: 0,
      createdAt: "2026-01-01T12:00:00.000Z",
      updatedAt: "2026-01-01T12:00:00.000Z",
      nextTaskAt: null,
      closingForecast: null,
      lastContactAt: null,
      lastInteractionAt: null,
      sourceChatId: null,
      lostReason: null,
      sourceChatPreview: null,
      sourceChatUnread: 0,
      otherInfo: {},
    };
    const linked = buildLinkedCustomerIdsForKanban([row], [customer], "comercial");
    expect(linked.has("cust-fatima")).toBe(true);
    const cards = buildSyntheticCustomerNegotiationCards({
      customers: [customer],
      funnelId: "comercial",
      funnels,
      linkedCustomerIds: linked,
    });
    expect(cards).toHaveLength(0);
  });

  it("mapeia inativo para pausado e bloqueado para perdido", () => {
    expect(customerStatusToSyntheticNegotiationStatus("inativo")).toBe("pausado");
    expect(customerStatusToSyntheticNegotiationStatus("bloqueado")).toBe("perdido");
    const paused = makeCustomer({
      id: "cust-3",
      nome: "Ana",
      status: "inativo",
      sourceColumns: { [CRM_PIPELINE_STAGE_KEY]: "andamento" },
    });
    const cards = buildSyntheticCustomerNegotiationCards({
      customers: [paused],
      funnelId: "comercial",
      funnels,
      linkedCustomerIds: new Set(),
    });
    expect(cards[0]?.status).toBe("pausado");
  });
});

describe("dedupeNegotiationsForKanban", () => {
  const customer = {
    id: "cust-fatima",
    nome: "Fátima Da Silva Ferreira",
    telefone: "",
    perfil: "A" as const,
    rota: "",
    ultimoPedido: "",
    status: "ativo" as const,
    email: "",
    cnpj: "",
    endereco: "",
    vendedor: "",
    ticketMedio: 0,
    frequenciaCompra: "",
    totalGasto: 0,
  };

  it("mantém negociação atribuída quando há duplicata no pool", () => {
    const assigned: CrmNegotiation = {
      ...baseCard(),
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      title: "Fátima Da Silva Ferreira",
      assigneeId: "user-1",
      customerId: "cust-fatima",
    };
    const pool: CrmNegotiation = {
      ...baseCard(),
      id: "11111111-2222-3333-4444-555555555555",
      title: "Fátima Da Silva Ferreira",
      assigneeId: "",
      customerId: undefined,
    };
    const deduped = dedupeNegotiationsForKanban([pool, assigned], [customer]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe(assigned.id);
  });

  it("agrupa pelo telefone no mesmo funil (customer_id + nome com acento/espaço)", () => {
    const phoneCustomer = { ...customer, id: "cust-1", nome: "João  Silva", telefone: "11 99999-8888" };
    const linked: CrmNegotiation = {
      ...baseCard(),
      id: "aaaaaaaa-1111-2222-3333-444444444444",
      title: "qualquer",
      customerId: "cust-1",
    };
    // Sem customer_id, título "Joao Silva" (sem acento, 1 espaço) → casa pelo nome.
    const byName: CrmNegotiation = {
      ...baseCard(),
      id: "bbbbbbbb-1111-2222-3333-444444444444",
      title: "Joao Silva",
      customerId: undefined,
    };
    const keyLinked = resolveKanbanCustomerKey(linked, [phoneCustomer]);
    expect(keyLinked).toBe("phone:11999998888");
    expect(resolveKanbanCustomerKey(byName, [phoneCustomer])).toBe(keyLinked);
    const deduped = dedupeNegotiationsForKanban([linked, byName], [phoneCustomer]);
    expect(deduped).toHaveLength(1);
  });

  it("permite a mesma lead em funis diferentes (um telefone por pipeline)", () => {
    const c = { ...customer, id: "cust-2", nome: "Maria", telefone: "11 98888-7777" };
    const a: CrmNegotiation = { ...baseCard(), id: "cccccccc-1111-2222-3333-444444444444", funnelId: "comercial", customerId: "cust-2" };
    const b: CrmNegotiation = { ...baseCard(), id: "dddddddd-1111-2222-3333-444444444444", funnelId: "auxilio", customerId: "cust-2" };
    const deduped = dedupeNegotiationsForKanban([a, b], [c]);
    expect(deduped).toHaveLength(2);
  });

  it("funde dois cadastros de cliente com o mesmo telefone no mesmo funil", () => {
    const c1 = { ...customer, id: "dup-a", nome: "Ana", telefone: "11 97777-6666" };
    const c2 = { ...customer, id: "dup-b", nome: "Ana Paula", telefone: "11 97777-6666" };
    const n1: CrmNegotiation = { ...baseCard(), id: "11111111-aaaa-2222-3333-444444444444", customerId: "dup-a" };
    const n2: CrmNegotiation = { ...baseCard(), id: "22222222-aaaa-2222-3333-444444444444", customerId: "dup-b" };
    const deduped = dedupeNegotiationsForKanban([n1, n2], [c1, c2]);
    expect(deduped).toHaveLength(1);
  });
});
