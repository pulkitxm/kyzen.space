import { describe, expect, it } from "bun:test";
import {
  buildUsernameCandidates,
  parseUsernameCsv,
  selectSuggestions,
  slugifyBase,
  usernameEditableAt,
} from "../src/username-rules";

describe("parseUsernameCsv", () => {
  it("splits, trims, lowercases, and drops empties", () => {
    expect(parseUsernameCsv("pulkit, Kanak ,, admin")).toEqual([
      "pulkit",
      "kanak",
      "admin",
    ]);
  });

  it("returns an empty array for empty or whitespace input", () => {
    expect(parseUsernameCsv("")).toEqual([]);
    expect(parseUsernameCsv("   ")).toEqual([]);
  });
});

describe("slugifyBase", () => {
  it("lowercases, replaces spaces with underscores, and strips symbols", () => {
    expect(slugifyBase("John Doe!")).toBe("john_doe");
  });

  it("falls back to 'player' when nothing usable remains", () => {
    expect(slugifyBase("!!!")).toBe("player");
    expect(slugifyBase("")).toBe("player");
  });
});

describe("buildUsernameCandidates", () => {
  it("starts with the base and pads with suffixed variants", () => {
    const candidates = buildUsernameCandidates("alice", 5);
    expect(candidates).toHaveLength(5);
    expect(candidates[0]).toBe("alice");
    for (const c of candidates.slice(1)) {
      expect(c).toMatch(/^alice_[a-z0-9]+$/);
    }
  });
});

describe("selectSuggestions", () => {
  it("returns the first N candidates not marked unavailable", () => {
    const out = selectSuggestions(
      ["alice", "alice_a", "alice_b", "alice_c"],
      new Set(["alice", "alice_b"]),
      2,
    );
    expect(out).toEqual(["alice_a", "alice_c"]);
  });

  it("never exceeds the requested count", () => {
    const out = selectSuggestions(["a", "b", "c"], new Set(), 2);
    expect(out).toHaveLength(2);
  });
});

describe("usernameEditableAt", () => {
  const now = new Date("2026-06-03T00:00:00Z");

  it("returns null when never changed", () => {
    expect(usernameEditableAt(null, 30, now)).toBeNull();
  });

  it("returns null when the cooldown is disabled", () => {
    expect(
      usernameEditableAt(new Date("2026-06-02T00:00:00Z"), 0, now),
    ).toBeNull();
  });

  it("returns null when the cooldown has elapsed", () => {
    expect(
      usernameEditableAt(new Date("2026-01-01T00:00:00Z"), 30, now),
    ).toBeNull();
  });

  it("returns the next-eligible date while inside the cooldown", () => {
    const changedAt = new Date("2026-06-01T00:00:00Z");
    const next = usernameEditableAt(changedAt, 30, now);
    expect(next?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
