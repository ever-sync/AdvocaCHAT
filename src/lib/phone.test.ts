import { describe, expect, it } from "vitest";
import { buildChatDisplayName, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("retorna vazio quando nao ha digitos", () => {
    const r = normalizePhone("abc");
    expect(r.digits).toBe("");
    expect(r.e164).toBeNull();
    expect(r.jid).toBeNull();
  });

  it("prefixa 55 quando falta DDI", () => {
    const r = normalizePhone("(11) 98765-4321");
    expect(r.digits).toBe("5511987654321");
    expect(r.e164).toBe("+5511987654321");
    expect(r.jid).toBe("5511987654321@s.whatsapp.net");
  });

  it("preserva 55 inicial", () => {
    const r = normalizePhone("5511987654321");
    expect(r.digits).toBe("5511987654321");
    expect(r.e164).toBe("+5511987654321");
  });

  it("remove zero e codigo de operadora antes do DDD", () => {
    const r = normalizePhone("0 21 11 98765-4321");
    expect(r.digits).toBe("5511987654321");
    expect(r.jid).toBe("5511987654321@s.whatsapp.net");
  });

  it("ignora numeros curtos sem DDD", () => {
    const r = normalizePhone("12345");
    expect(r.digits).toBe("");
    expect(r.e164).toBeNull();
    expect(r.jid).toBeNull();
  });

  it("descarta lixo no fim quando o inicio comeca com DDD valido", () => {
    /* Importacoes "sujas" (ex.: extensao/ID interno coladas no telefone)
     * antes ficavam truncadas pelos ULTIMOS digitos, gerando DDD invalido. */
    const r = normalizePhone("85001832001701");
    expect(r.e164).toBe("+5585001832001");
  });

  it("mantem o DDD do inicio mesmo com sufixo grande", () => {
    const r = normalizePhone("12981092776 1234");
    expect(r.e164).toBe("+5512981092776");
  });
});

describe("buildChatDisplayName", () => {
  it("prefere nome", () => {
    expect(buildChatDisplayName("Maria", "11999999999")).toBe("Maria");
  });

  it("cai no telefone sem nome", () => {
    expect(buildChatDisplayName("", "11988887777")).toBe("11988887777");
  });

  it("fallback sem dados", () => {
    expect(buildChatDisplayName(null, null)).toBe("Sem nome");
  });
});
