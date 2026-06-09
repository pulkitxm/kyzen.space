import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

type Conv = { id: string; kind: "dm" | "group"; name: string | null } | null;

let conv: Conv = null;
let members: string[] = [];
let profile: { username: string } | null = { username: "alice" };
// biome-ignore lint/suspicious/noExplicitAny: test capture of repo input
let createGameInput: any = null;
const notifyCalls: Array<{ userId: string; type: string }> = [];
const notifyArgs: Array<{ userId: string; type: string; payload: unknown }> =
  [];
// biome-ignore lint/suspicious/noExplicitAny: test capture of sent message
const sentMessages: any[] = [];

mock.module("@gamelobby/database", () => ({
  conversations: {
    getById: async () => conv,
    isMember: async (_cid: string, uid: string) => members.includes(uid),
    getMemberIds: async () => members,
  },
  games: {
    findLiveGameInConversation: async () => null,
    // biome-ignore lint/suspicious/noExplicitAny: test stub
    createGame: async (input: any) => {
      createGameInput = input;
      return {
        id: "game-1",
        code: "GAMECODE",
        gameType: input.gameType,
        status: input.status ?? "waiting",
        players: input.players,
        winner: null,
        gameState: input.gameState,
        conversationId: input.conversationId ?? null,
        creatorUserId: input.creatorUserId ?? null,
        seatingMode: input.seatingMode ?? null,
        challengedUserId: input.challengedUserId ?? null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
  },
  profiles: {
    getProfileByUserId: async () => profile,
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
  notify: async (
    userId: string,
    type: string,
    opts?: { payload?: unknown },
  ) => {
    notifyCalls.push({ userId, type });
    notifyArgs.push({ userId, type, payload: opts?.payload });
  },
}));

mock.module("../src/chat/messages-service", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  sendMessage: async (input: any) => {
    sentMessages.push(input);
    return { ok: true, value: { id: "msg-1", ...input } };
  },
}));

const { createGameInConversation } = await import(
  "../src/chat/games-in-chat-service"
);

describe("createGameInConversation", () => {
  beforeEach(() => {
    conv = null;
    members = [];
    profile = { username: "alice" };
    createGameInput = null;
    notifyCalls.length = 0;
    notifyArgs.length = 0;
    sentMessages.length = 0;
  });

  test("rejects non-members", async () => {
    conv = { id: "c1", kind: "dm", name: null };
    members = ["bob"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "c1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  test("rejects unknown game types", async () => {
    conv = { id: "c1", kind: "dm", name: null };
    members = ["alice", "bob"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "c1",
      // @ts-expect-error unknown game type is rejected at runtime
      gameType: "chess",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  test("DM forces open seating and posts a card + notifies the other member", async () => {
    conv = { id: "c1", kind: "dm", name: null };
    members = ["alice", "bob"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "c1",
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: "bob",
    });
    expect(res.ok).toBe(true);
    expect(createGameInput.seatingMode).toBe("open");
    expect(createGameInput.challengedUserId).toBeNull();
    expect(createGameInput.creatorUserId).toBe("alice");
    expect(createGameInput.conversationId).toBe("c1");
    expect(sentMessages[0].kind).toBe("game_card");
    expect(notifyCalls).toEqual([{ userId: "bob", type: "game_started" }]);
  });

  test("group requires a seating mode", async () => {
    conv = { id: "g1", kind: "group", name: "Squad" };
    members = ["alice", "bob", "carol"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "g1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  test("group challenge must target a real member who isn't the creator", async () => {
    conv = { id: "g1", kind: "group", name: "Squad" };
    members = ["alice", "bob", "carol"];
    const notMember = await createGameInConversation({
      userId: "alice",
      conversationId: "g1",
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: "dave",
    });
    expect(notMember.ok).toBe(false);
    const self = await createGameInConversation({
      userId: "alice",
      conversationId: "g1",
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: "alice",
    });
    expect(self.ok).toBe(false);
  });

  test("group challenge sets the challenge + notifies the challenged distinctly", async () => {
    conv = { id: "g1", kind: "group", name: "Squad" };
    members = ["alice", "bob", "carol"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "g1",
      gameType: TIC_TAC_TOE,
      seatingMode: "challenge",
      challengedUserId: "bob",
    });
    expect(res.ok).toBe(true);
    expect(createGameInput.seatingMode).toBe("challenge");
    expect(createGameInput.challengedUserId).toBe("bob");
    const byUser = Object.fromEntries(
      notifyCalls.map((n) => [n.userId, n.type]),
    );
    expect(byUser).toEqual({ bob: "game_challenge", carol: "game_started" });
    expect(notifyCalls.find((n) => n.userId === "alice")).toBeUndefined();
  });

  test("card metadata + notification carry the code while the message FK carries the UUID", async () => {
    conv = { id: "c1", kind: "dm", name: null };
    members = ["alice", "bob"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "c1",
      gameType: TIC_TAC_TOE,
    });
    expect(res.ok).toBe(true);
    expect(sentMessages[0].gameId).toBe("game-1");
    expect((sentMessages[0].metadata as { gameId: string }).gameId).toBe(
      "GAMECODE",
    );
    const payload = notifyArgs[0]?.payload as { gameId?: string };
    expect(payload?.gameId).toBe("GAMECODE");
    if (res.ok) expect(res.value.game.id).toBe("GAMECODE");
  });

  test("group open seating notifies every other member as game_started", async () => {
    conv = { id: "g1", kind: "group", name: "Squad" };
    members = ["alice", "bob", "carol"];
    const res = await createGameInConversation({
      userId: "alice",
      conversationId: "g1",
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
    });
    expect(res.ok).toBe(true);
    expect(createGameInput.seatingMode).toBe("open");
    expect(notifyCalls.map((n) => n.type)).toEqual([
      "game_started",
      "game_started",
    ]);
  });
});
