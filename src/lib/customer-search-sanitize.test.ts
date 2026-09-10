import { describe, expect, it } from "vitest";
import {
  escapeIlikeLiteralForPostgrest,
  sanitizeCustomerSearchForPostgrestOrIlike,
} from "@/lib/customer-search-sanitize";

describe("sanitizeCustomerSearchForPostgrestOrIlike", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeCustomerSearchForPostgrestOrIlike("  a  b  ")).toBe("a b");
  });

  it("removes commas that would split PostgREST or()", () => {
    expect(sanitizeCustomerSearchForPostgrestOrIlike("Silva, Maria")).toBe("Silva Maria");
  });

  it("strips ILIKE wildcards and backslash", () => {
    expect(sanitizeCustomerSearchForPostgrestOrIlike("100%_acme\\")).toBe("100 acme");
  });

  it("returns empty when only problematic characters", () => {
    expect(sanitizeCustomerSearchForPostgrestOrIlike("%,_")).toBe("");
  });
});

describe("escapeIlikeLiteralForPostgrest", () => {
  it("escapes backslash, percent and underscore for literal ILIKE", () => {
    expect(escapeIlikeLiteralForPostgrest(`a\\b%c_d`)).toBe(`a\\\\b\\%c\\_d`);
  });

  it("leaves normal emails unchanged", () => {
    expect(escapeIlikeLiteralForPostgrest("user.name+tag@example.com")).toBe("user.name+tag@example.com");
  });
});
