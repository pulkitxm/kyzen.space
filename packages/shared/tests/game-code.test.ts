import { describe, expect, test } from "bun:test";
import {
  GAME_CODE_ALPHABET,
  GAME_CODE_LENGTH,
  gameCodeSchema,
  generateGameCode,
  isGameCode,
  normalizeGameCode,
} from "../src/types";

describe("generateGameCode", () => {
  test("produces a code of the configured length", () => {
    expect(generateGameCode()).toHaveLength(GAME_CODE_LENGTH);
  });

  test("only emits characters from the Crockford alphabet", () => {
    for (let i = 0; i < 2000; i++) {
      for (const char of generateGameCode()) {
        expect(GAME_CODE_ALPHABET).toContain(char);
      }
    }
  });

  test("never emits the ambiguous characters I, L, O, U", () => {
    const joined = Array.from({ length: 2000 }, generateGameCode).join("");
    expect(joined).not.toMatch(/[ILOU]/);
  });

  test("every generated code passes validation", () => {
    for (let i = 0; i < 1000; i++) {
      expect(isGameCode(generateGameCode())).toBe(true);
    }
  });

  test("exercises the whole alphabet over many draws", () => {
    const seen = new Set(
      Array.from({ length: 5000 }, generateGameCode).join(""),
    );
    for (const char of GAME_CODE_ALPHABET) expect(seen.has(char)).toBe(true);
  });
});

describe("normalizeGameCode", () => {
  test("uppercases and trims", () => {
    expect(normalizeGameCode("  k7p2qx  ")).toBe("K7P2QX");
  });

  test("maps look-alike characters to their canonical digits", () => {
    expect(normalizeGameCode("ilo")).toBe("110");
    expect(normalizeGameCode("L1o")).toBe("110");
  });
});

describe("gameCodeSchema", () => {
  test("accepts and normalizes a lowercase code", () => {
    const parsed = gameCodeSchema.safeParse("k7p2qx");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe("K7P2QX");
  });

  test("resolves look-alikes that map onto a real code", () => {
    const parsed = gameCodeSchema.safeParse("K7P2Qi");
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe("K7P2Q1");
  });

  test("rejects wrong length", () => {
    expect(gameCodeSchema.safeParse("K7P2Q").success).toBe(false);
    expect(gameCodeSchema.safeParse("K7P2QX9").success).toBe(false);
  });

  test("rejects characters outside the alphabet", () => {
    expect(gameCodeSchema.safeParse("K7P2Q-").success).toBe(false);
    expect(gameCodeSchema.safeParse("K7P2QU").success).toBe(false);
  });
});
