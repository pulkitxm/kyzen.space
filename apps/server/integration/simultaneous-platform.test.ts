import { afterAll, describe, expect, it } from "bun:test";
import { db, games, profiles, schema } from "@kyzen/database";
import { TIC_TAC_TOE } from "@kyzen/shared/constants";
import type { GameRecord, GameType } from "@kyzen/shared/types";
import { inArray } from "drizzle-orm";
import type { Server, Socket } from "socket.io";
import { __timerInternals } from "../src/realtime/game-runner";
import {
  configureRoom,
  kickPlayer,
  leaveRoom,
  startRoom,
} from "../src/realtime/lobby";
import { initialState, publicSeats } from "../src/realtime/setup";
import { handleMakeMove } from "../src/realtime/turn-based";
import { turnTimers } from "../src/realtime/turn-timer";
import {
  FAKE_ROUNDS,
  type FakeMove,
  type FakeState,
  fakeRoundsDefinition,
  LEAVE,
  REPLAY_MS,
} from "../tests/support/fake-rounds";
import { installFakeRegistry } from "../tests/support/runtime";
import { createHarness, DB_UP, type TestUser } from "./harness";

installFakeRegistry();

const h = createHarness("rounds");
afterAll(async () => {
  turnTimers.reset();
  await h.cleanup();
});

const engine = fakeRoundsDefinition.engine;
const wire: unknown[] = [];
const left: string[] = [];
const io = {
  to: () => ({
    emit: (_event: string, payload: unknown) => wire.push(payload),
  }),
  in: (room: string) => ({
    socketsLeave: () => left.push(room),
  }),
} as unknown as Server;

function socket(userId: string): Socket {
  return {
    data: { userId },
    emit: (_event: string, payload: unknown) => wire.push(payload),
  } as unknown as Socket;
}

async function lobby(
  humans: TestUser[],
  config: Record<string, unknown>,
): Promise<string> {
  const [row] = await db
    .insert(schema.game)
    .values({
      gameType: FAKE_ROUNDS,
      status: "waiting",
      config,
      creatorUserId: humans[0]?.id ?? null,
      seatingMode: "open",
    })
    .returning();
  if (!row) throw new Error("lobby insert failed");
  h.trackGame(row.id);
  await db.insert(schema.gamePlayer).values(
    humans.map((user, index) => ({
      gameId: row.id,
      userId: user.id,
      username: user.username,
      role: engine.roleForSeat(index),
      seatOrder: index,
    })),
  );
  return row.code;
}

async function record(code: string): Promise<GameRecord> {
  const found = await games.getGameByCode(code);
  if (!found) throw new Error("game missing");
  return found;
}

async function lockAll(code: string, locks: [TestUser, FakeMove][]) {
  await Promise.all(
    locks.map(([user, move]) =>
      handleMakeMove(io, socket(user.id), { gameId: code, moveData: move }),
    ),
  );
}

async function statsOf(user: TestUser) {
  return (await profiles.getProfileByUserId(user.id))?.stats[FAKE_ROUNDS];
}

function replay(
  final: FakeState,
  rows: { playerId: string; moveData: unknown }[],
  players: GameRecord["players"],
) {
  const reduce = engine.reduce;
  if (!reduce) throw new Error("engine has no reduce");
  let state = engine.createInitialState(final.seats, {
    config: { rounds: final.rounds },
    seed: final.seed,
  });
  for (const row of rows) {
    const role = players.find((p) => p.userId === row.playerId)?.role ?? "";
    const result = reduce(state, { role }, row.moveData);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
  }
  return state;
}

describe.skipIf(!DB_UP)("simultaneous lobbies against PostgreSQL", () => {
  it("plays a private team lobby with bots to completion with exactly-once stats", async () => {
    const a = await h.makeUser("a");
    const b = await h.makeUser("b");
    const code = await lobby([a, b], {
      mode: "teams",
      teams: { [a.id]: "A", [b.id]: "B" },
      bots: [
        { id: "bot:1", difficulty: "hard", team: "B" },
        { id: "bot:2", difficulty: "easy", team: "A" },
      ],
      rounds: 2,
    });
    expect(await startRoom(io, b.id, code)).toEqual({
      ok: false,
      error: "Only the host can change the lobby",
    });
    expect(await startRoom(io, a.id, code)).toEqual({ ok: true });
    expect(await startRoom(io, a.id, code)).toEqual({
      ok: false,
      error: "Game already started",
    });

    const started = await record(code);
    expect(started.status).toBe("active");
    expect(started.players.map((p) => [p.userId, p.username, p.role])).toEqual([
      [a.id, a.username, "P1"],
      [b.id, b.username, "P2"],
      ["bot:1", "Bot 1 (Hard)", "P3"],
      ["bot:2", "Bot 2 (Easy)", "P4"],
    ]);
    expect(await games.listMoves(started.id)).toHaveLength(2);

    await lockAll(code, [
      [a, { round: 1, value: 0 }],
      [b, { round: 1, value: 0 }],
    ]);
    const finalLocks = Array.from({ length: 4 }, (): [TestUser, FakeMove][] => [
      [a, { round: 2, value: 0 }],
      [b, { round: 2, value: 0 }],
    ]).flat();
    await lockAll(code, finalLocks);

    const finished = await record(code);
    expect(finished.status).toBe("completed");
    expect(finished.winners).toEqual([b.id, "bot:1"]);
    expect(finished.winner).toBeNull();
    expect(await statsOf(a)).toEqual({ played: 1, won: 0, lost: 1, drawn: 0 });
    expect(await statsOf(b)).toEqual({ played: 1, won: 1, lost: 0, drawn: 0 });
    const botProfiles = await db
      .select()
      .from(schema.userProfile)
      .where(inArray(schema.userProfile.userId, ["bot:1", "bot:2"]));
    expect(botProfiles).toEqual([]);

    const rows = await games.listMoves(finished.id);
    expect(rows).toHaveLength(8);
    expect(
      replay(finished.gameState as FakeState, rows, finished.players),
    ).toEqual(finished.gameState as FakeState);
    expect(turnTimers.deadline(finished.id)).toBeNull();
  });

  it("records shared draws: co-drawers draw, everyone else loses", async () => {
    const a = await h.makeUser("da");
    const b = await h.makeUser("db");
    const c = await h.makeUser("dc");
    const code = await lobby([a, b, c], {
      mode: "ffa",
      teams: {},
      bots: [],
      rounds: 1,
    });
    await startRoom(io, a.id, code);
    await lockAll(code, [
      [a, { round: 1, value: 2 }],
      [b, { round: 1, value: 2 }],
      [c, { round: 1, value: 1 }],
    ]);
    const finished = await record(code);
    expect(finished.winner).toBe("draw");
    expect(finished.winners).toEqual([a.id, b.id]);
    expect(await statsOf(a)).toEqual({ played: 1, won: 0, lost: 0, drawn: 1 });
    expect(await statsOf(b)).toEqual({ played: 1, won: 0, lost: 0, drawn: 1 });
    expect(await statsOf(c)).toEqual({ played: 1, won: 0, lost: 1, drawn: 0 });
  });

  it("records a full draw for every seat", async () => {
    const a = await h.makeUser("fa");
    const b = await h.makeUser("fb");
    const code = await lobby([a, b], {
      mode: "ffa",
      teams: {},
      bots: [],
      rounds: 1,
    });
    await startRoom(io, a.id, code);
    await lockAll(code, [
      [a, { round: 1, value: 3 }],
      [b, { round: 1, value: 3 }],
    ]);
    const finished = await record(code);
    expect(finished.winner).toBe("draw");
    expect(finished.winners).toEqual([]);
    expect(await statsOf(a)).toEqual({ played: 1, won: 0, lost: 0, drawn: 1 });
    expect(await statsOf(b)).toEqual({ played: 1, won: 0, lost: 0, drawn: 1 });
  });

  it("guards seating and starting with row locks", async () => {
    const a = await h.makeUser("sa");
    const b = await h.makeUser("sb");
    const c = await h.makeUser("sc");
    const code = await lobby([a], { mode: "ffa", teams: {}, bots: [] });
    const waiting = await record(code);
    expect(
      await games.seatPlayer(
        waiting.id,
        { userId: b.id, username: b.username, role: "P2" },
        0,
      ),
    ).toBe(false);
    expect(
      await games.startLobby({
        previous: { ...waiting, config: { mode: "teams" } },
        bots: [],
        gameState: {},
      }),
    ).toBeNull();
    const [first, second] = await Promise.all([
      games.seatPlayer(
        waiting.id,
        { userId: b.id, username: b.username, role: "P2" },
        1,
      ),
      games.seatPlayer(
        waiting.id,
        { userId: c.id, username: c.username, role: "P2" },
        1,
      ),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await startRoom(io, a.id, code);
    expect(
      await games.seatPlayer(
        waiting.id,
        { userId: c.id, username: c.username, role: "P3" },
        2,
      ),
    ).toBe(false);
    expect((await record(code)).players).toHaveLength(2);
  });
});

describe.skipIf(!DB_UP)("lobby rules against PostgreSQL", () => {
  it("rejects configuring or starting teams mode with a single team", async () => {
    const a = await h.makeUser("ta1");
    const b = await h.makeUser("tb1");
    const together = {
      mode: "teams",
      teams: { [a.id]: "A", [b.id]: "A" },
      bots: [],
    };
    const code = await lobby([a, b], together);
    expect(await startRoom(io, a.id, code)).toEqual({
      ok: false,
      error: "Teams mode needs players on at least two teams",
    });
    expect(
      await configureRoom(io, a.id, code, {
        ...together,
        bots: [{ id: "bot:1", difficulty: "easy", team: "A" }],
      }),
    ).toEqual({
      ok: false,
      error: "Teams mode needs players on at least two teams",
    });
    expect(
      await configureRoom(io, a.id, code, {
        ...together,
        teams: { [a.id]: "A", [b.id]: "A", stranger: "B" },
      }),
    ).toEqual({
      ok: false,
      error: "Teams can only list seated players and bots",
    });
    expect((await record(code)).status).toBe("waiting");
    expect(
      await configureRoom(io, a.id, code, {
        mode: "teams",
        teams: { [a.id]: "A", [b.id]: "B" },
        bots: [],
      }),
    ).toEqual({ ok: true });
    expect(await startRoom(io, a.id, code)).toEqual({ ok: true });
    expect((await record(code)).players.map((player) => player.userId)).toEqual(
      [a.id, b.id],
    );
  });

  it("lets a guest leave and the host remove a guest before the start", async () => {
    const a = await h.makeUser("la");
    const b = await h.makeUser("lb");
    const c = await h.makeUser("lc");
    const d = await h.makeUser("ld");
    const code = await lobby([a, b, c, d], {
      mode: "teams",
      teams: { [a.id]: "A", [b.id]: "B", [c.id]: "A", [d.id]: "B" },
      bots: [],
    });
    left.length = 0;
    expect(await leaveRoom(io, a.id, code)).toEqual({
      ok: false,
      error: "The host cannot leave the lobby",
    });
    expect(await leaveRoom(io, b.id, code)).toEqual({ ok: true });
    expect(await kickPlayer(io, b.id, code, c.id)).toEqual({
      ok: false,
      error: "Only the host can change the lobby",
    });
    expect(await kickPlayer(io, a.id, code, b.id)).toEqual({
      ok: false,
      error: "Player not found",
    });
    expect(await kickPlayer(io, a.id, code, c.id)).toEqual({ ok: true });
    const after = await record(code);
    expect(after.players.map((player) => [player.userId, player.role])).toEqual(
      [
        [a.id, "P1"],
        [d.id, "P2"],
      ],
    );
    expect(after.config).toEqual({
      mode: "teams",
      teams: { [a.id]: "A", [d.id]: "B" },
      bots: [],
    });
    expect(left).toEqual([`user:${b.id}`, `user:${c.id}`]);
    expect(await startRoom(io, a.id, code)).toEqual({ ok: true });
    expect(await kickPlayer(io, a.id, code, d.id)).toEqual({
      ok: false,
      error: "Game already started",
    });
  });

  it("paces bot-only rounds on the bot clock instead of resolving them at once", async () => {
    const a = await h.makeUser("bo");
    const code = await lobby([a], {
      mode: "ffa",
      teams: {},
      bots: [
        { id: "bot:1", difficulty: "hard", team: "A" },
        { id: "bot:2", difficulty: "easy", team: "A" },
      ],
      rounds: 3,
    });
    expect(await startRoom(io, a.id, code)).toEqual({ ok: true });
    const id = (await record(code)).id;
    const before = Date.now();
    await handleMakeMove(io, socket(a.id), {
      gameId: code,
      moveData: { round: 1, value: LEAVE },
    });
    const waiting = await record(code);
    expect((waiting.gameState as FakeState).round).toBe(2);
    expect(await games.listMoves(id)).toHaveLength(3);
    expect(turnTimers.armedKey(id)).toBe("bots:round:2");
    const deadline = turnTimers.deadline(id) ?? 0;
    expect(deadline).toBeGreaterThanOrEqual(before + REPLAY_MS);
    expect(deadline).toBeLessThanOrEqual(Date.now() + REPLAY_MS);

    await __timerInternals.onBotClock(io, id, "bots:round:1");
    expect(await games.listMoves(id)).toHaveLength(3);

    await __timerInternals.onBotClock(io, id, "bots:round:2");
    const rows = await games.listMoves(id);
    expect(rows.map((row) => [row.moveNumber, row.playerId])).toEqual([
      [1, "bot:1"],
      [2, "bot:2"],
      [3, a.id],
      [4, "bot:1"],
      [5, "bot:2"],
    ]);
    expect(((await record(code)).gameState as FakeState).round).toBe(3);
    expect(turnTimers.armedKey(id)).toBe("bots:round:3");
    turnTimers.dispose(id);
  });
});

describe.skipIf(!DB_UP)("public N-player matchmaking", () => {
  it("assembles 2v2 matches from concurrent joins with alternating teams", async () => {
    const config = { mode: "teams", teams: {}, bots: [] };
    const users = await Promise.all(
      Array.from({ length: 8 }, (_, i) => h.makeUser(`q${i}`)),
    );
    const join = (user: TestUser) =>
      games.joinMatchmaking({
        userId: user.id,
        owner: user.id,
        gameType: FAKE_ROUNDS as GameType,
        config,
        seats: publicSeats(engine, 4, config),
        createState: (seats) =>
          initialState(fakeRoundsDefinition, seats, config),
      });
    await Promise.all(users.flatMap((user) => [join(user), join(user)]));
    const results = await Promise.all(users.map(join));
    const codes = [...new Set(results.map((result) => result?.code ?? ""))];
    expect(codes).toHaveLength(2);
    for (const code of codes) h.trackGame((await record(code)).id);
    for (const code of codes) {
      const match = await record(code);
      expect(match.publicMatch).toBe(true);
      expect(match.status).toBe("active");
      expect(match.players.map((p) => p.role)).toEqual([
        "P1",
        "P2",
        "P3",
        "P4",
      ]);
      expect(match.players.map((p) => p.username)).toEqual([
        "Player 1",
        "Player 2",
        "Player 3",
        "Player 4",
      ]);
      expect(
        (match.gameState as FakeState).seats.map((seat) => seat.team),
      ).toEqual(["A", "B", "A", "B"]);
    }
  });

  it("waits until a full group is available", async () => {
    const config = { mode: "teams", teams: {}, bots: [], rounds: 9 };
    const users = await Promise.all(
      Array.from({ length: 3 }, (_, i) => h.makeUser(`w${i}`)),
    );
    for (const user of users)
      expect(
        await games.joinMatchmaking({
          userId: user.id,
          owner: user.id,
          gameType: FAKE_ROUNDS as GameType,
          config,
          seats: publicSeats(engine, 4, config),
          createState: (seats) =>
            initialState(fakeRoundsDefinition, seats, config),
        }),
      ).toBeNull();
    for (const user of users)
      await games.leaveMatchmaking(user.id, user.id, FAKE_ROUNDS as GameType);
  });

  it("keeps two-player turn-based pools unchanged", async () => {
    const a = await h.makeUser("ta");
    const b = await h.makeUser("tb");
    expect(TIC_TAC_TOE).toBe("tic-tac-toe");
    const join = (user: TestUser) =>
      games.joinMatchmaking({
        userId: user.id,
        owner: user.id,
        gameType: TIC_TAC_TOE,
        config: { pool: "rounds" },
        seats: [
          { role: "X", team: "X", bot: null },
          { role: "O", team: "O", bot: null },
        ],
        createState: () => ({ board: Array(9).fill(null), currentTurn: "X" }),
      });
    expect(await join(a)).toBeNull();
    const matched = await join(b);
    if (matched) h.trackGame((await record(matched.code)).id);
    expect(matched?.userIds.sort()).toEqual([a.id, b.id].sort());
  });
});
