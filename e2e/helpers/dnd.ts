import type { Locator, Page } from "@playwright/test";

/** Simula drag com pointer (compatível com @dnd-kit activationConstraint). */
export async function dragLocatorTo(page: Page, source: Locator, target: Locator) {
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) {
    throw new Error("Elementos de drag sem bounding box visível.");
  }

  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const tx = tgtBox.x + tgtBox.width / 2;
  const ty = tgtBox.y + tgtBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 12, sy, { steps: 3 });
  await page.mouse.move(tx, ty, { steps: 20 });
  await page.mouse.up();
}
