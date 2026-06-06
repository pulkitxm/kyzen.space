import { describe, expect, it } from "bun:test";
import {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  THEME_IDS,
} from "../src/constants";
import { isValidColorMode, isValidTheme } from "../src/types";

describe("isValidTheme", () => {
  it("accepts every catalog theme id", () => {
    for (const id of THEME_IDS) expect(isValidTheme(id)).toBe(true);
  });

  it("rejects unknown / non-string values", () => {
    for (const v of ["neon", "", "SANGRIA", null, undefined, 1, {}])
      expect(isValidTheme(v)).toBe(false);
  });
});

describe("isValidColorMode", () => {
  it("accepts every mode", () => {
    for (const m of COLOR_MODES) expect(isValidColorMode(m)).toBe(true);
  });

  it("rejects unknown values", () => {
    for (const v of ["sepia", "Dark", null, undefined, 0])
      expect(isValidColorMode(v)).toBe(false);
  });
});

describe("defaults", () => {
  it("are members of their catalogs", () => {
    expect(isValidTheme(DEFAULT_THEME)).toBe(true);
    expect(isValidColorMode(DEFAULT_COLOR_MODE)).toBe(true);
  });
});
