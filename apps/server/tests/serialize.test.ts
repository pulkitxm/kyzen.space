import { describe, expect, test } from "bun:test";
import type { GameRecord } from "@gamelobby/database";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";
import { serializeGame, serializeMove } from "../src/api/serialize";

const baseRow: GameRecord = {
  id: "g1",
  gameType: TIC_TAC_TOE,
  status: "active",
  winner: null,
  gameState: { board: Array(9).fill(null), currentTurn: "X" },
  config: null,
  conversationId: null,
  creatorUserId: "u1",
  seatingMode: "open",
  challengedUserId: null,
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  completedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  players: [{ userId: "u1", username: "alice", role: "X" }],
};

describe("serializeGame", () => {
  test("maps fields, players, and ISO dates", () => {
    const g = serializeGame(baseRow);
    expect(g.id).toBe("g1");
    expect(g.gameType).toBe("tic-tac-toe");
    expect(g.status).toBe("active");
    expect(g.players).toEqual([{ userId: "u1", username: "alice", role: "X" }]);
    expect(g.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(g.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(g.completedAt).toBeNull();
    expect(g.gameState).toEqual({
      board: Array(9).fill(null),
      currentTurn: "X",
    });
  });

  test("coerces an absent game state to null", () => {
    const g = serializeGame({ ...baseRow, gameState: null });
    expect(g.gameState).toBeNull();
  });

  test("emits empty players when none are seated", () => {
    const g = serializeGame({ ...baseRow, players: [] });
    expect(g.players).toEqual([]);
  });
});

describe("serializeMove", () => {
  test("maps fields and the ISO date", () => {
    const m = serializeMove({
      id: "m1",
      gameId: "g1",
      moveNumber: 1,
      playerId: "u1",
      moveData: { row: 0, col: 0 },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(m).toEqual({
      id: "m1",
      gameId: "g1",
      moveNumber: 1,
      playerId: "u1",
      moveData: { row: 0, col: 0 },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });
});
