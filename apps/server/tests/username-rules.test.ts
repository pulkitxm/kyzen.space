import { describe, expect, it } from "bun:test";
import {
  buildUsernameCandidates,
  isReservedUsername,
  isValidUsernameFormat,
  normalizeUsername,
  parseUsernameCsv,
  RESERVED_USERNAMES,
  selectSuggestions,
  slugifyBase,
  usernameEditableAt,
} from "../src/username-rules";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Alice_99 ")).toBe("alice_99");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeUsername("   ")).toBe("");
  });
});

describe("isValidUsernameFormat", () => {
  it("accepts lowercase letters, digits, and underscore within 3-30 chars", () => {
    expect(isValidUsernameFormat("alice")).toBe(true);
    expect(isValidUsernameFormat("a_b_2")).toBe(true);
    expect(isValidUsernameFormat("abc")).toBe(true);
    expect(isValidUsernameFormat("a".repeat(30))).toBe(true);
  });

  it("rejects too short, too long, and empty", () => {
    expect(isValidUsernameFormat("")).toBe(false);
    expect(isValidUsernameFormat("ab")).toBe(false);
    expect(isValidUsernameFormat("a".repeat(31))).toBe(false);
  });

  it("rejects uppercase, spaces, and symbols", () => {
    expect(isValidUsernameFormat("Alice")).toBe(false);
    expect(isValidUsernameFormat("al ice")).toBe(false);
    expect(isValidUsernameFormat("al-ice")).toBe(false);
    expect(isValidUsernameFormat("al.ice")).toBe(false);
  });
});

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

describe("RESERVED_USERNAMES / isReservedUsername", () => {
  it("reserves top-level routes and server namespaces", () => {
    for (const name of [
      "api",
      "auth",
      "games",
      "profile",
      "settings",
      "chat",
    ]) {
      expect(RESERVED_USERNAMES.has(name)).toBe(true);
      expect(isReservedUsername(name)).toBe(true);
    }
  });

  it("does not reserve ordinary names", () => {
    expect(isReservedUsername("alice")).toBe(false);
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
