import { describe, expect, it } from "vitest";
import {
  customerStatusForNegotiationPause,
  negotiationCanPause,
  negotiationCanResume,
  negotiationPauseToggleLabel,
} from "@/lib/crm/negotiation-status";

describe("negotiation-status", () => {
  it("permite pausar apenas negócios ativos", () => {
    expect(negotiationCanPause("em_andamento")).toBe(true);
    expect(negotiationCanPause("nao_pausado")).toBe(false);
    expect(negotiationCanPause("pausado")).toBe(false);
    expect(negotiationCanPause("vendido")).toBe(false);
    expect(negotiationCanPause("perdido")).toBe(false);
  });

  it("retoma só quando pausado", () => {
    expect(negotiationCanResume("pausado")).toBe(true);
    expect(negotiationCanResume("em_andamento")).toBe(false);
  });

  it("rótulo do botão alterna entre Pausar e Retomar", () => {
    expect(negotiationPauseToggleLabel("em_andamento")).toBe("Pausar");
    expect(negotiationPauseToggleLabel("pausado")).toBe("Retomar");
    expect(negotiationPauseToggleLabel("vendido")).toBeNull();
  });

  it("mapeia pausa para cliente inativo", () => {
    expect(customerStatusForNegotiationPause("pausado", "ativo")).toBe("inativo");
    expect(customerStatusForNegotiationPause("em_andamento", "inativo")).toBe("ativo");
    expect(customerStatusForNegotiationPause("em_andamento", "bloqueado")).toBeUndefined();
  });
});
