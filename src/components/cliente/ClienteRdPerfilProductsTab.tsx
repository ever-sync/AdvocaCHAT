import { Loader2 } from "lucide-react";
import { CrmSaleItemsPreview } from "@/components/crm/CrmSaleItemsPreview";
import { Badge } from "@/components/ui/badge";
import { useCustomerSales, useSales } from "@/lib/api/sales";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SALE_PAYMENT_METHOD_LABELS, type SaleRecord } from "@/types/domain";
import { formatBRL } from "@/lib/format";

function formatMoney(value: number) {
  return formatBRL(value);
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function filterSalesForNegotiation(
  sales: SaleRecord[],
  opts: { customerId?: string | null; sourceChatId?: string | null },
) {
  return sales.filter((sale) => {
    if (opts.sourceChatId) {
      return sale.chatId === opts.sourceChatId;
    }
    if (opts.customerId) {
      return sale.customerId === opts.customerId;
    }
    return false;
  });
}

type ClienteRdPerfilProductsTabProps = {
  customerId?: string | null;
  sourceChatId?: string | null;
  negotiationTotalValue?: number;
  negotiationStatus?: string;
};

export function ClienteRdPerfilProductsTab({
  customerId,
  sourceChatId,
  negotiationTotalValue = 0,
  negotiationStatus,
}: ClienteRdPerfilProductsTabProps) {
  const supabaseReady = Boolean(isSupabaseConfigured && (customerId || sourceChatId));

  const { data: customerSales = [], isLoading: customerSalesLoading } = useCustomerSales(
    customerId ?? null,
    { limit: 50 },
    { enabled: Boolean(customerId) && supabaseReady },
  );

  const { data: chatSales = [], isLoading: chatSalesLoading } = useSales(
    { chatId: sourceChatId, limit: 50 },
    { enabled: Boolean(sourceChatId) && !customerId && supabaseReady },
  );

  const sales = customerId ? customerSales : chatSales;
  const isLoading = customerId ? customerSalesLoading : chatSalesLoading;
  const scopedSales = filterSalesForNegotiation(sales, { customerId, sourceChatId });

  if (!isSupabaseConfigured) {
    return (
      <p className="text-sm text-[#78909c]">
        Configure o Supabase para registrar e exibir produtos da venda.
      </p>
    );
  }

  if (!customerId && !sourceChatId) {
    return (
      <p className="text-sm text-[#78909c]">
        Vincule um cliente ou uma conversa para exibir os produtos vendidos nesta negociação.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#78909c]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando produtos da venda…
      </div>
    );
  }

  if (scopedSales.length === 0) {
    if (negotiationStatus === "vendido" && negotiationTotalValue > 0) {
      return (
        <div className="space-y-2 text-left text-sm text-[#78909c]">
          <p>
            Valor registrado na negociação:{" "}
            <span className="font-semibold text-[#334047]">{formatMoney(negotiationTotalValue)}</span>
          </p>
          <p>Os itens vendidos aparecerão aqui após marcar a venda com produtos no popup.</p>
        </div>
      );
    }
    return (
      <p className="text-sm text-[#78909c]">
        Nenhum produto vinculado ainda. Use &quot;Marcar venda&quot; para registrar os itens.
      </p>
    );
  }

  return (
    <ul className="space-y-4 text-left">
      {scopedSales.map((sale) => (
        <li
          key={sale.id}
          className="rounded-lg border border-[#e8eaed] bg-[#fafbfc] p-4 text-sm shadow-sm"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-[#334047]">{formatDateTime(sale.soldAt)}</p>
            <Badge variant="outline" className="border-[#dce4d6] bg-white text-[#5f6c66]">
              {SALE_PAYMENT_METHOD_LABELS[sale.paymentMethod]}
            </Badge>
          </div>
          <CrmSaleItemsPreview
            items={sale.items}
            maxVisible={20}
            size="sm"
            allowExpand={sale.items.length > 5}
            formatLine={(item) => (
              <>
                {" "}
                · {item.quantity > 1 ? `${item.quantity} × ` : ""}
                {formatMoney(item.unitPrice)}
                {item.quantity > 1 ? ` = ${formatMoney(item.unitPrice * item.quantity)}` : ""}
              </>
            )}
          />
          <p className="mt-3 font-medium text-[#334047]">Total {formatMoney(sale.totalAmount)}</p>
        </li>
      ))}
    </ul>
  );
}
