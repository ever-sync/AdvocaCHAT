import { describe, expect, it } from "vitest";
// Logica pura das edge functions (workers), importada via caminho relativo para
// ser exercitada sob Node/vitest no CI — o Deno nao roda no pipeline atual.
import {
  flowRetryDelayMinutes,
  webhookBackoffSeconds,
} from "../../supabase/functions/_shared/retry-backoff.ts";

describe("flowRetryDelayMinutes", () => {
  it("segue a tabela de backoff por tentativa", () => {
    expect(flowRetryDelayMinutes(1)).toBe(1);
    expect(flowRetryDelayMinutes(2)).toBe(5);
    expect(flowRetryDelayMinutes(3)).toBe(30);
    expect(flowRetryDelayMinutes(4)).toBe(120);
  });

  it("satura na ultima faixa para tentativas altas", () => {
    expect(flowRetryDelayMinutes(5)).toBe(120);
    expect(flowRetryDelayMinutes(99)).toBe(120);
  });

  it("nunca retorna negativo para entradas invalidas", () => {
    expect(flowRetryDelayMinutes(0)).toBe(0);
    expect(flowRetryDelayMinutes(-3)).toBe(0);
  });
});

describe("webhookBackoffSeconds", () => {
  it("cresce de forma quadratica", () => {
    expect(webhookBackoffSeconds(1)).toBe(30);
    expect(webhookBackoffSeconds(2)).toBe(120);
    expect(webhookBackoffSeconds(3)).toBe(270);
  });

  it("satura em 1 hora", () => {
    expect(webhookBackoffSeconds(10)).toBe(3000);
    expect(webhookBackoffSeconds(11)).toBe(3600);
    expect(webhookBackoffSeconds(1000)).toBe(3600);
  });

  it("trata tentativa zero como a primeira (>= 1)", () => {
    expect(webhookBackoffSeconds(0)).toBe(30);
  });
});
