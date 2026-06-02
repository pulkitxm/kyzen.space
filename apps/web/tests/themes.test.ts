import { describe, expect, it } from "bun:test";
import {
  COLOR_MODES,
  DEFAULT_COLOR_MODE,
  DEFAULT_THEME,
  isValidColorMode,
  isValidTheme,
  PALETTE_BOOT_SCRIPT,
  THEME_IDS,
  THEMES,
} from "../lib/themes";

describe("theme catalog", () => {
  it("has a ThemeDef for every id, and vice versa", () => {
    const defIds = THEMES.map((t) => t.id).sort();
    expect(defIds).toEqual([...THEME_IDS].sort());
  });

  it("each theme defines two hex brand colors", () => {
    for (const t of THEMES) {
      expect(t.deep).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.vivid).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("offers the full set of palettes", () => {
    expect(THEMES).toHaveLength(11);
  });
});

describe("validators", () => {
  it("accept catalog ids and reject junk", () => {
    for (const id of THEME_IDS) expect(isValidTheme(id)).toBe(true);
    for (const m of COLOR_MODES) expect(isValidColorMode(m)).toBe(true);
    expect(isValidTheme("nope")).toBe(false);
    expect(isValidColorMode("nope")).toBe(false);
  });

  it("defaults are valid", () => {
    expect(isValidTheme(DEFAULT_THEME)).toBe(true);
    expect(isValidColorMode(DEFAULT_COLOR_MODE)).toBe(true);
  });
});

describe("PALETTE_BOOT_SCRIPT", () => {
  it("references the storage key and validates against the id list", () => {
    expect(PALETTE_BOOT_SCRIPT).toContain("gl-palette");
    expect(PALETTE_BOOT_SCRIPT).toContain("data-theme");
    for (const id of THEME_IDS) expect(PALETTE_BOOT_SCRIPT).toContain(id);
  });
});
