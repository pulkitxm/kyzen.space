import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type AnyGame = {
  id: string;
  code: string;
  gameType: string;
  status: string;
  winner: string | null;
  gameState: unknown;
  config: unknown;
  conversationId: string | null;
  creatorUserId: string | null;
  seatingMode: string | null;
  challengedUserId: string | null;
  seriesId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  players: { userId: string; username: string; role: string }[];
};

let prev: AnyGame;
let liveGame: AnyGame | null;
let createInput: {
  players: { userId: string; username: string; role: string }[];
  status?: string;
  seriesId?: string | null;
} | null;
let createdConfig: unknown = null;
const notifyCalls: { userId: string; type: string }[] = [];
const sentCards: { gameId: string }[] = [];

mock.module("@gamelobby/database", () => ({
  conversations: {
    getMemberIds: async () => ["u1", "u2"],
  },
  profiles: {
    getProfileByUserId: async () => ({ username: "aman" }),
  },
  games: {
    getGameByCode: async () => prev,
    findLiveGameInConversation: async () => liveGame,
    createGame: async (input: AnyGame) => {
      createInput = {
        players: input.players,
        status: input.status,
        seriesId: input.seriesId,
      };
      createdConfig = input.config;
      return {
        ...input,
        id: "new-id",
        code: "NEWGM2",
        winner: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  },
  messages: {},
  accountMerge: {},
  friends: {},
  notifications: {},
  db: {},
  schema: {},
  invites: {},
  generateInviteToken: () => "x".repeat(43),
  createDb: () => ({ db: {}, client: {} }),
}));

mock.module("../src/realtime/notify", () => ({
  notify: async (userId: string, type: string) => {
    notifyCalls.push({ userId, type });
  },
}));

mock.module("../src/chat/messages-service", () => ({
  sendMessage: async (input: { gameId: string }) => {
    sentCards.push({ gameId: input.gameId });
    return { ok: true, value: { id: "msg1" } };
  },
}));

const { rematchGame } = await import("../src/chat/games-in-chat-service");

function freshPrev(over: Partial<AnyGame> = {}): AnyGame {
  return {
    id: "old-id",
    code: "OLDGM1",
    gameType: TIC_TAC_TOE,
    status: "completed",
    winner: "u1",
    gameState: null,
    config: { firstPlayer: "X" },
    conversationId: "conv1",
    creatorUserId: "u1",
    seatingMode: "open",
    challengedUserId: null,
    seriesId: "series1",
    startedAt: null,
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    players: [
      { userId: "u1", username: "aman", role: "X" },
      { userId: "u2", username: "riya", role: "O" },
    ],
    ...over,
  };
}

describe("rematchGame", () => {
  beforeEach(() => {
    prev = freshPrev();
    liveGame = null;
    createInput = null;
    createdConfig = null;
    notifyCalls.length = 0;
    sentCards.length = 0;
  });

  test("creates an active rematch with loser first and inherited seriesId", async () => {
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    expect(createInput?.status).toBe("active");
    expect(createInput?.seriesId).toBe("series1");
    expect(createInput?.players[0]?.userId).toBe("u2");
    expect(createInput?.players[0]?.role).toBe("X");
    expect(sentCards.length).toBe(1);
    expect(notifyCalls.some((n) => n.userId === "u2")).toBe(true);
  });

  test("de-dupes to an existing live game without creating", async () => {
    liveGame = freshPrev({ id: "live-id", code: "LIVEGM", status: "active" });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.game.id).toBe("LIVEGM");
    expect(createInput).toBeNull();
  });

  test("rejects a rematch from a non-player", async () => {
    const res = await rematchGame({ userId: "u9", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
  });

  test("rejects a rematch of an unfinished game", async () => {
    prev = freshPrev({ status: "active" });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
  });

  test("rejects a rematch of an abandoned game", async () => {
    prev = freshPrev({ status: "abandoned" });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(createInput).toBeNull();
  });

  test("404s when the game code resolves to nothing", async () => {
    prev = null as unknown as AnyGame;
    const res = await rematchGame({ userId: "u1", gameId: "MISSIN" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(createInput).toBeNull();
  });

  test("rejects a rematch of a game with no conversation", async () => {
    prev = freshPrev({ conversationId: null });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(createInput).toBeNull();
  });

  test("seats the loser of a decisive O win as the first role", async () => {
    prev = freshPrev({ winner: "u2" });
    const res = await rematchGame({ userId: "u2", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    expect(createInput?.players[0]?.userId).toBe("u1");
    expect(createInput?.players[0]?.role).toBe("X");
    expect(createInput?.players[1]?.userId).toBe("u2");
    expect(createInput?.players[1]?.role).toBe("O");
  });

  test("copies the parent config and seats both players active", async () => {
    prev = freshPrev({ config: { firstPlayer: "O" } });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    expect(createInput?.status).toBe("active");
    expect(createInput?.players).toHaveLength(2);
    expect(createdConfig).toEqual({ firstPlayer: "O" });
  });
});
