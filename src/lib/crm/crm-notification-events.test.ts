import { describe, expect, it } from "vitest";
import {
  isNegotiationEnteredPool,
  shouldEmitStaleNotificationForRecord,
  shouldNotifyUserForNegotiation,
} from "./crm-notification-events";
import type { CrmNegotiationRecord } from "@/types/domain";

const baseRecord: CrmNegotiationRecord = {
  id: "n-1",
  tenantId: "t-1",
  title: "Acme",
  funnelId: "f1",
  stageId: "s1",
  status: "em_andamento",
  assigneeId: "user-a",
  customerId: null,
  starCount: 0,
  qualification: 0,
  totalValue: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastInteractionAt: "2026-01-01T00:00:00.000Z",
};

describe("isNegotiationEnteredPool", () => {
  it("detecta assignee removido em negócio em andamento", () => {
    expect(
      isNegotiationEnteredPool(
        { id: "n-1", status: "em_andamento", assignee_id: "u1" },
        { id: "n-1", status: "em_andamento", assignee_id: null },
      ),
    ).toBe(true);
  });

  it("ignora se já estava no pool", () => {
    expect(
      isNegotiationEnteredPool(
        { id: "n-1", status: "em_andamento", assignee_id: null },
        { id: "n-1", status: "em_andamento", assignee_id: null },
      ),
    ).toBe(false);
  });
});

describe("shouldNotifyUserForNegotiation", () => {
  it("pool notifica qualquer usuário autenticado", () => {
    expect(shouldNotifyUserForNegotiation({ assigneeId: null }, "user-x")).toBe(true);
  });

  it("com responsável só notifica o assignee", () => {
    expect(shouldNotifyUserForNegotiation({ assigneeId: "user-a" }, "user-a")).toBe(true);
    expect(shouldNotifyUserForNegotiation({ assigneeId: "user-a" }, "user-b")).toBe(false);
  });
});

describe("shouldEmitStaleNotificationForRecord", () => {
  it("emite quando atinge limite e ainda não notificou esse patamar", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const result = shouldEmitStaleNotificationForRecord(
      { ...baseRecord, lastInteractionAt: eightDaysAgo },
      "user-a",
      7,
      null,
    );
    expect(result.notify).toBe(true);
    expect(result.staleDays).toBeGreaterThanOrEqual(7);
  });

  it("não repete para o mesmo número de dias", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const result = shouldEmitStaleNotificationForRecord(
      { ...baseRecord, lastInteractionAt: eightDaysAgo },
      "user-a",
      7,
      8,
    );
    expect(result.notify).toBe(false);
  });
});
