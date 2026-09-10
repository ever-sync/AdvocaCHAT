import { describe, expect, it } from "vitest";
import { buildMensagemOfertaCliente } from "./calculadora-mensagem-cliente";
import type { HonorariosOferta } from "./recuperei-honorarios";

describe("buildMensagemOfertaCliente", () => {
  const retroativo = {
    mesesElegiveis: 40,
    atingiuTeto: false,
    valorRetroativo: 12_000,
  };

  const oferta20: HonorariosOferta = {
    tier: "20",
    label: "20%",
    parcelaMensal: 60,
    total36x: 2_160,
  };

  it("inclui gasto atual, retroativo, honorários e saldo positivo", () => {
    const msg = buildMensagemOfertaCliente({
      parcelaAtual: 300,
      retroativo,
      oferta: oferta20,
    });

    expect(msg).toMatch(/300,00/);
    expect(msg).toMatch(/12\.000,00/);
    expect(msg).toMatch(/60,00/);
    expect(msg).toMatch(/2\.160,00/);
    expect(msg).toMatch(/9\.840,00/);
    expect(msg).toContain("40 meses");
    expect(msg).toContain("honorários 20%");
  });
});
