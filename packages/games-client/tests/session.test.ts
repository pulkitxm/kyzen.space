import { describe, expect, test } from "bun:test";
import type {
  GameJson,
  MoveJson,
  ServerGameStatePayload,
} from "@kyzen/shared/types";
import type { Socket } from "socket.io-client";
import {
  bindGameSession,
  mergeGameMoves,
  mergeGameSnapshot,
} from "../src/session";

const game: GameJson = {
  id: "A2K9P7",
  gameType: "tic-tac-toe",
  status: "active",
  winner: null,
  players: [],
  gameState: {},
};

function move(moveNumber: number, gameId = game.id): MoveJson {
  return {
    id: `move-${moveNumber}`,
    gameId,
    playerId: "demo-player",
    moveNumber,
    moveData: { row: 0, col: moveNumber - 1 },
  };
}

function fakeSocket(connected: boolean) {
  const listeners = new Map<string, Set<(payload: never) => void>>();
  const sent: { event: string; payload: unknown }[] = [];
  const socket = {
    connected,
    on(event: string, listener: (payload: never) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
    },
    off(event: string, listener: (payload: never) => void) {
      listeners.get(event)?.delete(listener);
    },
    emit(event: string, payload: unknown) {
      sent.push({ event, payload });
    },
  };
  return {
    socket: socket as unknown as Socket,
    sent,
    receive(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? [])
        listener(payload as never);
    },
  };
}

describe("shared game session", () => {
  test("joins immediately and requests a fresh snapshot after reconnect", () => {
    const transport = fakeSocket(true);
    const states: ServerGameStatePayload[] = [];
    const errors: (string | null)[] = [];
    const cleanup = bindGameSession(
      transport.socket,
      game.id,
      (state) => states.push(state),
      (error) => errors.push(error),
    );
    transport.receive("game_error", { message: "Move rejected" });
    transport.receive("connect");
    expect(transport.sent).toEqual([
      { event: "join_room", payload: { gameId: game.id } },
      { event: "join_room", payload: { gameId: game.id } },
    ]);
    expect(errors).toEqual([null, "Move rejected", null]);
    cleanup();
  });

  test("ignores updates for another room and removes only its own listeners", () => {
    const transport = fakeSocket(true);
    const states: ServerGameStatePayload[] = [];
    const chat: unknown[] = [];
    transport.socket.on("message:new", (payload) => chat.push(payload));
    const cleanup = bindGameSession(
      transport.socket,
      game.id,
      (state) => states.push(state),
      () => {},
    );
    transport.receive("game_state", { game: { ...game, id: "B3M8R6" } });
    transport.receive("game_state", { game });
    expect(states).toEqual([{ game }]);
    cleanup();
    transport.receive("game_state", { game });
    transport.receive("connect");
    transport.receive("message:new", "chat still works");
    expect(states).toHaveLength(1);
    expect(chat).toEqual(["chat still works"]);
    expect(transport.sent.at(-1)).toEqual({
      event: "leave_room",
      payload: { gameId: game.id },
    });
    expect(transport.sent).toHaveLength(2);
  });

  test("waits for connection before joining and does not leave a disconnected socket", () => {
    const transport = fakeSocket(false);
    const cleanup = bindGameSession(
      transport.socket,
      game.id,
      () => {},
      () => {},
    );
    expect(transport.sent).toHaveLength(0);
    cleanup();
    expect(transport.sent).toHaveLength(0);
  });

  test("sorts and deduplicates move deltas and replaces history on resync", () => {
    const first = mergeGameMoves([move(2), move(1)], { game, move: move(2) });
    expect(first.map((item) => item.moveNumber)).toEqual([1, 2]);
    const resynced = mergeGameMoves(first, {
      game,
      moves: [move(3), move(1), move(2), move(1), move(4, "B3M8R6")],
    });
    expect(resynced.map((item) => item.moveNumber)).toEqual([1, 2, 3]);
    expect(mergeGameMoves(resynced, { game, moves: [] })).toEqual([]);
  });

  test("keeps the viewer identity when a shared broadcast omits it", () => {
    const viewer = { ...game, publicMatch: true, viewerId: "A2K9P7:X" };
    const broadcast = {
      ...game,
      publicMatch: true,
      status: "completed" as const,
    };
    expect(mergeGameSnapshot(viewer, broadcast)).toEqual({
      ...broadcast,
      viewerId: "A2K9P7:X",
    });
    const fresh = { ...broadcast, viewerId: "A2K9P7:O" };
    expect(mergeGameSnapshot(viewer, fresh)).toBe(fresh);
    expect(mergeGameSnapshot(game, broadcast)).toBe(broadcast);
  });
});
