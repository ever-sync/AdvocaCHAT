import { test, expect } from "@playwright/test";
import { E2E_POOL_NEGOTIATION } from "../src/data/crm-e2e-fixtures";
import { dragLocatorTo } from "./helpers/dnd";
import { setE2eMockRole } from "./helpers/mock-role";

test.describe("CRM Kanban (mock E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await setE2eMockRole(page, "operacao");
    await page.goto("/crm");
    await expect(page.getByTestId("crm-card-netoneto")).toBeVisible({ timeout: 20_000 });
  });

  test("assumir negócio do pool", async ({ page }) => {
    const card = page.getByTestId(`crm-card-${E2E_POOL_NEGOTIATION.id}`);
    await expect(card).toBeVisible();
    await expect(card.getByText("E2E Pool Lead")).toBeVisible();
    await expect(card.getByTestId("crm-pool-badge")).toBeVisible();

    await card.getByTestId(`crm-claim-${E2E_POOL_NEGOTIATION.id}`).click();

    await expect(card.getByTestId("crm-pool-badge")).not.toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("status").filter({ hasText: "Negócio assumido" }).first(),
    ).toBeVisible();
  });

  test("drag bloqueado sem valor em etapa com campo obrigatório", async ({ page }) => {
    const card = page.getByTestId("crm-card-netoneto");
    const targetColumn = page.getByTestId("crm-column-contrato");

    await expect(card).toBeVisible();
    await targetColumn.scrollIntoViewIfNeeded();
    await expect(targetColumn).toBeVisible();

    await dragLocatorTo(page, card, targetColumn);

    const toastTitle = page.locator("[data-sonner-toast], [role=status]").filter({
      hasText: "Campos obrigatórios",
    });
    await expect(toastTitle.first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/valor do negócio/i).first()).toBeVisible();
  });

  test("marcar perda na ficha do negócio (mock)", async ({ page }) => {
    await page.goto("/crm/negociacao/netoneto");
    await expect(page.getByRole("heading", { name: "netoneto" })).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("crm-mark-loss").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Sem interesse" }).click();
    await page.getByTestId("crm-mark-loss-confirm").click();

    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Negociação atualizada" }).first(),
    ).toBeVisible({ timeout: 8_000 });
  });
});
