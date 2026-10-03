import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import { FAKE_ROUNDS } from "./support/fake-rounds";
import { installFakeRegistry } from "./support/runtime";

type AnyGame = {
  id: string;
  code: string;
  publicMatch?: boolean;
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
  gameState?: unknown;
} | null;
let createdConfig: unknown = null;
const rematchCalls: Record<string, unknown>[] = [];
let existingRoom: AnyGame | null = null;
const notifyCalls: { userId: string; type: string }[] = [];
const sentCards: { gameId: string }[] = [];

mock.module("@kyzen/database", () => ({
  conversations: {
    getMemberIds: async () => ["u1", "u2"],
  },
  profiles: {
    getProfileByUserId: async () => ({ username: "aman" }),
  },
  games: {
    getGameByCode: async () => prev,
    findLiveGameInConversation: async () => liveGame,
    createRematch: async (input: AnyGame) => {
      rematchCalls.push(input);
      if (existingRoom) return { game: existingRoom, created: false };
      return {
        game: {
          ...input,
          id: "room-id",
          code: "ROOM22",
          winner: null,
          startedAt: null,
          completedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        created: true,
      };
    },
    createGame: async (input: AnyGame) => {
      createInput = {
        players: input.players,
        status: input.status,
        seriesId: input.seriesId,
        gameState: input.gameState,
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
  matchChat: {},
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
  sendSystemMessage: async () => ({ ok: true, value: null }),
  deleteMessage: async () => ({ ok: true, value: null }),
  markRead: async () => ({ ok: true, value: null }),
}));

installFakeRegistry();

const { rematchGame } = await import("../src/chat/games-in-chat-service");
const { attachGameChatHandlers } = await import(
  "../src/realtime/games-in-chat"
);

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
    rematchCalls.length = 0;
    existingRoom = null;
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

  test("rejects a rematch of a public match", async () => {
    prev = freshPrev({ conversationId: null, publicMatch: true });
    const res = await rematchGame({ userId: "u1", gameId: "OLDGM1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(createInput).toBeNull();
    expect(rematchCalls).toEqual([]);
  });

  test("a private room rematch opens a waiting room hosted by the requester", async () => {
    const config = {
      mode: "teams",
      teams: { u1: "A", u2: "B" },
      bots: [{ id: "bot:1", difficulty: "hard", team: "A" }],
    };
    prev = freshPrev({
      gameType: FAKE_ROUNDS,
      conversationId: null,
      config,
      players: [
        { userId: "u1", username: "aman", role: "P1" },
        { userId: "u2", username: "riya", role: "P2" },
        { userId: "bot:1", username: "Bot 1 (Hard)", role: "P3" },
      ],
    });
    const res = await rematchGame({ userId: "u2", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.game.id).toBe("ROOM22");
    expect(res.value.recipients).toEqual(["u1"]);
    expect(rematchCalls).toEqual([
      expect.objectContaining({
        gameType: FAKE_ROUNDS,
        status: "waiting",
        players: [{ userId: "u2", username: "aman", role: "P1" }],
        gameState: null,
        config,
        conversationId: null,
        creatorUserId: "u2",
        seatingMode: "open",
        seriesId: "series1",
      }),
    ]);
    expect(createInput).toBeNull();
    expect(sentCards).toEqual([]);
    expect(notifyCalls).toEqual([]);
  });

  test("a repeated private room rematch returns the same room without new invitations", async () => {
    prev = freshPrev({ conversationId: null });
    existingRoom = freshPrev({
      id: "room-id",
      code: "ROOM22",
      status: "waiting",
      conversationId: null,
    });
    const res = await rematchGame({ userId: "u2", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.game.id).toBe("ROOM22");
    expect(res.value.recipients).toEqual([]);
  });

  test("the rematch event invites the other humans of a private room by user room", async () => {
    prev = freshPrev({
      conversationId: null,
      players: [
        { userId: "u1", username: "aman", role: "X" },
        { userId: "u2", username: "riya", role: "O" },
      ],
    });
    const emits: { room: string; event: string; payload: unknown }[] = [];
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) =>
          emits.push({ room, event, payload }),
      }),
    };
    const handlers = new Map<
      string,
      (payload: unknown, ack: unknown) => void
    >();
    const socket = {
      data: { userId: "u1" },
      on: (event: string, fn: (payload: unknown, ack: unknown) => void) =>
        handlers.set(event, fn),
    };
    attachGameChatHandlers(io as never, socket as never);
    const ack = await new Promise((resolve) =>
      handlers.get("game:rematch")?.({ gameId: "OLDGM1" }, resolve),
    );
    expect(ack).toEqual({ ok: true, gameId: "ROOM22" });
    expect(emits).toEqual([
      {
        room: "user:u2",
        event: "game:rematch_created",
        payload: { newGameId: "ROOM22", previousGameId: "OLDGM1" },
      },
    ]);
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

  test("a lobby rematch opens a waiting lobby with the same config and every prior human", async () => {
    const config = {
      mode: "teams",
      teams: { u1: "A", u2: "B" },
      bots: [{ id: "bot:1", difficulty: "hard", team: "A" }],
    };
    prev = freshPrev({
      gameType: FAKE_ROUNDS,
      config,
      players: [
        { userId: "u1", username: "aman", role: "P1" },
        { userId: "u2", username: "riya", role: "P2" },
        { userId: "bot:1", username: "Hard Bot", role: "P3" },
      ],
    });
    const res = await rematchGame({ userId: "u2", gameId: "OLDGM1" });
    expect(res.ok).toBe(true);
    expect(createInput?.status).toBe("waiting");
    expect(createInput?.gameState).toBeNull();
    expect(createInput?.players).toEqual([
      { userId: "u1", username: "aman", role: "P1" },
      { userId: "u2", username: "riya", role: "P2" },
    ]);
    expect(createdConfig).toEqual(config);
  });
});
