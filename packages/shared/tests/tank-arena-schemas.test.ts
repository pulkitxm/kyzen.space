import { describe, expect, test } from "bun:test";
import {
  lobbyConfigSchema,
  TANK_ARENA_MAX_ROUND,
  type TankArenaState,
  tankArenaConfigSchema,
  tankArenaMoveSchema,
  tankArenaStateSchema,
} from "../src/types";

function tank(role: string) {
  return {
    role,
    kind: "kestrel" as const,
    x: 7,
    y: 0.9,
    vx: 0,
    vy: 0,
    hp: 120,
    alive: true,
    fell: false,
    forfeited: false,
    cooldowns: { specialA: 0, specialB: 0 },
    effects: { overcharge: false, platingRounds: 0 },
  };
}

function state(): TankArenaState {
  return {
    version: 1,
    secret: [1, 2, 3, 4, 5, 6, 7, 4_294_967_295],
    round: 1,
    phase: "plan",
    modules: 2,
    seats: [
      { role: "p1", team: "A", bot: null },
      { role: "p2", team: "p2", bot: "hard" },
    ],
    tanks: [tank("p1"), tank("p2")],
    pickups: [{ id: 1, kind: "repair", x: 6.5, y: 9.6 }],
    mines: [{ id: 2, x: 5, y: 0.25 }],
    nextId: 3,
    airstrike: { round: 6, columns: [3, 15.8] },
    submitted: ["p1"],
    plans: { p1: { action: "missile", angle: 45, power: 0.8 } },
    resolution: null,
    eliminated: [],
    outcome: null,
  };
}

describe("tank arena move schema", () => {
  test("accepts select, lock, and forfeit moves", () => {
    for (const move of [
      { type: "select", round: 0, tank: "bastion" },
      {
        type: "lock",
        round: 3,
        action: "specialB",
        angle: -180,
        power: 0.15,
      },
      { type: "lock", round: 40, action: "idle", angle: 180, power: 1 },
      { type: "forfeit", round: 0 },
    ])
      expect(tankArenaMoveSchema.safeParse(move).success).toBe(true);
  });

  test("rejects unknown keys, actions, tanks, and out-of-range numbers", () => {
    for (const move of [
      { type: "select", round: 1, tank: "bastion" },
      { type: "select", round: 0, tank: "titan" },
      { type: "select", round: 0, tank: "bastion", extra: 1 },
      { type: "lock", round: 0, action: "missile", angle: 0, power: 0.5 },
      {
        type: "lock",
        round: TANK_ARENA_MAX_ROUND + 1,
        action: "missile",
        angle: 0,
        power: 0.5,
      },
      { type: "lock", round: 1, action: "nuke", angle: 0, power: 0.5 },
      { type: "lock", round: 1, action: "forfeit", angle: 0, power: 0.5 },
      { type: "lock", round: 1, action: "missile", angle: 181, power: 0.5 },
      { type: "lock", round: 1, action: "missile", angle: 0, power: 0.1 },
      { type: "lock", round: 1, action: "missile", angle: 0, power: 1.01 },
      {
        type: "lock",
        round: 1,
        action: "missile",
        angle: Number.NaN,
        power: 0.5,
      },
      { type: "lock", round: 1.5, action: "missile", angle: 0, power: 0.5 },
      { type: "lock", round: 1, action: "missile", angle: 0 },
      { type: "forfeit", round: -1 },
      { type: "forfeit", round: 2, reason: "bored" },
      { type: "move", round: 1 },
      null,
    ])
      expect(tankArenaMoveSchema.safeParse(move).success).toBe(false);
  });
});

describe("tank arena state schema", () => {
  test("accepts a well-formed state and its JSON round trip", () => {
    const value = state();
    const parsed = tankArenaStateSchema.parse(
      JSON.parse(JSON.stringify(value)),
    );
    expect(parsed).toEqual(value);
  });

  test("accepts public states without the secret", () => {
    const { secret: _secret, ...shown } = state();
    expect(tankArenaStateSchema.safeParse(shown).success).toBe(true);
  });

  test("does not cap the player count", () => {
    const count = 1000;
    const roles = Array.from({ length: count }, (_, i) => `p${i + 1}`);
    const value = {
      ...state(),
      modules: count / 2,
      seats: roles.map((role) => ({ role, team: role, bot: null })),
      tanks: roles.map((role) => ({ ...tank(role), x: 31_990 })),
      submitted: roles,
      airstrike: {
        round: 6,
        columns: Array.from({ length: 503 }, (_, i) => i * 63),
      },
      pickups: Array.from({ length: 502 }, (_, i) => ({
        id: i,
        kind: "repair" as const,
        x: i * 63,
        y: 1,
      })),
      mines: Array.from({ length: 2500 }, (_, i) => ({
        id: 600 + i,
        x: i * 12,
        y: 0.25,
      })),
      nextId: 5_000_000,
    };
    expect(tankArenaStateSchema.safeParse(value).success).toBe(true);
  });

  test("is strict at every level", () => {
    const value = state();
    const variants: unknown[] = [
      { ...value, extra: true },
      { ...value, seed: 12 },
      { ...value, secret: [1, 2, 3] },
      { ...value, secret: [1, 2, 3, 4, 5, 6, 7, 2 ** 32] },
      { ...value, version: 2 },
      { ...value, phase: "replay" },
      { ...value, round: 41 },
      { ...value, modules: 1 },
      { ...value, seats: [] },
      { ...value, tanks: [{ ...tank("p1"), turbo: true }] },
      { ...value, tanks: [{ ...tank("p1"), hp: 161 }] },
      { ...value, tanks: [{ ...tank("p1"), kind: "titan" }] },
      { ...value, tanks: [{ ...tank("p1"), role: "X" }] },
      {
        ...value,
        tanks: [{ ...tank("p1"), cooldowns: { specialA: -1, specialB: 0 } }],
      },
      {
        ...value,
        tanks: [
          { ...tank("p1"), effects: { overcharge: false, platingRounds: 3 } },
        ],
      },
      { ...value, pickups: [{ id: 1, kind: "nitro", x: 0, y: 0 }] },
      { ...value, mines: [{ id: 1, x: 0, y: 0, armed: true }] },
      { ...value, airstrike: { round: 6, columns: [] } },
      { ...value, plans: { p1: { action: "missile", angle: 45 } } },
      { ...value, plans: { bad: { action: "idle", angle: 0, power: 0.5 } } },
      { ...value, seats: [{ role: "p1", team: "a", bot: null }] },
      { ...value, seats: [{ role: "p1", team: "A", bot: "expert" }] },
      { ...value, outcome: { winnerRoles: ["p1"] } },
      { ...value, eliminated: [{ role: "p1", round: 1, cause: "melted" }] },
      { ...value, tanks: [{ ...tank("p1"), x: Number.POSITIVE_INFINITY }] },
    ];
    for (const variant of variants)
      expect(tankArenaStateSchema.safeParse(variant).success).toBe(false);
  });

  test("bounds the stored resolution", () => {
    const value = state();
    const resolution = {
      round: 1,
      seed: 3_000_000_000,
      steps: 120,
      before: {
        tanks: value.tanks,
        pickups: value.pickups,
        mines: value.mines,
        airstrike: null,
      },
      plans: value.plans,
      damage: [{ role: "p2", amount: 21 }],
      collected: [{ role: "p1", kind: "repair" }],
      eliminated: [{ role: "p2", cause: "fell" }],
    };
    expect(
      tankArenaStateSchema.safeParse({ ...value, resolution }).success,
    ).toBe(true);
    for (const broken of [
      { ...resolution, steps: 0 },
      { ...resolution, steps: 901 },
      { ...resolution, damage: [{ role: "p2", amount: 2.5 }] },
      { ...resolution, before: { ...resolution.before, extra: 1 } },
      { ...resolution, events: [] },
      { ...resolution, seed: -1 },
      { ...resolution, seed: 2 ** 32 },
    ])
      expect(
        tankArenaStateSchema.safeParse({ ...value, resolution: broken })
          .success,
      ).toBe(false);
  });
});

describe("tank arena config schema", () => {
  test("is the shared lobby config", () => {
    expect(tankArenaConfigSchema).toBe(lobbyConfigSchema);
    expect(tankArenaConfigSchema.parse({ mode: "teams" })).toEqual({
      mode: "teams",
      teams: {},
      bots: [],
    });
    expect(tankArenaConfigSchema.safeParse({ mode: "duel" }).success).toBe(
      false,
    );
  });
});
