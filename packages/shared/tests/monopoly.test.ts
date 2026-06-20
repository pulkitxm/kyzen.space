import { describe, expect, test } from "bun:test";
import {
  monopolyConfigSchema,
  monopolyMoveSchema,
  monopolyStateSchema,
} from "../src/types";

describe("monopoly move schema (strict)", () => {
  test("accepts valid ROLL_DICE move", () => {
    const result = monopolyMoveSchema.safeParse({
      type: "ROLL_DICE",
      payload: { die1: 4, die2: 4 },
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid die values", () => {
    const result = monopolyMoveSchema.safeParse({
      type: "ROLL_DICE",
      payload: { die1: 7, die2: 0 },
    });
    expect(result.success).toBe(false);
  });

  test("rejects ROLL_DICE without payload", () => {
    expect(monopolyMoveSchema.safeParse({ type: "ROLL_DICE" }).success).toBe(
      false,
    );
  });

  test("accepts simple actions", () => {
    expect(monopolyMoveSchema.safeParse({ type: "BUY_PROPERTY" }).success).toBe(
      true,
    );
    expect(
      monopolyMoveSchema.safeParse({ type: "DECLINE_PURCHASE" }).success,
    ).toBe(true);
    expect(monopolyMoveSchema.safeParse({ type: "END_TURN" }).success).toBe(
      true,
    );
    expect(
      monopolyMoveSchema.safeParse({ type: "PAY_JAIL_FINE" }).success,
    ).toBe(true);
    expect(
      monopolyMoveSchema.safeParse({ type: "USE_OUT_OF_JAIL_CARD" }).success,
    ).toBe(true);
    expect(
      monopolyMoveSchema.safeParse({ type: "DECLARE_BANKRUPTCY" }).success,
    ).toBe(true);
    expect(monopolyMoveSchema.safeParse({ type: "DRAW_CARD" }).success).toBe(
      true,
    );
  });

  test("rejects unknown action type", () => {
    expect(
      monopolyMoveSchema.safeParse({ type: "STEAL_PROPERTY" }).success,
    ).toBe(false);
  });

  test("accepts BUILD_HOUSE with tileId payload", () => {
    expect(
      monopolyMoveSchema.safeParse({
        type: "BUILD_HOUSE",
        payload: { tileId: "middle_ave" },
      }).success,
    ).toBe(true);
  });

  test("rejects BUILD_HOUSE without payload", () => {
    expect(monopolyMoveSchema.safeParse({ type: "BUILD_HOUSE" }).success).toBe(
      false,
    );
  });

  test("accepts SELL_HOUSE with tileId payload", () => {
    expect(
      monopolyMoveSchema.safeParse({
        type: "SELL_HOUSE",
        payload: { tileId: "baltic" },
      }).success,
    ).toBe(true);
  });

  test("accepts MORTGAGE_PROPERTY with tileId payload", () => {
    expect(
      monopolyMoveSchema.safeParse({
        type: "MORTGAGE_PROPERTY",
        payload: { tileId: "reading_rr" },
      }).success,
    ).toBe(true);
  });

  test("accepts UNMORTGAGE_PROPERTY with tileId payload", () => {
    expect(
      monopolyMoveSchema.safeParse({
        type: "UNMORTGAGE_PROPERTY",
        payload: { tileId: "reading_rr" },
      }).success,
    ).toBe(true);
  });

  test("rejects completely invalid input", () => {
    expect(monopolyMoveSchema.safeParse(undefined).success).toBe(false);
    expect(monopolyMoveSchema.safeParse("nonsense").success).toBe(false);
    expect(
      monopolyMoveSchema.safeParse({ definitely: "not a move" }).success,
    ).toBe(false);
  });
});

describe("monopoly state schema (strict)", () => {
  test("rejects empty states or missing fields", () => {
    expect(monopolyStateSchema.safeParse({}).success).toBe(false);
  });

  test("rejects extra unknown fields (strict mode)", () => {
    expect(
      monopolyStateSchema.safeParse({
        board: [],
        players: [],
        currentPlayerIndex: 0,
        turnPhase: "WAITING_FOR_ROLL",
        dice: [1, 1],
        doublesCount: 0,
        chanceDeck: [],
        communityDeck: [],
        log: [],
        winnerId: null,
        extraField: "should fail",
      }).success,
    ).toBe(false);
  });
});

describe("monopoly config schema (strict)", () => {
  test("accepts empty object", () => {
    expect(monopolyConfigSchema.safeParse({}).success).toBe(true);
  });

  test("rejects extra keys", () => {
    expect(monopolyConfigSchema.safeParse({ boardSize: 40 }).success).toBe(
      false,
    );
  });
});
