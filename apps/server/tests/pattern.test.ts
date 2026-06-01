import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PATTERN,
  isValidPattern,
  PATTERN_IDS,
} from "../src/lib/pattern";

describe("isValidPattern", () => {
  it("accepts every catalog pattern id", () => {
    for (const id of PATTERN_IDS) expect(isValidPattern(id)).toBe(true);
  });

  it("rejects unknown / non-string values", () => {
    for (const v of ["scribbles", "", "Doodles", null, undefined, 1, {}])
      expect(isValidPattern(v)).toBe(false);
  });
});

describe("default pattern", () => {
  it("is a member of the catalog", () => {
    expect(isValidPattern(DEFAULT_PATTERN)).toBe(true);
  });
});
