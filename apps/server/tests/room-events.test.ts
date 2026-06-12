import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const CODE = "K7P2QX";

type Player = { userId: string; username: string; role: string };
type GameRec = {
  id: string;
  code: string;
  gameType: string;
  status: string;
  conversationId: string | null;
  seatingMode: "open" | "challenge" | null;
  challengedUserId: string | null;
  players: Player[];
};

let current: GameRec | null = null;
let profile: { username: string } | null = { username: "alice" };
let createGameCalled = false;

const games = {
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  createGame: async (input: any) => {
    createGameCalled = true;
    return { ...input, id: "g1", code: CODE };
  },
  getGameByCode: async () => current,
  getGameById: async () => current,
};
const profiles = {
  getProfileByUserId: async () => profile,
};

mock.module("@gamelobby/database", () => ({
  games,
  profiles,
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: { getGameCardByGameId: async () => null },
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { attachRoomHandlers } = await import("../src/realtime/room-events");

type Handler = (payload: unknown, cb?: (res: unknown) => void) => void;

function fakeSocket(userId: string) {
  const handlers = new Map<string, Handler>();
  const socket = {
    data: { userId },
    on: (event: string, fn: Handler) => handlers.set(event, fn),
  };
  return { socket, handlers };
}

function invoke(handler: Handler | undefined, payload: unknown) {
  return new Promise<unknown>((resolve) => {
    handler?.(payload, resolve);
    setTimeout(() => resolve(undefined), 100);
  });
}

function room(over: Partial<GameRec> = {}): GameRec {
  return {
    id: "g1",
    code: CODE,
    gameType: TIC_TAC_TOE,
    status: "waiting",
    conversationId: null,
    seatingMode: "open",
    challengedUserId: null,
    players: [{ userId: "u1", username: "alice", role: "X" }],
    ...over,
  };
}

beforeEach(() => {
  current = null;
  profile = { username: "alice" };
  createGameCalled = false;
});

describe("room:create", () => {
  test("acks the new room code on success", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:create"), {
      gameType: TIC_TAC_TOE,
    });
    expect(res).toEqual({ ok: true, code: CODE });
    expect(createGameCalled).toBe(true);
  });

  test("acks an error for an invalid payload without creating a game", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = (await invoke(handlers.get("room:create"), {})) as {
      ok: boolean;
    };
    expect(res.ok).toBe(false);
    expect(createGameCalled).toBe(false);
  });

  test("propagates a service failure", async () => {
    profile = null;
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = (await invoke(handlers.get("room:create"), {
      gameType: TIC_TAC_TOE,
    })) as { ok: boolean };
    expect(res.ok).toBe(false);
  });
});

describe("room:join", () => {
  test("acks ok for a joinable room", async () => {
    current = room();
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: true, code: CODE });
  });

  test("acks not_found for an unparseable code", async () => {
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: "bad" });
    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  test("passes through a typed join error", async () => {
    current = room({
      players: [
        { userId: "u1", username: "alice", role: "X" },
        { userId: "u3", username: "bob", role: "O" },
      ],
    });
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers(socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: false, error: "full" });
  });
});
