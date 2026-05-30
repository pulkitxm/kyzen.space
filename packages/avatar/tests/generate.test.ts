import { describe, expect, it } from "bun:test";
import type { AvatarColorKey, AvatarConfig, AvatarOptionKey } from "../src";
import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  applyStyleToConfig,
  randomAvatarConfig,
  seedAvatarConfig,
  toDicebearOptions,
  topsForStyle,
  validateAvatarConfig,
} from "../src";

const OPTION_KEYS: AvatarOptionKey[] = [
  "top",
  "accessories",
  "facialHair",
  "clothing",
  "eyes",
  "eyebrows",
  "mouth",
];
const COLOR_KEYS: AvatarColorKey[] = [
  "skinColor",
  "hairColor",
  "hatColor",
  "accessoriesColor",
  "facialHairColor",
  "clothesColor",
  "backgroundColor",
];

function expectValidShape(c: AvatarConfig) {
  for (const key of OPTION_KEYS) {
    expect(AVATAR_OPTIONS[key]).toContain(c[key]);
  }
  for (const key of COLOR_KEYS) {
    expect(AVATAR_COLORS[key]).toContain(c[key]);
  }
}

describe("randomAvatarConfig — determinism", () => {
  it("is stable for the same seed", () => {
    expect(randomAvatarConfig("user-123")).toEqual(
      randomAvatarConfig("user-123"),
    );
  });

  it("differs across different seeds (no constant collapse)", () => {
    const a = randomAvatarConfig("alice");
    const b = randomAvatarConfig("bob");
    expect(a).not.toEqual(b);
  });

  it("produces variety across many seeds", () => {
    const tops = new Set<string>();
    const skins = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = randomAvatarConfig(`seed-${i}`);
      tops.add(c.top);
      skins.add(c.skinColor);
    }
    expect(tops.size).toBeGreaterThan(10);
    expect(skins.size).toBe(AVATAR_COLORS.skinColor.length);
  });

  it("is unseeded-random when called with no seed", () => {
    const rolls = new Set<string>();
    for (let i = 0; i < 25; i++)
      rolls.add(JSON.stringify(randomAvatarConfig()));
    expect(rolls.size).toBeGreaterThan(1);
  });
});

describe("randomAvatarConfig — always valid", () => {
  it("only ever emits in-range values (seeded)", () => {
    for (let i = 0; i < 200; i++) {
      expectValidShape(randomAvatarConfig(`v-${i}`));
    }
  });

  it("only ever emits in-range values (unseeded)", () => {
    for (let i = 0; i < 200; i++) {
      expectValidShape(randomAvatarConfig());
    }
  });

  it("round-trips through validateAvatarConfig", () => {
    for (let i = 0; i < 100; i++) {
      const c = randomAvatarConfig(`rt-${i}`);
      expect(validateAvatarConfig(c)).toEqual(c);
    }
  });
});

describe("randomAvatarConfig — style biasing", () => {
  it("defaults to style 'any'", () => {
    expect(randomAvatarConfig("x").style).toBe("any");
  });

  it("feminine never has facial hair and draws from the feminine pool", () => {
    const pool = new Set(topsForStyle("feminine"));
    for (let i = 0; i < 150; i++) {
      const c = randomAvatarConfig(`f-${i}`, "feminine");
      expect(c.style).toBe("feminine");
      expect(c.facialHair).toBe("none");
      expect(pool.has(c.top)).toBe(true);
    }
  });

  it("masculine draws from the masculine pool", () => {
    const pool = new Set(topsForStyle("masculine"));
    for (let i = 0; i < 150; i++) {
      const c = randomAvatarConfig(`m-${i}`, "masculine");
      expect(c.style).toBe("masculine");
      expect(pool.has(c.top)).toBe(true);
    }
  });

  it("masculine produces facial hair at least sometimes", () => {
    let beards = 0;
    for (let i = 0; i < 300; i++) {
      if (randomAvatarConfig(`mb-${i}`, "masculine").facialHair !== "none") {
        beards++;
      }
    }
    expect(beards).toBeGreaterThan(30);
  });

  it("'any' allows facial hair at least sometimes", () => {
    let beards = 0;
    for (let i = 0; i < 400; i++) {
      if (randomAvatarConfig(`ab-${i}`, "any").facialHair !== "none") beards++;
    }
    expect(beards).toBeGreaterThan(10);
  });

  it("optional parts can be 'none' (accessories sometimes absent)", () => {
    let bare = 0;
    for (let i = 0; i < 200; i++) {
      if (randomAvatarConfig(`acc-${i}`).accessories === "none") bare++;
    }
    expect(bare).toBeGreaterThan(0);
  });
});

describe("seedAvatarConfig", () => {
  it("is deterministic and equivalent to a seeded random roll", () => {
    expect(seedAvatarConfig("abc")).toEqual(seedAvatarConfig("abc"));
    expect(seedAvatarConfig("abc")).toEqual(randomAvatarConfig("abc"));
  });

  it("maps distinct usernames to distinct characters (mostly)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(JSON.stringify(seedAvatarConfig(`player_${i}`)));
    }
    expect(seen.size).toBeGreaterThan(90);
  });

  it("handles empty and unicode seeds without throwing", () => {
    expect(() => seedAvatarConfig("")).not.toThrow();
    expect(() => seedAvatarConfig("名前🎮")).not.toThrow();
    expectValidShape(seedAvatarConfig(""));
    expectValidShape(seedAvatarConfig("名前🎮"));
  });
});

describe("applyStyleToConfig", () => {
  const base = randomAvatarConfig("base-config");

  it("preserves all colors when switching style", () => {
    for (const style of ["feminine", "masculine", "any"] as const) {
      const next = applyStyleToConfig(base, style);
      expect(next.skinColor).toBe(base.skinColor);
      expect(next.hairColor).toBe(base.hairColor);
      expect(next.clothesColor).toBe(base.clothesColor);
      expect(next.backgroundColor).toBe(base.backgroundColor);
      expect(next.accessoriesColor).toBe(base.accessoriesColor);
    }
  });

  it("'any' keeps the hairstyle and only updates the marker", () => {
    const next = applyStyleToConfig(base, "any");
    expect(next.top).toBe(base.top);
    expect(next.facialHair).toBe(base.facialHair);
    expect(next.style).toBe("any");
  });

  it("feminine clears facial hair and picks a feminine top", () => {
    const pool = new Set(topsForStyle("feminine"));
    for (let i = 0; i < 50; i++) {
      const next = applyStyleToConfig(base, "feminine");
      expect(next.facialHair).toBe("none");
      expect(pool.has(next.top)).toBe(true);
      expect(next.style).toBe("feminine");
    }
  });

  it("masculine keeps existing facial hair and picks a masculine top", () => {
    const withBeard: AvatarConfig = { ...base, facialHair: "beardMedium" };
    const pool = new Set(topsForStyle("masculine"));
    for (let i = 0; i < 50; i++) {
      const next = applyStyleToConfig(withBeard, "masculine");
      expect(next.facialHair).toBe("beardMedium");
      expect(pool.has(next.top)).toBe(true);
      expect(next.style).toBe("masculine");
    }
  });

  it("does not mutate the input config", () => {
    const snapshot = structuredClone(base);
    applyStyleToConfig(base, "feminine");
    expect(base).toEqual(snapshot);
  });

  it("always yields a config that passes validation", () => {
    for (const style of ["feminine", "masculine", "any"] as const) {
      for (let i = 0; i < 30; i++) {
        const next = applyStyleToConfig(base, style);
        expect(validateAvatarConfig(next)).toEqual(next);
      }
    }
  });
});
