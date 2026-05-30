import { describe, expect, it } from "bun:test";
import type { AvatarColorKey, AvatarOptionKey } from "../src";
import {
  AVATAR_COLORS,
  AVATAR_OPTIONS,
  AVATAR_STYLES,
  HAT_TOPS,
  isAvatarStyle,
  isHatTop,
  topsForStyle,
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

describe("AVATAR_OPTIONS", () => {
  it("exposes a non-empty list for every option attribute", () => {
    for (const key of OPTION_KEYS) {
      expect(AVATAR_OPTIONS[key].length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate values within any attribute", () => {
    for (const key of OPTION_KEYS) {
      const list = AVATAR_OPTIONS[key];
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("offers 'none' only for the optional parts", () => {
    expect(AVATAR_OPTIONS.accessories).toContain("none");
    expect(AVATAR_OPTIONS.facialHair).toContain("none");
    expect(AVATAR_OPTIONS.top).not.toContain("none");
    expect(AVATAR_OPTIONS.clothing).not.toContain("none");
    expect(AVATAR_OPTIONS.eyes).not.toContain("none");
    expect(AVATAR_OPTIONS.eyebrows).not.toContain("none");
    expect(AVATAR_OPTIONS.mouth).not.toContain("none");
  });
});

describe("AVATAR_COLORS", () => {
  it("exposes a non-empty palette for every color attribute", () => {
    for (const key of COLOR_KEYS) {
      expect(AVATAR_COLORS[key].length).toBeGreaterThan(0);
    }
  });

  it("stores bare 6-digit hex (no leading #) as DiceBear expects", () => {
    const hex = /^[0-9a-f]{6}$/;
    for (const key of COLOR_KEYS) {
      for (const value of AVATAR_COLORS[key]) {
        expect(value).toMatch(hex);
      }
    }
  });

  it("has no duplicate colors within any palette", () => {
    for (const key of COLOR_KEYS) {
      const list = AVATAR_COLORS[key];
      expect(new Set(list).size).toBe(list.length);
    }
  });
});

describe("AVATAR_STYLES", () => {
  it("is exactly any/feminine/masculine", () => {
    expect([...AVATAR_STYLES]).toEqual(["any", "feminine", "masculine"]);
  });
});

describe("isAvatarStyle", () => {
  it("accepts the three known styles", () => {
    expect(isAvatarStyle("any")).toBe(true);
    expect(isAvatarStyle("feminine")).toBe(true);
    expect(isAvatarStyle("masculine")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["", "male", "f", "ANY", null, undefined, 1, {}, []]) {
      expect(isAvatarStyle(v)).toBe(false);
    }
  });
});

describe("isHatTop / HAT_TOPS", () => {
  it("flags every hat top as headwear", () => {
    for (const hat of HAT_TOPS) {
      expect(isHatTop(hat)).toBe(true);
    }
  });

  it("does not flag plain hairstyles", () => {
    expect(isHatTop("shortFlat")).toBe(false);
    expect(isHatTop("bob")).toBe(false);
    expect(isHatTop("nonsense")).toBe(false);
  });

  it("only contains values that are valid tops", () => {
    for (const hat of HAT_TOPS) {
      expect(AVATAR_OPTIONS.top).toContain(hat);
    }
  });
});

describe("topsForStyle", () => {
  it("returns the full top list for 'any'", () => {
    expect(topsForStyle("any")).toBe(AVATAR_OPTIONS.top);
  });

  it("returns a strict subset of valid tops for biased styles", () => {
    const all = new Set(AVATAR_OPTIONS.top);
    for (const style of ["feminine", "masculine"] as const) {
      const pool = topsForStyle(style);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.length).toBeLessThan(AVATAR_OPTIONS.top.length);
      for (const top of pool) expect(all.has(top)).toBe(true);
    }
  });

  it("includes headwear in both biased pools (hats are unisex)", () => {
    for (const style of ["feminine", "masculine"] as const) {
      const pool = topsForStyle(style);
      for (const hat of HAT_TOPS) expect(pool).toContain(hat);
    }
  });

  it("has no duplicates in the biased pools", () => {
    for (const style of ["feminine", "masculine"] as const) {
      const pool = topsForStyle(style);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });

  it("gives feminine and masculine genuinely different hair", () => {
    const fem = new Set(topsForStyle("feminine"));
    const masc = new Set(topsForStyle("masculine"));
    const femOnly = [...fem].filter((t) => !masc.has(t));
    const mascOnly = [...masc].filter((t) => !fem.has(t));
    expect(femOnly.length).toBeGreaterThan(0);
    expect(mascOnly.length).toBeGreaterThan(0);
  });
});
