import type {
  BotDifficulty,
  Seat,
  TankAction,
  TankArenaMine,
  TankArenaMove,
  TankArenaPickup,
  TankArenaPlan,
  TankArenaState,
  TankArenaTank,
  TankKind,
  TankPlanAction,
} from "@kyzen/shared/types";
import {
  type RoundInput,
  simulateRound,
  TANKS,
  tankArenaEngine,
} from "../src/index";

export const engine = tankArenaEngine;

export function tank(
  role: string,
  kind: TankKind,
  x: number,
  overrides: Partial<TankArenaTank> = {},
): TankArenaTank {
  return {
    role,
    kind,
    x,
    y: TANKS[kind].halfHeight,
    vx: 0,
    vy: 0,
    hp: TANKS[kind].maxHp,
    alive: true,
    fell: false,
    forfeited: false,
    cooldowns: { specialA: 0, specialB: 0 },
    effects: { overcharge: false, platingRounds: 0 },
    ...overrides,
  };
}

export function plan(
  action: TankPlanAction,
  angle = 90,
  power = 0.5,
): TankArenaPlan {
  return { action, angle, power };
}

export function input(
  tanks: TankArenaTank[],
  plans: Record<string, TankArenaPlan>,
  options: {
    seed?: number;
    round?: number;
    modules?: number;
    teams?: Record<string, string>;
    pickups?: TankArenaPickup[];
    mines?: TankArenaMine[];
    airstrike?: RoundInput["airstrike"];
  } = {},
): RoundInput {
  return {
    seed: options.seed ?? 1,
    round: options.round ?? 1,
    modules: options.modules ?? 2,
    seats: tanks.map((t) => ({
      role: t.role,
      team: options.teams?.[t.role] ?? t.role,
    })),
    tanks,
    pickups: options.pickups ?? [],
    mines: options.mines ?? [],
    airstrike: options.airstrike ?? null,
    plans,
  };
}

export function run(
  tanks: TankArenaTank[],
  plans: Record<string, TankArenaPlan>,
  options: Parameters<typeof input>[2] = {},
) {
  return simulateRound(input(tanks, plans, options));
}

export function seats(
  count: number,
  options: { teams?: boolean; bots?: BotDifficulty | null } = {},
): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    role: `p${i + 1}`,
    team: options.teams ? (i % 2 === 0 ? "A" : "B") : `p${i + 1}`,
    bot: options.bots ?? null,
  }));
}

export function apply(
  state: TankArenaState,
  role: string,
  move: unknown,
): TankArenaState {
  const result = engine.reduce?.(state, { role }, move as TankArenaMove);
  if (!result?.ok)
    throw new Error(`move rejected: ${result ? result.error : "no reduce"}`);
  return result.state;
}

export function started(
  kinds: TankKind[],
  options: { seed?: number; teams?: boolean } = {},
): TankArenaState {
  let state = engine.createInitialState(
    seats(kinds.length, { teams: options.teams }),
    { config: {}, seed: options.seed ?? 42 },
  );
  kinds.forEach((kind, i) => {
    state = apply(state, `p${i + 1}`, { type: "select", round: 0, tank: kind });
  });
  return state;
}

export function lock(
  round: number,
  action: TankAction,
  angle = 90,
  power = 0.5,
): TankArenaMove {
  return { type: "lock", round, action, angle, power };
}

export function lockAll(
  state: TankArenaState,
  moves: Record<string, TankArenaMove>,
): TankArenaState {
  let next = state;
  for (const role of engine.pendingRoles?.(state) ?? [])
    next = apply(next, role, moves[role] ?? lock(state.round, "idle"));
  return next;
}

export function withTanks(
  state: TankArenaState,
  edit: (tank: TankArenaTank, index: number) => TankArenaTank,
): TankArenaState {
  return { ...state, tanks: state.tanks.map(edit) };
}

export function idleRound(state: TankArenaState): TankArenaState {
  return lockAll(state, {});
}
