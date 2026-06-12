import { describe, expect, test } from "bun:test";
import {
  clientCreateRoomSchema,
  clientJoinByCodeSchema,
  gameJsonSchema,
  gamePlayerSchema,
  gameStatusSchema,
  isGameLive,
  isGameOver,
  joinByCodeErrorSchema,
  moveJsonSchema,
} from "../src/types/games";

describe("aborted status", () => {
  test("schema accepts aborted", () => {
    expect(gameStatusSchema.safeParse("aborted").success).toBe(true);
  });

  test("isGameOver is true for aborted", () => {
    expect(isGameOver("aborted")).toBe(true);
  });

  test("isGameLive is false for aborted", () => {
    expect(isGameLive("aborted")).toBe(false);
  });
});

describe("turn-timer wire fields", () => {
  test("gamePlayerSchema accepts timeoutStrikes", () => {
    const parsed = gamePlayerSchema.safeParse({
      userId: "u1",
      username: "alice",
      role: "X",
      timeoutStrikes: 2,
    });
    expect(parsed.success).toBe(true);
  });

  test("gameJsonSchema accepts turnDeadline", () => {
    const parsed = gameJsonSchema.safeParse({
      id: "A2K9P7",
      gameType: "tic-tac-toe",
      status: "active",
      winner: null,
      players: [],
      gameState: {},
      turnDeadline: 1_700_000_000_000,
    });
    expect(parsed.success).toBe(true);
  });

  test("moveJsonSchema accepts auto flag", () => {
    const parsed = moveJsonSchema.safeParse({
      id: "m1",
      gameId: "A2K9P7",
      moveNumber: 0,
      playerId: "u1",
      moveData: {},
      auto: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("room socket schemas", () => {
  test("clientCreateRoomSchema requires a known game type", () => {
    expect(
      clientCreateRoomSchema.safeParse({ gameType: "tic-tac-toe" }).success,
    ).toBe(true);
    expect(
      clientCreateRoomSchema.safeParse({
        gameType: "tic-tac-toe",
        config: { foo: 1 },
      }).success,
    ).toBe(true);
    expect(clientCreateRoomSchema.safeParse({}).success).toBe(false);
  });

  test("clientJoinByCodeSchema normalizes and validates the code", () => {
    expect(clientJoinByCodeSchema.safeParse({ code: "A2K9P7" }).success).toBe(
      true,
    );
    const normalized = clientJoinByCodeSchema.safeParse({ code: "a2k9p7" });
    expect(normalized.success).toBe(true);
    if (normalized.success) expect(normalized.data.code).toBe("A2K9P7");
    expect(clientJoinByCodeSchema.safeParse({ code: "bad" }).success).toBe(
      false,
    );
  });

  test("joinByCodeErrorSchema enumerates the failure reasons", () => {
    for (const reason of [
      "not_found",
      "full",
      "already_started",
      "finished",
    ]) {
      expect(joinByCodeErrorSchema.safeParse(reason).success).toBe(true);
    }
    expect(joinByCodeErrorSchema.safeParse("nope").success).toBe(false);
  });
});
