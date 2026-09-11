import { expect, it } from "vitest";
import { portalDate } from "./format";
it("preserves a financial calendar date without interpreting it as UTC or inventing a time", () => {
  expect(portalDate("2026-09-11")).toBe("11/09/2026");
  expect(portalDate("2026-09-11T15:00:00Z")).toContain("12:00");
});
