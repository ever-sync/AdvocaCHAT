import { describe, expect, it } from "vitest";
import {
  FOLLOWUP_SOON_WINDOW_MS,
  classifyFollowup,
  followupMinutesFromNow,
  isFollowupOverdue,
  isFollowupSoon,
  pickMostUrgentFollowup,
} from "./inboxFollowupStatus";
import type { CrmTask } from "@/types/domain";

const NOW = Date.parse("2026-06-01T12:00:00.000Z");
const minute = 60_000;

function mkTask(over: Partial<CrmTask>): CrmTask {
  return {
    id: over.id ?? "t1",
    tenantId: "tn",
    negotiationId: over.negotiationId ?? null,
    customerId: over.customerId ?? null,
    assigneeId: over.assigneeId ?? null,
    title: over.title ?? "Lembrar",
    dueAt: over.dueAt ?? null,
    status: over.status ?? "aberta",
    notes: over.notes ?? "",
    templateId: over.templateId ?? null,
    createdAt: over.createdAt ?? "2026-05-01T00:00:00.000Z",
    updatedAt: over.updatedAt ?? "2026-05-01T00:00:00.000Z",
  };
}

describe("classifyFollowup", () => {
  it("retorna null sem dueAt", () => {
    expect(classifyFollowup(mkTask({}), { now: NOW })).toBeNull();
  });

  it("retorna null se status != aberta", () => {
    expect(
      classifyFollowup(mkTask({ status: "concluida", dueAt: new Date(NOW + minute).toISOString() }), {
        now: NOW,
      }),
    ).toBeNull();
  });

  it("retorna null para timestamp inválido", () => {
    expect(classifyFollowup(mkTask({ dueAt: "not-a-date" }), { now: NOW })).toBeNull();
  });

  it("overdue quando dueAt < now", () => {
    expect(
      classifyFollowup(mkTask({ dueAt: new Date(NOW - 30 * minute).toISOString() }), { now: NOW }),
    ).toBe("overdue");
  });

  it("soon quando vence em <= 60 min", () => {
    expect(
      classifyFollowup(mkTask({ dueAt: new Date(NOW + 30 * minute).toISOString() }), { now: NOW }),
    ).toBe("soon");
  });

  it("scheduled quando vence depois da janela", () => {
    expect(
      classifyFollowup(mkTask({ dueAt: new Date(NOW + 3 * 60 * minute).toISOString() }), { now: NOW }),
    ).toBe("scheduled");
  });

  it("respeita override de soonWindowMs", () => {
    expect(
      classifyFollowup(mkTask({ dueAt: new Date(NOW + 90 * minute).toISOString() }), {
        now: NOW,
        soonWindowMs: 2 * 60 * minute,
      }),
    ).toBe("soon");
  });

  it("default soon window é o exportado", () => {
    expect(FOLLOWUP_SOON_WINDOW_MS).toBe(60 * minute);
  });
});

describe("isFollowupOverdue / isFollowupSoon", () => {
  it("isFollowupOverdue true só pra overdue", () => {
    expect(isFollowupOverdue(mkTask({ dueAt: new Date(NOW - minute).toISOString() }), { now: NOW })).toBe(true);
    expect(isFollowupOverdue(mkTask({ dueAt: new Date(NOW + minute).toISOString() }), { now: NOW })).toBe(false);
  });

  it("isFollowupSoon true só pra janela próxima", () => {
    expect(isFollowupSoon(mkTask({ dueAt: new Date(NOW + 5 * minute).toISOString() }), { now: NOW })).toBe(true);
    expect(isFollowupSoon(mkTask({ dueAt: new Date(NOW - 5 * minute).toISOString() }), { now: NOW })).toBe(false);
    expect(isFollowupSoon(mkTask({ dueAt: new Date(NOW + 5 * 60 * minute).toISOString() }), { now: NOW })).toBe(
      false,
    );
  });
});

describe("pickMostUrgentFollowup", () => {
  it("retorna null sem tarefas elegíveis", () => {
    expect(pickMostUrgentFollowup([], { now: NOW })).toBeNull();
    expect(pickMostUrgentFollowup([mkTask({ status: "concluida" })], { now: NOW })).toBeNull();
  });

  it("vencido sempre vence sobre soon/scheduled", () => {
    const r = pickMostUrgentFollowup(
      [
        mkTask({ id: "agendado", dueAt: new Date(NOW + 10 * 60 * minute).toISOString() }),
        mkTask({ id: "vencido", dueAt: new Date(NOW - 5 * minute).toISOString() }),
        mkTask({ id: "soon", dueAt: new Date(NOW + 15 * minute).toISOString() }),
      ],
      { now: NOW },
    );
    expect(r?.task.id).toBe("vencido");
    expect(r?.status).toBe("overdue");
  });

  it("desempate por dueAt mais antigo (vencido mais antigo primeiro)", () => {
    const r = pickMostUrgentFollowup(
      [
        mkTask({ id: "a", dueAt: new Date(NOW - minute).toISOString() }),
        mkTask({ id: "b", dueAt: new Date(NOW - 10 * minute).toISOString() }),
      ],
      { now: NOW },
    );
    expect(r?.task.id).toBe("b");
  });
});

describe("followupMinutesFromNow", () => {
  it("positivo no futuro, negativo no passado", () => {
    expect(followupMinutesFromNow(mkTask({ dueAt: new Date(NOW + 30 * minute).toISOString() }), { now: NOW })).toBe(
      30,
    );
    expect(followupMinutesFromNow(mkTask({ dueAt: new Date(NOW - 90 * minute).toISOString() }), { now: NOW })).toBe(
      -90,
    );
  });

  it("null sem dueAt ou inválido", () => {
    expect(followupMinutesFromNow(mkTask({}), { now: NOW })).toBeNull();
    expect(followupMinutesFromNow(mkTask({ dueAt: "x" }), { now: NOW })).toBeNull();
  });
});
