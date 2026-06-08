import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_PATTERN,
  getPatternDef,
  isValidPattern,
  PATTERN_BOOT_SCRIPT,
  PATTERN_IDS,
  PATTERNS,
} from "../lib/patterns";

describe("pattern catalog", () => {
  it("has a PatternDef for every id, and vice versa", () => {
    const defIds = PATTERNS.map((p) => p.id).sort();
    expect(defIds).toEqual([...PATTERN_IDS].sort());
  });

  it("every pattern except 'none' has an asset path; 'none' has none", () => {
    for (const p of PATTERNS) {
      if (p.id === "none") {
        expect(p.src).toBeNull();
      } else {
        expect(p.src).toMatch(/^\/patterns\/.+\.svg$/);
        expect(p.tile).toBeGreaterThan(0);
      }
    }
  });

  it("default pattern resolves to a catalog entry", () => {
    expect(getPatternDef(DEFAULT_PATTERN)).toBeDefined();
  });

  it("every catalog tile SVG exists and matches its declared tile size", () => {
    for (const p of PATTERNS) {
      if (!p.src) continue;
      const file = join(import.meta.dir, "..", "public", p.src);
      expect(existsSync(file)).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toContain(`width="${p.tile}"`);
      expect(svg).toContain(`viewBox="0 0 ${p.tile} ${p.tile}"`);
      expect(svg).toContain("<use ");
    }
  });
});

describe("validators", () => {
  it("accept catalog ids and reject junk", () => {
    for (const id of PATTERN_IDS) expect(isValidPattern(id)).toBe(true);
    expect(isValidPattern("nope")).toBe(false);
    expect(isValidPattern(42)).toBe(false);
  });
});

describe("PATTERN_BOOT_SCRIPT", () => {
  it("references the storage key and validates against the id list", () => {
    expect(PATTERN_BOOT_SCRIPT).toContain("gl-pattern");
    expect(PATTERN_BOOT_SCRIPT).toContain("data-pattern");
    for (const id of PATTERN_IDS) expect(PATTERN_BOOT_SCRIPT).toContain(id);
  });
});
