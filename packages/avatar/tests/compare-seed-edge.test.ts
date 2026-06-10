import { describe, expect, it } from "bun:test";
import type { AvatarConfig } from "../src";
import {
  AVATAR_CONFIG_KEYS,
  configsEqual,
  randomAvatarConfig,
  seedAvatarConfig,
  toDicebearOptions,
} from "../src";

const BASE: AvatarConfig = randomAvatarConfig("compare-seed-edge");

describe("configsEqual: extraneous-key behavior", () => {
  it("ignores an extra non-rendered key on one side", () => {
    const withJunk = { ...BASE, totallyUnknown: "x" } as AvatarConfig;
    expect(configsEqual(BASE, withJunk)).toBe(true);
    expect(configsEqual(withJunk, BASE)).toBe(true);
  });

  it("ignores extra keys on both sides as long as the 14 fields match", () => {
    const a = { ...BASE, extraA: 1 } as AvatarConfig;
    const b = { ...BASE, extraB: 2 } as AvatarConfig;
    expect(configsEqual(a, b)).toBe(true);
  });

  it("treats an undefined rendered field as unequal to a present value", () => {
    const missingTop = { ...BASE, top: undefined } as unknown as AvatarConfig;
    expect(configsEqual(BASE, missingTop)).toBe(false);
    expect(configsEqual(missingTop, BASE)).toBe(false);
  });
});

describe("AVATAR_CONFIG_KEYS: matches a real config's rendered surface", () => {
  it("equals the config's own keys minus 'style'", () => {
    const keys = Object.keys(BASE)
      .filter((k) => k !== "style")
      .sort();
    expect(keys).toEqual([...AVATAR_CONFIG_KEYS].sort());
  });

  it("contains every field that toDicebearOptions reads (no missing render key)", () => {
    const dicebear = toDicebearOptions(BASE);
    for (const key of AVATAR_CONFIG_KEYS) {
      expect(BASE[key]).toBeDefined();
    }
    expect(dicebear.skinColor[0]).toBe(BASE.skinColor);
    expect(dicebear.top[0]).toBe(BASE.top);
    expect(dicebear.backgroundColor[0]).toBe(BASE.backgroundColor);
  });
});

describe("seedAvatarConfig: dirty seed inputs", () => {
  it("an empty seed is deterministic", () => {
    expect(seedAvatarConfig("")).toEqual(seedAvatarConfig(""));
  });

  it("a whitespace-only seed is deterministic and distinct from the empty seed", () => {
    expect(seedAvatarConfig(" ")).toEqual(seedAvatarConfig(" "));
    expect(seedAvatarConfig(" ")).not.toEqual(seedAvatarConfig(""));
  });

  it("distinct single-character seeds produce distinct configs", () => {
    expect(seedAvatarConfig("a")).not.toEqual(seedAvatarConfig("b"));
  });

  it("carries the default 'any' style through a seeded roll", () => {
    expect(seedAvatarConfig("style-marker").style).toBe("any");
  });
});

describe("randomAvatarConfig: seed isolation from the global generator", () => {
  it("a seeded roll is unaffected by intervening Math.random calls", () => {
    const first = randomAvatarConfig("isolation-seed");
    for (let i = 0; i < 50; i++) Math.random();
    const second = randomAvatarConfig("isolation-seed");
    expect(second).toEqual(first);
  });
});
