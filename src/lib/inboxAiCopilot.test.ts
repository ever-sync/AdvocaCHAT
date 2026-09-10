import { describe, expect, it } from "vitest";
import {
  COPILOT_DEFAULT_HISTORY_LIMIT,
  buildCopilotPromptFromThread,
} from "./inboxAiCopilot";
import type { WhatsappMessage } from "@/types/domain";

function mkMessage(overrides: Partial<WhatsappMessage>): WhatsappMessage {
  return {
    id: overrides.id ?? "m1",
    chatId: "c1",
    instanceId: "i1",
    direction: overrides.direction ?? "inbound",
    messageType: overrides.messageType ?? "text",
    status: overrides.status ?? "delivered",
    bodyText: overrides.bodyText ?? null,
    mediaUrl: overrides.mediaUrl ?? null,
    quotedMessageId: overrides.quotedMessageId ?? null,
    createdAt: overrides.createdAt ?? "2026-06-01T12:00:00.000Z",
    sentAt: overrides.sentAt ?? null,
    receivedAt: overrides.receivedAt ?? null,
    ...overrides,
  } as WhatsappMessage;
}

describe("buildCopilotPromptFromThread", () => {
  it("retorna vazio para thread vazia", () => {
    expect(buildCopilotPromptFromThread([])).toEqual([]);
  });

  it("mapeia inbound → user e outbound → assistant", () => {
    const out = buildCopilotPromptFromThread([
      mkMessage({ id: "1", direction: "inbound", bodyText: "Oi" }),
      mkMessage({ id: "2", direction: "outbound", bodyText: "Olá!" }),
      mkMessage({ id: "3", direction: "inbound", bodyText: "Quanto custa?" }),
    ]);
    expect(out).toEqual([
      { role: "user", text: "Oi" },
      { role: "assistant", text: "Olá!" },
      { role: "user", text: "Quanto custa?" },
    ]);
  });

  it("ignora mensagens sem texto útil", () => {
    const out = buildCopilotPromptFromThread([
      mkMessage({ id: "1", bodyText: "" }),
      mkMessage({ id: "2", bodyText: null }),
      mkMessage({ id: "3", bodyText: "   " }),
      mkMessage({ id: "4", bodyText: "ok" }),
    ]);
    expect(out).toEqual([{ role: "user", text: "ok" }]);
  });

  it("ignora mensagens system", () => {
    const out = buildCopilotPromptFromThread([
      mkMessage({ id: "1", messageType: "system", bodyText: "conversa aberta" }),
      mkMessage({ id: "2", bodyText: "Boa tarde" }),
    ]);
    expect(out).toEqual([{ role: "user", text: "Boa tarde" }]);
  });

  it("ignora mensagens com status failed (não saíram de fato)", () => {
    const out = buildCopilotPromptFromThread([
      mkMessage({ id: "1", direction: "outbound", status: "failed", bodyText: "Erro" }),
      mkMessage({ id: "2", direction: "inbound", bodyText: "Tá aí?" }),
    ]);
    expect(out).toEqual([{ role: "user", text: "Tá aí?" }]);
  });

  it("limita aos N mais recentes preservando ordem", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      mkMessage({ id: `m${i}`, bodyText: `msg${i}` }),
    );
    const out = buildCopilotPromptFromThread(many, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ role: "user", text: "msg25" });
    expect(out[4]).toEqual({ role: "user", text: "msg29" });
  });

  it("default limit é COPILOT_DEFAULT_HISTORY_LIMIT", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      mkMessage({ id: `m${i}`, bodyText: `x${i}` }),
    );
    const out = buildCopilotPromptFromThread(many);
    expect(out).toHaveLength(COPILOT_DEFAULT_HISTORY_LIMIT);
  });

  it("trim no body antes de comparar", () => {
    const out = buildCopilotPromptFromThread([
      mkMessage({ id: "1", bodyText: "  oi  " }),
    ]);
    // Note: o helper preserva o body original (sem trim na saída) — testamos
    // só que não foi descartado.
    expect(out).toHaveLength(1);
    expect(out[0].text.trim()).toBe("oi");
  });
});
