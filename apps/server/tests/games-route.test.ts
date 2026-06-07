import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const UUID = "11111111-1111-1111-1111-111111111111";
const CODE = "K7P2QX";

// biome-ignore lint/suspicious/noExplicitAny: test game record
let found: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test move store
let moves: any[] = [];
const lookupArgs: string[] = [];

mock.module("@gamelobby/database", () => ({
  games: {
    getGameByCode: async (code: string) => {
      lookupArgs.push(code);
      return found;
    },
    getGameById: async () => found,
    listMoves: async () => moves,
  },
  profiles: {},
  conversations: {},
  friends: {},
  messages: {},
  notifications: {},
  db: {},
  schema: {},
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
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    players: [{ userId: "u1", username: "alice", role: "X" }],
    ...over,
  };
}

beforeEach(() => {
  found = null;
  moves = [];
  lookupArgs.length = 0;
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
