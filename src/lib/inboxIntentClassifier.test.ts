import { describe, expect, it } from "vitest";
import {
  buildIntentClassifierPrompt,
  parseIntentClassifierReply,
} from "./inboxIntentClassifier";
import type { ChatTag, WhatsappMessage } from "@/types/domain";

function mkTag(id: string, name: string): ChatTag {
  return {
    id,
    name,
    color: "#000",
    scope: "global",
    tenantId: "tn",
    createdBy: "u0",
    createdAt: "2026-06-01T12:00:00.000Z",
  };
}

function mkMsg(over: Partial<WhatsappMessage>): WhatsappMessage {
  return {
    id: over.id ?? "m1",
    chatId: "c1",
    instanceId: "i1",
    direction: over.direction ?? "inbound",
    messageType: "text",
    status: "delivered",
    bodyText: over.bodyText ?? null,
    mediaUrl: null,
    quotedMessageId: null,
    createdAt: "2026-06-01T12:00:00.000Z",
    sentAt: null,
    receivedAt: null,
  } as WhatsappMessage;
}

const CATALOG: ChatTag[] = [
  mkTag("t1", "preço"),
  mkTag("t2", "cancelamento"),
  mkTag("t3", "dúvida técnica"),
  mkTag("t4", "VIP"),
];

describe("buildIntentClassifierPrompt", () => {
  it("retorna 1 mensagem user com a lista permitida e o histórico", () => {
    const out = buildIntentClassifierPrompt(
      [mkMsg({ bodyText: "Quanto custa?" }), mkMsg({ id: "m2", direction: "outbound", bodyText: "R$ 100" })],
      CATALOG,
    );
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
    expect(out[0].text).toContain("preço");
    expect(out[0].text).toContain("cancelamento");
    expect(out[0].text).toContain("[cliente] Quanto custa?");
    expect(out[0].text).toContain("[atendente] R$ 100");
  });

  it("avisa quando o histórico não tem texto", () => {
    const out = buildIntentClassifierPrompt([], CATALOG);
    expect(out[0].text).toContain("conversa ainda sem mensagens");
  });

  it("avisa quando o catálogo está vazio", () => {
    const out = buildIntentClassifierPrompt([mkMsg({ bodyText: "oi" })], []);
    expect(out[0].text).toContain("catálogo vazio");
  });
});

describe("parseIntentClassifierReply", () => {
  it("mapeia 1 tag única", () => {
    const r = parseIntentClassifierReply("preço", CATALOG);
    expect(r.matched.map((t) => t.id)).toEqual(["t1"]);
  });

  it("mapeia múltiplas tags separadas por vírgula", () => {
    const r = parseIntentClassifierReply("preço, cancelamento", CATALOG);
    expect(r.matched.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("case-insensitive", () => {
    const r = parseIntentClassifierReply("VIP, Preço", CATALOG);
    expect(r.matched.map((t) => t.id).sort()).toEqual(["t1", "t4"]);
  });

  it("tolera prefixo 'Etiquetas:'", () => {
    const r = parseIntentClassifierReply("Etiquetas: preço, VIP", CATALOG);
    expect(r.matched.map((t) => t.id).sort()).toEqual(["t1", "t4"]);
  });

  it("tolera bullets ('- foo')", () => {
    const r = parseIntentClassifierReply("- preço\n- cancelamento", CATALOG);
    expect(r.matched.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("ignora ponto final e aspas", () => {
    const r = parseIntentClassifierReply('"preço", "cancelamento".', CATALOG);
    expect(r.matched.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
  });

  it("corta sufixo (motivo: ...)", () => {
    const r = parseIntentClassifierReply("preço (motivo: pediu desconto), VIP", CATALOG);
    expect(r.matched.map((t) => t.id).sort()).toEqual(["t1", "t4"]);
  });

  it("deduplica matches repetidos", () => {
    const r = parseIntentClassifierReply("preço, preço, PREÇO", CATALOG);
    expect(r.matched).toHaveLength(1);
  });

  it("ignora itens fora do catálogo (sem alucinar)", () => {
    const r = parseIntentClassifierReply("preço, lava-jato, brigadeiro", CATALOG);
    expect(r.matched.map((t) => t.id)).toEqual(["t1"]);
  });

  it("sentinela '—' devolve lista vazia", () => {
    const r = parseIntentClassifierReply("—", CATALOG);
    expect(r.matched).toEqual([]);
  });

  it("vazio devolve lista vazia", () => {
    expect(parseIntentClassifierReply("", CATALOG).matched).toEqual([]);
    expect(parseIntentClassifierReply("   ", CATALOG).matched).toEqual([]);
  });

  it("preserva rawText pra debug", () => {
    const r = parseIntentClassifierReply("Etiquetas: preço.", CATALOG);
    expect(r.rawText).toBe("Etiquetas: preço.");
  });
});
