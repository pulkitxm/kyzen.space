import { describe, expect, it } from "bun:test";
import { AVATAR_OPTIONS, HAT_TOPS, topsForStyle } from "../src";

describe("topsForStyle: feminine/masculine partition boundary", () => {
  it("the feminine pool excludes the canonical short tops", () => {
    const fem = new Set(topsForStyle("feminine"));
    for (const shortTop of ["shortFlat", "shortRound", "theCaesar", "sides"]) {
      expect(fem.has(shortTop)).toBe(false);
    }
  });

  it("the feminine pool includes the canonical long tops", () => {
    const fem = new Set(topsForStyle("feminine"));
    for (const longTop of ["bob", "bun", "miaWallace", "straight01"]) {
      expect(fem.has(longTop)).toBe(true);
    }
  });

  it("the masculine pool excludes the canonical long tops", () => {
    const masc = new Set(topsForStyle("masculine"));
    for (const longTop of ["bob", "bun", "miaWallace", "straight01"]) {
      expect(masc.has(longTop)).toBe(false);
    }
  });

  it("the masculine pool includes the canonical short tops", () => {
    const masc = new Set(topsForStyle("masculine"));
    for (const shortTop of ["shortFlat", "shortRound", "theCaesar", "sides"]) {
      expect(masc.has(shortTop)).toBe(true);
    }
  });

  it("neutral tops appear in both biased pools", () => {
    const fem = new Set(topsForStyle("feminine"));
    const masc = new Set(topsForStyle("masculine"));
    for (const neutral of ["dreads", "fro", "shaggy", "shaggyMullet"]) {
      expect(fem.has(neutral)).toBe(true);
      expect(masc.has(neutral)).toBe(true);
    }
  });

  it("the feminine/masculine overlap is exactly the neutral tops plus hats", () => {
    const fem = topsForStyle("feminine");
    const masc = new Set(topsForStyle("masculine"));
    const overlap = new Set(fem.filter((t) => masc.has(t)));
    const expected = new Set<string>([
      "dreads",
      "dreads01",
      "dreads02",
      "fro",
      "froBand",
      "shaggy",
      "shaggyMullet",
      ...HAT_TOPS,
    ]);
    expect(overlap).toEqual(expected);
  });
});

describe("topsForStyle: pool sanity", () => {
  it("no biased pool ever offers 'none' as a hairstyle", () => {
    expect(topsForStyle("feminine")).not.toContain("none");
    expect(topsForStyle("masculine")).not.toContain("none");
    expect(topsForStyle("any")).not.toContain("none");
  });

  it("the union of both biased pools introduces no top outside AVATAR_OPTIONS.top", () => {
    const all = new Set(AVATAR_OPTIONS.top);
    for (const top of [
      ...topsForStyle("feminine"),
      ...topsForStyle("masculine"),
    ]) {
      expect(all.has(top)).toBe(true);
    }
  });

  it("'any' returns the full catalog list by reference (not a copy)", () => {
    expect(topsForStyle("any")).toBe(AVATAR_OPTIONS.top);
  });

  it("a fresh biased array is returned per call (not a shared mutable reference)", () => {
    const a = topsForStyle("feminine");
    const b = topsForStyle("feminine");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
