import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/lib/api/products";
import {
  syncNegotiationTotalFromProducts,
  useAddNegotiationProduct,
  useNegotiationProducts,
  useNegotiationProductsRealtime,
  useRemoveNegotiationProduct,
  useUpdateNegotiationProduct,
} from "@/lib/api/crm-negotiation-products";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatCurrencyInput,
  maskCurrencyInputChange,
  parseCurrencyInput,
} from "@/lib/currency-input";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { CrmNegotiationProduct } from "@/types/domain";

function formatMoney(value: number) {
  return formatBRL(value);
}

function parseQuantity(value: string): number {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function ProductRow({
  item,
  readOnly,
  onUpdate,
  onRemove,
  removing,
}: {
  item: CrmNegotiationProduct;
  readOnly: boolean;
  onUpdate: (patch: { quantity?: number; unitPrice?: number; usedCustomPrice?: boolean }) => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [qtyStr, setQtyStr] = useState(String(item.quantity));
  const [priceStr, setPriceStr] = useState(formatCurrencyInput(item.unitPrice));

  useEffect(() => {
    setQtyStr(String(item.quantity));
  }, [item.quantity]);
  useEffect(() => {
    setPriceStr(formatCurrencyInput(item.unitPrice));
  }, [item.unitPrice]);

  const lineTotal = item.quantity * item.unitPrice;
  const priceMismatch =
    item.listPrice > 0 && Math.abs(item.unitPrice - item.listPrice) > 0.001;

  const commitQty = () => {
    const next = parseQuantity(qtyStr);
    if (next <= 0) {
      setQtyStr(String(item.quantity));
      return;
    }
    if (next !== item.quantity) onUpdate({ quantity: next });
  };

  const commitPrice = () => {
    const next = parseCurrencyInput(priceStr);
    if (next !== item.unitPrice) {
      onUpdate({ unitPrice: next, usedCustomPrice: item.listPrice > 0 && next !== item.listPrice });
    }
  };

  return (
    <li className="rounded-xl border border-[var(--crm-surface)] bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--crm-ink)]">{item.productName}</p>
          {priceMismatch ? (
            <p className="mt-0.5 text-[11px] text-[var(--crm-amber-ink)]">
              Preço de tabela: {formatMoney(item.listPrice)}
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={removing}
            className="shrink-0 rounded-md p-1 text-[var(--crm-ink-3)] transition-colors hover:bg-[var(--crm-danger-tint)] hover:text-red-600 disabled:opacity-50"
            title="Remover produto"
            aria-label="Remover produto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">Qtd</span>
          <Input
            value={qtyStr}
            disabled={readOnly}
            inputMode="decimal"
            onChange={(e) => setQtyStr(e.target.value)}
            onBlur={commitQty}
            className="h-9 w-20 rounded-lg border-[var(--crm-border-2)] bg-card text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
            Preço unit.
          </span>
          <Input
            value={priceStr}
            disabled={readOnly}
            inputMode="numeric"
            onChange={(e) => setPriceStr(maskCurrencyInputChange(e.target.value))}
            onBlur={commitPrice}
            placeholder="R$ 0,00"
            className="h-9 w-32 rounded-lg border-[var(--crm-border-2)] bg-card text-sm"
          />
        </label>
        <div className="ml-auto text-right">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-ink-3)]">
            Subtotal
          </span>
          <p className="text-sm font-semibold text-[var(--crm-ink)]">{formatMoney(lineTotal)}</p>
        </div>
      </div>
    </li>
  );
}

const ADD_NONE = "__none__";

export function NegotiationProductsEditor({
  negotiationId,
  readOnly = false,
  negotiationTotalValue,
}: {
  negotiationId: string;
  readOnly?: boolean;
  /** Total atual da negociação; usado p/ corrigir registros antigos cujo total ficou dessincronizado. */
  negotiationTotalValue?: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: items = [], isLoading } = useNegotiationProducts(negotiationId);
  useNegotiationProductsRealtime(negotiationId);
  const { data: products = [] } = useProducts({ status: "ativo" }, { enabled: !readOnly });

  const addProduct = useAddNegotiationProduct();
  const updateProduct = useUpdateNegotiationProduct();
  const removeProduct = useRemoveNegotiationProduct();

  const [pickProductId, setPickProductId] = useState<string>(ADD_NONE);

  const total = useMemo(
    () => items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0),
    [items],
  );

  // Conserta negociações antigas cujo total_value não reflete a soma dos produtos.
  // Só grava quando há divergência real (evita regravar quando já está correto).
  const reconciledRef = useRef<string | null>(null);
  useEffect(() => {
    if (readOnly || isLoading || negotiationTotalValue === undefined) return;
    if (reconciledRef.current === negotiationId) return;
    if (items.length === 0) return;
    if (Math.abs(total - negotiationTotalValue) <= 0.009) {
      reconciledRef.current = negotiationId;
      return;
    }
    reconciledRef.current = negotiationId;
    void syncNegotiationTotalFromProducts(negotiationId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["crm-negotiations"] });
        void queryClient.invalidateQueries({ queryKey: ["chat-negotiation"] });
      })
      .catch(() => {
        reconciledRef.current = null;
      });
  }, [readOnly, isLoading, items.length, total, negotiationTotalValue, negotiationId, queryClient]);

  const onError = (error: unknown) => {
    toast({
      title: "Erro nos produtos",
      description: error instanceof Error ? error.message : "Tente novamente.",
      variant: "destructive",
    });
  };

  const handleAdd = () => {
    if (pickProductId === ADD_NONE) return;
    const product = products.find((p) => p.id === pickProductId);
    if (!product) return;
    addProduct.mutate(
      {
        negotiationId,
        productId: product.id,
        productName: product.nome,
        quantity: 1,
        listPrice: product.precoVenda,
        unitPrice: product.precoVenda,
        usedCustomPrice: false,
      },
      {
        onSuccess: () => setPickProductId(ADD_NONE),
        onError,
      },
    );
  };

  if (!isSupabaseConfigured) {
    return (
      <p className="text-sm text-[var(--crm-ink-3)]">
        Configure o Supabase para gerenciar os produtos do lead.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Select value={pickProductId} onValueChange={setPickProductId}>
              <SelectTrigger className="h-10 rounded-xl border-[var(--crm-border-2)] bg-card">
                <SelectValue placeholder="Selecionar produto…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ADD_NONE} disabled className="text-muted-foreground">
                  Selecionar produto…
                </SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.precoVenda > 0 ? ` · ${formatMoney(p.precoVenda)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={pickProductId === ADD_NONE || addProduct.isPending}
            className="h-10 rounded-xl"
          >
            {addProduct.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            Adicionar
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--crm-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando produtos…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--crm-ink-3)]">
          Nenhum produto adicionado ainda.
          {!readOnly ? " Selecione um produto acima para começar." : ""}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => (
              <ProductRow
                key={item.id}
                item={item}
                readOnly={readOnly}
                removing={removeProduct.isPending}
                onUpdate={(patch) =>
                  updateProduct.mutate({ id: item.id, negotiationId, patch }, { onError })
                }
                onRemove={() =>
                  removeProduct.mutate({ id: item.id, negotiationId }, { onError })
                }
              />
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-[var(--crm-surface)] pt-3">
            <span className="text-sm font-medium text-[var(--crm-ink-3)]">Total</span>
            <span className="text-base font-semibold text-[var(--crm-ink)]">{formatMoney(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
