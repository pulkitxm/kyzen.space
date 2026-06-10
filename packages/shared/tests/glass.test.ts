import { describe, expect, it } from "bun:test";
import {
  DEFAULT_GLASS_MODE,
  GLASS_MODE_DEFS,
  GLASS_MODES,
  getGlassModeDef,
} from "../src/constants";
import { isValidGlassMode } from "../src/types";

describe("isValidGlassMode", () => {
  it("accepts every catalog glass mode", () => {
    for (const id of GLASS_MODES) expect(isValidGlassMode(id)).toBe(true);
  });

  it("rejects unknown / non-string values", () => {
    for (const v of ["frosted", "", "NEUTRAL", null, undefined, 1, {}])
      expect(isValidGlassMode(v)).toBe(false);
  });
});

describe("glass mode catalog", () => {
  it("has a def for every id, and vice versa", () => {
    const defIds = GLASS_MODE_DEFS.map((m) => m.id).sort();
    expect(defIds).toEqual([...GLASS_MODES].sort());
  });

  it("looks up defs by id", () => {
    for (const id of GLASS_MODES) expect(getGlassModeDef(id)?.id).toBe(id);
    expect(getGlassModeDef("frosted")).toBeUndefined();
  });
});

describe("defaults", () => {
  it("default mode is a catalog member and is off", () => {
    expect(isValidGlassMode(DEFAULT_GLASS_MODE)).toBe(true);
    expect(DEFAULT_GLASS_MODE).toBe("off");
  });
});
