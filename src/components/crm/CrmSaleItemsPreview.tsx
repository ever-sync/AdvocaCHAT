import { useEffect, useState, type ReactNode } from "react";
import type { SaleItemRecord } from "@/types/domain";

type CrmSaleItemsPreviewProps = {
  items: SaleItemRecord[];
  /** Quantos itens listar antes de "e mais N" ou do botao expandir. */
  maxVisible?: number;
  /** Conteudo apos o nome do produto (subtotal ou detalhe de quantidade/preco). */
  formatLine: (item: SaleItemRecord) => ReactNode;
  /** Texto do corpo da lista (perfil: xs, tabela: sm). */
  size?: "xs" | "sm";
  /** Se true, permite expandir para ver todos os itens (default: true). */
  allowExpand?: boolean;
};

export function CrmSaleItemsPreview({
  items,
  maxVisible = 3,
  formatLine,
  size = "xs",
  allowExpand = true,
}: CrmSaleItemsPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const itemIdsKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    setExpanded(false);
  }, [itemIdsKey]);

  if (items.length === 0) {
    return (
      <p className={`mt-1 text-muted-foreground ${size === "sm" ? "text-sm" : "text-xs"}`}>
        Sem itens registrados.
      </p>
    );
  }

  const hasMore = items.length > maxVisible;
  const shown = !hasMore || expanded ? items : items.slice(0, maxVisible);
  const rest = items.length - maxVisible;
  const bodyClass = size === "sm" ? "text-sm" : "text-xs";
  const expandBtnClass =
    "mt-1 h-auto rounded-md p-0 text-left font-medium text-primary hover:text-primary/90 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <div>
      <ul className={`mt-1 list-none space-y-1 text-muted-foreground ${bodyClass} leading-snug`}>
        {shown.map((item) => (
          <li key={item.id} className="min-w-0 truncate" title={item.productName}>
            <span className="font-medium text-foreground/90">{item.productName}</span>
            {formatLine(item)}
          </li>
        ))}
      </ul>
      {hasMore && !expanded && !allowExpand ? (
        <p className={`mt-0.5 text-muted-foreground ${bodyClass}`}>
          e mais {rest} {rest === 1 ? "item" : "itens"}
        </p>
      ) : null}
      {hasMore && !expanded && allowExpand ? (
        <button type="button" className={`${expandBtnClass} ${bodyClass}`} onClick={() => setExpanded(true)}>
          Ver mais {rest} {rest === 1 ? "item" : "itens"}
        </button>
      ) : null}
      {hasMore && expanded && allowExpand ? (
        <button type="button" className={`${expandBtnClass} ${bodyClass}`} onClick={() => setExpanded(false)}>
          Mostrar menos
        </button>
      ) : null}
    </div>
  );
}
