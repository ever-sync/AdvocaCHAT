import { describe, expect, it } from "vitest";
import type { CrmNegotiation, Customer } from "@/types/domain";
import {
  customerPhoneOptions,
  resolveCrmWhatsappOpenAction,
} from "@/lib/crm/crm-whatsapp-inbox";

function makeCustomer(partial: Partial<Customer> = {}): Customer {
  return {
    id: "cust-1",
    nome: "Francisca Pereira",
    telefone: "+5511999887766",
    celular: "+5511988776655",
    email: "",
    cnpj: "",
    endereco: "",
    perfil: "B",
    rota: "",
    ultimoPedido: "2026-01-01",
    status: "ativo",
    vendedor: "",
    ticketMedio: 0,
    frequenciaCompra: "",
    totalGasto: 0,
    cadastradoEm: "2026-01-01",
    ...partial,
  };
}

function makeCard(partial: Partial<CrmNegotiation> = {}): CrmNegotiation {
  return {
    id: "neg-1",
    funnelId: "f1",
    stageId: "s1",
    status: "em_andamento",
    assigneeId: "u1",
    title: "Francisca Pereira",
    starCount: 0,
    createdAt: "2026-01-01T10:00:00.000Z",
    qualification: 3,
    totalValue: 0,
    ...partial,
  };
}

describe("customerPhoneOptions", () => {
  it("returns telefone and celular when both differ", () => {
    const options = customerPhoneOptions(makeCustomer());
    expect(options).toHaveLength(2);
    expect(options.map((o) => o.key)).toEqual(["telefone", "celular"]);
  });

  it("dedupes identical numbers", () => {
    const options = customerPhoneOptions(
      makeCustomer({ telefone: "+5511999887766", celular: "+5511999887766" }),
    );
    expect(options).toHaveLength(1);
  });
});

describe("resolveCrmWhatsappOpenAction", () => {
  it("asks to pick when customer has two phones", () => {
    const action = resolveCrmWhatsappOpenAction({
      card: makeCard(),
      customer: makeCustomer(),
    });
    expect(action.kind).toBe("pick");
    if (action.kind === "pick") {
      expect(action.options).toHaveLength(2);
    }
  });

  it("opens directly with one phone", () => {
    const action = resolveCrmWhatsappOpenAction({
      card: makeCard(),
      customer: makeCustomer({ celular: "" }),
    });
    expect(action).toEqual({ kind: "open", phone: "+5511999887766" });
  });

  it("falls back to source chat when no phones", () => {
    const action = resolveCrmWhatsappOpenAction({
      card: makeCard({ sourceChatId: "chat-1" }),
      customer: null,
    });
    expect(action).toEqual({ kind: "open_chat", chatId: "chat-1" });
  });

  it("prefers source chat over customer phones", () => {
    const action = resolveCrmWhatsappOpenAction({
      card: makeCard({ sourceChatId: "chat-linked" }),
      customer: makeCustomer(),
    });
    expect(action).toEqual({ kind: "open_chat", chatId: "chat-linked" });
  });
});
