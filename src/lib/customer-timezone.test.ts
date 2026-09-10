import { describe, expect, it } from "vitest";
import { formatLocalTime, inferCustomerTimezone } from "./customer-timezone";

describe("inferCustomerTimezone", () => {
  it("retorna null sem telefone", () => {
    expect(inferCustomerTimezone(null)).toBeNull();
    expect(inferCustomerTimezone(undefined)).toBeNull();
    expect(inferCustomerTimezone("")).toBeNull();
  });

  it("retorna null para números muito curtos", () => {
    expect(inferCustomerTimezone("123")).toBeNull();
  });

  it("default Brasil = America/Sao_Paulo (DDD 11)", () => {
    expect(inferCustomerTimezone("+5511987654321")).toEqual({
      timezone: "America/Sao_Paulo",
      label: "Brasília",
    });
  });

  it("aceita só dígitos (sem +)", () => {
    expect(inferCustomerTimezone("5511987654321")?.timezone).toBe("America/Sao_Paulo");
  });

  it("ignora formatação do telefone", () => {
    expect(inferCustomerTimezone("+55 (11) 98765-4321")?.timezone).toBe("America/Sao_Paulo");
  });

  it("Manaus (DDD 92) → America/Manaus", () => {
    expect(inferCustomerTimezone("+5592999990000")).toEqual({
      timezone: "America/Manaus",
      label: "Manaus",
    });
  });

  it("Rio Branco (DDD 68) → America/Rio_Branco", () => {
    expect(inferCustomerTimezone("+5568999990000")).toEqual({
      timezone: "America/Rio_Branco",
      label: "Rio Branco",
    });
  });

  it("Cuiabá (DDD 65/66) → America/Cuiaba", () => {
    expect(inferCustomerTimezone("+5565999990000")?.timezone).toBe("America/Cuiaba");
    expect(inferCustomerTimezone("+5566999990000")?.timezone).toBe("America/Cuiaba");
  });

  it("Portugal (DDI 351)", () => {
    expect(inferCustomerTimezone("+351912345678")).toEqual({
      timezone: "Europe/Lisbon",
      label: "Portugal",
    });
  });

  it("EUA/Canadá (DDI 1) → America/New_York como aproximação", () => {
    expect(inferCustomerTimezone("+14155551234")).toEqual({
      timezone: "America/New_York",
      label: "EUA/Canadá",
    });
  });

  it("prefixos longos batem antes dos curtos (351 antes de 3)", () => {
    // Não há DDI "3" isolado na tabela, mas o teste documenta a ordem.
    expect(inferCustomerTimezone("+351912345678")?.label).toBe("Portugal");
  });

  it("DDI desconhecido retorna null", () => {
    // 999 não é DDI real e nem prefixo dos mapeados.
    expect(inferCustomerTimezone("+999123456789")).toBeNull();
  });
});

describe("formatLocalTime", () => {
  it("formata HH:mm pt-BR no fuso pedido", () => {
    // Meio-dia UTC = 09:00 em São Paulo (UTC-3, sem DST desde 2019).
    const noonUtc = new Date("2026-06-01T12:00:00.000Z");
    expect(formatLocalTime("America/Sao_Paulo", noonUtc)).toBe("09:00");
  });

  it("retorna null para fuso inválido", () => {
    expect(formatLocalTime("Not/A_Real_TZ")).toBeNull();
  });
});
