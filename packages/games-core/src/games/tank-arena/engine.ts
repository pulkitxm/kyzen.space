import { TANK_ARENA } from "@kyzen/shared/constants";
import {
  type GameEngine,
  lobbyConfigSchema,
  type Outcome,
  type ReduceResult,
  type Seat,
  type SetupOptions,
  type TankArenaAirstrike,
  type TankArenaMine,
  type TankArenaMove,
  type TankArenaPickup,
  type TankArenaPlan,
  type TankArenaResolution,
  type TankArenaState,
  type TankArenaTank,
  type TankEliminationCause,
  tankArenaMoveSchema,
} from "@kyzen/shared/types";
import { type Anchor, buildArena, modulesFor } from "./arena";
import { botMove } from "./bots";
import {
  FIRST_PLANNING_MS,
  FORFEIT_STRIKES,
  ITEM_SPACING,
  JUMP_MAX_ANGLE,
  JUMP_MIN_ANGLE,
  MAX_ROUND,
  MIN_POWER,
  MINE_TANK_CLEARANCE,
  MODULE_WIDTH,
  PICKUP_KINDS,
  PLANNING_MS,
  RESULTS_MS,
  SELECT_MS,
  STEPS_PER_SECOND,
  TANKS,
} from "./constants";
import {
  aliveTeams,
  arenaWidth,
  defaultKind,
  isJumpAction,
  roleForSeat,
  seatIndex,
  secretOf,
  teamsOf,
} from "./helpers";
import {
  ceilDiv,
  deriveSecret,
  round4,
  secretRng,
  secretWord,
  wrapDelta,
  wrapX,
} from "./math";
import { type RoundInput, simulateRound } from "./simulate";

type State = TankArenaState;
type Move = TankArenaMove;

function rolesOfTeams(state: State, teams: readonly string[]): string[] {
  return state.seats
    .filter((seat) => teams.includes(seat.team))
    .map((seat) => seat.role);
}

export function isStrikeRound(round: number): boolean {
  return (round >= 6 && round % 3 === 0) || round >= 15;
}

export function airstrikeFor(
  secret: readonly number[],
  modules: number,
  round: number,
): TankArenaAirstrike {
  const count = (3 + modules) * (round >= 25 ? 2 : 1);
  const spacing = (modules * MODULE_WIDTH) / count;
  const offset = secretRng(secret, round, "airstrike")() * spacing;
  return {
    round,
    columns: Array.from({ length: count }, (_, i) =>
      round4(offset + i * spacing),
    ),
  };
}

function interleave(seats: readonly Seat[]): number[] {
  const teams: string[] = [];
  const members = new Map<string, number[]>();
  seats.forEach((seat, index) => {
    const list = members.get(seat.team);
    if (list) list.push(index);
    else {
      teams.push(seat.team);
      members.set(seat.team, [index]);
    }
  });
  const order: number[] = [];
  for (let depth = 0; order.length < seats.length; depth++)
    for (const team of teams) {
      const index = members.get(team)?.[depth];
      if (index !== undefined) order.push(index);
    }
  return order;
}

function createInitialState(seats: Seat[], options: SetupOptions): State {
  const secret = deriveSecret(options.seed);
  const modules = modulesFor(seats.length);
  const slots = buildArena(modules).spawnSlots;
  const offset = Math.floor(secretRng(secret, 0, "spawn")() * slots.length);
  const xs: number[] = new Array(seats.length).fill(0);
  interleave(seats).forEach((seatIdx, order) => {
    const slot =
      slots[
        (Math.floor((order * slots.length) / seats.length) + offset) %
          slots.length
      ];
    xs[seatIdx] = slot?.x ?? 0;
  });
  return {
    version: 1,
    secret,
    round: 0,
    phase: "select",
    modules,
    seats: seats.map((seat) => ({
      role: seat.role,
      team: seat.team,
      bot: seat.bot,
    })),
    tanks: seats.map((seat, index) => ({
      role: seat.role,
      kind: null,
      x: xs[index] ?? 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 0,
      alive: true,
      fell: false,
      forfeited: false,
      cooldowns: { specialA: 0, specialB: 0 },
      effects: { overcharge: false, platingRounds: 0 },
    })),
    pickups: [],
    mines: [],
    nextId: 1,
    airstrike: null,
    submitted: [],
    plans: {},
    resolution: null,
    eliminated: [],
    outcome: null,
  };
}

function pendingRoles(state: State): string[] {
  if (state.phase === "finished") return [];
  return state.tanks
    .filter((tank) => tank.alive && !state.submitted.includes(tank.role))
    .map((tank) => tank.role);
}

export function replayMs(steps: number): number {
  return Math.round((steps * 1000) / STEPS_PER_SECOND) + RESULTS_MS;
}

function roundTimeMs(state: State): number {
  if (state.phase === "select") return SELECT_MS;
  if (state.round <= 1 || !state.resolution) return FIRST_PLANNING_MS;
  return PLANNING_MS + replayMs(state.resolution.steps);
}

function outcomeOf(state: State): Outcome {
  return state.outcome
    ? {
        status: "completed",
        winnerRoles: [...state.outcome.winnerRoles],
        draw: state.outcome.draw,
      }
    : { status: "active" };
}

function decideOutcome(
  state: State,
  startTeams: readonly string[],
  tanks: readonly TankArenaTank[],
  round: number,
): State["outcome"] {
  const alive = teamsOf(state, tanks);
  if (alive.length === 1)
    return { winnerRoles: rolesOfTeams(state, alive), draw: false };
  if (alive.length === 0)
    return { winnerRoles: rolesOfTeams(state, startTeams), draw: true };
  if (round < MAX_ROUND) return null;
  const totals = alive.map((team) =>
    tanks.reduce(
      (sum, tank, index) =>
        tank.alive && state.seats[index]?.team === team ? sum + tank.hp : sum,
      0,
    ),
  );
  const best = Math.max(...totals);
  const leaders = alive.filter((_, index) => totals[index] === best);
  return {
    winnerRoles: rolesOfTeams(state, leaders),
    draw: leaders.length > 1,
  };
}

export function roundInputOf(
  state: Pick<State, "modules" | "seats">,
  resolution: Pick<TankArenaResolution, "round" | "seed" | "before" | "plans">,
): RoundInput {
  return {
    seed: resolution.seed,
    round: resolution.round,
    modules: state.modules,
    seats: state.seats,
    tanks: resolution.before.tanks,
    pickups: resolution.before.pickups,
    mines: resolution.before.mines,
    airstrike: resolution.before.airstrike,
    plans: resolution.plans,
  };
}

export function resolutionInput(state: State): RoundInput | null {
  return state.resolution ? roundInputOf(state, state.resolution) : null;
}

type Point = { x: number; y: number };

function moduleBuckets(points: readonly Point[], modules: number): Point[][] {
  const buckets: Point[][] = Array.from({ length: modules }, () => []);
  for (const point of points)
    buckets[Math.min(modules - 1, Math.floor(point.x / MODULE_WIDTH))]?.push(
      point,
    );
  return buckets;
}

function near(width: number, a: Point, b: Point, distance: number): boolean {
  const dx = wrapDelta(a.x, b.x, width);
  const dy = b.y - a.y;
  return dx * dx + dy * dy < distance * distance;
}

function freeAnchors(
  state: State,
  anchors: readonly Anchor[],
  tanks: readonly TankArenaTank[],
  items: readonly Point[],
  clearance: number,
): Anchor[] {
  const width = arenaWidth(state);
  const living = moduleBuckets(
    tanks.filter((tank) => tank.alive),
    state.modules,
  );
  const placed = moduleBuckets(items, state.modules);
  return anchors.filter((anchor) => {
    const home = Math.floor(anchor.x / MODULE_WIDTH);
    for (const offset of [-1, 0, 1]) {
      const m = (home + offset + state.modules) % state.modules;
      if (living[m]?.some((tank) => near(width, anchor, tank, clearance)))
        return false;
      if (placed[m]?.some((item) => near(width, anchor, item, ITEM_SPACING)))
        return false;
    }
    return true;
  });
}

function spawnItems(
  state: State,
  round: number,
  tanks: readonly TankArenaTank[],
  pickups: TankArenaPickup[],
  mines: TankArenaMine[],
  nextId: number,
): number {
  const players = state.seats.length;
  const width = arenaWidth(state);
  const arena = buildArena(state.modules);
  let id = nextId;
  if (round >= 2 && round % 2 === 0) {
    const rng = secretRng(secretOf(state), round, "pickups");
    const cap = 2 + Math.floor(players / 2);
    const count = Math.min(ceilDiv(players, 4), cap - pickups.length);
    let free = freeAnchors(
      state,
      arena.pickupAnchors,
      tanks,
      [...pickups, ...mines],
      ITEM_SPACING,
    );
    for (let i = 0; i < count; i++) {
      const anchor = free[Math.floor(rng() * free.length)];
      const kind = PICKUP_KINDS[Math.floor(rng() * PICKUP_KINDS.length)];
      if (!anchor || !kind) break;
      pickups.push({ id: id++, kind, x: anchor.x, y: anchor.y });
      free = free.filter((other) => !near(width, other, anchor, ITEM_SPACING));
    }
  }
  if (round >= 3 && round % 3 === 0) {
    const rng = secretRng(secretOf(state), round, "mines");
    const count = ceilDiv(players, 4);
    let free = freeAnchors(
      state,
      arena.mineAnchors,
      tanks,
      [...pickups, ...mines],
      MINE_TANK_CLEARANCE,
    );
    for (let i = 0; i < count; i++) {
      const anchor = free[Math.floor(rng() * free.length)];
      if (!anchor) break;
      mines.push({ id: id++, x: anchor.x, y: anchor.y });
      free = free.filter((other) => !near(width, other, anchor, ITEM_SPACING));
    }
  }
  return id;
}

function finishSelect(state: State): State {
  const eliminated: State["eliminated"] = [];
  const tanks = state.tanks.map((tank, index) => {
    const kind = tank.kind ?? defaultKind(index);
    const spec = TANKS[kind];
    const forfeited = state.plans[tank.role]?.action === "forfeit";
    if (forfeited)
      eliminated.push({ role: tank.role, round: 0, cause: "forfeit" });
    return {
      ...tank,
      kind,
      y: spec.halfHeight,
      hp: forfeited ? 0 : spec.maxHp,
      alive: !forfeited,
      forfeited,
    };
  });
  const startTeams = aliveTeams(state);
  const outcome = decideOutcome(state, startTeams, tanks, 0);
  return {
    ...state,
    round: outcome ? 0 : 1,
    phase: outcome ? "finished" : "plan",
    tanks,
    submitted: [],
    plans: {},
    eliminated: [...state.eliminated, ...eliminated],
    outcome,
  };
}

function settleTank(
  tank: TankArenaTank,
  width: number,
): Pick<TankArenaTank, "x" | "y" | "vx" | "vy"> {
  return {
    x: wrapX(round4(tank.x), width),
    y: round4(tank.y),
    vx: round4(tank.vx),
    vy: round4(tank.vy),
  };
}

function resolveRound(state: State): State {
  const round = state.round;
  const width = arenaWidth(state);
  const plans: Record<string, TankArenaPlan> = {};
  for (const tank of state.tanks) {
    const plan = state.plans[tank.role];
    if (tank.alive && plan) plans[tank.role] = plan;
  }
  const before: TankArenaResolution["before"] = {
    tanks: state.tanks,
    pickups: state.pickups,
    mines: state.mines,
    airstrike: state.airstrike,
  };
  const seed = secretWord(secretOf(state), round, "round");
  const result = simulateRound(
    roundInputOf(state, { round, seed, before, plans }),
  );
  const outputs = new Map(result.tanks.map((tank) => [tank.role, tank]));
  const eliminatedNow: { role: string; cause: TankEliminationCause }[] = [];
  const tanks = state.tanks.map((tank): TankArenaTank => {
    const out = outputs.get(tank.role);
    if (!out) return tank;
    const cause: TankEliminationCause | null = out.forfeited
      ? "forfeit"
      : out.fell
        ? "fell"
        : out.hp <= 0
          ? "destroyed"
          : null;
    const moved = settleTank({ ...tank, ...out }, width);
    const next: TankArenaTank = {
      ...tank,
      ...moved,
      hp: round4(Math.max(0, out.hp)),
      cooldowns: {
        specialA: Math.max(0, out.cooldowns.specialA - 1),
        specialB: Math.max(0, out.cooldowns.specialB - 1),
      },
      effects: {
        overcharge: out.effects.overcharge,
        platingRounds: out.collectedPlating
          ? out.effects.platingRounds
          : Math.max(0, out.effects.platingRounds - 1),
      },
    };
    if (!cause) return next;
    eliminatedNow.push({ role: tank.role, cause });
    return {
      ...next,
      hp: 0,
      vx: 0,
      vy: 0,
      alive: false,
      fell: out.fell,
      forfeited: out.forfeited,
    };
  });
  const damage = new Map<string, number>();
  const collected: TankArenaResolution["collected"] = [];
  for (const event of result.events) {
    if (event.type === "damage")
      damage.set(event.role, (damage.get(event.role) ?? 0) + event.amount);
    else if (event.type === "pickup")
      collected.push({ role: event.role, kind: event.kind });
  }
  const pickups = result.pickups.map((pickup) => ({ ...pickup }));
  const mines = result.mines.map((mine) => ({ ...mine }));
  const nextId = spawnItems(state, round, tanks, pickups, mines, state.nextId);
  const startTeams = aliveTeams(state);
  const outcome = decideOutcome(state, startTeams, tanks, round);
  const finished = outcome !== null;
  return {
    ...state,
    round: finished ? round : round + 1,
    phase: finished ? "finished" : "plan",
    tanks,
    pickups,
    mines,
    nextId,
    airstrike:
      !finished && isStrikeRound(round + 1)
        ? airstrikeFor(secretOf(state), state.modules, round + 1)
        : null,
    submitted: [],
    plans: {},
    resolution: {
      round,
      seed,
      steps: result.steps,
      before,
      plans,
      damage: state.seats
        .filter((seat) => (damage.get(seat.role) ?? 0) > 0)
        .map((seat) => ({
          role: seat.role,
          amount: damage.get(seat.role) ?? 0,
        })),
      collected,
      eliminated: eliminatedNow,
    },
    eliminated: [
      ...state.eliminated,
      ...eliminatedNow.map((entry) => ({
        role: entry.role,
        round,
        cause: entry.cause,
      })),
    ],
    outcome,
  };
}

function reject(error: string): ReduceResult<State> {
  return { ok: false, error };
}

function reduce(
  state: State,
  role: string,
  input: unknown,
): ReduceResult<State> {
  if (state.phase === "finished") return reject("The game is finished");
  const index = seatIndex(state, role);
  const tank = state.tanks[index];
  if (index < 0 || !tank) return reject("Not a player in this game");
  const parsed = tankArenaMoveSchema.safeParse(input);
  if (!parsed.success) return reject("Invalid move");
  const move = parsed.data;
  if (!tank.alive) return reject("Your tank has been eliminated");
  if (move.type === "select" && state.phase !== "select")
    return reject("Tank selection is over");
  if (move.type === "lock" && state.phase === "select")
    return reject("Choose a tank before locking a plan");
  if (move.round < state.round) return reject("That round is already over");
  if (move.round > state.round) return reject("That round has not started");
  if (
    state.submitted.includes(role) &&
    (move.type !== "forfeit" || state.plans[role]?.action === "forfeit")
  )
    return reject("You already submitted this round");
  if (move.type === "lock") {
    if (move.action === "specialA" && tank.cooldowns.specialA > 0)
      return reject("Special A is cooling down");
    if (move.action === "specialB" && tank.cooldowns.specialB > 0)
      return reject("Special B is cooling down");
    if (
      isJumpAction(tank.kind, move.action) &&
      (move.angle < JUMP_MIN_ANGLE || move.angle > JUMP_MAX_ANGLE)
    )
      return reject("Jump angle must point upward (10 to 170 degrees)");
  }
  const submitted = state.seats
    .map((seat) => seat.role)
    .filter((other) => other === role || state.submitted.includes(other));
  let next: State;
  if (move.type === "select") {
    next = {
      ...state,
      submitted,
      tanks: state.tanks.map((other, i) =>
        i === index ? { ...other, kind: move.tank } : other,
      ),
    };
  } else {
    const plan: TankArenaPlan =
      move.type === "lock"
        ? {
            action: move.action,
            angle: round4(move.angle),
            power: round4(move.power),
          }
        : { action: "forfeit", angle: 90, power: MIN_POWER };
    const plans: Record<string, TankArenaPlan> = {};
    for (const seat of state.seats) {
      const existing = seat.role === role ? plan : state.plans[seat.role];
      if (existing) plans[seat.role] = existing;
    }
    next = { ...state, submitted, plans };
  }
  if (pendingRoles(next).length === 0)
    next = next.phase === "select" ? finishSelect(next) : resolveRound(next);
  return { ok: true, state: next, outcome: outcomeOf(next) };
}

function autoMove(state: State, role: string, strikes: number): Move {
  if (strikes >= FORFEIT_STRIKES)
    return { type: "forfeit", round: state.round };
  if (state.phase === "select")
    return {
      type: "select",
      round: 0,
      tank: defaultKind(Math.max(0, seatIndex(state, role))),
    };
  return {
    type: "lock",
    round: state.round,
    action: "idle",
    angle: 90,
    power: 0.5,
  };
}

function publicState(state: State): State {
  const { secret: _secret, ...shown } = state;
  return {
    ...shown,
    plans: {},
    tanks:
      state.phase === "select"
        ? state.tanks.map((tank) => ({ ...tank, kind: null }))
        : state.tanks,
  };
}

function publicMove(
  state: State,
  move: Move,
): Move | { type: "submitted"; round: number } {
  if (move.type === "forfeit") return move;
  if (state.phase !== "finished" && move.round === state.round)
    return { type: "submitted", round: move.round };
  return move;
}

function playerCount(config: unknown): number {
  const parsed = lobbyConfigSchema.safeParse(config);
  return parsed.success && parsed.data.mode === "teams" ? 4 : 2;
}

export const tankArenaEngine: GameEngine<State, Move> = {
  type: TANK_ARENA,
  mode: "simultaneous",
  minPlayers: 2,
  maxPlayers: Number.POSITIVE_INFINITY,
  lobby: { teams: true, bots: true },
  roleForSeat,
  createInitialState,
  reduce: (state, ctx, input) => reduce(state, ctx.role, input),
  autoMove,
  roundOf: (state) => state.round,
  pendingRoles,
  roundTimeMs,
  botMove,
  publicState,
  publicMove,
  playerCount,
};
