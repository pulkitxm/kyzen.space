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

const UUID_V4 = "a0927a0b-1234-4abc-89ef-0123456789ab";
const UUID_ONES = "11111111-1111-1111-1111-111111111111";

describe("normalizeGameCode - mapping matrix and idempotency", () => {
  test("maps every ambiguous letter in both cases", () => {
    expect(normalizeGameCode("i")).toBe("1");
    expect(normalizeGameCode("I")).toBe("1");
    expect(normalizeGameCode("l")).toBe("1");
    expect(normalizeGameCode("L")).toBe("1");
    expect(normalizeGameCode("o")).toBe("0");
    expect(normalizeGameCode("O")).toBe("0");
  });

  test("leaves U unmapped - it is neither remapped nor in the alphabet", () => {
    expect(normalizeGameCode("u")).toBe("U");
    expect(normalizeGameCode("U")).toBe("U");
    expect(normalizeGameCode("KUP2QX")).toBe("KUP2QX");
    expect(isGameCode("KUP2QX")).toBe(false);
  });

  test("resolves an all-ambiguous input to a valid mapped code", () => {
    expect(normalizeGameCode("iloilo")).toBe("110110");
    expect(isGameCode("ILOILO")).toBe(true);
  });

  test("only trims surrounding whitespace, never internal whitespace", () => {
    expect(normalizeGameCode("  k7p2qx  ")).toBe("K7P2QX");
    expect(normalizeGameCode("k7 p2qx")).toBe("K7 P2QX");
    expect(isGameCode("k7 p2qx")).toBe(false);
  });

  test("is idempotent - re-normalizing a code returns the same code", () => {
    for (const raw of ["k7p2qx", "  ilo123  ", "K7P2Q1", "ABCDEF", "iloilo"]) {
      const once = normalizeGameCode(raw);
      expect(normalizeGameCode(once)).toBe(once);
    }
  });

  test("a freshly generated code is already canonical", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateGameCode();
      expect(normalizeGameCode(code)).toBe(code);
    }
  });
});

describe("isGameCode - boundaries and the UUID migration guard", () => {
  test("accepts a canonical six-char code", () => {
    expect(isGameCode("K7P2QX")).toBe(true);
  });

  test("accepts a lowercase code via normalization", () => {
    expect(isGameCode("k7p2qx")).toBe(true);
  });

  test("rejects the empty string and whitespace-only input", () => {
    expect(isGameCode("")).toBe(false);
    expect(isGameCode("      ")).toBe(false);
  });

  test("rejects codes that are off by one in length", () => {
    expect(isGameCode("K7P2Q")).toBe(false);
    expect(isGameCode("K7P2QXX")).toBe(false);
  });

  test("rejects a typed U", () => {
    expect(isGameCode("K7P2QU")).toBe(false);
  });

  test("rejects a v4 UUID and the legacy /play/<uuid> identifier", () => {
    expect(isGameCode(UUID_ONES)).toBe(false);
    expect(isGameCode(UUID_V4)).toBe(false);
  });

  test("rejects symbols and separators", () => {
    expect(isGameCode("K7P2Q-")).toBe(false);
    expect(isGameCode("K7P2Q_")).toBe(false);
    expect(isGameCode("K7P2Q.")).toBe(false);
  });
});

describe("gameCodeSchema - non-string, empty, and canonical output", () => {
  test("rejects non-string inputs", () => {
    expect(gameCodeSchema.safeParse(123456).success).toBe(false);
    expect(gameCodeSchema.safeParse(null).success).toBe(false);
    expect(gameCodeSchema.safeParse(undefined).success).toBe(false);
    expect(gameCodeSchema.safeParse({}).success).toBe(false);
  });

  test("rejects the empty string", () => {
    expect(gameCodeSchema.safeParse("").success).toBe(false);
  });

  test("rejects a v4 UUID", () => {
    expect(gameCodeSchema.safeParse(UUID_ONES).success).toBe(false);
    expect(gameCodeSchema.safeParse(UUID_V4).success).toBe(false);
  });

  test("parse output is the canonical normalized code", () => {
    expect(gameCodeSchema.parse("k7p2qx")).toBe("K7P2QX");
    expect(gameCodeSchema.parse("  k7p2qx  ")).toBe("K7P2QX");
    expect(gameCodeSchema.parse("iloilo")).toBe("110110");
  });
});
