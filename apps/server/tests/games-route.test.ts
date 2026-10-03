import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";

const UUID = "11111111-1111-1111-1111-111111111111";
const CODE = "K7P2QX";

// biome-ignore lint/suspicious/noExplicitAny: test game record
let found: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test move store
let moves: any[] = [];
// biome-ignore lint/suspicious/noExplicitAny: test series store
let seriesGames: any[] = [];
const lookupArgs: string[] = [];
const seriesLookupArgs: string[] = [];

mock.module("@kyzen/database", () => ({
  games: {
    getGameByCode: async (code: string) => {
      lookupArgs.push(code);
      return found;
    },
    getGameById: async () => found,
    listMoves: async () => moves,
    getSeriesGames: async (seriesId: string) => {
      seriesLookupArgs.push(seriesId);
      return seriesGames;
    },
  },
  profiles: {},
  matchChat: {},
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: {},
  notifications: {},
  db: {},
  schema: {},
  invites: {},
  generateInviteToken: () => "x".repeat(43),
  createDb: () => ({ db: {}, client: {} }),
}));

const { gamesRouter } = await import("../src/api/routes/games");

function record(over: Record<string, unknown> = {}) {
  return {
    id: UUID,
    code: CODE,
    gameType: TIC_TAC_TOE,
    status: "active",
    winner: null,
    gameState: { board: Array(9).fill(null), currentTurn: "X" },
    config: null,
    conversationId: null,
    creatorUserId: "u1",
    seatingMode: "open",
    challengedUserId: null,
    seriesId: UUID,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    players: [
      { userId: "u1", username: "alice", role: "X" },
      { userId: "u2", username: "bob", role: "O" },
    ],
    ...over,
  };
}

beforeEach(() => {
  found = null;
  moves = [];
  seriesGames = [];
  lookupArgs.length = 0;
  seriesLookupArgs.length = 0;
});

describe("GET /api/games/:gameId", () => {
  test("404s an invalid code without a DB lookup", async () => {
    for (const bad of [UUID, "ABCDE", "ABCDEFG", "K7P2QU"]) {
      const res = await gamesRouter.request(`/${bad}`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    expect(lookupArgs).toHaveLength(0);
  });

  test("404s when no game matches the code", async () => {
    found = null;
    const res = await gamesRouter.request(`/${CODE}`);
    expect(res.status).toBe(404);
    expect(lookupArgs).toEqual([CODE]);
  });

  test("serializes the game by code, never the UUID", async () => {
    found = record();
    moves = [
      {
        id: "m1",
        gameId: UUID,
        moveNumber: 1,
        playerId: "u1",
        moveData: { row: 0, col: 0 },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];
    const res = await gamesRouter.request(`/${CODE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      game: { id: string };
      moves: { gameId: string }[];
    };
    expect(body.game.id).toBe(CODE);
    expect(body.game.id).not.toBe(UUID);
    expect(body.moves[0]?.gameId).toBe(CODE);
    expect(body.moves[0]?.gameId).not.toBe(UUID);
  });

  test("passes a lowercase code through and serializes the stored canonical code", async () => {
    found = record();
    const res = await gamesRouter.request("/k7p2qx");
    expect(res.status).toBe(200);
    expect(lookupArgs).toEqual(["k7p2qx"]);
    const body = (await res.json()) as { game: { id: string } };
    expect(body.game.id).toBe(CODE);
  });
});

describe("GET /api/games/:gameId/series", () => {
  test("404s an invalid code without a DB lookup", async () => {
    for (const bad of [UUID, "ABCDE", "ABCDEFG", "K7P2QU"]) {
      const res = await gamesRouter.request(`/${bad}/series`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
    expect(lookupArgs).toHaveLength(0);
    expect(seriesLookupArgs).toHaveLength(0);
  });

  test("404s when no game matches the code", async () => {
    found = null;
    const res = await gamesRouter.request(`/${CODE}/series`);
    expect(res.status).toBe(404);
    expect(lookupArgs).toEqual([CODE]);
    expect(seriesLookupArgs).toHaveLength(0);
  });

  test("404s when the game has no seriesId", async () => {
    found = record({ seriesId: null });
    const res = await gamesRouter.request(`/${CODE}/series`);
    expect(res.status).toBe(404);
    expect(seriesLookupArgs).toHaveLength(0);
  });

  test("returns the series detail with the score and per-game summaries", async () => {
    found = record({ seriesId: UUID });
    seriesGames = [
      record({
        code: "AAAAAA",
        status: "completed",
        winner: "u1",
        completedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
      record({ code: "BBBBBB", status: "completed", winner: "draw" }),
      record({ code: CODE, status: "active", winner: null }),
    ];
    const res = await gamesRouter.request(`/${CODE}/series`);
    expect(res.status).toBe(200);
    expect(seriesLookupArgs).toEqual([UUID]);

    const body = (await res.json()) as {
      seriesId: string;
      gameType: string;
      score: {
        draws: number;
        completedGames: number;
        totalGames: number;
        entries: { userId: string; wins: number }[];
      };
      games: {
        gameId: string;
        gameNumber: number;
        status: string;
        winner: string | null;
        winnerUsername: string | null;
      }[];
    };

    expect(body.seriesId).toBe(UUID);
    expect(body.gameType).toBe(TIC_TAC_TOE);
    expect(body.score.draws).toBe(1);
    expect(body.score.completedGames).toBe(2);
    expect(body.score.totalGames).toBe(3);
    expect(body.score.entries.find((e) => e.userId === "u1")?.wins).toBe(1);

    expect(body.games.map((g) => g.gameId)).toEqual(["AAAAAA", "BBBBBB", CODE]);
    expect(body.games.map((g) => g.gameNumber)).toEqual([1, 2, 3]);
    expect(body.games[0]?.winnerUsername).toBe("alice");
    expect(body.games[1]?.winner).toBe("draw");
    expect(body.games[1]?.winnerUsername).toBeNull();
    expect(body.games[2]?.winner).toBeNull();
  });
});
