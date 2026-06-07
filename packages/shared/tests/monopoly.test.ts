import { describe, expect, test } from "bun:test";
import { monopolyMoveSchema, monopolyStateSchema } from "../src/types";

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
  });
});

describe("monopoly state schema (strict)", () => {
  test("rejects empty states or missing fields", () => {
    expect(monopolyStateSchema.safeParse({}).success).toBe(false);
  });
});
