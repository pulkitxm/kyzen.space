import { describe, expect, test } from "bun:test";
import { TIC_TAC_TOE } from "../src/constants";
import {
  clientRematchSchema,
  gameCardMetaSchema,
  seriesDetailSchema,
  seriesGameSummarySchema,
  seriesScoreEntrySchema,
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

  test("rejects a non-integer win count", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [{ userId: "u1", username: "aman", wins: 1.5 }],
      draws: 0,
      completedGames: 0,
      totalGames: 1,
    });
    expect(r.success).toBe(false);
  });

  test("rejects a negative draw tally", () => {
    const r = seriesScoreSchema.safeParse({
      entries: [],
      draws: -1,
      completedGames: 0,
      totalGames: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("series score entry schema", () => {
  test("accepts an explicit null avatar", () => {
    const r = seriesScoreEntrySchema.safeParse({
      userId: "u1",
      username: "aman",
      wins: 0,
      avatar: null,
    });
    expect(r.success).toBe(true);
  });

  test("accepts an omitted avatar", () => {
    const r = seriesScoreEntrySchema.safeParse({
      userId: "u1",
      username: "aman",
      wins: 0,
    });
    expect(r.success).toBe(true);
  });

  test("rejects a malformed avatar object", () => {
    const r = seriesScoreEntrySchema.safeParse({
      userId: "u1",
      username: "aman",
      wins: 0,
      avatar: { top: "ShortHairTheCaesar" },
    });
    expect(r.success).toBe(false);
  });
});

describe("series game summary schema", () => {
  const base = {
    gameId: "K7P2QX",
    gameNumber: 1,
    status: "completed" as const,
    winner: "u1",
    winnerUsername: "aman",
    completedAt: null,
  };

  test("rejects a zero game number", () => {
    expect(
      seriesGameSummarySchema.safeParse({ ...base, gameNumber: 0 }).success,
    ).toBe(false);
  });

  test("rejects a non-integer game number", () => {
    expect(
      seriesGameSummarySchema.safeParse({ ...base, gameNumber: 2.5 }).success,
    ).toBe(false);
  });

  test("rejects an unknown game status", () => {
    expect(
      seriesGameSummarySchema.safeParse({ ...base, status: "paused" }).success,
    ).toBe(false);
  });

  test("accepts a draw winner string and a null winner", () => {
    expect(
      seriesGameSummarySchema.safeParse({
        ...base,
        winner: "draw",
        winnerUsername: null,
      }).success,
    ).toBe(true);
    expect(
      seriesGameSummarySchema.safeParse({
        ...base,
        winner: null,
        winnerUsername: null,
      }).success,
    ).toBe(true);
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

  test("rejects an unknown game type", () => {
    const r = seriesDetailSchema.safeParse({
      seriesId: "11111111-1111-1111-1111-111111111111",
      gameType: "chess",
      score: { entries: [], draws: 0, completedGames: 0, totalGames: 1 },
      games: [],
    });
    expect(r.success).toBe(false);
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
  test("rejects an empty game id string", () => {
    expect(clientRematchSchema.safeParse({ gameId: "" }).success).toBe(false);
  });
  test("rejects an unknown extra key", () => {
    expect(
      clientRematchSchema.safeParse({ gameId: "K7P2QX", extra: 1 }).success,
    ).toBe(false);
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

  test("omits seriesScore on a series of one", () => {
    const r = gameCardMetaSchema.safeParse({
      gameId: "K7P2QX",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      creatorUsername: "aman",
    });
    expect(r.success).toBe(true);
  });

  test("rejects an unknown extra key alongside seriesScore", () => {
    const r = gameCardMetaSchema.safeParse({
      gameId: "K7P2QX",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      creatorUsername: "aman",
      bogus: true,
    });
    expect(r.success).toBe(false);
  });

  test("rejects a malformed nested seriesScore", () => {
    const r = gameCardMetaSchema.safeParse({
      gameId: "K7P2QX",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      creatorUsername: "aman",
      seriesScore: {
        entries: [{ userId: "u1", username: "aman", wins: -2 }],
        draws: 0,
        completedGames: 0,
        totalGames: 2,
      },
    });
    expect(r.success).toBe(false);
  });
});
