import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";

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

mock.module("@kyzen/database", () => ({
  games,
  profiles,
  matchChat: {},
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
    attachRoomHandlers({} as any, socket as any);
    const res = await invoke(handlers.get("room:create"), {
      gameType: TIC_TAC_TOE,
    });
    expect(res).toEqual({ ok: true, code: CODE });
    expect(createGameCalled).toBe(true);
  });

  test("acks an error for an invalid payload without creating a game", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers({} as any, socket as any);
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
    attachRoomHandlers({} as any, socket as any);
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
    attachRoomHandlers({} as any, socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: true, code: CODE });
  });

  test("acks not_found for an unparseable code", async () => {
    const { socket, handlers } = fakeSocket("u2");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers({} as any, socket as any);
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
    attachRoomHandlers({} as any, socket as any);
    const res = await invoke(handlers.get("room:join"), { code: CODE });
    expect(res).toEqual({ ok: false, error: "full" });
  });
});

describe("lobby events", () => {
  test("room:start is rate limited like room:create", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers({} as any, socket as any);
    const results: unknown[] = [];
    for (let i = 0; i < 11; i++)
      results.push(await invoke(handlers.get("room:start"), { gameId: CODE }));
    expect(results.slice(0, 10)).toEqual(
      Array(10).fill({ ok: false, error: "Game not found" }),
    );
    expect(results[10]).toEqual({
      ok: false,
      error: "Too many starts, slow down",
    });
  });

  test("room:leave and room:kick reject malformed payloads", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers({} as any, socket as any);
    const invalid = { ok: false, error: "Invalid payload" };
    expect(await invoke(handlers.get("room:leave"), {})).toEqual(invalid);
    expect(
      await invoke(handlers.get("room:leave"), { gameId: CODE, extra: 1 }),
    ).toEqual(invalid);
    expect(await invoke(handlers.get("room:kick"), { gameId: CODE })).toEqual(
      invalid,
    );
    expect(
      await invoke(handlers.get("room:kick"), { gameId: CODE, userId: "" }),
    ).toEqual(invalid);
  });

  test("room:leave and room:kick answer through the lobby service", async () => {
    const { socket, handlers } = fakeSocket("u1");
    // biome-ignore lint/suspicious/noExplicitAny: fake socket
    attachRoomHandlers({} as any, socket as any);
    expect(await invoke(handlers.get("room:leave"), { gameId: CODE })).toEqual({
      ok: false,
      error: "Game not found",
    });
    expect(
      await invoke(handlers.get("room:kick"), { gameId: CODE, userId: "u2" }),
    ).toEqual({ ok: false, error: "Game not found" });
  });
});
