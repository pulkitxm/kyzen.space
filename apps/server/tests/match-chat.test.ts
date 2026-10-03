import { beforeEach, describe, expect, test } from "bun:test";
import { CHAT_EVENTS } from "@kyzen/shared/constants";
import {
  fakeIo,
  installRuntime,
  lobbyConfig,
  lobbyRow,
} from "./support/runtime";

const choices: { code: string; userId: string; playerId: string }[] = [];
let mutual = false;

const friendshipRow = {
  id: "f1",
  requesterId: "u1",
  addresseeId: "u3",
  pairKey: "u1:u3",
  status: "accepted",
  createdAt: new Date(),
  updatedAt: new Date(),
  respondedAt: new Date(),
};

const publicUser = (id: string) => ({
  id,
  username: `name-${id}`,
  displayName: null,
  avatar: null,
});

const memory = installRuntime({
  matchChat: {
    sendMatchMessage: async (input: { code: string; body: string }) => ({
      id: "msg-1",
      gameId: input.code,
      authorId: "u1",
      body: input.body,
      createdAt: new Date(0).toISOString(),
    }),
    chooseMatchFriend: async (
      code: string,
      userId: string,
      playerId: string,
    ) => {
      choices.push({ code, userId, playerId });
      return { mutual, targetUserId: "u3" };
    },
  },
  friends: {
    areFriends: async () => true,
    getFriendshipBetween: async () => friendshipRow,
    otherUserId: (row: typeof friendshipRow, viewer: string) =>
      row.requesterId === viewer ? row.addresseeId : row.requesterId,
  },
  conversations: {
    getOrCreateDm: async () => ({
      conversation: {
        id: "c1",
        kind: "dm",
        name: null,
        avatarUrl: null,
        createdBy: null,
        dmKey: "u1:u3",
        lastMessageId: null,
        lastMessageAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      created: false,
    }),
    getMemberRows: async () => [],
    unreadCount: async () => 0,
  },
  profiles: {
    getProfileByUserId: async (userId: string) => ({
      userId,
      username: `name-${userId}`,
    }),
    getPublicUser: async (id: string) => publicUser(id),
    getPublicUsers: async (ids: string[]) => ids.map(publicUser),
  },
});

const { attachMatchChatHandlers } = await import("../src/realtime/match-chat");

type Handler = (payload: unknown, cb: (res: unknown) => void) => void;

function connect(userId: string) {
  const handlers = new Map<string, Handler>();
  const socket = {
    data: { userId },
    on: (event: string, fn: Handler) => handlers.set(event, fn),
  };
  const harness = fakeIo();
  attachMatchChatHandlers(harness.io, socket as never);
  const call = (event: string, payload: unknown) =>
    new Promise<Record<string, unknown>>((resolve) =>
      handlers.get(event)?.(payload, (res) =>
        resolve(res as Record<string, unknown>),
      ),
    );
  return { call, emits: harness.emits };
}

const game = memory.put(
  lobbyRow(["u1", "u2", "u3", "u4"], lobbyConfig(), {
    publicMatch: true,
    status: "active",
  }),
);

beforeEach(() => {
  choices.length = 0;
  mutual = false;
  memory.put(game);
});

describe("match:message", () => {
  test("delivers only to the human participants, never to spectators in the room", async () => {
    memory.put({
      ...game,
      publicMatch: false,
      players: [
        ...game.players,
        { userId: "bot:1", username: "Easy Bot", role: "P5", avatar: null },
      ],
    });
    const { call, emits } = connect("u1");
    const result = await call("match:message", {
      gameId: game.code,
      clientId: crypto.randomUUID(),
      body: "synthetic hello",
    });
    expect(result.ok).toBe(true);
    expect(emits.map((emit) => [emit.room, emit.event])).toEqual([
      ["user:u1", "match:message"],
      ["user:u2", "match:message"],
      ["user:u3", "match:message"],
      ["user:u4", "match:message"],
    ]);
  });
});

describe("match:friend", () => {
  test("requires a target player id", async () => {
    const { call } = connect("u1");
    expect(await call("match:friend", { gameId: game.code })).toEqual({
      ok: false,
      error: "Invalid match",
    });
    expect(choices).toEqual([]);
  });

  test("a one-sided choice reveals nothing", async () => {
    const { call, emits } = connect("u1");
    const playerId = `${game.code}:P3`;
    expect(await call("match:friend", { gameId: game.code, playerId })).toEqual(
      { ok: true, mutual: false, playerId, peerUsername: null },
    );
    expect(choices).toEqual([{ code: game.code, userId: "u1", playerId }]);
    expect(emits).toEqual([]);
  });

  test("a mutual choice tells both players who the other is", async () => {
    mutual = true;
    const { call, emits } = connect("u1");
    const playerId = `${game.code}:P3`;
    expect(await call("match:friend", { gameId: game.code, playerId })).toEqual(
      { ok: true, mutual: true, playerId, peerUsername: "name-u3" },
    );
    const friends = emits.filter((emit) => emit.event === "match:friends");
    expect(friends).toEqual([
      {
        room: "user:u1",
        event: "match:friends",
        payload: {
          gameId: game.code,
          playerId: `${game.code}:P3`,
          peerUsername: "name-u3",
        },
      },
      {
        room: "user:u3",
        event: "match:friends",
        payload: {
          gameId: game.code,
          playerId: `${game.code}:P1`,
          peerUsername: "name-u1",
        },
      },
    ]);
    expect(
      emits
        .filter((emit) => emit.event === CHAT_EVENTS.friendAccepted)
        .map((emit) => emit.room),
    ).toEqual(["user:u1", "user:u3"]);
  });
});
