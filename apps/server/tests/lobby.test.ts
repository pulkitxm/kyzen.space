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

const { configureRoom, kickPlayer, leaveRoom, startRoom } = await import(
  "../src/realtime/lobby"
);
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

  test("more than LOBBY_MAX_BOTS bots are rejected", async () => {
    const row = memory.put(lobbyRow(["h1"], lobbyConfig()));
    const { io } = fakeIo();
    const bots = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `bot:${index + 1}`,
        difficulty: "easy",
        team: "A",
      }));
    expect(
      await configureRoom(io, "h1", row.code, lobbyConfig({ bots: bots(65) })),
    ).toEqual({ ok: false, error: "Invalid game config" });
    expect(memory.stored(row.id).config).toEqual(lobbyConfig());
  });

  test("team entries must name seated players or configured bots", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io } = fakeIo();
    const stranger = lobbyConfig({
      mode: "teams",
      teams: { h1: "A", h2: "B", ghost: "A" },
    });
    expect(await configureRoom(io, "h1", row.code, stranger)).toEqual({
      ok: false,
      error: "Teams can only list seated players and bots",
    });
    const known = lobbyConfig({
      mode: "teams",
      teams: { h1: "A", h2: "B", "bot:1": "B" },
      bots: [BOTS[0]],
    });
    expect(await configureRoom(io, "h1", row.code, known)).toEqual({
      ok: true,
    });
  });

  test("teams mode must split the seats over at least two teams", async () => {
    const row = memory.put(lobbyRow(["h1", "h2"], lobbyConfig()));
    const { io } = fakeIo();
    const together = lobbyConfig({
      mode: "teams",
      teams: { h1: "A", h2: "A" },
    });
    expect(await configureRoom(io, "h1", row.code, together)).toEqual({
      ok: false,
      error: "Teams mode needs players on at least two teams",
    });
    const alone = memory.put(lobbyRow(["h1"], lobbyConfig()));
    expect(
      await configureRoom(
        io,
        "h1",
        alone.code,
        lobbyConfig({ mode: "teams", teams: { h1: "B" } }),
      ),
    ).toEqual({ ok: true });
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
      { userId: "bot:1", username: "Bot 1 (Hard)", role: "P3" },
      { userId: "bot:2", username: "Bot 2 (Easy)", role: "P4" },
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

  test("teams mode cannot start with every seat on one team", async () => {
    const row = memory.put(
      lobbyRow(
        ["h1", "h2"],
        lobbyConfig({
          mode: "teams",
          teams: { h1: "A", h2: "A" },
          bots: [{ id: "bot:1", difficulty: "easy", team: "A" }],
        }),
      ),
    );
    const { io } = fakeIo();
    expect(await startRoom(io, "h1", row.code)).toEqual({
      ok: false,
      error: "Teams mode needs players on at least two teams",
    });
    expect(memory.stored(row.id).status).toBe("waiting");
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

describe("room:leave and room:kick", () => {
  function teamsLobby(humans: string[]) {
    return memory.put(
      lobbyRow(
        humans,
        lobbyConfig({
          mode: "teams",
          teams: Object.fromEntries(
            humans.map((id, index) => [id, index % 2 ? "B" : "A"]),
          ),
        }),
      ),
    );
  }

  test("a guest leaving compacts the seats and drops their team", async () => {
    const row = teamsLobby(["h1", "h2", "h3"]);
    const { io, emits, leaves } = fakeIo();
    expect(await leaveRoom(io, "h2", row.code)).toEqual({ ok: true });
    const stored = memory.stored(row.id);
    expect(stored.players.map((p) => [p.userId, p.role])).toEqual([
      ["h1", "P1"],
      ["h3", "P2"],
    ]);
    expect(stored.config).toEqual(
      lobbyConfig({ mode: "teams", teams: { h1: "A", h3: "A" } }),
    );
    expect(leaves).toEqual([{ room: "user:h2", left: `game:${row.code}` }]);
    expect(lastGame(emits).players.map((p) => p.userId)).toEqual(["h1", "h3"]);
  });

  test("the host, outsiders, and started games cannot leave", async () => {
    const row = teamsLobby(["h1", "h2"]);
    const { io } = fakeIo();
    expect(await leaveRoom(io, "h1", row.code)).toEqual({
      ok: false,
      error: "The host cannot leave the lobby",
    });
    expect(await leaveRoom(io, "h9", row.code)).toEqual({
      ok: false,
      error: "You are not in this lobby",
    });
    await startRoom(io, "h1", row.code);
    expect(await leaveRoom(io, "h2", row.code)).toEqual({
      ok: false,
      error: "Game already started",
    });
    expect(memory.stored(row.id).players).toHaveLength(2);
  });

  test("the host can remove a guest, who is told and taken out of the room", async () => {
    const row = teamsLobby(["h1", "h2", "h3"]);
    const { io, emits, leaves } = fakeIo();
    expect(await kickPlayer(io, "h1", row.code, "h3")).toEqual({ ok: true });
    expect(memory.stored(row.id).players.map((p) => p.userId)).toEqual([
      "h1",
      "h2",
    ]);
    expect(leaves).toEqual([{ room: "user:h3", left: `game:${row.code}` }]);
    expect(emits).toContainEqual({
      room: "user:h3",
      event: "game_error",
      payload: { message: "Removed from the room" },
    });
    expect(emits.filter((emit) => emit.room === `game:${row.code}`)).toEqual([
      expect.objectContaining({ event: "game_state" }),
    ]);
  });

  test("only the host can remove someone, and never themselves", async () => {
    const row = teamsLobby(["h1", "h2", "h3"]);
    const { io, emits } = fakeIo();
    expect(await kickPlayer(io, "h2", row.code, "h3")).toEqual({
      ok: false,
      error: "Only the host can change the lobby",
    });
    expect(await kickPlayer(io, "h1", row.code, "h1")).toEqual({
      ok: false,
      error: "The host cannot leave the lobby",
    });
    expect(await kickPlayer(io, "h1", row.code, "h9")).toEqual({
      ok: false,
      error: "Player not found",
    });
    expect(memory.stored(row.id).players).toHaveLength(3);
    expect(emits).toEqual([]);
  });
});
