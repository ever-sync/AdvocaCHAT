import type { Page } from "@playwright/test";
import type { UserRole } from "../../src/types/domain";

/** Define o papel do mock de auth antes do carregamento da página. */
export async function setE2eMockRole(page: Page, role: UserRole) {
  await page.addInitScript((r: UserRole) => {
    sessionStorage.setItem("e2e-mock-role", r);
  }, role);
}
