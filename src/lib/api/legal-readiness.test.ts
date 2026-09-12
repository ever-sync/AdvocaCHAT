import { describe, it, expect } from "vitest";
import { parseCaseImport } from "./legal-readiness";
describe("case import input boundary", () => {
  it("accepts a bounded list preserving literal untrusted titles", () =>
    expect(parseCaseImport('[{"title":"<script>literal</script>"}]')).toEqual([
      { title: "<script>literal</script>" },
    ]));
  it.each([
    "{}",
    "null",
    "[]",
    JSON.stringify(Array.from({ length: 101 }, () => ({ title: "A" }))),
  ])("rejects invalid list %s", (text) =>
    expect(() => parseCaseImport(text)).toThrow(),
  );
  it("measures UTF-8 bytes before parsing", () =>
    expect(() =>
      parseCaseImport(JSON.stringify([{ title: "á".repeat(70000) }])),
    ).toThrow("128 KiB"));
  it("does not coerce malformed JSON", () =>
    expect(() => parseCaseImport("[bad]")).toThrow());
});
