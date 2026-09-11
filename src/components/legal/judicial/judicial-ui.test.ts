import { expect, it } from "vitest";
import type { LegalOperationsProps } from "../operations/operations-ui";
import {
  judicialCaseAccess,
  judicialCategoryAccess,
  judicialDate,
  judicialKey,
} from "./judicial-ui";
const reader = {
  workspace: { user_id: "reader", tenant_id: "tenant", enabled: true },
  legalCase: { id: "case", owner_id: "owner", tenant_id: "tenant" },
  member: {
    profile_id: "reader",
    can_edit: false,
    can_view_medical: true,
    can_view_fiscal: true,
  },
  canEdit: false,
} as unknown as LegalOperationsProps;
it("requires both current category permissions to read a restricted judicial original", () => {
  expect(judicialCategoryAccess(reader, "restricted")).toBe(true);
  const lostFiscal = {
    ...reader,
    member: { ...reader.member!, can_view_fiscal: false },
  };
  expect(judicialCategoryAccess(lostFiscal, "medical")).toBe(true);
  expect(judicialCategoryAccess(lostFiscal, "restricted")).toBe(false);
  expect(judicialKey(lostFiscal, "events")).not.toEqual(
    judicialKey(reader, "events"),
  );
});
it("does not grant general-content access from a stale case row after membership or tenant changes", () => {
  expect(judicialCaseAccess({ ...reader, member: undefined })).toBe(false);
  expect(
    judicialCategoryAccess({ ...reader, member: undefined }, "general"),
  ).toBe(false);
  expect(
    judicialCaseAccess({
      ...reader,
      workspace: { ...reader.workspace, tenant_id: "other" },
    }),
  ).toBe(false);
});
it("distinguishes a civil date, an instant, and an unknown source timezone", () => {
  expect(judicialDate("2026-09-11")).toBe("11/09/2026");
  expect(judicialDate("2026-09-11T01:00:00Z")).toContain("10/09/2026");
  expect(judicialDate("2026-09-11T01:00:00")).toBe(
    "2026-09-11T01:00:00 (fuso não informado na origem)",
  );
  expect(judicialDate(null)).toBe("Não informada");
});

it("formats a deadline in the calendar timezone instead of attaching an incorrect timezone label", () => {
  expect(judicialDate("2026-09-18T23:59:59-04:00", "America/Manaus")).toContain(
    "18/09/2026, 23:59",
  );
});

it("preserves the provider continuation without turning arbitrary URLs or incomplete jobs into a next-page action", async () => {
  const { judicialContinuation } = await import("./judicial-ui");
  const job = {
    operation: "read_updates",
    state: "succeeded",
    result_summary: {
      next_cursor: { cursor: "YWJj=", li: "12345678901234567890", page: "2" },
    },
  } as unknown as import("@/types/legal-judicial").JudicialJob;
  expect(judicialContinuation(job)).toEqual(job.result_summary.next_cursor);
  expect(
    judicialContinuation({
      ...job,
      result_summary: { next_cursor: { cursor: "https://wrong.invalid/page" } },
    }),
  ).toBeNull();
  expect(judicialContinuation({ ...job, state: "unknown" })).toBeNull();
  expect(
    judicialContinuation({ ...job, operation: "monitor_process" }),
  ).toBeNull();
});
