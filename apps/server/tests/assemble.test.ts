import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TIC_TAC_TOE } from "@gamelobby/shared/constants";

const UUID = "11111111-1111-1111-1111-111111111111";
const CODE = "K7P2QX";

// biome-ignore lint/suspicious/noExplicitAny: test game record
let gameById: any = null;

mock.module("@gamelobby/database", () => ({
  games: { getGameById: async () => gameById },
  profiles: {
    getPublicUser: async (id: string) => ({
      id,
      username: "alice",
      displayName: "Alice",
      avatar: null,
    }),
    getPublicUsers: async () => [],
  },
  conversations: {},
  friends: {},
  messages: {},
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
      gameId: CODE,
      gameType: TIC_TAC_TOE,
      seatingMode: "open",
      challengedUserId: null,
      creatorUsername: "alice",
    },
    gameId: UUID,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    editedAt: null,
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  gameById = null;
});

describe("assembleMessage — game-card code/UUID split", () => {
  test("swaps the wire gameId to the game code when the game is found", async () => {
    gameById = {
      id: UUID,
      code: CODE,
      status: "active",
      winner: null,
      players: [{ userId: "u1", username: "alice", role: "X" }],
    };
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    expect(out.gameId).toBe(CODE);
    expect(out.gameId).not.toBe(UUID);
  });

  test("leaves the FK gameId untouched when the game is missing", async () => {
    gameById = null;
    // biome-ignore lint/suspicious/noExplicitAny: test message row
    const out = await assembleMessage(gameCardRow() as any);
    expect(out.gameId).toBe(UUID);
  });

  test("leaves the FK gameId untouched for a game card with no metadata", async () => {
    gameById = {
      id: UUID,
      code: CODE,
      status: "active",
      winner: null,
      players: [],
    };
    const out = await assembleMessage(
      // biome-ignore lint/suspicious/noExplicitAny: test message row
      gameCardRow({ metadata: null }) as any,
    );
    expect(out.gameId).toBe(UUID);
  });
});
