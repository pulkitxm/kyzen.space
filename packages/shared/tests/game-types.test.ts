import { describe, expect, test } from "bun:test";
import { GAME_TYPES, OLD_MAID, TIC_TAC_TOE } from "../src/constants";
import { gameTypeSchema } from "../src/types";

describe("game-types", () => {
  test("the slug constant is the canonical value", () => {
    expect(TIC_TAC_TOE).toBe("tic-tac-toe");
  });

  test("GAME_TYPES contains the slug constant", () => {
    expect(GAME_TYPES).toContain(TIC_TAC_TOE);
    expect(GAME_TYPES).toContain(OLD_MAID);
  });

  test("gameTypeSchema accepts a registered slug", () => {
    expect(gameTypeSchema.parse(TIC_TAC_TOE)).toBe("tic-tac-toe");
    expect(gameTypeSchema.parse(OLD_MAID)).toBe("old-maid");
  });

  test("gameTypeSchema rejects an unknown slug", () => {
    expect(gameTypeSchema.safeParse("chess").success).toBe(false);
  });
});
