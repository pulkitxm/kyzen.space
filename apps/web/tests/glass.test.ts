import { describe, expect, it } from "bun:test";
import {
  applyGlass,
  DEFAULT_GLASS_MODE,
  GLASS_BOOT_SCRIPT,
  GLASS_MODE_DEFS,
  GLASS_MODES,
  GLASS_STORAGE_KEY,
  isValidGlassMode,
} from "../lib/glass";

function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    getAttribute(name: string) {
      return attrs.has(name) ? (attrs.get(name) as string) : null;
    },
  };
}

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

describe("applyGlass", () => {
  it("removes the data-glass attribute for the off mode", () => {
    const root = fakeRoot();
    root.setAttribute("data-glass", "tinted");
    applyGlass(root as unknown as HTMLElement, "off");
    expect(root.getAttribute("data-glass")).toBeNull();
  });

  it("sets data-glass to each active mode", () => {
    for (const mode of GLASS_MODES) {
      if (mode === "off") continue;
      const root = fakeRoot();
      applyGlass(root as unknown as HTMLElement, mode);
      expect(root.getAttribute("data-glass")).toBe(mode);
    }
  });

  it("overwrites a previously-set mode when switching", () => {
    const root = fakeRoot();
    applyGlass(root as unknown as HTMLElement, "neutral");
    applyGlass(root as unknown as HTMLElement, "smoke");
    expect(root.getAttribute("data-glass")).toBe("smoke");
  });
});
