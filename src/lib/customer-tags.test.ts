import { describe, expect, it } from "vitest";
import {
  CUSTOMER_TAGS_SOURCE_KEY,
  parseCustomerTags,
  serializeCustomerTags,
} from "@/lib/customer-tags";

describe("parseCustomerTags", () => {
  it("returns empty array when missing or empty", () => {
    expect(parseCustomerTags(undefined)).toEqual([]);
    expect(parseCustomerTags(null)).toEqual([]);
    expect(parseCustomerTags({})).toEqual([]);
    expect(parseCustomerTags({ [CUSTOMER_TAGS_SOURCE_KEY]: "   " })).toEqual([]);
  });

  it("parses JSON array of strings", () => {
    const json = JSON.stringify(["vip", " atacado ", "retail"]);
    expect(parseCustomerTags({ [CUSTOMER_TAGS_SOURCE_KEY]: json })).toEqual(["vip", "atacado", "retail"]);
  });

  it("ignores non-strings inside JSON array", () => {
    const raw = JSON.stringify(["ok", 1, null, { x: 1 }, "  b  "]);
    expect(parseCustomerTags({ [CUSTOMER_TAGS_SOURCE_KEY]: raw })).toEqual(["ok", "b"]);
  });

  it("falls back to legacy comma/pipe/semicolon separators", () => {
    expect(parseCustomerTags({ [CUSTOMER_TAGS_SOURCE_KEY]: "a, b ; c|d" })).toEqual(["a", "b", "c", "d"]);
  });

  it("uses legacy split when JSON is invalid", () => {
    expect(parseCustomerTags({ [CUSTOMER_TAGS_SOURCE_KEY]: "[broken" })).toEqual(["[broken"]);
  });
});

describe("serializeCustomerTags", () => {
  it("dedupes, trims and outputs stable JSON array", () => {
    expect(serializeCustomerTags([" b ", "a", "a", ""])).toBe(JSON.stringify(["b", "a"]));
  });

  it("returns empty JSON array string for empty input", () => {
    expect(serializeCustomerTags([])).toBe("[]");
  });
});
