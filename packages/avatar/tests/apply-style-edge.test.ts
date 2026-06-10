import { describe, expect, it } from "bun:test";
import type { AvatarConfig } from "../src";
import {
  applyStyleToConfig,
  randomAvatarConfig,
  toDicebearOptions,
  topsForStyle,
  validateAvatarConfig,
} from "../src";

const BASE: AvatarConfig = randomAvatarConfig("apply-style-edge");

describe("applyStyleToConfig: facial-hair branch on masculine", () => {
  it("keeps an existing beard when switching to masculine", () => {
    const withBeard: AvatarConfig = { ...BASE, facialHair: "moustacheFancy" };
    const next = applyStyleToConfig(withBeard, "masculine");
    expect(next.facialHair).toBe("moustacheFancy");
  });

  it("leaves a clean-shaven config clean-shaven on masculine", () => {
    const clean: AvatarConfig = { ...BASE, facialHair: "none" };
    const next = applyStyleToConfig(clean, "masculine");
    expect(next.facialHair).toBe("none");
  });

  it("clears a beard when switching to feminine", () => {
    const withBeard: AvatarConfig = { ...BASE, facialHair: "beardMajestic" };
    const next = applyStyleToConfig(withBeard, "feminine");
    expect(next.facialHair).toBe("none");
  });
});

describe("applyStyleToConfig: only top, facialHair, and style change", () => {
  it("preserves accessories across a feminine switch", () => {
    const withAcc: AvatarConfig = { ...BASE, accessories: "round" };
    const next = applyStyleToConfig(withAcc, "feminine");
    expect(next.accessories).toBe("round");
  });

  it("preserves every color across each style switch", () => {
    for (const style of ["any", "feminine", "masculine"] as const) {
      const next = applyStyleToConfig(BASE, style);
      expect(next.hatColor).toBe(BASE.hatColor);
      expect(next.facialHairColor).toBe(BASE.facialHairColor);
      expect(next.clothing).toBe(BASE.clothing);
      expect(next.eyes).toBe(BASE.eyes);
      expect(next.eyebrows).toBe(BASE.eyebrows);
      expect(next.mouth).toBe(BASE.mouth);
    }
  });
});

describe("applyStyleToConfig: object identity and freshness", () => {
  it("never returns the same reference, even for 'any'", () => {
    expect(applyStyleToConfig(BASE, "any")).not.toBe(BASE);
    expect(applyStyleToConfig(BASE, "feminine")).not.toBe(BASE);
    expect(applyStyleToConfig(BASE, "masculine")).not.toBe(BASE);
  });

  it("'any' returns an equal config apart from the style marker", () => {
    const { style: _omit, ...base } = BASE;
    const next = applyStyleToConfig(BASE, "any");
    const { style, ...rest } = next;
    expect(style).toBe("any");
    expect(rest).toEqual({ ...base });
  });
});

describe("applyStyleToConfig: it is a styler, not a sanitizer", () => {
  it("passes an out-of-palette color through unchanged", () => {
    const dirty: AvatarConfig = { ...BASE, skinColor: "zzzzzz" };
    expect(applyStyleToConfig(dirty, "any").skinColor).toBe("zzzzzz");
    expect(applyStyleToConfig(dirty, "masculine").skinColor).toBe("zzzzzz");
  });
});

describe("applyStyleToConfig: result always validates and stays in its pool", () => {
  it("biased switches keep the top inside the style pool and pass validation", () => {
    for (const style of ["feminine", "masculine"] as const) {
      const pool = new Set(topsForStyle(style));
      for (let i = 0; i < 40; i++) {
        const next = applyStyleToConfig(BASE, style);
        expect(pool.has(next.top)).toBe(true);
        expect(validateAvatarConfig(next)).toEqual(next);
      }
    }
  });
});

describe("toDicebearOptions: optional-part colors stay populated", () => {
  it("keeps accessoriesColor single-element even when accessories is 'none'", () => {
    const cfg: AvatarConfig = { ...BASE, accessories: "none" };
    const o = toDicebearOptions(cfg);
    expect(o.accessories).toEqual([]);
    expect(o.accessoriesProbability).toBe(0);
    expect(o.accessoriesColor).toEqual([BASE.accessoriesColor]);
  });

  it("keeps facialHairColor single-element even when facialHair is 'none'", () => {
    const cfg: AvatarConfig = { ...BASE, facialHair: "none" };
    const o = toDicebearOptions(cfg);
    expect(o.facialHair).toEqual([]);
    expect(o.facialHairProbability).toBe(0);
    expect(o.facialHairColor).toEqual([BASE.facialHairColor]);
  });
});
