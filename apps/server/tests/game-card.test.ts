import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TANK_ARENA, TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameCardMeta } from "@kyzen/shared/types";
import { enrichGameCardMeta } from "../src/chat/game-card";
import * as rooms from "../src/realtime/rooms";
import { dbState, gameCardDbMock } from "./support/game-card-state";

const realRooms = { ...rooms };

const BASE: GameCardMeta = {
  gameId: "g1",
  gameType: TIC_TAC_TOE,
  seatingMode: "open",
  creatorUsername: "alice",
};

const PLAYERS = [
  { userId: "u1", username: "alice", role: "x" },
  { userId: "u2", username: "bob", role: "o" },
];

describe("enrichGameCardMeta", () => {
  test("carries a completed game's winner and winners", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "completed",
      winner: "u2",
      winners: ["u2"],
      players: PLAYERS,
    });
    expect(meta.status).toBe("completed");
    expect(meta.winner).toBe("u2");
    expect(meta.winners).toEqual(["u2"]);
    expect(meta.players).toEqual(PLAYERS);
  });

  test("carries every winner of a team game with no single winner", () => {
    const players = [
      { userId: "u1", username: "alice", role: "p1" },
      { userId: "u2", username: "bob", role: "p2" },
      { userId: "bot:1", username: "Normal Bot", role: "p3" },
    ];
    const meta = enrichGameCardMeta(
      { ...BASE, gameType: TANK_ARENA },
      {
        status: "completed",
        winner: null,
        winners: ["u2", "bot:1"],
        players,
      },
    );
    expect(meta.winner).toBeNull();
    expect(meta.winners).toEqual(["u2", "bot:1"]);
    expect(meta.players).toEqual(players);
  });

  test("marks a draw and keeps the drawing players", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "completed",
      winner: "draw",
      winners: ["u1", "u2"],
      players: PLAYERS,
    });
    expect(meta.winner).toBe("draw");
    expect(meta.winners).toEqual(["u1", "u2"]);
  });

  test("carries status and players for an in-progress game", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "active",
      winner: null,
      winners: [],
      players: PLAYERS,
    });
    expect(meta.status).toBe("active");
    expect(meta.winner).toBeNull();
    expect(meta.winners).toEqual([]);
    expect(meta.players).toEqual(PLAYERS);
  });

  test("preserves the base fields", () => {
    const [firstPlayer] = PLAYERS;
    expect(firstPlayer).toBeDefined();
    if (!firstPlayer) throw new Error("expected a player");
    const meta = enrichGameCardMeta(BASE, {
      status: "waiting",
      winner: null,
      winners: [],
      players: [firstPlayer],
    });
    expect(meta.gameType).toBe("tic-tac-toe");
    expect(meta.creatorUsername).toBe("alice");
    expect(meta.seatingMode).toBe("open");
  });

  test("leaves metadata untouched when the game is missing", () => {
    expect(enrichGameCardMeta(BASE, null)).toEqual(BASE);
  });
});

const emitted: Array<{ event: string; payload: unknown }> = [];

mock.module("@kyzen/database", gameCardDbMock);
mock.module("../src/realtime/rooms", () => ({
  ...realRooms,
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  emitToConv: (_io: any, _cid: string, event: string, payload: unknown) => {
    emitted.push({ event, payload });
  },
}));

const { broadcastGameCard } = await import("../src/chat/game-card-broadcast");

describe("broadcastGameCard", () => {
  beforeEach(() => {
    dbState.game = null;
    dbState.card = null;
    emitted.length = 0;
  });

  test("re-broadcasts the card as message_updated to its conversation", async () => {
    dbState.card = {
      id: "msg-1",
      conversationId: "c1",
      senderId: null,
      kind: "game_card",
      body: null,
      metadata: null,
      gameId: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      editedAt: null,
      deletedAt: null,
    };
    await broadcastGameCard({} as never, "g1");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe("message_updated");
    // biome-ignore lint/suspicious/noExplicitAny: test payload assertion
    const message = (emitted[0]?.payload as any).message;
    expect(message.id).toBe("msg-1");
    expect(message.conversationId).toBe("c1");
    expect(message.kind).toBe("game_card");
  });

  test("no-ops when the game has no card (not started from a conversation)", async () => {
    dbState.card = null;
    await broadcastGameCard({} as never, "g1");
    expect(emitted).toHaveLength(0);
  });
});
