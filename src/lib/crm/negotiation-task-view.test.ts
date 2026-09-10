import { describe, expect, it } from "vitest";
import {
  countOpenCrmTasksByDue,
  mergeCompletedCrmTasksForNegotiationView,
  mergeOpenCrmTasksForNegotiationView,
} from "@/lib/crm/negotiation-task-view";
import type { CrmTask } from "@/types/domain";

function task(over: Partial<CrmTask> & Pick<CrmTask, "id" | "title" | "status">): CrmTask {
  return {
    tenantId: "t1",
    negotiationId: null,
    customerId: "c1",
    assigneeId: null,
    dueAt: null,
    notes: "",
    templateId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T12:00:00.000Z",
    ...over,
  };
}

describe("mergeOpenCrmTasksForNegotiationView", () => {
  it("une listas e remove duplicata por id", () => {
    const a = task({ id: "1", title: "A", status: "aberta" });
    const dup = task({ id: "1", title: "A2", status: "aberta" });
    const b = task({ id: "2", title: "B", status: "aberta" });
    const out = mergeOpenCrmTasksForNegotiationView([a], [dup, b]);
    expect(out.map((t) => t.id).sort()).toEqual(["1", "2"]);
    expect(out.find((t) => t.id === "1")?.title).toBe("A2");
  });

  it("ignora concluídas", () => {
    const open = task({ id: "1", title: "O", status: "aberta" });
    const done = task({ id: "2", title: "D", status: "concluida" });
    expect(mergeOpenCrmTasksForNegotiationView([open, done], [])).toEqual([open]);
  });

  it("ordena por dueAt crescente; sem prazo por último", () => {
    const t0 = task({
      id: "a",
      title: "sem",
      status: "aberta",
      dueAt: null,
    });
    const t1 = task({
      id: "b",
      title: "depois",
      status: "aberta",
      dueAt: "2026-06-15T10:00:00.000Z",
    });
    const t2 = task({
      id: "c",
      title: "antes",
      status: "aberta",
      dueAt: "2026-06-01T10:00:00.000Z",
    });
    const out = mergeOpenCrmTasksForNegotiationView([t0, t1], [t2]);
    expect(out.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("countOpenCrmTasksByDue", () => {
  const now = new Date("2026-05-15T12:00:00.000Z").getTime();

  it("separa pendentes e atrasadas", () => {
    const tasks = [
      task({ id: "1", title: "sem prazo", status: "aberta", dueAt: null }),
      task({
        id: "2",
        title: "futura",
        status: "aberta",
        dueAt: "2026-06-01T10:00:00.000Z",
      }),
      task({
        id: "3",
        title: "atrasada",
        status: "aberta",
        dueAt: "2026-05-01T10:00:00.000Z",
      }),
    ];
    expect(countOpenCrmTasksByDue(tasks, now)).toEqual({ pending: 2, overdue: 1 });
  });
});

describe("mergeCompletedCrmTasksForNegotiationView", () => {
  it("ordena por updatedAt decrescente", () => {
    const older = task({
      id: "o",
      title: "old",
      status: "concluida",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = task({
      id: "n",
      title: "new",
      status: "concluida",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    const out = mergeCompletedCrmTasksForNegotiationView([older], [newer]);
    expect(out.map((t) => t.id)).toEqual(["n", "o"]);
  });

  it("ignora abertas", () => {
    const done = task({ id: "1", title: "D", status: "concluida" });
    const open = task({ id: "2", title: "O", status: "aberta" });
    expect(mergeCompletedCrmTasksForNegotiationView([done, open], [])).toEqual([done]);
  });
});
