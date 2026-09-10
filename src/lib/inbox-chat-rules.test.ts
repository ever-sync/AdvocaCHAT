import { describe, expect, it } from "vitest";
import {
  WAITING_CUSTOMER_MIN_QUIET_MS,
  isChatSlaBreached,
  isChatSnoozed,
  isChatWaitingForCustomer,
  slaMinutesRemaining,
} from "./inbox-chat-rules";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const minute = 60_000;

function chat(overrides: Partial<Parameters<typeof isChatWaitingForCustomer>[0]> = {}) {
  return {
    status: "open" as const,
    firstResponseAt: new Date(NOW - 2 * 60 * minute).toISOString(),
    unreadCount: 0,
    lastMessageAt: new Date(NOW - 45 * minute).toISOString(),
    ...overrides,
  };
}

describe("isChatSnoozed", () => {
  it("false quando sem snoozeUntil", () => {
    expect(isChatSnoozed({ snoozeUntil: null })).toBe(false);
  });
  it("true para snoozeUntil futuro", () => {
    expect(isChatSnoozed({ snoozeUntil: new Date(Date.now() + 60_000).toISOString() })).toBe(true);
  });
  it("false para snoozeUntil já passado", () => {
    expect(isChatSnoozed({ snoozeUntil: new Date(Date.now() - 60_000).toISOString() })).toBe(false);
  });
});

describe("isChatSlaBreached / slaMinutesRemaining", () => {
  it("false quando atendente já respondeu (firstResponseAt setado)", () => {
    const c = { firstResponseAt: new Date().toISOString(), slaFirstResponseDueAt: new Date(0).toISOString() };
    expect(isChatSlaBreached(c)).toBe(false);
    expect(slaMinutesRemaining(c)).toBe(null);
  });
  it("true quando passou do due e ninguém respondeu", () => {
    const c = { firstResponseAt: null, slaFirstResponseDueAt: new Date(Date.now() - 60_000).toISOString() };
    expect(isChatSlaBreached(c)).toBe(true);
  });
  it("calcula minutos restantes positivos", () => {
    const c = {
      firstResponseAt: null,
      slaFirstResponseDueAt: new Date(Date.now() + 5 * minute).toISOString(),
    };
    expect(slaMinutesRemaining(c)).toBe(5);
  });
});

describe("isChatWaitingForCustomer", () => {
  it("true quando todos os critérios batem (45min de silêncio > 30min limiar)", () => {
    expect(isChatWaitingForCustomer(chat(), { now: NOW })).toBe(true);
  });

  it("respeita override de minQuietMs", () => {
    expect(
      isChatWaitingForCustomer(chat({ lastMessageAt: new Date(NOW - 10 * minute).toISOString() }), {
        now: NOW,
        minQuietMs: 5 * minute,
      }),
    ).toBe(true);
  });

  it("false se o status não é open", () => {
    expect(isChatWaitingForCustomer(chat({ status: "closed" }), { now: NOW })).toBe(false);
  });

  it("false se há mensagens não lidas (cliente já respondeu)", () => {
    expect(isChatWaitingForCustomer(chat({ unreadCount: 1 }), { now: NOW })).toBe(false);
  });

  it("false se atendente ainda não respondeu (firstResponseAt null)", () => {
    expect(isChatWaitingForCustomer(chat({ firstResponseAt: null }), { now: NOW })).toBe(false);
  });

  it("false se a última mensagem foi anterior ao primeiro atendimento (não houve follow-up)", () => {
    expect(
      isChatWaitingForCustomer(
        chat({
          firstResponseAt: new Date(NOW - 10 * minute).toISOString(),
          lastMessageAt: new Date(NOW - 20 * minute).toISOString(),
        }),
        { now: NOW },
      ),
    ).toBe(false);
  });

  it("false enquanto ainda 'ao vivo' (silêncio < limiar de 30min)", () => {
    expect(
      isChatWaitingForCustomer(chat({ lastMessageAt: new Date(NOW - 10 * minute).toISOString() }), {
        now: NOW,
      }),
    ).toBe(false);
  });

  it("usa Date.now() quando 'now' não é passado", () => {
    // Defesa: timestamps reais relativos a `Date.now()` (não ao NOW fixo do helper).
    const realNow = Date.now();
    expect(
      isChatWaitingForCustomer(
        chat({
          firstResponseAt: new Date(realNow - 3 * WAITING_CUSTOMER_MIN_QUIET_MS).toISOString(),
          lastMessageAt: new Date(realNow - 2 * WAITING_CUSTOMER_MIN_QUIET_MS).toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("false em timestamps inválidos", () => {
    expect(
      isChatWaitingForCustomer(chat({ lastMessageAt: "not-a-date" }), { now: NOW }),
    ).toBe(false);
    expect(
      isChatWaitingForCustomer(chat({ firstResponseAt: "not-a-date" }), { now: NOW }),
    ).toBe(false);
  });
});
