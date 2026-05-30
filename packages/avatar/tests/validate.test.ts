import { describe, expect, it } from "bun:test";
import type { AvatarConfig } from "../src";
import { randomAvatarConfig, validateAvatarConfig } from "../src";

const VALID: AvatarConfig = randomAvatarConfig("validate-baseline");

describe("validateAvatarConfig — rejects non-objects", () => {
  it("rejects null / undefined / primitives / arrays", () => {
    for (const bad of [null, undefined, 0, 1, "", "x", true, false, []]) {
      expect(validateAvatarConfig(bad)).toBeNull();
    }
  });
});

describe("validateAvatarConfig — accepts good input", () => {
  it("returns a clean clone of a fully valid config", () => {
    const result = validateAvatarConfig(VALID);
    expect(result).toEqual(VALID);
  });

  it("accepts 'none' for accessories and facial hair", () => {
    const cfg: AvatarConfig = {
      ...VALID,
      accessories: "none",
      facialHair: "none",
    };
    expect(validateAvatarConfig(cfg)).toEqual(cfg);
  });

  it("strips unknown extra keys (only known fields are returned)", () => {
    const result = validateAvatarConfig({
      ...VALID,
      injected: "<script>",
      anotherJunk: 42,
    });
    expect(result).toEqual(VALID);
    expect(result as Record<string, unknown>).not.toHaveProperty("injected");
    expect(result as Record<string, unknown>).not.toHaveProperty("anotherJunk");
  });
});

describe("validateAvatarConfig — rejects out-of-range pieces", () => {
  const optionMutations: Partial<Record<keyof AvatarConfig, unknown>> = {
    top: "mohawk",
    accessories: "monocle",
    facialHair: "wizardBeard",
    clothing: "spacesuit",
    eyes: "laser",
    eyebrows: "none",
    mouth: "vomit2",
  };

  for (const [key, value] of Object.entries(optionMutations)) {
    it(`rejects an invalid ${key}`, () => {
      expect(validateAvatarConfig({ ...VALID, [key]: value })).toBeNull();
    });
  }

  it("rejects a missing required field", () => {
    const { top: _omitted, ...rest } = VALID;
    expect(validateAvatarConfig(rest)).toBeNull();
  });

  it("rejects a field of the wrong type", () => {
    expect(validateAvatarConfig({ ...VALID, top: 123 })).toBeNull();
    expect(validateAvatarConfig({ ...VALID, eyes: null })).toBeNull();
  });
});

describe("validateAvatarConfig — rejects out-of-range colors", () => {
  const colorKeys = [
    "skinColor",
    "hairColor",
    "hatColor",
    "accessoriesColor",
    "facialHairColor",
    "clothesColor",
    "backgroundColor",
  ] as const;

  for (const key of colorKeys) {
    it(`rejects a #-prefixed ${key}`, () => {
      const withHash = `#${VALID[key]}`;
      expect(validateAvatarConfig({ ...VALID, [key]: withHash })).toBeNull();
    });

    it(`rejects an arbitrary hex for ${key} that is not in the palette`, () => {
      expect(validateAvatarConfig({ ...VALID, [key]: "abcdef" })).toBeNull();
    });
  }
});

describe("validateAvatarConfig — style coercion", () => {
  it("keeps a valid style", () => {
    expect(validateAvatarConfig({ ...VALID, style: "masculine" })?.style).toBe(
      "masculine",
    );
    expect(validateAvatarConfig({ ...VALID, style: "feminine" })?.style).toBe(
      "feminine",
    );
  });

  it("coerces an invalid style to 'any' rather than rejecting", () => {
    expect(validateAvatarConfig({ ...VALID, style: "zzz" })?.style).toBe("any");
    expect(validateAvatarConfig({ ...VALID, style: 5 })?.style).toBe("any");
    expect(validateAvatarConfig({ ...VALID, style: null })?.style).toBe("any");
  });

  it("defaults a missing style to 'any' (back-compat with old avatars)", () => {
    const { style: _omit, ...noStyle } = VALID;
    expect(validateAvatarConfig(noStyle)?.style).toBe("any");
  });
});

describe("validateAvatarConfig — does not mutate input", () => {
  it("leaves the original object untouched", () => {
    const input = { ...VALID, junk: "x" };
    const snapshot = structuredClone(input);
    validateAvatarConfig(input);
    expect(input).toEqual(snapshot);
  });
});
