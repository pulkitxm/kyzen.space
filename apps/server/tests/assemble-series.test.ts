import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const CARD_GAME_UUID = "11111111-1111-1111-1111-111111111111";
const CARD_GAME_CODE = "K7P2QX";

type FakeGame = {
  id: string;
  code: string;
  status: string;
  winner: string | null;
  seriesId: string | null;
  players: { userId: string; username: string; role: string }[];
};

const state: {
  game: FakeGame | null;
  seriesGames: FakeGame[] | null;
  seriesThrows: boolean;
  seriesCalls: string[];
} = {
  game: null,
  seriesGames: null,
  seriesThrows: false,
  seriesCalls: [],
};

mock.module("@gamelobby/database", () => ({
  games: {
    getGameById: async () => state.game,
    getGameByCode: async () => state.game,
    getSeriesGames: async (seriesId: string) => {
      state.seriesCalls.push(seriesId);
      if (state.seriesThrows) throw new Error("series read failed");
      return state.seriesGames ?? [];
    },
  },
  profiles: {
    getPublicUser: async (id: string) => ({
      id,
      username: "alice",
      displayName: "Alice",
      avatar: null,
    }),
    getPublicUsers: async () => [],
  },
  messages: { getGameCardByGameId: async () => null },
  conversations: {},
  friends: {},
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { assembleMessage } = await import("../src/chat/assemble");

function gameCardRow(over: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    conversationId: "c1",
    senderId: "u1",
    kind: "game_card" as const,
    body: null,
    metadata: {
      gameId: CARD_GAME_CODE,
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      challengedUserId: null,
      creatorUsername: "alice",
    },
    gameId: CARD_GAME_UUID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    editedAt: null,
    deletedAt: null,
    ...over,
  };
}

const PLAYERS = [
  { userId: "u1", username: "alice", role: "X" },
  { userId: "u2", username: "bob", role: "O" },
];

function seriesGame(over: Partial<FakeGame>): FakeGame {
  return {
    id: CARD_GAME_UUID,
    code: CARD_GAME_CODE,
    status: "completed",
    winner: "u1",
    seriesId: "series-1",
    players: PLAYERS,
    ...over,
  };
}

type CardMeta = {
  seriesScore?: { completedGames: number; totalGames: number };
  seriesSuperseded?: boolean;
};

beforeEach(() => {
  state.game = null;
  state.seriesGames = null;
  state.seriesThrows = false;
  state.seriesCalls = [];
});

describe("assembleMessage - series enrichment", () => {
  test("a single-game series carries no seriesScore and is not superseded", async () => {
    state.game = seriesGame({ seriesId: null });
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    const meta = out.metadata as CardMeta;
    expect(state.seriesCalls).toHaveLength(0);
    expect(meta.seriesScore).toBeUndefined();
    expect(meta.seriesSuperseded).toBeUndefined();
  });

  test("the latest card in a multi-game series carries a seriesScore", async () => {
    state.game = seriesGame({ id: CARD_GAME_UUID, code: CARD_GAME_CODE });
    state.seriesGames = [
      seriesGame({
        id: "old",
        code: "AAAAAA",
        status: "completed",
        winner: "u1",
      }),
      seriesGame({
        id: CARD_GAME_UUID,
        code: CARD_GAME_CODE,
        status: "completed",
        winner: "u2",
      }),
    ];
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    const meta = out.metadata as CardMeta;
    expect(state.seriesCalls).toEqual(["series-1"]);
    expect(meta.seriesScore).toBeDefined();
    expect(meta.seriesScore?.completedGames).toBe(2);
    expect(meta.seriesScore?.totalGames).toBe(2);
    expect(meta.seriesSuperseded).toBeUndefined();
  });

  test("an older (superseded) card in a multi-game series is flagged superseded with no score", async () => {
    state.game = seriesGame({ id: "old", code: "AAAAAA" });
    state.seriesGames = [
      seriesGame({
        id: "old",
        code: "AAAAAA",
        status: "completed",
        winner: "u1",
      }),
      seriesGame({
        id: "newest",
        code: "BBBBBB",
        status: "active",
        winner: null,
      }),
    ];
    const out = await assembleMessage(
      // biome-ignore lint/suspicious/noExplicitAny: test message row
      gameCardRow({ gameId: "old-fk" }) as any,
    );
    const meta = out.metadata as CardMeta;
    expect(meta.seriesSuperseded).toBe(true);
    expect(meta.seriesScore).toBeUndefined();
  });

  test("a failing getSeriesGames falls back to the single game with no enrichment", async () => {
    state.game = seriesGame({ id: CARD_GAME_UUID, code: CARD_GAME_CODE });
    state.seriesThrows = true;
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    const meta = out.metadata as CardMeta;
    expect(state.seriesCalls).toEqual(["series-1"]);
    expect(meta.seriesScore).toBeUndefined();
    expect(meta.seriesSuperseded).toBeUndefined();
  });

  test("swaps the wire gameId to the latest game code while enriching the series", async () => {
    state.game = seriesGame({ id: "g2", code: "BBBBBB" });
    state.seriesGames = [
      seriesGame({
        id: "g1",
        code: "AAAAAA",
        status: "completed",
        winner: "u1",
      }),
      seriesGame({
        id: "g2",
        code: "BBBBBB",
        status: "completed",
        winner: "u2",
      }),
    ];
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    expect(out.gameId).toBe("BBBBBB");
    expect(out.gameId).not.toBe(CARD_GAME_UUID);
  });
});
