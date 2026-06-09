import { describe, expect, it } from "bun:test";
import type { AvatarConfig } from "../src";
import { randomAvatarConfig, toDicebearOptions } from "../src";

const BASE: AvatarConfig = randomAvatarConfig("mapping-base");

describe("toDicebearOptions - single-value forcing", () => {
  it("wraps each rendered field in a single-element array", () => {
    const o = toDicebearOptions(BASE);
    expect(o.skinColor).toEqual([BASE.skinColor]);
    expect(o.top).toEqual([BASE.top]);
    expect(o.hairColor).toEqual([BASE.hairColor]);
    expect(o.hatColor).toEqual([BASE.hatColor]);
    expect(o.clothing).toEqual([BASE.clothing]);
    expect(o.clothesColor).toEqual([BASE.clothesColor]);
    expect(o.eyes).toEqual([BASE.eyes]);
    expect(o.eyebrows).toEqual([BASE.eyebrows]);
    expect(o.mouth).toEqual([BASE.mouth]);
    expect(o.backgroundColor).toEqual([BASE.backgroundColor]);
  });

  it("uses a solid background", () => {
    expect(toDicebearOptions(BASE).backgroundType).toEqual(["solid"]);
  });
});

describe("toDicebearOptions - optional parts (accessories)", () => {
  it("enables accessories at 100% when one is chosen", () => {
    const cfg: AvatarConfig = { ...BASE, accessories: "sunglasses" };
    const o = toDicebearOptions(cfg);
    expect(o.accessories).toEqual(["sunglasses"]);
    expect(o.accessoriesProbability).toBe(100);
  });

  it("disables accessories at 0% and empties the list when 'none'", () => {
    const cfg: AvatarConfig = { ...BASE, accessories: "none" };
    const o = toDicebearOptions(cfg);
    expect(o.accessories).toEqual([]);
    expect(o.accessoriesProbability).toBe(0);
  });
});

describe("toDicebearOptions - optional parts (facial hair)", () => {
  it("enables facial hair at 100% when one is chosen", () => {
    const cfg: AvatarConfig = { ...BASE, facialHair: "beardMajestic" };
    const o = toDicebearOptions(cfg);
    expect(o.facialHair).toEqual(["beardMajestic"]);
    expect(o.facialHairProbability).toBe(100);
  });

  it("disables facial hair at 0% and empties the list when 'none'", () => {
    const cfg: AvatarConfig = { ...BASE, facialHair: "none" };
    const o = toDicebearOptions(cfg);
    expect(o.facialHair).toEqual([]);
    expect(o.facialHairProbability).toBe(0);
  });
});

describe("toDicebearOptions - purity", () => {
  it("does not mutate the input config", () => {
    const snapshot = structuredClone(BASE);
    toDicebearOptions(BASE);
    expect(BASE).toEqual(snapshot);
  });

  it("ignores the non-rendered 'style' field", () => {
    const a = toDicebearOptions({ ...BASE, style: "feminine" });
    const b = toDicebearOptions({ ...BASE, style: "masculine" });
    expect(a).toEqual(b);
  });
});
