import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GameJson, GameType } from "@kyzen/shared/types";
import { FAKE_ROUNDS, type FakeState } from "./support/fake-rounds";
import {
  fakeIo,
  fakeSocket,
  installRuntime,
  lobbyConfig,
  lobbyRow,
} from "./support/runtime";

const memory = installRuntime();

const { configureRoom, startRoom } = await import("../src/realtime/lobby");
const { handleJoinRoom } = await import("../src/realtime/turn-based");
const { createStandaloneGame, validateJoinByCode } = await import(
  "../src/realtime/rooms-service"
);
const { turnTimers } = await import("../src/realtime/turn-timer");

const BOTS = [
  { id: "bot:1", difficulty: "hard", team: "B" },
  { id: "bot:2", difficulty: "easy", team: "A" },
];

beforeEach(() => {
  memory.reset();
  turnTimers.reset();
});

afterEach(() => {
  turnTimers.reset();
});

function lastGame(emits: { event: string; payload: unknown }[]): GameJson {
  const payload = emits.filter((emit) => emit.event === "game_state").at(-1)
    ?.payload as { game: GameJson } | undefined;
  if (!payload) throw new Error("no game_state emitted");
  return payload.game;
}

describe("room:configure", () => {
  test("only the host can configure the lobby", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io, emits } = fakeIo();
    const result = await configureRoom(
      io,
      "h2",
      row.code,
      lobbyConfig({ bots: BOTS }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Only the host can change the lobby",
    });
    expect(memory.stored(row.id).config).toEqual(lobbyConfig());
    expect(emits).toHaveLength(0);
  });

  test("the host's validated config is persisted and broadcast", async () => {
    const row = memory.put(lobbyRow(["h1"], lobbyConfig()));
    const { io, emits } = fakeIo();
    const config = lobbyConfig({ mode: "teams", bots: BOTS });
    expect(await configureRoom(io, "h1", row.code, config)).toEqual({
      ok: true,
    });
    expect(memory.stored(row.id).config).toEqual(config);
    expect(lastGame(emits).config).toEqual(config);
    expect(lastGame(emits).gameState).toBeNull();
  });

  test("an invalid config is rejected by the definition's configSchema", async () => {
    const row = memory.put(lobbyRow(["h1"], lobbyConfig()));
    const { io } = fakeIo();
    const result = await configureRoom(io, "h1", row.code, {
      mode: "ffa",
      bots: [{ id: "robot", difficulty: "hard", team: "A" }],
    });
    expect(result).toEqual({ ok: false, error: "Invalid game config" });
  });

  test("a config that overfills the table is rejected", async () => {
    const row = memory.put(lobbyRow(["h1", "h2", "h3"], lobbyConfig()));
    const { io } = fakeIo();
    const result = await configureRoom(
      io,
      "h1",
      row.code,
      lobbyConfig({ bots: BOTS }),
    );
    expect(result).toEqual({ ok: false, error: "Too many players" });
  });
});

describe("room:start", () => {
  test("only the host can start", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io } = fakeIo();
    expect(await startRoom(io, "h2", row.code)).toEqual({
      ok: false,
      error: "Only the host can change the lobby",
    });
    expect(memory.stored(row.id).status).toBe("waiting");
  });

  test("minPlayers counts bots", async () => {
    const lonely = memory.put(lobbyRow(["h1"], lobbyConfig()));
    const { io } = fakeIo();
    expect(await startRoom(io, "h1", lonely.code)).toEqual({
      ok: false,
      error: "At least 2 players are needed",
    });
    const withBot = memory.put(
      lobbyRow(["h1"], lobbyConfig({ bots: [BOTS[0]] })),
    );
    expect(await startRoom(io, "h1", withBot.code)).toEqual({ ok: true });
    expect(memory.stored(withBot.id).status).toBe("active");
  });

  test("inserts bot seats after the humans and builds seats with teams", async () => {
    const row = memory.put(
      lobbyRow(
        ["h1", "h2"],
        lobbyConfig({ mode: "teams", teams: { h1: "A" }, bots: BOTS }),
      ),
    );
    const { io, emits } = fakeIo();
    expect(await startRoom(io, "h1", row.code)).toEqual({ ok: true });
    const stored = memory.stored(row.id);
    expect(
      stored.players.map(({ userId, username, role }) => ({
        userId,
        username,
        role,
      })),
    ).toEqual([
      { userId: "h1", username: "name-h1", role: "P1" },
      { userId: "h2", username: "name-h2", role: "P2" },
      { userId: "bot:1", username: "Hard Bot", role: "P3" },
      { userId: "bot:2", username: "Easy Bot", role: "P4" },
    ]);
    const state = stored.gameState as FakeState;
    expect(state.seats).toEqual([
      { role: "P1", team: "A", bot: null },
      { role: "P2", team: "B", bot: null },
      { role: "P3", team: "B", bot: "hard" },
      { role: "P4", team: "A", bot: "easy" },
    ]);
    expect(Number.isInteger(state.seed)).toBe(true);
    expect(stored.startedAt).not.toBeNull();
    expect(lastGame(emits).status).toBe("active");
    expect(lastGame(emits).turnDeadline).toBe(turnTimers.deadline(row.id));
  });

  test("unassigned humans join the least-populated team", async () => {
    const row = memory.put(
      lobbyRow(["h1", "h2"], lobbyConfig({ mode: "teams", bots: [BOTS[1]] })),
    );
    const { io } = fakeIo();
    await startRoom(io, "h1", row.code);
    const teams = (memory.stored(row.id).gameState as FakeState).seats.map(
      (seat) => seat.team,
    );
    expect(teams).toEqual(["B", "A", "A"]);
  });

  test("free-for-all seats are their own teams", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io } = fakeIo();
    await startRoom(io, "h1", row.code);
    const seats = (memory.stored(row.id).gameState as FakeState).seats;
    expect(seats.map((seat) => seat.team)).toEqual(["P1", "P2"]);
  });

  test("starting twice is rejected and configuring after start is rejected", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io } = fakeIo();
    const [first, second] = await Promise.all([
      startRoom(io, "h1", row.code),
      startRoom(io, "h1", row.code),
    ]);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, error: "Game already started" });
    expect(await configureRoom(io, "h1", row.code, lobbyConfig())).toEqual({
      ok: false,
      error: "Game already started",
    });
  });
});

describe("lobby seating", () => {
  test("joining a lobby only seats the player and keeps it waiting", async () => {
    const row = memory.put(lobbyRow(["h1"], lobbyConfig()));
    const { io, emits } = fakeIo();
    await handleJoinRoom(io, fakeSocket("h2").socket, { gameId: row.code });
    await handleJoinRoom(io, fakeSocket("h3").socket, { gameId: row.code });
    const stored = memory.stored(row.id);
    expect(stored.status).toBe("waiting");
    expect(stored.gameState).toBeNull();
    expect(stored.players.map((p) => [p.userId, p.role])).toEqual([
      ["h1", "P1"],
      ["h2", "P2"],
      ["h3", "P3"],
    ]);
    expect(lastGame(emits).players).toHaveLength(3);
  });

  test("configured bots reserve seats, so a full lobby turns joiners into spectators", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig({ bots: BOTS })));
    const { io } = fakeIo();
    await handleJoinRoom(io, fakeSocket("h3").socket, { gameId: row.code });
    expect(memory.stored(row.id).players).toHaveLength(2);
    expect(await validateJoinByCode({ userId: "h3", code: row.code })).toEqual({
      ok: false,
      error: "full",
    });
  });

  test("join by code allows a waiting lobby beyond two seats", async () => {
    const row = memory.put(lobbyRow(["h1", "h2", "h3"], lobbyConfig()));
    expect(await validateJoinByCode({ userId: "h4", code: row.code })).toEqual({
      ok: true,
      code: row.code,
    });
  });

  test("creating a lobby room stores the parsed config and no state", async () => {
    const created = await createStandaloneGame({
      userId: "host",
      gameType: FAKE_ROUNDS as GameType,
      config: { mode: "teams" },
    });
    if (!created.ok) throw new Error(created.error);
    const row = [...memory.rows.values()].find(
      (candidate) => candidate.code === created.value.code,
    );
    expect(row?.status).toBe("waiting");
    expect(row?.gameState).toBeNull();
    expect(row?.config).toEqual({ mode: "teams", teams: {}, bots: [] });
    expect(row?.players.map((p) => p.role)).toEqual(["P1"]);
  });
});
