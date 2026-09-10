import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CrmSaleItemsPreview } from "@/components/crm/CrmSaleItemsPreview";
import type { SaleItemRecord } from "@/types/domain";

function mockItems(count: number): SaleItemRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-id-${index}`,
    saleId: "sale-1",
    productId: `prod-${index}`,
    productName: `Produto ${index + 1}`,
    quantity: 1,
    listPrice: 10,
    unitPrice: 10,
    usedCustomPrice: false,
  }));
}

describe("CrmSaleItemsPreview", () => {
  it("lista todos quando cabe em maxVisible", () => {
    const items = mockItems(2);
    render(
      <CrmSaleItemsPreview
        items={items}
        maxVisible={3}
        formatLine={(item) => <> · {item.unitPrice}</>}
      />,
    );
    expect(screen.getByText("Produto 1")).toBeInTheDocument();
    expect(screen.getByText("Produto 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver mais/i })).not.toBeInTheDocument();
  });

  it("expande e recolhe lista longa", () => {
    const items = mockItems(5);
    render(
      <CrmSaleItemsPreview items={items} maxVisible={2} formatLine={() => null} />,
    );

    expect(screen.queryByText("Produto 3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver mais 3 itens/ }));

    expect(screen.getByText("Produto 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mostrar menos/ }));

    expect(screen.queryByText("Produto 3")).not.toBeInTheDocument();
  });

  it("Ver mais 1 item no singular", () => {
    const items = mockItems(3);
    render(
      <CrmSaleItemsPreview items={items} maxVisible={2} formatLine={() => null} />,
    );
    expect(screen.getByRole("button", { name: /Ver mais 1 item/ })).toBeInTheDocument();
  });

  it("allowExpand false mostra texto e nao botao", () => {
    const items = mockItems(4);
    render(
      <CrmSaleItemsPreview
        items={items}
        maxVisible={2}
        allowExpand={false}
        formatLine={() => null}
      />,
    );
    expect(screen.getByText(/e mais 2 itens/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver mais/i })).not.toBeInTheDocument();
  });
});
