import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { GameCardMeta } from "@gamelobby/chat-core";
import { enrichGameCardMeta } from "../src/chat/game-card";
import * as rooms from "../src/realtime/rooms";

const realRooms = { ...rooms };

const BASE: GameCardMeta = {
  gameId: "g1",
  gameType: "tic-tac-toe",
  seatingMode: "open",
  creatorUsername: "alice",
};

const PLAYERS = [
  { userId: "u1", username: "alice", role: "x" },
  { userId: "u2", username: "bob", role: "o" },
];

describe("enrichGameCardMeta", () => {
  test("resolves a completed game's winner to a username", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "completed",
      winner: "u2",
      players: PLAYERS,
    });
    expect(meta.status).toBe("completed");
    expect(meta.winner).toBe("u2");
    expect(meta.winnerUsername).toBe("bob");
    expect(meta.players).toEqual(PLAYERS);
  });

  test("marks a draw with no winner username", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "completed",
      winner: "draw",
      players: PLAYERS,
    });
    expect(meta.winner).toBe("draw");
    expect(meta.winnerUsername).toBeNull();
  });

  test("carries status and players for an in-progress game", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "active",
      winner: null,
      players: PLAYERS,
    });
    expect(meta.status).toBe("active");
    expect(meta.winner).toBeNull();
    expect(meta.winnerUsername).toBeNull();
    expect(meta.players).toEqual(PLAYERS);
  });

  test("preserves the base fields", () => {
    const [firstPlayer] = PLAYERS;
    expect(firstPlayer).toBeDefined();
    if (!firstPlayer) throw new Error("expected a player");
    const meta = enrichGameCardMeta(BASE, {
      status: "waiting",
      winner: null,
      players: [firstPlayer],
    });
    expect(meta.gameType).toBe("tic-tac-toe");
    expect(meta.creatorUsername).toBe("alice");
    expect(meta.seatingMode).toBe("open");
  });

  test("leaves metadata untouched when the game is missing", () => {
    expect(enrichGameCardMeta(BASE, null)).toEqual(BASE);
  });

  test("null winner username when the winner isn't in the players list", () => {
    const meta = enrichGameCardMeta(BASE, {
      status: "completed",
      winner: "ghost",
      players: PLAYERS,
    });
    expect(meta.winner).toBe("ghost");
    expect(meta.winnerUsername).toBeNull();
  });
});

// biome-ignore lint/suspicious/noExplicitAny: test capture of the card row
let gameCard: any = null;
const emitted: Array<{ event: string; payload: unknown }> = [];

mock.module("../src/db/repositories/messages", () => ({
  getGameCardByGameId: async () => gameCard,
}));
mock.module("../src/chat/assemble", () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  assembleMessage: async (row: any) => ({ id: row.id, kind: "game_card" }),
}));
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
    gameCard = null;
    emitted.length = 0;
  });

  test("re-broadcasts the card as message_updated to its conversation", async () => {
    gameCard = { id: "msg-1", conversationId: "c1" };
    await broadcastGameCard({} as never, "g1");
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.event).toBe("message_updated");
    expect(emitted[0]?.payload).toEqual({
      message: { id: "msg-1", kind: "game_card" },
    });
  });

  test("no-ops when the game has no card (not started from a conversation)", async () => {
    gameCard = null;
    await broadcastGameCard({} as never, "g1");
    expect(emitted).toHaveLength(0);
  });
});
