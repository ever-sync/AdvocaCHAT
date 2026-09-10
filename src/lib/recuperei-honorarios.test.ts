import { describe, expect, it } from "vitest";
import {
  HONORARIOS_PARCELAS,
  RETROATIVO_MAX_MESES,
  calcularRetroativo,
  honorariosOfertasPorParcela,
  mesesRetroativosElegiveis,
} from "./recuperei-honorarios";

describe("retroativo IR", () => {
  const hoje = new Date(2026, 4, 16); // 16/05/2026

  it("3 anos atrás gera 36 meses elegíveis", () => {
    const dataDoenca = new Date(2023, 4, 16);
    expect(mesesRetroativosElegiveis(dataDoenca, hoje)).toBe(36);
    const r = calcularRetroativo(1_500, dataDoenca, hoje);
    expect(r?.mesesElegiveis).toBe(36);
    expect(r?.valorRetroativo).toBe(54_000);
    expect(r?.atingiuTeto).toBe(false);
  });

  it("limita a 60 meses quando a doença é há mais de 5 anos", () => {
    const dataDoenca = new Date(2018, 0, 1);
    expect(mesesRetroativosElegiveis(dataDoenca, hoje)).toBe(RETROATIVO_MAX_MESES);
    const r = calcularRetroativo(500, dataDoenca, hoje);
    expect(r?.mesesElegiveis).toBe(60);
    expect(r?.valorRetroativo).toBe(30_000);
    expect(r?.atingiuTeto).toBe(true);
  });

  it("rejeita data da doença no futuro", () => {
    const dataDoenca = new Date(2027, 0, 1);
    const r = calcularRetroativo(1_000, dataDoenca, hoje);
    expect(r?.dataInvalida).toBe("futura");
    expect(r?.valorRetroativo).toBe(0);
  });
});

describe("honorarios ofertas", () => {
  it("aplica percentual sobre a parcela atual (ex.: 20% de 300 = 60)", () => {
    const ofertas = honorariosOfertasPorParcela(300);
    expect(ofertas).toHaveLength(3);
    expect(ofertas?.map((o) => o.label)).toEqual(["20%", "25%", "30%"]);
    expect(ofertas?.[0].parcelaMensal).toBe(60);
    expect(ofertas?.[0].total36x).toBe(60 * HONORARIOS_PARCELAS);
    expect(ofertas?.[1].parcelaMensal).toBe(75);
    expect(ofertas?.[1].total36x).toBe(2_700);
    expect(ofertas?.[2].parcelaMensal).toBe(90);
    expect(ofertas?.[2].total36x).toBe(3_240);
  });

  it("rejeita parcela inválida", () => {
    expect(honorariosOfertasPorParcela(0)).toBeNull();
    expect(honorariosOfertasPorParcela(-10)).toBeNull();
  });
});
