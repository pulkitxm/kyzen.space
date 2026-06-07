import { describe, expect, it } from "bun:test";
import { USERNAME_MAX_LENGTH } from "@gamelobby/shared/constants";
import {
  buildUsernameCandidates,
  parseUsernameCsv,
  randomUsernameSuffix,
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

  it("truncates an over-long base to USERNAME_MAX_LENGTH", () => {
    const slug = slugifyBase("a".repeat(USERNAME_MAX_LENGTH + 12));
    expect(slug).toBe("a".repeat(USERNAME_MAX_LENGTH));
    expect(slug.length).toBe(USERNAME_MAX_LENGTH);
  });

  it("keeps a base that is exactly at the max length", () => {
    const slug = slugifyBase("b".repeat(USERNAME_MAX_LENGTH));
    expect(slug.length).toBe(USERNAME_MAX_LENGTH);
  });

  it("truncates only after collapsing spaces to underscores", () => {
    const slug = slugifyBase(`${"x".repeat(USERNAME_MAX_LENGTH)} y`);
    expect(slug).toBe("x".repeat(USERNAME_MAX_LENGTH));
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

  it("returns just the bare base when only one is requested", () => {
    expect(buildUsernameCandidates("alice", 1)).toEqual(["alice"]);
  });

  it("never returns fewer than one even for a count of zero or negative", () => {
    expect(buildUsernameCandidates("alice", 0)).toEqual(["alice"]);
    expect(buildUsernameCandidates("alice", -3)).toEqual(["alice"]);
  });
});

describe("randomUsernameSuffix", () => {
  it("produces a short lowercase-alphanumeric token", () => {
    for (let i = 0; i < 50; i++) {
      const suffix = randomUsernameSuffix();
      expect(suffix).toMatch(/^[a-z0-9]*$/);
      expect(suffix.length).toBeLessThanOrEqual(6);
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

  it("skips duplicate candidates so a name is suggested at most once", () => {
    const out = selectSuggestions(["alice", "alice", "bob"], new Set(), 3);
    expect(out).toEqual(["alice", "bob"]);
  });

  it("returns fewer than requested when the pool runs out", () => {
    const out = selectSuggestions(["a", "b"], new Set(["a"]), 5);
    expect(out).toEqual(["b"]);
  });

  it("returns an empty array for an empty candidate pool", () => {
    expect(selectSuggestions([], new Set(), 3)).toEqual([]);
  });

  it("compares availability against the normalized candidate", () => {
    const out = selectSuggestions(["Alice_99"], new Set(["alice_99"]), 1);
    expect(out).toEqual([]);
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

  it("treats the exact moment the cooldown ends as editable (strict >)", () => {
    const changedAt = new Date("2026-06-01T00:00:00.000Z");
    const exactlyNow = new Date("2026-07-01T00:00:00.000Z");
    expect(usernameEditableAt(changedAt, 30, exactlyNow)).toBeNull();
  });

  it("is still locked one millisecond before the cooldown ends", () => {
    const changedAt = new Date("2026-06-01T00:00:00.000Z");
    const justBefore = new Date("2026-06-30T23:59:59.999Z");
    expect(usernameEditableAt(changedAt, 30, justBefore)?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("returns null for a negative cooldown window", () => {
    expect(
      usernameEditableAt(new Date("2026-06-02T00:00:00Z"), -5, now),
    ).toBeNull();
  });
});
