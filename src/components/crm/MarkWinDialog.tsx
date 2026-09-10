import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProducts } from "@/lib/api/products";
import { validateMarkWinLines } from "@/lib/crm/sale-rules";
import {
  formatCurrencyInput,
  maskCurrencyInputChange,
  parseCurrencyInput,
} from "@/lib/currency-input";
import { SALE_PAYMENT_METHOD_LABELS, type Product, type SalePaymentMethod } from "@/types/domain";

function parseQuantityInput(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 1;
  }
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return parsed;
}

function createLineKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type SaleLineState = {
  key: string;
  productId: string;
  valueText: string;
  requiresManualValue: boolean;
  quantityStr: string;
};

function createEmptyLine(): SaleLineState {
  return {
    key: createLineKey(),
    productId: "",
    valueText: "",
    requiresManualValue: true,
    quantityStr: "1",
  };
}

function resolveValueFromProduct(product: Product | undefined): {
  text: string;
  requiresManualEntry: boolean;
} {
  if (!product) {
    return { text: "", requiresManualEntry: true };
  }
  if (product.precoVenda > 0) {
    return {
      text: formatCurrencyInput(product.precoVenda),
      requiresManualEntry: false,
    };
  }
  return { text: "", requiresManualEntry: true };
}

export type MarkWinSaleLine = {
  productId: string;
  productName: string;
  unitValue: number;
  quantity: number;
  lineTotal: number;
};

export type MarkWinConfirm = {
  lines: MarkWinSaleLine[];
  totalValue: number;
  paymentMethod: SalePaymentMethod;
};

const PAYMENT_METHOD_OPTIONS: SalePaymentMethod[] = [
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "fiado",
  "outro",
];

export type MarkWinInitialLine = {
  productId: string;
  quantity: number;
  unitValue: number;
};

type MarkWinDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: number;
  initialProductId?: string;
  /** Pré-preenche o popup com os produtos já vinculados ao lead (só confirmar/ajustar). */
  initialLines?: MarkWinInitialLine[];
  onConfirm: (result: MarkWinConfirm) => void | Promise<void>;
  pending?: boolean;
};

function lineTotals(line: SaleLineState): {
  unitValue: number;
  quantity: number;
  lineTotal: number;
  valid: boolean;
} {
  const quantity = parseQuantityInput(line.quantityStr);
  const unitValue = parseCurrencyInput(line.valueText);
  const valid = Boolean(line.productId) && unitValue > 0 && quantity > 0;
  return {
    unitValue,
    quantity: quantity > 0 ? quantity : 0,
    lineTotal: unitValue * (quantity > 0 ? quantity : 0),
    valid,
  };
}

export function MarkWinDialog({
  open,
  onOpenChange,
  initialValue = 0,
  initialProductId = "",
  initialLines,
  onConfirm,
  pending,
}: MarkWinDialogProps) {
  const { data: products = [], isLoading: productsLoading } = useProducts(
    { status: "ativo" },
    { enabled: open },
  );

  const [lines, setLines] = useState<SaleLineState[]>(() => [createEmptyLine()]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("pix");

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const computed = useMemo(() => {
    const rows = lines.map((line) => {
      const totals = lineTotals(line);
      const product = productById.get(line.productId);
      return {
        line,
        ...totals,
        productName: product?.nome ?? "",
      };
    });
    const totalValue = rows.reduce((sum, row) => sum + row.lineTotal, 0);
    const isValid = rows.length > 0 && rows.every((row) => row.valid);
    return { rows, totalValue, isValid };
  }, [lines, productById]);

  const initialLinesRef = useRef(initialLines);
  initialLinesRef.current = initialLines;
  const initialLinesKey = useMemo(
    () => (initialLines ?? []).map((l) => `${l.productId}:${l.quantity}:${l.unitValue}`).join("|"),
    [initialLines],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const presetLines = initialLinesRef.current;
    if (presetLines && presetLines.length > 0) {
      setLines(
        presetLines.map((preset) => {
          const product = productById.get(preset.productId);
          const requiresManualValue = preset.unitValue <= 0;
          return {
            key: createLineKey(),
            productId: preset.productId,
            valueText: preset.unitValue > 0 ? formatCurrencyInput(preset.unitValue) : "",
            requiresManualValue: requiresManualValue && !product?.precoVenda,
            quantityStr: String(preset.quantity > 0 ? preset.quantity : 1),
          };
        }),
      );
      return;
    }

    if (initialProductId && products.some((p) => p.id === initialProductId)) {
      const product = products.find((p) => p.id === initialProductId);
      const { text, requiresManualEntry } = resolveValueFromProduct(product);
      setLines([
        {
          key: createLineKey(),
          productId: initialProductId,
          valueText:
            requiresManualEntry && initialValue > 0 ? formatCurrencyInput(initialValue) : text,
          requiresManualValue: requiresManualEntry,
          quantityStr: "1",
        },
      ]);
      return;
    }

    setLines([createEmptyLine()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProductId, initialValue, products, initialLinesKey]);

  const updateLine = (index: number, patch: Partial<SaleLineState>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const handleProductChange = (index: number, productId: string) => {
    const product = productById.get(productId);
    const { text, requiresManualEntry } = resolveValueFromProduct(product);
    updateLine(index, {
      productId,
      valueText: text,
      requiresManualValue: requiresManualEntry,
    });
  };

  const resetForm = () => {
    setLines([createEmptyLine()]);
    setPaymentMethod("pix");
  };

  const handleConfirm = () => {
    if (!computed.isValid) {
      return;
    }

    const lineError = validateMarkWinLines(
      computed.rows.map((row) => ({
        productId: row.line.productId,
        productName: row.productName,
        unitValue: row.unitValue,
        quantity: row.quantity,
        lineTotal: row.lineTotal,
      })),
    );
    if (lineError) {
      return;
    }

    const result: MarkWinConfirm = {
      lines: computed.rows.map((row) => ({
        productId: row.line.productId,
        productName: row.productName,
        unitValue: row.unitValue,
        quantity: row.quantity,
        lineTotal: row.lineTotal,
      })),
      totalValue: computed.totalValue,
      paymentMethod,
    };

    void Promise.resolve(onConfirm(result)).then(() => {
      resetForm();
      onOpenChange(false);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          resetForm();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(90dvh,720px)] max-w-lg overflow-y-auto rounded-[12px]">
        <DialogHeader>
          <DialogTitle>Marcar como venda</DialogTitle>
          <DialogDescription>
            Adicione um ou mais produtos ou serviços. O valor total da venda é a soma dos itens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {productsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando catálogo…
            </div>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item ativo no catálogo. Cadastre em Serviços e produtos.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {lines.map((line, index) => {
                  const row = computed.rows[index];
                  return (
                    <div
                      key={line.key}
                      className="space-y-3 rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Item {index + 1}
                        </span>
                        {lines.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label="Remover item"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`sale-product-${line.key}`}>Produto / serviço</Label>
                        <Select
                          value={line.productId || undefined}
                          onValueChange={(value) => handleProductChange(index, value)}
                        >
                          <SelectTrigger
                            id={`sale-product-${line.key}`}
                            className="rounded-[10px]"
                          >
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome}
                                {p.precoVenda > 0 ? ` — ${formatCurrencyInput(p.precoVenda)}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor={`sale-qty-${line.key}`}>Qtd.</Label>
                          <Input
                            id={`sale-qty-${line.key}`}
                            inputMode="numeric"
                            value={line.quantityStr}
                            onChange={(e) => updateLine(index, { quantityStr: e.target.value })}
                            className="rounded-[10px]"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`sale-value-${line.key}`}>Valor unitário</Label>
                          <Input
                            id={`sale-value-${line.key}`}
                            inputMode="numeric"
                            value={line.valueText}
                            readOnly={!line.requiresManualValue}
                            onChange={(e) => {
                              if (line.requiresManualValue) {
                                updateLine(index, {
                                  valueText: maskCurrencyInputChange(e.target.value),
                                });
                              }
                            }}
                            placeholder="R$ 0,00"
                            className="rounded-[10px]"
                          />
                        </div>
                      </div>

                      {line.productId && line.requiresManualValue ? (
                        <p className="text-xs text-muted-foreground">
                          Sem valor no catálogo — informe o valor unitário.
                        </p>
                      ) : line.productId && !line.requiresManualValue ? (
                        <p className="text-xs text-muted-foreground">Valor do cadastro.</p>
                      ) : null}

                      {line.productId && row && row.unitValue > 0 && row.quantity > 0 ? (
                        <p className="text-xs font-medium text-foreground">
                          Subtotal: {formatCurrencyInput(row.lineTotal)}
                        </p>
                      ) : line.productId && row && !row.valid ? (
                        <p className="text-xs text-destructive">
                          Informe quantidade e valor unitário válidos.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1 rounded-[10px]"
                onClick={() => setLines((prev) => [...prev, createEmptyLine()])}
              >
                <Plus className="h-4 w-4" />
                Adicionar produto
              </Button>

              <div className="space-y-1.5">
                <Label htmlFor="markwin-payment-method">Forma de pagamento</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as SalePaymentMethod)}
                >
                  <SelectTrigger id="markwin-payment-method" className="rounded-[10px]">
                    <SelectValue placeholder="Selecionar forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_OPTIONS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {SALE_PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">Total da venda</span>
                <span className="text-base font-semibold tabular-nums">
                  {computed.totalValue > 0
                    ? formatCurrencyInput(computed.totalValue)
                    : "R$ 0,00"}
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            data-testid="crm-mark-win-confirm"
            disabled={!computed.isValid || pending || productsLoading || products.length === 0}
            onClick={handleConfirm}
          >
            Confirmar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
