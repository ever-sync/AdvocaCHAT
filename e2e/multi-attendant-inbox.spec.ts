import { test, expect } from "@playwright/test";
import {
  E2E_CHAT_A,
  E2E_CHAT_B,
  E2E_CHAT_POOL,
} from "../src/data/inbox-e2e-fixtures";
import { setE2eMockRole } from "./helpers/mock-role";

test.describe("Inbox multi-atendentes (mock E2E)", () => {
  test("atendimento A vê conversa própria e pool, não a de B", async ({ page }) => {
    await setE2eMockRole(page, "atendimento");
    await page.goto("/inbox");
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_A.id}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_POOL.id}`)).toBeVisible();
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_B.id}`)).not.toBeVisible();
  });

  test("atendimento A não abre deep link da conversa de B", async ({ page }) => {
    await setE2eMockRole(page, "atendimento");
    await page.goto(`/inbox?chatId=${E2E_CHAT_B.id}`);
    await expect(page.getByTestId("inbox-chat-blocked")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/outro atendente/i)).toBeVisible();
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_B.id}`)).not.toBeVisible();
  });

  test("gestor (admin) vê pool, A e B", async ({ page }) => {
    await setE2eMockRole(page, "admin");
    await page.goto("/inbox");
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_A.id}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_B.id}`)).toBeVisible();
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_POOL.id}`)).toBeVisible();
  });

  test("gestor vê banner da fila sem responsável", async ({ page }) => {
    await setE2eMockRole(page, "admin");
    await page.goto("/inbox");
    await expect(page.getByTestId("inbox-manager-queue")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Fila:\s*1 sem responsável/i)).toBeVisible();
  });

  test("atendimento no pool vê bloqueio até assumir", async ({ page }) => {
    await setE2eMockRole(page, "atendimento");
    await page.goto(`/inbox?chatId=${E2E_CHAT_POOL.id}`);
    await expect(page.getByTestId("inbox-claim-required")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/precisa assumi-la/i)).toBeVisible();
    await expect(page.getByText("Mensagem pool")).not.toBeVisible();
    await expect(page.getByPlaceholder("Digite uma mensagem")).not.toBeVisible();
  });

  test("gestor vê Assumir ambos no chat pool com negócio vinculado", async ({ page }) => {
    await setE2eMockRole(page, "admin");
    await page.goto(`/inbox?chatId=${E2E_CHAT_POOL.id}`);
    await expect(page.getByTestId(`inbox-chat-${E2E_CHAT_POOL.id}`)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("inbox-claim-both")).toBeVisible();
    await expect(page.getByRole("button", { name: /Assumir ambos/i })).toBeVisible();
  });
});
