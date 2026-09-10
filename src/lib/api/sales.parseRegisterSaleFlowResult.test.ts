import { describe, expect, it } from "vitest";
import { parseRegisterSaleFlowResult } from "@/lib/api/sales";

describe("parseRegisterSaleFlowResult", () => {
  it("retorna null para entrada invalida", () => {
    expect(parseRegisterSaleFlowResult(null)).toBeNull();
    expect(parseRegisterSaleFlowResult(undefined)).toBeNull();
    expect(parseRegisterSaleFlowResult("x")).toBeNull();
    expect(parseRegisterSaleFlowResult([])).toBeNull();
    expect(parseRegisterSaleFlowResult({ flow_type: "x" })).toBeNull();
  });

  it("parseia venda com multi_item", () => {
    expect(
      parseRegisterSaleFlowResult({
        flow_type: "venda",
        sale_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: 199.9,
        payment_method: "pix",
        credit_applied: 0,
        multi_item: true,
      }),
    ).toEqual({
      flow_type: "venda",
      sale_id: "550e8400-e29b-41d4-a716-446655440000",
      return_id: null,
      credit_id: null,
      amount: 199.9,
      resolution: null,
      payment_method: "pix",
      credit_applied: 0,
      multiItem: true,
      returnQuantity: null,
    });
  });

  it("parseia devolucao", () => {
    expect(
      parseRegisterSaleFlowResult({
        flow_type: "devolucao",
        return_id: "660e8400-e29b-41d4-a716-446655440001",
        sale_id: "550e8400-e29b-41d4-a716-446655440000",
        credit_id: null,
        amount: 50,
        resolution: "credito",
      }),
    ).toEqual({
      flow_type: "devolucao",
      sale_id: "550e8400-e29b-41d4-a716-446655440000",
      return_id: "660e8400-e29b-41d4-a716-446655440001",
      credit_id: null,
      amount: 50,
      resolution: "credito",
      payment_method: null,
      credit_applied: null,
      multiItem: false,
      returnQuantity: null,
    });
  });

  it("parseia devolucao com return_quantity", () => {
    expect(
      parseRegisterSaleFlowResult({
        flow_type: "devolucao",
        return_id: "660e8400-e29b-41d4-a716-446655440001",
        amount: 120,
        resolution: "credito",
        return_quantity: 3,
      }),
    ).toMatchObject({
      flow_type: "devolucao",
      amount: 120,
      returnQuantity: 3,
    });
  });

  it("ignores resolution invalida", () => {
    const r = parseRegisterSaleFlowResult({
      flow_type: "devolucao",
      resolution: "outro",
      amount: 1,
    });
    expect(r?.resolution).toBeNull();
  });
});
