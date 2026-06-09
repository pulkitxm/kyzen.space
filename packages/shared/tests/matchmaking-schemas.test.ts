import { describe, expect, it } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import {
  clientQueueJoinSchema,
  clientQueueLeaveSchema,
} from "@gamelobby/shared/types";

describe("clientQueueJoinSchema", () => {
  it("accepts a known game type with no config", () => {
    const parsed = clientQueueJoinSchema.safeParse({ gameType: TIC_TAC_TOE });
    expect(parsed.success).toBe(true);
  });

  it("accepts a known game type with a config object", () => {
    const parsed = clientQueueJoinSchema.safeParse({
      gameType: TIC_TAC_TOE,
      config: { firstMove: "X" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown game type", () => {
    const parsed = clientQueueJoinSchema.safeParse({ gameType: "chess" });
    expect(parsed.success).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    const parsed = clientQueueJoinSchema.safeParse({
      gameType: TIC_TAC_TOE,
      sneaky: true,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a payload missing gameType", () => {
    const parsed = clientQueueJoinSchema.safeParse({
      config: { firstMove: "X" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(clientQueueJoinSchema.safeParse(null).success).toBe(false);
    expect(clientQueueJoinSchema.safeParse("tic-tac-toe").success).toBe(false);
    expect(clientQueueJoinSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("clientQueueLeaveSchema", () => {
  it("accepts a known game type", () => {
    const parsed = clientQueueLeaveSchema.safeParse({ gameType: TIC_TAC_TOE });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown game type", () => {
    const parsed = clientQueueLeaveSchema.safeParse({ gameType: "go" });
    expect(parsed.success).toBe(false);
  });

  it("rejects a payload missing gameType", () => {
    expect(clientQueueLeaveSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown extra keys", () => {
    const parsed = clientQueueLeaveSchema.safeParse({
      gameType: TIC_TAC_TOE,
      config: { firstMove: "X" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(clientQueueLeaveSchema.safeParse(null).success).toBe(false);
    expect(clientQueueLeaveSchema.safeParse(undefined).success).toBe(false);
  });
});
