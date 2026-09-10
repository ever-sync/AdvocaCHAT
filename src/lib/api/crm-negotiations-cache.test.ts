import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { previousNegotiationCustomerIdFromQueryCache } from "@/lib/api/crm-negotiations";
import type { CrmNegotiationRecord } from "@/types/domain";

function neg(over: Partial<CrmNegotiationRecord> & Pick<CrmNegotiationRecord, "id">): CrmNegotiationRecord {
  return {
    tenantId: "t1",
    title: "N",
    funnelId: "f1",
    stageId: "lead",
    status: "em_andamento",
    assigneeId: null,
    customerId: null,
    starCount: 0,
    qualification: 0,
    totalValue: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("previousNegotiationCustomerIdFromQueryCache", () => {
  it("lê customerId do cache de detalhe", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["crm-negotiations", "neg-1"], neg({ id: "neg-1", customerId: "cust-a" }));
    expect(previousNegotiationCustomerIdFromQueryCache(qc, "neg-1")).toBe("cust-a");
  });

  it("lê customerId da listagem do quadro quando o detalhe não está em cache", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(
      ["crm-negotiations", "f1", null, null, null, null],
      [neg({ id: "neg-1", customerId: "cust-b" })],
    );
    expect(previousNegotiationCustomerIdFromQueryCache(qc, "neg-1")).toBe("cust-b");
  });

  it("ignora queries crm-negotiations/customer", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["crm-negotiations", "customer", "cust-x"], [
      neg({ id: "neg-1", customerId: "wrong" }),
    ]);
    expect(previousNegotiationCustomerIdFromQueryCache(qc, "neg-1")).toBeNull();
  });

  it("retorna null quando a negociação não aparece em cache", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    expect(previousNegotiationCustomerIdFromQueryCache(qc, "neg-99")).toBeNull();
  });
});
