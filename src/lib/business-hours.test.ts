import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_HOURS,
  intervalsByWeekday,
  normalizeBusinessHours,
  normalizeSlaMinutes,
} from "./business-hours";

describe("normalizeSlaMinutes", () => {
  it("clamps to the 1–1440 range", () => {
    expect(normalizeSlaMinutes(0)).toBe(1);
    expect(normalizeSlaMinutes(-5)).toBe(1);
    expect(normalizeSlaMinutes(99999)).toBe(1440);
    expect(normalizeSlaMinutes(30)).toBe(30);
  });

  it("falls back to 15 for non-numeric input", () => {
    expect(normalizeSlaMinutes(undefined)).toBe(15);
    expect(normalizeSlaMinutes("abc")).toBe(15);
    expect(normalizeSlaMinutes(null)).toBe(15);
  });

  it("truncates fractional minutes", () => {
    expect(normalizeSlaMinutes(15.9)).toBe(15);
  });
});

describe("normalizeBusinessHours", () => {
  it("returns the default when input is missing", () => {
    expect(normalizeBusinessHours(undefined)).toEqual(DEFAULT_BUSINESS_HOURS);
    expect(normalizeBusinessHours(null)).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("keeps valid intervals and drops invalid ones", () => {
    const result = normalizeBusinessHours({
      enabled: true,
      timezone: "America/Manaus",
      intervals: [
        { weekday: 1, start: "09:00", end: "18:00" }, // valid
        { weekday: 9, start: "09:00", end: "18:00" }, // weekday out of range
        { weekday: 2, start: "18:00", end: "09:00" }, // end before start
        { weekday: 3, start: "bad", end: "18:00" }, // invalid time → coerced to 09:00 < 18:00 → kept
      ],
    });
    expect(result.enabled).toBe(true);
    expect(result.timezone).toBe("America/Manaus");
    expect(result.intervals).toEqual([
      { weekday: 1, start: "09:00", end: "18:00" },
      { weekday: 3, start: "09:00", end: "18:00" },
    ]);
  });

  it("defaults timezone when blank", () => {
    expect(normalizeBusinessHours({ enabled: false, timezone: "  ", intervals: [] }).timezone).toBe(
      "America/Sao_Paulo",
    );
  });
});

describe("intervalsByWeekday", () => {
  it("groups and sorts intervals per weekday", () => {
    const grouped = intervalsByWeekday({
      enabled: true,
      timezone: "America/Sao_Paulo",
      intervals: [
        { weekday: 1, start: "13:00", end: "18:00" },
        { weekday: 1, start: "09:00", end: "12:00" },
      ],
    });
    expect(grouped[1]).toEqual([
      { weekday: 1, start: "09:00", end: "12:00" },
      { weekday: 1, start: "13:00", end: "18:00" },
    ]);
    expect(grouped[0]).toEqual([]);
  });
});
