import { describe, expect, it } from "bun:test";
import { relativeTime, timeOfDay } from "@/lib/chat/format";

// Regression: an ambient `undefined` locale rendered "PM" on the server but
// "pm" in some browsers, causing a hydration mismatch. The formatters must
// produce a single, deterministic string regardless of the host locale.
describe("timeOfDay", () => {
  it("renders an explicit (en-US) day period, not a locale-dependent one", () => {
    const result = timeOfDay("2026-05-30T15:31:00Z");
    expect(result).toMatch(/^\d{1,2}:\d{2}\s(AM|PM)$/);
  });

  it("returns an empty string for missing input", () => {
    expect(timeOfDay(null)).toBe("");
    expect(timeOfDay(undefined)).toBe("");
  });
});

describe("relativeTime", () => {
  it("renders an explicit (en-US) date for old timestamps", () => {
    // > 7 days ago → falls through to the absolute-date branch
    expect(relativeTime("2020-01-04T12:00:00Z")).toBe("Jan 4");
  });

  it("returns an empty string for missing input", () => {
    expect(relativeTime(null)).toBe("");
  });
});
