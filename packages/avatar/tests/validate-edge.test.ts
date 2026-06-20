import { describe, expect, it } from "bun:test";
import type { AvatarColorKey, AvatarConfig } from "../src";
import {
  AVATAR_COLORS,
  randomAvatarConfig,
  validateAvatarConfig,
} from "../src";

const VALID: AvatarConfig = randomAvatarConfig("validate-edge-baseline");

describe("validateAvatarConfig: colors are validated unconditionally", () => {
  it("rejects an invalid accessoriesColor even when accessories is 'none'", () => {
    const cfg = {
      ...VALID,
      accessories: "none",
      accessoriesColor: "zzzzzz",
    };
    expect(validateAvatarConfig(cfg)).toBeNull();
  });

  it("rejects an invalid facialHairColor even when facialHair is 'none'", () => {
    const cfg = {
      ...VALID,
      facialHair: "none",
      facialHairColor: "zzzzzz",
    };
    expect(validateAvatarConfig(cfg)).toBeNull();
  });

  it("accepts a valid accessoriesColor when accessories is 'none'", () => {
    const cfg: AvatarConfig = {
      ...VALID,
      accessories: "none",
      accessoriesColor:
        AVATAR_COLORS.accessoriesColor[0] ?? VALID.accessoriesColor,
    };
    expect(validateAvatarConfig(cfg)).toEqual(cfg);
  });
});

describe("validateAvatarConfig: hex palette is exact and case-sensitive", () => {
  const colorKeys: AvatarColorKey[] = [
    "skinColor",
    "hairColor",
    "hatColor",
    "accessoriesColor",
    "facialHairColor",
    "clothesColor",
    "backgroundColor",
  ];

  for (const key of colorKeys) {
    it(`rejects an upper-cased ${key} (palette stores lowercase hex)`, () => {
      const upper = VALID[key].toUpperCase();
      if (upper === VALID[key]) return;
      expect(validateAvatarConfig({ ...VALID, [key]: upper })).toBeNull();
    });

    it(`accepts the canonical lowercase ${key}`, () => {
      expect(validateAvatarConfig({ ...VALID, [key]: VALID[key] })?.[key]).toBe(
        VALID[key],
      );
    });
  }
});

describe("validateAvatarConfig: empty and whitespace option values", () => {
  it("rejects an empty-string option value", () => {
    expect(validateAvatarConfig({ ...VALID, top: "" })).toBeNull();
  });

  it("rejects a whitespace-padded but otherwise valid option value", () => {
    expect(
      validateAvatarConfig({ ...VALID, top: ` ${VALID.top} ` }),
    ).toBeNull();
  });

  it("rejects an empty-string color value", () => {
    expect(validateAvatarConfig({ ...VALID, skinColor: "" })).toBeNull();
  });
});

describe("validateAvatarConfig: prototype-pollution payloads", () => {
  it("returns null for a bare __proto__ object with no real fields", () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(validateAvatarConfig(payload)).toBeNull();
  });

  it("ignores a __proto__ key on an otherwise valid config", () => {
    const result = validateAvatarConfig({
      ...VALID,
      ["__proto__" as string]: { polluted: true },
    });
    expect(result).toEqual(VALID);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("validateAvatarConfig: NaN and edge style coercion", () => {
  it("coerces a NaN style to 'any'", () => {
    expect(validateAvatarConfig({ ...VALID, style: Number.NaN })?.style).toBe(
      "any",
    );
  });

  it("coerces an array style to 'any'", () => {
    expect(validateAvatarConfig({ ...VALID, style: ["feminine"] })?.style).toBe(
      "any",
    );
  });

  it("coerces a case-mismatched style to 'any'", () => {
    expect(validateAvatarConfig({ ...VALID, style: "Feminine" })?.style).toBe(
      "any",
    );
  });
});

describe("validateAvatarConfig: returns a fresh object, never the input", () => {
  it("does not return the same reference it was given", () => {
    const result = validateAvatarConfig(VALID);
    expect(result).not.toBe(VALID);
    expect(result).toEqual(VALID);
  });

  it("a feminine random config round-trips and keeps its style", () => {
    const fem = randomAvatarConfig("validate-edge-fem", "feminine");
    const result = validateAvatarConfig(fem);
    expect(result).toEqual(fem);
    expect(result?.style).toBe("feminine");
  });
});
