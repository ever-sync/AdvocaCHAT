import { describe, expect, it } from "vitest";
import {
  filterCustomersByBlockedIds,
  filterCustomersForContactPicker,
  isCustomerBlockedByOtherAssignee,
  resolveContactListAssigneeFilterId,
} from "./customer-contact-picker-eligibility";

describe("resolveContactListAssigneeFilterId", () => {
  it("atendimento filtra pelo proprio id", () => {
    expect(resolveContactListAssigneeFilterId("atendimento", "u1", null)).toBe("u1");
  });

  it("admin filtra pelo atendente escolhido", () => {
    expect(resolveContactListAssigneeFilterId("admin", "admin-1", "att-1")).toBe("att-1");
    expect(resolveContactListAssigneeFilterId("admin", "admin-1", null)).toBeNull();
  });
});

describe("isCustomerBlockedByOtherAssignee", () => {
  const negotiations = [
    { customerId: "c1", assigneeId: null },
    { customerId: "c2", assigneeId: "u2" },
    { customerId: "c3", assigneeId: "u1" },
    { customerId: "c5", assigneeId: "u2" },
    { customerId: "c5", assigneeId: "u1" },
  ];
  const chats = [
    { customerId: "c4", assigneeId: "u2" },
    { customerId: "c6", assigneeId: "u2" },
    { customerId: "c6", assigneeId: "u1" },
  ];

  it("permite pool e proprio responsavel", () => {
    expect(isCustomerBlockedByOtherAssignee("c1", "u1", negotiations, [])).toBe(false);
    expect(isCustomerBlockedByOtherAssignee("c3", "u1", negotiations, [])).toBe(false);
  });

  it("bloqueia vinculo exclusivo com outro atendente", () => {
    expect(isCustomerBlockedByOtherAssignee("c2", "u1", negotiations, [])).toBe(true);
    expect(isCustomerBlockedByOtherAssignee("c4", "u1", [], chats)).toBe(true);
  });

  it("permite quando tambem ha pool ou proprio vinculo", () => {
    expect(isCustomerBlockedByOtherAssignee("c5", "u1", negotiations, [])).toBe(false);
    expect(isCustomerBlockedByOtherAssignee("c6", "u1", [], chats)).toBe(false);
  });
});

describe("filterCustomersForContactPicker", () => {
  it("remove clientes bloqueados", () => {
    const customers = [{ id: "c1" }, { id: "c2" }];
    const negotiations = [{ customerId: "c2", assigneeId: "other" }];
    expect(filterCustomersForContactPicker(customers, "me", negotiations, [])).toEqual([{ id: "c1" }]);
  });
});

describe("filterCustomersByBlockedIds", () => {
  it("remove ids retornados pela RPC", () => {
    const customers = [{ id: "c1" }, { id: "c2" }];
    expect(filterCustomersByBlockedIds(customers, new Set(["c2"]))).toEqual([{ id: "c1" }]);
  });
});
