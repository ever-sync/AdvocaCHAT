import { describe, expect, it } from "vitest";
import {
  inboxFiltersFromQuickFilter,
  inboxQuickFilterLabel,
  inboxScopeFiltersForQuickFilter,
} from "./inbox-quick-filters";

describe("inboxFiltersFromQuickFilter", () => {
  it("mapeia Minhas para assignee mine", () => {
    expect(inboxFiltersFromQuickFilter("mine", "u1")).toEqual({
      assigneeId: "mine",
      currentUserId: "u1",
      hideSnoozed: true,
      snoozedOnly: false,
      unreadOnly: false,
    });
  });

  it("Ocultas nao usa filtro de adiadas", () => {
    expect(inboxFiltersFromQuickFilter("hidden", undefined)).toEqual({
      hideSnoozed: false,
      snoozedOnly: false,
      unreadOnly: false,
    });
  });

  it("mapeia Não lidas para unreadOnly", () => {
    expect(inboxFiltersFromQuickFilter("unread", undefined).unreadOnly).toBe(true);
  });

  it("Aguardando cliente passa pelo escopo 'mine' (filtro real é client-side)", () => {
    expect(inboxFiltersFromQuickFilter("waiting_customer", "u1")).toEqual({
      assigneeId: "mine",
      currentUserId: "u1",
      hideSnoozed: true,
      snoozedOnly: false,
      unreadOnly: false,
    });
  });

  it("Lembretes vencidos também usa 'mine' (cruzamento com tarefas é client-side)", () => {
    expect(inboxFiltersFromQuickFilter("overdue_followup", "u1")).toEqual({
      assigneeId: "mine",
      currentUserId: "u1",
      hideSnoozed: true,
      snoozedOnly: false,
      unreadOnly: false,
    });
  });
});

describe("inboxScopeFiltersForQuickFilter", () => {
  it("Ocultas lista conversas encerradas incluindo perdidas", () => {
    expect(inboxScopeFiltersForQuickFilter("hidden", "open")).toEqual({
      status: "closed",
      hideLost: false,
    });
  });

  it("demais chips usam listScope normal", () => {
    expect(inboxScopeFiltersForQuickFilter(null, "open")).toEqual({
      status: "open",
      hideLost: true,
    });
  });
});

describe("inboxQuickFilterLabel", () => {
  it("retorna Todas quando sem filtro", () => {
    expect(inboxQuickFilterLabel(null)).toBe("Todas");
    expect(inboxQuickFilterLabel("mine")).toBe("Minhas");
  });
  it("traduz waiting_customer", () => {
    expect(inboxQuickFilterLabel("waiting_customer")).toBe("Aguardando cliente");
  });
  it("traduz overdue_followup", () => {
    expect(inboxQuickFilterLabel("overdue_followup")).toBe("Lembretes vencidos");
  });
});
