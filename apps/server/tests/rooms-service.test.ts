import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";

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

const CODE = "K7P2QX";
let current: GameRec | null;
// biome-ignore lint/suspicious/noExplicitAny: test capture
let createGameArg: any = null;
let profile: { username: string } | null = { username: "alice" };

const games = {
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  createGame: async (input: any) => {
    createGameArg = input;
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
  accountMerge: {},
  conversations: {},
  friends: {},
  messages: { getGameCardByGameId: async () => null },
  notifications: {},
  db: {},
  schema: {},
  createDb: () => ({ db: {}, client: {} }),
}));

const { createStandaloneGame, validateJoinByCode } = await import(
  "../src/realtime/rooms-service"
);

beforeEach(() => {
  createGameArg = null;
  profile = { username: "alice" };
  current = null;
});

describe("createStandaloneGame", () => {
  test("creates a conversation-less open room and returns its code", async () => {
    const res = await createStandaloneGame({
      userId: "u1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.code).toBe(CODE);
    expect(createGameArg).toMatchObject({
      gameType: TIC_TAC_TOE,
      status: "waiting",
      conversationId: null,
      seatingMode: "open",
      challengedUserId: null,
    });
    expect(createGameArg.players).toHaveLength(1);
    expect(createGameArg.players[0]).toMatchObject({
      userId: "u1",
      role: "X",
    });
  });

  test("rejects an unknown game type", async () => {
    const res = await createStandaloneGame({
      userId: "u1",
      // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid
      gameType: "not-a-game" as any,
    });
    expect(res.ok).toBe(false);
    expect(createGameArg).toBeNull();
  });

  test("rejects when the user has no profile", async () => {
    profile = null;
    const res = await createStandaloneGame({
      userId: "u1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(false);
  });
});

describe("validateJoinByCode", () => {
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

  test("not_found when the code resolves to no game", async () => {
    current = null;
    const res = await validateJoinByCode({ userId: "u2", code: CODE });
    expect(res).toEqual({ ok: false, error: "not_found" });
  });

  test("ok for a waiting open room with a free seat", async () => {
    current = room();
    const res = await validateJoinByCode({ userId: "u2", code: CODE });
    expect(res).toEqual({ ok: true, code: CODE });
  });

  test("already_started for an active room", async () => {
    current = room({ status: "active" });
    const res = await validateJoinByCode({ userId: "u2", code: CODE });
    expect(res).toEqual({ ok: false, error: "already_started" });
  });

  test("full when the room already has max players", async () => {
    current = room({
      players: [
        { userId: "u1", username: "alice", role: "X" },
        { userId: "u3", username: "bob", role: "O" },
      ],
    });
    const res = await validateJoinByCode({ userId: "u2", code: CODE });
    expect(res).toEqual({ ok: false, error: "full" });
  });

  test("finished for a completed or aborted room", async () => {
    current = room({ status: "completed" });
    expect(await validateJoinByCode({ userId: "u2", code: CODE })).toEqual({
      ok: false,
      error: "finished",
    });
    current = room({ status: "aborted" });
    expect(await validateJoinByCode({ userId: "u2", code: CODE })).toEqual({
      ok: false,
      error: "finished",
    });
  });

  test("a reserved challenge seat blocks everyone but the challenged user", async () => {
    current = room({ seatingMode: "challenge", challengedUserId: "u9" });
    expect(await validateJoinByCode({ userId: "u2", code: CODE })).toEqual({
      ok: false,
      error: "full",
    });
    expect(await validateJoinByCode({ userId: "u9", code: CODE })).toEqual({
      ok: true,
      code: CODE,
    });
  });

  test("an already-seated player may rejoin a live room", async () => {
    current = room({ status: "active" });
    const res = await validateJoinByCode({ userId: "u1", code: CODE });
    expect(res).toEqual({ ok: true, code: CODE });
  });
});
