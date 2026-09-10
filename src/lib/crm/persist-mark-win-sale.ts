import type { QueryClient } from "@tanstack/react-query";
import type { MarkWinSaleLine } from "@/components/crm/MarkWinDialog";
import { listProducts } from "@/lib/api/products";
import { registerSaleFlow } from "@/lib/api/sales";
import type { SaleFlowLineInput, SalePaymentMethod } from "@/types/domain";

export function invalidateSalesQueries(
  queryClient: QueryClient,
  customerId?: string | null,
) {
  void queryClient.invalidateQueries({ queryKey: ["sales"] });
  if (customerId) {
    void queryClient.invalidateQueries({ queryKey: ["sales", "customer", customerId] });
  }
}

export function markWinLinesToSaleFlowLines(
  lines: MarkWinSaleLine[],
  catalogPriceByProductId: Map<string, number>,
): SaleFlowLineInput[] {
  return lines.map((line) => {
    const catalogPrice = catalogPriceByProductId.get(line.productId) ?? 0;
    const usedCustom =
      catalogPrice <= 0 || Math.abs(catalogPrice - line.unitValue) > 0.009;
    return {
      productId: line.productId,
      quantity: line.quantity,
      otherPrice: usedCustom,
      customUnitPrice: usedCustom ? line.unitValue : undefined,
    };
  });
}

export async function persistMarkWinSale(input: {
  chatId: string | null;
  customerId: string | null;
  soldBy: string;
  lines: MarkWinSaleLine[];
  paymentMethod: SalePaymentMethod;
}) {
  const soldBy = input.soldBy.trim();
  if (!soldBy) {
    throw new Error("Responsável pela venda é obrigatório.");
  }
  if (!input.chatId && !input.customerId) {
    throw new Error("Vincule um cliente ou conversa para registrar os produtos da venda.");
  }

  const products = await listProducts({ status: "ativo" });
  const catalogPriceByProductId = new Map(products.map((p) => [p.id, p.precoVenda]));

  await registerSaleFlow({
    chatId: input.chatId,
    customerId: input.customerId,
    flowType: "venda",
    soldBy,
    saleLines: markWinLinesToSaleFlowLines(input.lines, catalogPriceByProductId),
    salePaymentMethod: input.paymentMethod,
  });
}
