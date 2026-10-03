import { describe, expect, test } from "bun:test";
import {
  type TankArenaMove,
  type TankArenaState,
  tankArenaMoveSchema,
  tankArenaStateSchema,
} from "@kyzen/shared/types";
import { deriveSecret } from "../src/games/tank-arena/math";
import {
  aliveTeams,
  canUse,
  cooldownsOf,
  FIRST_PLANNING_MS,
  MODULE_WIDTH,
  PLANNING_MS,
  RESULTS_MS,
  roleTeam,
  SELECT_MS,
  TANKS,
  tankArenaDefinition,
} from "../src/index";
import {
  apply,
  engine,
  idleRound,
  lock,
  lockAll,
  seats,
  started,
  tank,
  withTanks,
} from "./tank-arena-fixtures";

function reduce(state: TankArenaState, role: string, move: unknown) {
  const result = engine.reduce?.(state, { role }, move as TankArenaMove);
  if (!result) throw new Error("engine has no reduce");
  return result;
}

function rejection(state: TankArenaState, role: string, move: unknown) {
  const result = reduce(state, role, move);
  return result.ok ? null : result.error;
}

function duel(): TankArenaState {
  return {
    ...started(["kestrel", "bastion"]),
    tanks: [tank("p1", "kestrel", 19), tank("p2", "bastion", 27)],
  };
}

describe("tank arena definition", () => {
  test("exposes the engine contract", () => {
    expect(engine.type).toBe("tank-arena");
    expect(engine.mode).toBe("simultaneous");
    expect(engine.minPlayers).toBe(2);
    expect(engine.maxPlayers).toBe(Number.POSITIVE_INFINITY);
    expect(engine.lobby).toEqual({ teams: true, bots: true });
    expect([0, 1, 9].map((i) => engine.roleForSeat(i))).toEqual([
      "p1",
      "p2",
      "p10",
    ]);
    expect(tankArenaDefinition.layout).toBe("wide");
    expect(tankArenaDefinition.meta.name).toBe("Tank Arena");
    expect(tankArenaDefinition.queues?.map((q) => q.id)).toEqual([
      "duel",
      "teams",
    ]);
  });

  test("public queues size 1v1 and 2v2 groups", () => {
    const sizes = (tankArenaDefinition.queues ?? []).map((queue) =>
      engine.playerCount?.(
        tankArenaDefinition.configSchema.parse(queue.config),
      ),
    );
    expect(sizes).toEqual([2, 4]);
    expect(engine.playerCount?.({})).toBe(2);
    expect(engine.playerCount?.("garbage")).toBe(2);
  });
});

describe("initial state", () => {
  test("sizes the map from the seat count and stretches the seed", () => {
    for (const [count, modules] of [
      [2, 2],
      [4, 2],
      [5, 3],
      [8, 4],
      [64, 32],
      [256, 128],
    ] as const) {
      const state = engine.createInitialState(seats(count), {
        config: {},
        seed: 5,
      });
      expect(state.modules).toBe(modules);
      expect(state.secret).toEqual(deriveSecret(5));
      expect(state.phase).toBe("select");
      expect(state.round).toBe(0);
      expect(tankArenaStateSchema.safeParse(state).success).toBe(true);
    }
  });

  test("spawns every seat on its own slot, interleaving teams", () => {
    const state = engine.createInitialState(seats(4, { teams: true }), {
      config: {},
      seed: 11,
    });
    const xs = state.tanks.map((t) => t.x);
    expect(new Set(xs).size).toBe(4);
    for (const x of xs) expect([7, 25]).toContain(x % MODULE_WIDTH);
    const duelState = engine.createInitialState(seats(2), {
      config: {},
      seed: 3,
    });
    const [a, b] = duelState.tanks.map((t) => t.x);
    expect(Math.abs((a ?? 0) - (b ?? 0))).toBe(32);
  });

  test("is seed deterministic and fresh", () => {
    const a = engine.createInitialState(seats(6), { config: {}, seed: 77 });
    const b = engine.createInitialState(seats(6), { config: {}, seed: 77 });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe("tank select", () => {
  test("hides picks until everyone has picked", () => {
    let state = engine.createInitialState(seats(2), { config: {}, seed: 1 });
    state = apply(state, "p1", { type: "select", round: 0, tank: "kestrel" });
    expect(engine.pendingRoles?.(state)).toEqual(["p2"]);
    const shown = engine.publicState?.(state) as TankArenaState;
    expect(shown.tanks.map((t) => t.kind)).toEqual([null, null]);
    expect(shown.submitted).toEqual(["p1"]);
    expect(
      engine.publicMove?.(state, {
        type: "select",
        round: 0,
        tank: "kestrel",
      }),
    ).toEqual({ type: "submitted", round: 0 });
    state = apply(state, "p2", { type: "select", round: 0, tank: "bastion" });
    expect(state.phase).toBe("plan");
    expect(state.round).toBe(1);
    expect(state.tanks.map((t) => [t.kind, t.hp, t.y])).toEqual([
      ["kestrel", 120, 0.9],
      ["bastion", 160, 1.2],
    ]);
    const revealed = engine.publicState?.(state) as TankArenaState;
    expect(revealed.tanks.map((t) => t.kind)).toEqual(["kestrel", "bastion"]);
  });

  test("auto-picks alternating defaults on timeout", () => {
    const state = engine.createInitialState(seats(3), { config: {}, seed: 1 });
    expect(
      ["p1", "p2", "p3"].map((role) => engine.autoMove?.(state, role, 0)),
    ).toEqual([
      { type: "select", round: 0, tank: "bastion" },
      { type: "select", round: 0, tank: "kestrel" },
      { type: "select", round: 0, tank: "bastion" },
    ]);
  });

  test("a forfeit during select eliminates the tank and can end the game", () => {
    let state = engine.createInitialState(seats(2), { config: {}, seed: 1 });
    state = apply(state, "p1", { type: "forfeit", round: 0 });
    const result = reduce(state, "p2", {
      type: "select",
      round: 0,
      tank: "kestrel",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome).toEqual({
      status: "completed",
      winnerRoles: ["p2"],
      draw: false,
    });
    expect(result.state.eliminated).toEqual([
      { role: "p1", round: 0, cause: "forfeit" },
    ]);
  });
});

describe("lock validation", () => {
  test("rejects every invalid submission with a reason", () => {
    const state = duel();
    const selecting = engine.createInitialState(seats(2), {
      config: {},
      seed: 1,
    });
    expect(rejection(state, "p9", lock(1, "missile"))).toBe(
      "Not a player in this game",
    );
    expect(rejection(state, "p1", { type: "lock", round: 1 })).toBe(
      "Invalid move",
    );
    expect(rejection(state, "p1", lock(1, "missile", 200))).toBe(
      "Invalid move",
    );
    expect(rejection(state, "p1", lock(1, "missile", 45, 0.1))).toBe(
      "Invalid move",
    );
    expect(rejection(state, "p1", lock(2, "missile"))).toBe(
      "That round has not started",
    );
    expect(rejection(selecting, "p1", lock(1, "missile"))).toBe(
      "Choose a tank before locking a plan",
    );
    expect(
      rejection(state, "p1", { type: "select", round: 0, tank: "bastion" }),
    ).toBe("Tank selection is over");
    expect(rejection(state, "p1", lock(1, "jump", 5))).toBe(
      "Jump angle must point upward (10 to 170 degrees)",
    );
    expect(rejection(state, "p1", lock(1, "specialB", -40))).toBe(
      "Jump angle must point upward (10 to 170 degrees)",
    );
    expect(rejection(state, "p2", lock(1, "specialB", -40))).toBeNull();
    const cooling = withTanks(state, (t) => ({
      ...t,
      cooldowns: { specialA: 2, specialB: 1 },
    }));
    expect(rejection(cooling, "p1", lock(1, "specialA"))).toBe(
      "Special A is cooling down",
    );
    expect(rejection(cooling, "p1", lock(1, "specialB"))).toBe(
      "Special B is cooling down",
    );
    const once = apply(state, "p1", lock(1, "missile", 0, 1));
    expect(rejection(once, "p1", lock(1, "shield"))).toBe(
      "You already submitted this round",
    );
    const next = apply(once, "p2", lock(1, "idle"));
    expect(rejection(next, "p1", lock(1, "missile"))).toBe(
      "That round is already over",
    );
    const dead = withTanks(next, (t) =>
      t.role === "p1" ? { ...t, alive: false, hp: 0 } : t,
    );
    expect(rejection(dead, "p1", lock(2, "missile"))).toBe(
      "Your tank has been eliminated",
    );
    const finished: TankArenaState = {
      ...next,
      phase: "finished",
      outcome: { winnerRoles: ["p1"], draw: false },
    };
    expect(rejection(finished, "p1", lock(2, "missile"))).toBe(
      "The game is finished",
    );
  });

  test("does not mutate the input state", () => {
    const state = duel();
    const snapshot = JSON.parse(JSON.stringify(state));
    reduce(state, "p1", lock(1, "missile", 0, 1));
    apply(apply(state, "p1", lock(1, "missile", 0, 1)), "p2", lock(1, "idle"));
    expect(state).toEqual(snapshot);
  });

  test("hides locked plans until the round resolves", () => {
    const state = apply(duel(), "p1", lock(1, "missile", 12, 0.8));
    const shown = engine.publicState?.(state) as TankArenaState;
    expect(shown.plans).toEqual({});
    expect(shown.submitted).toEqual(["p1"]);
    expect(JSON.stringify(shown)).not.toContain("0.8");
    const move = lock(1, "missile", 12, 0.8);
    expect(engine.publicMove?.(state, move)).toEqual({
      type: "submitted",
      round: 1,
    });
    const resolved = apply(state, "p2", lock(1, "idle"));
    expect(engine.publicMove?.(resolved, move)).toEqual(move);
    expect(resolved.resolution?.plans.p1).toEqual({
      action: "missile",
      angle: 12,
      power: 0.8,
    });
    expect(engine.publicMove?.(state, { type: "forfeit", round: 1 })).toEqual({
      type: "forfeit",
      round: 1,
    });
    expect(tankArenaStateSchema.safeParse(shown).success).toBe(true);
  });
});

describe("leaving the match", () => {
  test("a forfeit replaces a locked plan at any time", () => {
    const locked = apply(duel(), "p1", lock(1, "missile", 0, 1));
    const left = apply(locked, "p1", { type: "forfeit", round: 1 });
    expect(left.plans.p1).toEqual({
      action: "forfeit",
      angle: 90,
      power: 0.15,
    });
    expect(left.submitted).toEqual(["p1"]);
    expect(engine.pendingRoles?.(left)).toEqual(["p2"]);
    expect(rejection(left, "p1", { type: "forfeit", round: 1 })).toBe(
      "You already submitted this round",
    );
    expect(rejection(left, "p1", lock(1, "idle"))).toBe(
      "You already submitted this round",
    );
    const after = apply(left, "p2", lock(1, "idle"));
    expect(after.resolution?.plans.p1?.action).toBe("forfeit");
    expect(after.outcome).toEqual({ winnerRoles: ["p2"], draw: false });
    let selecting = engine.createInitialState(seats(2), {
      config: {},
      seed: 1,
    });
    selecting = apply(selecting, "p1", {
      type: "select",
      round: 0,
      tank: "kestrel",
    });
    selecting = apply(selecting, "p1", { type: "forfeit", round: 0 });
    const done = apply(selecting, "p2", {
      type: "select",
      round: 0,
      tank: "bastion",
    });
    expect(done.outcome).toEqual({ winnerRoles: ["p2"], draw: false });
  });
});

describe("hidden information", () => {
  const masterSeed = 1_987_654_321;

  function midGame(rounds: number): TankArenaState {
    let state = started(["kestrel", "bastion", "kestrel", "bastion"], {
      teams: true,
      seed: masterSeed,
    });
    for (let round = 1; round <= rounds && state.phase === "plan"; round++)
      for (const role of engine.pendingRoles?.(state) ?? [])
        state = apply(
          state,
          role,
          engine.botMove?.(state, role, "normal") as TankArenaMove,
        );
    return state;
  }

  test("public state carries neither the master seed nor the secret", () => {
    const state = midGame(4);
    const shown = engine.publicState?.(state) as TankArenaState;
    const text = JSON.stringify(shown);
    expect(state.secret).toEqual(deriveSecret(masterSeed));
    expect("secret" in shown).toBe(false);
    expect(text).not.toContain(String(masterSeed));
    for (const word of state.secret ?? [])
      expect(text).not.toContain(String(word));
    expect(tankArenaStateSchema.safeParse(shown).success).toBe(true);
  });

  test("aimed bot moves cannot be reproduced without the server secret", () => {
    const state = midGame(0);
    const shown = engine.publicState?.(state) as TankArenaState;
    for (const difficulty of ["easy", "normal", "hard"] as const)
      for (const role of ["p1", "p2", "p3", "p4"]) {
        const truth = engine.botMove?.(state, role, difficulty);
        expect(engine.botMove?.(shown, role, difficulty)).not.toEqual(truth);
        for (const guess of [0, 1, 42, masterSeed + 1])
          expect(
            engine.botMove?.(
              { ...shown, secret: deriveSecret(guess) },
              role,
              difficulty,
            ),
          ).not.toEqual(truth);
        expect(
          engine.botMove?.(
            { ...shown, secret: deriveSecret(masterSeed) },
            role,
            difficulty,
          ),
        ).toEqual(truth);
      }
  });

  test("spreads, spawns, and airstrikes stay unpredictable until announced", () => {
    let state = midGame(0);
    for (let round = 1; round < 8; round++) state = idleRound(state);
    expect(state.round).toBe(8);
    const shown = engine.publicState?.(state) as TankArenaState;
    const truth = idleRound(state);
    const guessed = idleRound({ ...shown, secret: deriveSecret(12345) });
    expect(guessed.resolution?.seed).not.toBe(truth.resolution?.seed);
    expect(guessed.pickups).not.toEqual(truth.pickups);
    expect(truth.airstrike?.round).toBe(9);
    expect(guessed.airstrike?.columns).not.toEqual(truth.airstrike?.columns);
    const exact = idleRound({ ...shown, secret: deriveSecret(masterSeed) });
    expect(JSON.stringify(engine.publicState?.(exact))).toBe(
      JSON.stringify(engine.publicState?.(truth)),
    );
  });
});

describe("simultaneous submissions", () => {
  test("resolve identically in either order", () => {
    const base = withTanks(
      started(["kestrel", "bastion", "kestrel"]),
      (t, i) =>
        i === 0 ? { ...t, x: 19 } : i === 1 ? { ...t, x: 27 } : { ...t, x: 50 },
    );
    const moves: Record<string, TankArenaMove> = {
      p1: lock(1, "missile", 3, 1),
      p2: lock(1, "specialA", 160, 0.7),
      p3: lock(1, "jump", 120, 0.6),
    };
    const orders = [
      ["p1", "p2", "p3"],
      ["p3", "p2", "p1"],
      ["p2", "p3", "p1"],
    ];
    const finals = orders.map((order) => {
      let state = base;
      const partial: string[] = [];
      for (const role of order) {
        state = apply(state, role, moves[role]);
        partial.push(JSON.stringify(state));
      }
      return { final: JSON.stringify(state), partial };
    });
    expect(new Set(finals.map((f) => f.final)).size).toBe(1);
    expect(finals[0]?.partial[1]).toBe(
      JSON.stringify(
        apply(apply(base, "p2", moves.p2), "p1", moves.p1 as TankArenaMove),
      ),
    );
  });
});

describe("round clock", () => {
  test("follows the select, battle start, and replay allowances", () => {
    const selecting = engine.createInitialState(seats(2), {
      config: {},
      seed: 1,
    });
    expect(engine.roundTimeMs?.(selecting)).toBe(SELECT_MS);
    const first = duel();
    expect(engine.roundOf?.(first)).toBe(1);
    expect(engine.roundTimeMs?.(first)).toBe(FIRST_PLANNING_MS);
    const second = idleRound(first);
    expect(engine.roundOf?.(second)).toBe(2);
    const steps = second.resolution?.steps ?? 0;
    expect(steps).toBeGreaterThan(0);
    expect(engine.roundTimeMs?.(second)).toBe(
      PLANNING_MS + Math.round((steps * 1000) / 60) + RESULTS_MS,
    );
    expect(engine.pendingRoles?.(second)).toEqual(["p1", "p2"]);
  });
});

describe("cooldowns", () => {
  test("a special returns N + 1 rounds after use", () => {
    let state = duel();
    state = lockAll(state, { p1: lock(1, "specialA", 120, 0.3) });
    expect(cooldownsOf(state, "p1")).toEqual({ specialA: 3, specialB: 0 });
    for (const round of [2, 3, 4]) {
      expect(canUse(state, "p1", "specialA")).toBe(false);
      expect(rejection(state, "p1", lock(round, "specialA"))).toBe(
        "Special A is cooling down",
      );
      state = idleRound(state);
    }
    expect(state.round).toBe(5);
    expect(cooldownsOf(state, "p1")).toEqual({ specialA: 0, specialB: 0 });
    expect(canUse(state, "p1", "specialA")).toBe(true);
    state = lockAll(state, { p1: lock(5, "specialB", 90, 0.3) });
    expect(cooldownsOf(state, "p1")).toEqual({ specialA: 0, specialB: 2 });
  });

  test("coolant clears cooldowns, including one used this round", () => {
    const state = withTanks(duel(), (t) =>
      t.role === "p1" ? { ...t, cooldowns: { specialA: 0, specialB: 2 } } : t,
    );
    const withCoolant: TankArenaState = {
      ...state,
      pickups: [{ id: 50, kind: "coolant", x: 19, y: 1 }],
    };
    const next = lockAll(withCoolant, { p1: lock(1, "specialA", 120, 0.3) });
    expect(next.resolution?.collected).toEqual([
      { role: "p1", kind: "coolant" },
    ]);
    expect(cooldownsOf(next, "p1")).toEqual({ specialA: 0, specialB: 0 });
    expect(next.pickups).toEqual([]);
  });

  test("plating lasts two full rounds after pickup", () => {
    const state: TankArenaState = {
      ...duel(),
      pickups: [{ id: 51, kind: "plating", x: 19, y: 1 }],
    };
    let next = idleRound(state);
    expect(next.tanks[0]?.effects.platingRounds).toBe(2);
    next = idleRound(next);
    expect(next.tanks[0]?.effects.platingRounds).toBe(1);
    next = idleRound(next);
    expect(next.tanks[0]?.effects.platingRounds).toBe(0);
  });
});

describe("timeouts", () => {
  test("auto-locks idle and forfeits after three strikes", () => {
    const state = duel();
    expect(engine.autoMove?.(state, "p1", 0)).toEqual(lock(1, "idle", 90, 0.5));
    expect(engine.autoMove?.(state, "p1", 2)).toEqual(lock(1, "idle", 90, 0.5));
    const forfeit = engine.autoMove?.(state, "p1", 3);
    expect(forfeit).toEqual({ type: "forfeit", round: 1 });
    const low = withTanks(state, (t) =>
      t.role === "p1" ? { ...t, hp: 1 } : t,
    );
    const after = apply(apply(low, "p1", forfeit), "p2", lock(1, "idle"));
    expect(after.phase).toBe("finished");
    expect(after.outcome).toEqual({ winnerRoles: ["p2"], draw: false });
    expect(after.eliminated).toEqual([
      { role: "p1", round: 1, cause: "forfeit" },
    ]);
    expect(after.resolution?.eliminated).toEqual([
      { role: "p1", cause: "forfeit" },
    ]);
  });
});

describe("outcomes", () => {
  test("a team wins with its fallen members", () => {
    let state = withTanks(
      started(["kestrel", "kestrel", "kestrel", "kestrel"], { teams: true }),
      (t, i) => {
        const xs = [19, 27, 7, 45];
        return { ...t, x: xs[i] ?? 0, hp: i === 1 ? 5 : t.hp };
      },
    );
    state = withTanks(state, (t) =>
      t.role === "p3" ? { ...t, alive: false, hp: 0 } : t,
    );
    state = withTanks(state, (t) =>
      t.role === "p4" ? { ...t, alive: false, hp: 0 } : t,
    );
    expect(aliveTeams(state)).toEqual(["A", "B"]);
    expect(roleTeam(state, "p2")).toBe("B");
    const result = reduce(
      apply(state, "p1", lock(1, "missile", 0, 1)),
      "p2",
      lock(1, "idle"),
    );
    expect(result.ok && result.outcome).toEqual({
      status: "completed",
      winnerRoles: ["p1", "p3"],
      draw: false,
    });
  });

  test("an FFA ends when one tank remains", () => {
    const state = withTanks(duel(), (t) =>
      t.role === "p2" ? { ...t, hp: 10 } : t,
    );
    const result = reduce(
      apply(state, "p1", lock(1, "missile", 0, 1)),
      "p2",
      lock(1, "idle"),
    );
    expect(result.ok && result.outcome).toEqual({
      status: "completed",
      winnerRoles: ["p1"],
      draw: false,
    });
    if (result.ok)
      expect(result.state.eliminated).toEqual([
        { role: "p2", round: 1, cause: "destroyed" },
      ]);
  });

  test("simultaneous elimination is a draw", () => {
    const state = withTanks(duel(), (t) => ({ ...t, hp: 5 }));
    const result = reduce(
      apply(state, "p1", lock(1, "missile", 0, 1)),
      "p2",
      lock(1, "missile", 180, 1),
    );
    expect(result.ok && result.outcome).toEqual({
      status: "completed",
      winnerRoles: ["p1", "p2"],
      draw: true,
    });
  });

  test("an all-dead draw is shared only by tanks alive at round start", () => {
    let state = withTanks(started(["kestrel", "bastion", "kestrel"]), (t, i) =>
      i === 0
        ? tank("p1", "kestrel", 19, { hp: 5 })
        : i === 1
          ? tank("p2", "bastion", 27, { hp: 5 })
          : { ...t, alive: false, hp: 0 },
    );
    state = apply(state, "p1", lock(1, "missile", 0, 1));
    const result = reduce(state, "p2", lock(1, "missile", 180, 1));
    expect(result.ok && result.outcome).toEqual({
      status: "completed",
      winnerRoles: ["p1", "p2"],
      draw: true,
    });
  });

  test("round 40 ends with the healthiest team, or a draw on equal health", () => {
    const late = (hp: [number, number]): TankArenaState =>
      withTanks({ ...duel(), round: 40 }, (t, i) => ({
        ...t,
        hp: hp[i] ?? t.hp,
      }));
    const win = idleRound(late([90, 80]));
    expect(win.phase).toBe("finished");
    expect(win.round).toBe(40);
    expect(win.outcome).toEqual({ winnerRoles: ["p1"], draw: false });
    const tie = idleRound(late([80, 80]));
    expect(tie.outcome).toEqual({ winnerRoles: ["p1", "p2"], draw: true });
  });
});

describe("airstrikes and spawns", () => {
  test("announces strikes one round ahead with the documented cadence", () => {
    let state = started(["kestrel", "kestrel"], { seed: 9 });
    const announced: number[] = [];
    while (state.phase === "plan" && state.round <= 26) {
      if (state.airstrike) {
        expect(state.airstrike.round).toBe(state.round);
        announced.push(state.round);
        expect(state.airstrike.columns).toHaveLength(
          (3 + state.modules) * (state.round >= 25 ? 2 : 1),
        );
      }
      state = withTanks(idleRound(state), (t) =>
        t.alive ? { ...t, hp: TANKS.kestrel.maxHp } : t,
      );
      state = { ...state, mines: [] };
    }
    expect(announced).toEqual([
      6, 9, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
    ]);
  });

  test("spawns pickups on even rounds and mines every third round", () => {
    let state = started(["kestrel", "kestrel"], { seed: 4 });
    const pickupRounds: number[] = [];
    const mineRounds: number[] = [];
    for (let round = 1; round <= 6; round++) {
      const before = state;
      state = idleRound(state);
      if (state.pickups.length > before.pickups.length)
        pickupRounds.push(round);
      if (state.mines.length > before.mines.length) mineRounds.push(round);
    }
    expect(pickupRounds).toEqual([2, 4, 6]);
    expect(mineRounds).toEqual([3, 6]);
    expect(state.pickups.length).toBeLessThanOrEqual(3);
    for (const mine of state.mines)
      for (const t of state.tanks) {
        const dx = Math.abs(mine.x - t.x);
        const wrapped = Math.min(dx, state.modules * 32 - dx);
        expect(Math.hypot(wrapped, mine.y - t.y)).toBeGreaterThanOrEqual(4);
      }
  });
});

describe("state serialization", () => {
  test("round-trips through JSON and the schema exactly", () => {
    let state = started(["kestrel", "bastion", "kestrel", "bastion"], {
      teams: true,
      seed: 21,
    });
    for (let round = 1; round <= 7 && state.phase === "plan"; round++)
      state = lockAll(state, {
        p1: lock(round, "missile", 40, 0.7),
        p2: lock(round, "missile", 140, 0.65),
        p3: lock(round, "jump", 70, 0.4),
      });
    const text = JSON.stringify(state);
    const parsed = tankArenaStateSchema.parse(JSON.parse(text));
    expect(parsed).toEqual(state);
    expect(JSON.stringify(parsed)).toBe(text);
    expect(text.includes("-0,")).toBe(false);
    for (const t of state.tanks)
      for (const value of [t.x, t.y, t.vx, t.vy, t.hp])
        expect(Math.round(value * 10_000) / 10_000).toBe(value);
  });

  test("move schema accepts every move the engine produces", () => {
    const state = duel();
    for (const strikes of [0, 3])
      expect(
        tankArenaMoveSchema.safeParse(engine.autoMove?.(state, "p1", strikes))
          .success,
      ).toBe(true);
  });
});
