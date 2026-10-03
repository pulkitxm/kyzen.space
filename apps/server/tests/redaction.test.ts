import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GameJson, MoveJson } from "@kyzen/shared/types";
import type { FakeState } from "./support/fake-rounds";
import {
  fakeIo,
  fakeSocket,
  installRuntime,
  lobbyConfig,
  lobbyRow,
} from "./support/runtime";

const memory = installRuntime();

const { handleJoinRoom, handleMakeMove } = await import(
  "../src/realtime/turn-based"
);
const { startRoom } = await import("../src/realtime/lobby");
const { serializeGame, serializeMoves } = await import("../src/api/serialize");
const { gamesRouter } = await import("../src/api/routes/games");
const { turnTimers } = await import("../src/realtime/turn-timer");

const SECRET = 4242;

beforeEach(() => {
  memory.reset();
  turnTimers.reset();
});

afterEach(() => {
  turnTimers.reset();
});

async function lockedGame() {
  const row = memory.put(
    lobbyRow(["h1", "h2", "h3"], lobbyConfig({ rounds: 2 })),
  );
  const harness = fakeIo();
  await startRoom(harness.io, "h1", row.code);
  await handleMakeMove(harness.io, fakeSocket("h1").socket, {
    gameId: row.code,
    moveData: { round: 1, value: SECRET },
  });
  return { row, harness };
}

function payloads(emits: { event: string; payload: unknown }[]) {
  return emits
    .filter((emit) => emit.event === "game_state")
    .map((emit) => emit.payload as { game: GameJson; moves?: MoveJson[] });
}

describe("hidden information", () => {
  test("serializeGame applies publicState and serializeMoves applies publicMove", () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const state: FakeState = {
      round: 2,
      rounds: 3,
      seed: 1,
      seats: [],
      locked: { P1: SECRET },
      scores: { P1: 1, P2: 2 },
      out: [],
      over: false,
    };
    const game = { ...row, status: "active" as const, gameState: state };
    const json = serializeGame(game);
    expect(json.gameState).toEqual({
      round: 2,
      scores: { P1: 1, P2: 2 },
      seats: [],
      locked: ["P1"],
      over: false,
    });
    const moves = serializeMoves(
      [
        {
          id: "m1",
          gameId: row.id,
          moveNumber: 1,
          playerId: "h1",
          moveData: { round: 1, value: 9 },
          createdAt: new Date(),
        },
        {
          id: "m2",
          gameId: row.id,
          moveNumber: 2,
          playerId: "h1",
          moveData: { round: 2, value: SECRET },
          createdAt: new Date(),
        },
      ],
      game,
    );
    expect(moves.map((move) => move.moveData)).toEqual([
      { round: 1, value: 9 },
      { round: 2, locked: true },
    ]);
  });

  test("a waiting lobby serializes its config and a null state", () => {
    const row = memory.put(lobbyRow(["h1"], lobbyConfig({ mode: "teams" })));
    const json = serializeGame(row);
    expect(json.gameState).toBeNull();
    expect(json.config).toEqual(lobbyConfig({ mode: "teams" }));
    expect(json.winners).toEqual([]);
  });

  test("move deltas never carry an unresolved plan", async () => {
    const { harness } = await lockedGame();
    expect(JSON.stringify(payloads(harness.emits))).not.toContain(
      String(SECRET),
    );
    const delta = payloads(harness.emits).at(-1) as unknown as {
      move: MoveJson;
      game: GameJson;
    };
    expect(delta.move.moveData).toEqual({ round: 1, locked: true });
    expect((delta.game.gameState as { locked: string[] }).locked).toEqual([
      "P1",
    ]);
  });

  test("join_room snapshots redact state and history", async () => {
    const { row } = await lockedGame();
    const viewer = fakeIo();
    await handleJoinRoom(viewer.io, fakeSocket("h2").socket, {
      gameId: row.code,
    });
    const snapshot = payloads(viewer.emits).at(-1);
    expect(snapshot?.moves).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain(String(SECRET));
  });

  test("the HTTP snapshot redacts state and history", async () => {
    const { row } = await lockedGame();
    const response = await gamesRouter.request(`/${row.code}`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(String(SECRET));
    expect(JSON.parse(body).moves[0].moveData).toEqual({
      round: 1,
      locked: true,
    });
  });

  test("resolved moves are revealed once their round is over", async () => {
    const { row, harness } = await lockedGame();
    for (const userId of ["h2", "h3"])
      await handleMakeMove(harness.io, fakeSocket(userId).socket, {
        gameId: row.code,
        moveData: { round: 1, value: 1 },
      });
    const viewer = fakeIo();
    await handleJoinRoom(viewer.io, fakeSocket("h2").socket, {
      gameId: row.code,
    });
    const snapshot = payloads(viewer.emits).at(-1);
    expect(snapshot?.moves?.[0]?.moveData).toEqual({
      round: 1,
      value: SECRET,
    });
  });

  test("game_over carries only the winner summary", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig({ rounds: 1 })));
    const harness = fakeIo();
    await startRoom(harness.io, "h1", row.code);
    await handleMakeMove(harness.io, fakeSocket("h1").socket, {
      gameId: row.code,
      moveData: { round: 1, value: SECRET },
    });
    await handleMakeMove(harness.io, fakeSocket("h2").socket, {
      gameId: row.code,
      moveData: { round: 1, value: 1 },
    });
    expect(harness.emits.filter((emit) => emit.event === "game_over")).toEqual([
      {
        room: `game:${row.code}`,
        event: "game_over",
        payload: { winner: "h1" },
      },
    ]);
  });
});
