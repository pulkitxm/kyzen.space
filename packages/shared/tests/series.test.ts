import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  clientRematchSchema,
  gameCardMetaSchema,
  seriesDetailSchema,
  seriesScoreSchema,
} from "../src/types";

describe("series score schema", () => {
  test("accepts a valid score", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [{ userId: "u1", username: "aman", wins: 2 }],
      draws: 1,
      completedGames: 3,
      totalGames: 4,
    });
    expect(r.success).toBe(true);
  });

  test("rejects a negative win count", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [{ userId: "u1", username: "aman", wins: -1 }],
      draws: 0,
      completedGames: 0,
      totalGames: 1,
    });
    expect(r.success).toBe(false);
  });
});

describe("series detail schema", () => {
  test("accepts a valid detail", () => {
    const r = seriesDetailSchema.safeParse({
      seriesId: "11111111-1111-1111-1111-111111111111",
      gameType: TIC_TAC_TOE,
      score: { entries: [], draws: 0, completedGames: 0, totalGames: 1 },
      games: [
        {
          gameId: "K7P2QX",
          gameNumber: 1,
          status: "completed",
          winner: "u1",
          winnerUsername: "aman",
          completedAt: null,
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("rematch payload schema", () => {
  test("accepts a game id", () => {
    expect(clientRematchSchema.safeParse({ gameId: "K7P2QX" }).success).toBe(
      true,
    );
  });
  test("rejects an empty payload", () => {
    expect(clientRematchSchema.safeParse({}).success).toBe(false);
  });
});

describe("game card meta with series score", () => {
  test("accepts an optional seriesScore", () => {
    const r = gameCardMetaSchema.safeParse({
      gameId: "K7P2QX",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      creatorUsername: "aman",
      seriesScore: {
        entries: [{ userId: "u1", username: "aman", wins: 1 }],
        draws: 0,
        completedGames: 1,
        totalGames: 2,
      },
    });
    expect(r.success).toBe(true);
  });
});
