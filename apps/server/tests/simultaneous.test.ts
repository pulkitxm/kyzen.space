import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GameJson, MoveJson } from "@kyzen/shared/types";
import {
  type FakeMove,
  type FakeState,
  fakeRoundsEngine,
  REPLAY_MS,
  ROUND_MS,
} from "./support/fake-rounds";
import {
  type Emit,
  fakeIo,
  fakeSocket,
  installRuntime,
  lobbyConfig,
  lobbyRow,
} from "./support/runtime";

const memory = installRuntime();

const { handleMakeMove } = await import("../src/realtime/turn-based");
const { __timerInternals } = await import("../src/realtime/game-runner");
const { startRoom } = await import("../src/realtime/lobby");
const { turnTimers } = await import("../src/realtime/turn-timer");
const { lockedGameCount } = await import("../src/realtime/game-lock");

type Io = ReturnType<typeof fakeIo>;

beforeEach(() => {
  memory.reset();
  turnTimers.reset();
});

afterEach(() => {
  turnTimers.reset();
});

async function started(
  humans: string[],
  config: Record<string, unknown> = lobbyConfig(),
): Promise<{ id: string; code: string; harness: Io }> {
  const row = memory.put(lobbyRow(humans, config));
  const harness = fakeIo();
  const result = await startRoom(harness.io, humans[0] ?? "", row.code);
  if (!result.ok) throw new Error(result.error);
  return { id: row.id, code: row.code, harness };
}

function state(id: string): FakeState {
  return memory.stored(id).gameState as FakeState;
}

function moveData(id: string): FakeMove[] {
  return (memory.moves.get(id) ?? []).map((row) => row.moveData as FakeMove);
}

async function lock(
  harness: Io,
  code: string,
  userId: string,
  move: FakeMove,
): Promise<Emit[]> {
  const { socket, emits } = fakeSocket(userId);
  await handleMakeMove(harness.io, socket, { gameId: code, moveData: move });
  return emits;
}

function stateEmits(emits: Emit[]) {
  return emits
    .filter((emit) => emit.event === "game_state")
    .map((emit) => emit.payload as { game: GameJson; move?: MoveJson });
}

describe("simultaneous runner: concurrent submissions", () => {
  test("two players locking at the same instant both persist", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    await Promise.all([
      lock(harness, code, "h1", { round: 1, value: 2 }),
      lock(harness, code, "h2", { round: 1, value: 5 }),
    ]);
    expect(memory.moves.get(id)).toHaveLength(2);
    expect(memory.casMisses).toEqual([]);
    expect(state(id).round).toBe(2);
    expect(state(id).scores).toEqual({ P1: 2, P2: 5 });
    expect(lockedGameCount()).toBe(0);
  });

  test("a compare-and-swap miss from another process reloads and retries", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    let injected = false;
    memory.hooks.beforePersist = (input) => {
      if (injected || input.playerId !== "h1") return;
      injected = true;
      const row = memory.stored(id);
      const result = fakeRoundsEngine.reduce?.(
        row.gameState as FakeState,
        { role: "P2" },
        { round: 1, value: 5 },
      );
      if (!result?.ok) throw new Error("synthetic lock failed");
      row.gameState = result.state;
      memory.moves.get(id)?.push({
        id: "other-process",
        gameId: id,
        moveNumber: 1,
        playerId: "h2",
        moveData: { round: 1, value: 5 },
        createdAt: new Date(),
      });
    };
    const emits = await lock(harness, code, "h1", { round: 1, value: 2 });
    expect(emits.filter((emit) => emit.event === "game_error")).toEqual([]);
    expect(memory.casMisses).toEqual(["h1"]);
    expect(memory.moves.get(id)).toHaveLength(2);
    expect(state(id).round).toBe(2);
    expect(state(id).scores).toEqual({ P1: 2, P2: 5 });
  });
});

describe("simultaneous runner: engine contract rejections", () => {
  test("a duplicate lock in the same round is rejected without persisting", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    await lock(harness, code, "h1", { round: 1, value: 1 });
    const emits = await lock(harness, code, "h1", { round: 1, value: 4 });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Already locked" },
    });
    expect(moveData(id)).toEqual([{ round: 1, value: 1 }]);
  });

  test("a lock for a stale round is rejected", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    await lock(harness, code, "h1", { round: 1, value: 1 });
    await lock(harness, code, "h2", { round: 1, value: 1 });
    const emits = await lock(harness, code, "h1", { round: 1, value: 3 });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Stale round" },
    });
    expect(memory.moves.get(id)).toHaveLength(2);
  });

  test("a non-player cannot lock", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    const emits = await lock(harness, code, "outsider", { round: 1, value: 1 });
    expect(emits).toContainEqual({
      event: "game_error",
      payload: { message: "Not a player in this game" },
    });
    expect(memory.moves.get(id)).toHaveLength(0);
  });
});

describe("simultaneous runner: round clock", () => {
  test("the deadline is armed from roundTimeMs and re-armed when the round changes", async () => {
    const before = Date.now();
    const { id, code, harness } = await started(["h1", "h2"]);
    const first = turnTimers.deadline(id) ?? 0;
    expect(first).toBeGreaterThanOrEqual(before + ROUND_MS);
    expect(first).toBeLessThanOrEqual(Date.now() + ROUND_MS);
    expect(turnTimers.armedKey(id)).toBe("round:1");

    await lock(harness, code, "h1", { round: 1, value: 1 });
    expect(turnTimers.deadline(id)).toBe(first);

    const resolveAt = Date.now();
    await lock(harness, code, "h2", { round: 1, value: 1 });
    const second = turnTimers.deadline(id) ?? 0;
    expect(turnTimers.armedKey(id)).toBe("round:2");
    expect(second).toBeGreaterThanOrEqual(resolveAt + ROUND_MS + REPLAY_MS);
    const last = stateEmits(harness.emits).at(-1);
    expect(last?.game.turnDeadline).toBe(second);
  });

  test("expiry auto-submits only the pending humans and adds a strike to each", async () => {
    const { id, code, harness } = await started(["h1", "h2", "h3"]);
    await lock(harness, code, "h1", { round: 1, value: 4 });
    await __timerInternals.onRoundTimeout(harness.io, id, "round:1");

    const rows = memory.moves.get(id) ?? [];
    expect(rows.map((row) => row.playerId)).toEqual(["h1", "h2", "h3"]);
    expect(turnTimers.strikes(id, "P1")).toBe(0);
    expect(turnTimers.strikes(id, "P2")).toBe(1);
    expect(turnTimers.strikes(id, "P3")).toBe(1);
    const autos = stateEmits(harness.emits).filter(
      (payload) => payload.move?.auto,
    );
    expect(autos.map((payload) => payload.move?.playerId)).toEqual([
      "h2",
      "h3",
    ]);
    expect(state(id).round).toBe(2);
    expect(turnTimers.armedKey(id)).toBe("round:2");
  });

  test("autoMove sees the prior strike count and a real lock resets it", async () => {
    const { id, code, harness } = await started(
      ["h1", "h2"],
      lobbyConfig({ rounds: 3 }),
    );
    turnTimers.setStrikes(id, "P2", 2);
    await lock(harness, code, "h1", { round: 1, value: 1 });
    await __timerInternals.onRoundTimeout(harness.io, id, "round:1");
    expect(moveData(id).at(-1)).toEqual({ round: 1, value: -1 });
    expect(turnTimers.strikes(id, "P2")).toBe(3);

    await lock(harness, code, "h2", { round: 2, value: 1 });
    expect(turnTimers.strikes(id, "P2")).toBe(0);
  });

  test("a timeout armed for an earlier round is ignored", async () => {
    const { id, code, harness } = await started(["h1", "h2"]);
    await lock(harness, code, "h1", { round: 1, value: 1 });
    await lock(harness, code, "h2", { round: 1, value: 1 });
    const deadline = turnTimers.deadline(id);
    await __timerInternals.onRoundTimeout(harness.io, id, "round:1");
    expect(memory.moves.get(id)).toHaveLength(2);
    expect(turnTimers.strikes(id, "P1")).toBe(0);
    expect(turnTimers.strikes(id, "P2")).toBe(0);
    expect(turnTimers.deadline(id)).toBe(deadline);
  });
});

describe("simultaneous runner: bots", () => {
  const bots = [
    { id: "bot:1", difficulty: "hard", team: "A" },
    { id: "bot:2", difficulty: "easy", team: "A" },
  ];

  test("bots lock instantly when the game starts and when each round opens", async () => {
    const { id, code, harness } = await started(
      ["h1"],
      lobbyConfig({ bots, rounds: 3 }),
    );
    expect(
      (memory.moves.get(id) ?? []).map((row) => [row.playerId, row.moveData]),
    ).toEqual([
      ["bot:1", { round: 1, value: 3 }],
      ["bot:2", { round: 1, value: 1 }],
    ]);
    expect(fakeRoundsEngine.pendingRoles?.(state(id))).toEqual(["P1"]);

    await lock(harness, code, "h1", { round: 1, value: 0 });
    expect(state(id).round).toBe(2);
    expect(Object.keys(state(id).locked).sort()).toEqual(["P2", "P3"]);
    expect(memory.moves.get(id)).toHaveLength(5);
  });

  test("bots are never given strikes and still resolve rounds after a timeout", async () => {
    const { id, harness } = await started(["h1"], lobbyConfig({ bots }));
    await __timerInternals.onRoundTimeout(harness.io, id, "round:1");
    expect(turnTimers.strikes(id, "P1")).toBe(1);
    expect(turnTimers.strikes(id, "P2")).toBe(0);
    expect(state(id).round).toBe(2);
  });
});

describe("simultaneous runner: completion", () => {
  test("team winners map to every winning seat, including bots, exactly once", async () => {
    const { id, code, harness } = await started(
      ["h1", "h2"],
      lobbyConfig({
        mode: "teams",
        teams: { h1: "A", h2: "B" },
        bots: [
          { id: "bot:1", difficulty: "hard", team: "B" },
          { id: "bot:2", difficulty: "easy", team: "A" },
        ],
        rounds: 1,
      }),
    );
    await Promise.all([
      lock(harness, code, "h1", { round: 1, value: 0 }),
      lock(harness, code, "h2", { round: 1, value: 0 }),
    ]);
    const row = memory.stored(id);
    expect(row.status).toBe("completed");
    expect(row.winners).toEqual(["h2", "bot:1"]);
    expect(row.winner).toBeNull();
    expect(memory.completions).toHaveLength(1);
    const overs = harness.emits.filter((emit) => emit.event === "game_over");
    expect(overs).toEqual([
      { room: `game:${code}`, event: "game_over", payload: { winner: null } },
    ]);
    const final = stateEmits(harness.emits).at(-1);
    expect(final?.game.winners).toEqual(["h2", "bot:1"]);
    expect(turnTimers.deadline(id)).toBeNull();
  });

  test("a tied finish is a draw with no winners", async () => {
    const { id, code, harness } = await started(
      ["h1", "h2"],
      lobbyConfig({ rounds: 1 }),
    );
    await lock(harness, code, "h1", { round: 1, value: 2 });
    await lock(harness, code, "h2", { round: 1, value: 2 });
    const row = memory.stored(id);
    expect(row.winner).toBe("draw");
    expect(row.winners).toEqual([]);
    expect(memory.completions).toEqual([
      { gameId: id, winners: [], draw: true },
    ]);
    const late = await lock(harness, code, "h1", { round: 2, value: 1 });
    expect(late).toContainEqual({
      event: "game_error",
      payload: { message: "Game is not active" },
    });
  });

  test("a partial draw records the co-drawers as winners with a draw summary", async () => {
    const { id, code, harness } = await started(
      ["h1", "h2", "h3"],
      lobbyConfig({ rounds: 1 }),
    );
    await lock(harness, code, "h1", { round: 1, value: 2 });
    await lock(harness, code, "h2", { round: 1, value: 2 });
    await lock(harness, code, "h3", { round: 1, value: 1 });
    const row = memory.stored(id);
    expect(row.winner).toBe("draw");
    expect(row.winners).toEqual(["h1", "h2"]);
    expect(harness.emits.filter((e) => e.event === "game_over")).toHaveLength(
      1,
    );
  });
});
