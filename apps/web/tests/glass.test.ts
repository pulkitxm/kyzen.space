import { describe, expect, it } from "bun:test";
import {
  DEFAULT_GLASS_MODE,
  GLASS_BOOT_SCRIPT,
  GLASS_MODE_DEFS,
  GLASS_MODES,
  GLASS_STORAGE_KEY,
  isValidGlassMode,
} from "../lib/glass";

describe("glass mode catalog", () => {
  it("has a def for every id, and vice versa", () => {
    const defIds = GLASS_MODE_DEFS.map((m) => m.id).sort();
    expect(defIds).toEqual([...GLASS_MODES].sort());
  });

  it("offers the full set of modes", () => {
    expect(GLASS_MODES).toHaveLength(4);
    expect(GLASS_MODES).toContain("off");
  });
});

describe("validators", () => {
  it("accept catalog ids and reject junk", () => {
    for (const id of GLASS_MODES) expect(isValidGlassMode(id)).toBe(true);
    expect(isValidGlassMode("frosted")).toBe(false);
    expect(isValidGlassMode("")).toBe(false);
  });

  it("default is valid and off", () => {
    expect(isValidGlassMode(DEFAULT_GLASS_MODE)).toBe(true);
    expect(DEFAULT_GLASS_MODE).toBe("off");
  });
});

describe("GLASS_BOOT_SCRIPT", () => {
  it("references the storage key and validates against the id list", () => {
    expect(GLASS_BOOT_SCRIPT).toContain(GLASS_STORAGE_KEY);
    expect(GLASS_BOOT_SCRIPT).toContain("data-glass");
    for (const id of GLASS_MODES) expect(GLASS_BOOT_SCRIPT).toContain(id);
  });

  it("removes the attribute for the off mode", () => {
    expect(GLASS_BOOT_SCRIPT).toContain("removeAttribute");
  });
});
