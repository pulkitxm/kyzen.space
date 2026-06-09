import { describe, expect, it } from "bun:test";
import type { AvatarConfig } from "../src";
import { AVATAR_CONFIG_KEYS, configsEqual, randomAvatarConfig } from "../src";

const BASE: AvatarConfig = randomAvatarConfig("compare-base");

describe("configsEqual: identity", () => {
  it("a config equals itself", () => {
    expect(configsEqual(BASE, BASE)).toBe(true);
  });

  it("equals a shallow clone", () => {
    expect(configsEqual(BASE, { ...BASE })).toBe(true);
  });
});

describe("configsEqual: every field is compared", () => {
  for (const key of AVATAR_CONFIG_KEYS) {
    it(`detects a change in ${key}`, () => {
      const mutated: AvatarConfig = { ...BASE, [key]: "__different__" };
      expect(configsEqual(BASE, mutated)).toBe(false);
    });
  }
});

describe("configsEqual: style normalization", () => {
  it("treats explicit 'any' and omitted style as equal", () => {
    const withAny: AvatarConfig = { ...BASE, style: "any" };
    const { style: _omit, ...withoutStyle } = BASE;
    expect(configsEqual(withAny, withoutStyle as AvatarConfig)).toBe(true);
  });

  it("treats two omitted styles as equal", () => {
    const { style: _a, ...x } = BASE;
    const { style: _b, ...y } = BASE;
    expect(configsEqual(x as AvatarConfig, y as AvatarConfig)).toBe(true);
  });

  it("distinguishes feminine from masculine", () => {
    expect(
      configsEqual(
        { ...BASE, style: "feminine" },
        { ...BASE, style: "masculine" },
      ),
    ).toBe(false);
  });

  it("distinguishes feminine from 'any'", () => {
    expect(
      configsEqual({ ...BASE, style: "feminine" }, { ...BASE, style: "any" }),
    ).toBe(false);
  });

  it("distinguishes feminine from omitted style", () => {
    const { style: _omit, ...noStyle } = BASE;
    expect(
      configsEqual({ ...BASE, style: "feminine" }, noStyle as AvatarConfig),
    ).toBe(false);
  });
});

describe("configsEqual: symmetry", () => {
  it("is symmetric for equal configs", () => {
    const clone = { ...BASE };
    expect(configsEqual(BASE, clone)).toBe(configsEqual(clone, BASE));
  });

  it("is symmetric for unequal configs", () => {
    const other: AvatarConfig = { ...BASE, top: "__x__" };
    expect(configsEqual(BASE, other)).toBe(configsEqual(other, BASE));
  });
});

describe("AVATAR_CONFIG_KEYS", () => {
  it("covers all 14 rendered fields and excludes 'style'", () => {
    expect(AVATAR_CONFIG_KEYS).toHaveLength(14);
    expect(AVATAR_CONFIG_KEYS).not.toContain("style");
    expect(new Set(AVATAR_CONFIG_KEYS).size).toBe(AVATAR_CONFIG_KEYS.length);
  });
});
