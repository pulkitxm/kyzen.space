import type {
  BotDifficulty,
  GameDefinition,
  GameEngine,
  Outcome,
  Seat,
} from "@kyzen/shared/types";
import { lobbyConfigSchema } from "@kyzen/shared/types";

export const FAKE_ROUNDS = "fake-rounds";
export const ROUND_MS = 10_000;
export const REPLAY_MS = 2_000;
export const LEAVE = -99;

export type FakeMove = { round: number; value: number };

export type FakeState = {
  round: number;
  rounds: number;
  seed: number;
  seats: Seat[];
  locked: Record<string, number>;
  scores: Record<string, number>;
  out: string[];
  over: boolean;
};

type Parser<T> = GameDefinition<T, unknown, unknown>["stateSchema"];

function parser<T>(check: (value: unknown) => T | null): Parser<T> {
  return {
    safeParse(value: unknown) {
      const data = check(value);
      return data === null
        ? { success: false, error: new Error("invalid") }
        : { success: true, data };
    },
    parse(value: unknown) {
      const data = check(value);
      if (data === null) throw new Error("invalid");
      return data;
    },
  } as unknown as Parser<T>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function outcomeOf(state: FakeState): Outcome {
  if (!state.over) return { status: "active" };
  const totals = new Map<string, number>();
  for (const seat of state.seats)
    totals.set(
      seat.team,
      (totals.get(seat.team) ?? 0) + (state.scores[seat.role] ?? 0),
    );
  const best = Math.max(...totals.values());
  const leaders = new Set(
    [...totals.entries()]
      .filter(([, total]) => total === best)
      .map(([team]) => team),
  );
  if (leaders.size === totals.size)
    return { status: "completed", winnerRoles: [], draw: true };
  return {
    status: "completed",
    winnerRoles: state.seats
      .filter((seat) => leaders.has(seat.team))
      .map((seat) => seat.role),
    draw: leaders.size > 1,
  };
}

export const fakeRoundsEngine: GameEngine<FakeState, FakeMove> = {
  type: FAKE_ROUNDS,
  mode: "simultaneous",
  minPlayers: 2,
  maxPlayers: 4,
  lobby: { teams: true, bots: true },

  roleForSeat(index) {
    return `P${index + 1}`;
  },

  createInitialState(seats, { config, seed }) {
    const rounds =
      isObject(config) && typeof config.rounds === "number" ? config.rounds : 2;
    return {
      round: 1,
      rounds,
      seed,
      seats: seats.map((seat) => ({ ...seat })),
      locked: {},
      scores: Object.fromEntries(seats.map((seat) => [seat.role, 0])),
      out: [],
      over: false,
    };
  },

  reduce(state, ctx, input) {
    if (state.over) return { ok: false, error: "Game is over" };
    if (!state.seats.some((seat) => seat.role === ctx.role))
      return { ok: false, error: "Not a player" };
    if (state.out.includes(ctx.role)) return { ok: false, error: "Out" };
    if (input.round !== state.round) return { ok: false, error: "Stale round" };
    if (ctx.role in state.locked) return { ok: false, error: "Already locked" };
    const locked = { ...state.locked, [ctx.role]: input.value };
    const out =
      input.value === LEAVE ? [...state.out, ctx.role] : [...state.out];
    if (
      state.seats.some(
        (seat) => !(seat.role in locked) && !out.includes(seat.role),
      )
    ) {
      const next = { ...state, locked, out };
      return { ok: true, state: next, outcome: outcomeOf(next) };
    }
    const scores = { ...state.scores };
    for (const [role, value] of Object.entries(locked))
      if (value !== LEAVE) scores[role] = (scores[role] ?? 0) + value;
    const next: FakeState = {
      ...state,
      round: state.round + 1,
      locked: {},
      scores,
      out,
      over: state.round >= state.rounds,
    };
    return { ok: true, state: next, outcome: outcomeOf(next) };
  },

  pendingRoles(state) {
    if (state.over) return [];
    return state.seats
      .map((seat) => seat.role)
      .filter((role) => !(role in state.locked) && !state.out.includes(role));
  },

  resultDelayMs(state) {
    return state.round > 1 ? REPLAY_MS : 0;
  },

  roundOf(state) {
    return state.round;
  },

  roundTimeMs(state) {
    return ROUND_MS + (state.round > 1 ? REPLAY_MS : 0);
  },

  autoMove(state, _role, strikes) {
    return { round: state.round, value: strikes >= 2 ? -1 : 0 };
  },

  botMove(state, _role, difficulty: BotDifficulty) {
    return { round: state.round, value: difficulty === "hard" ? 3 : 1 };
  },

  publicState(state) {
    return {
      round: state.round,
      scores: state.scores,
      seats: state.seats,
      locked: Object.keys(state.locked),
      over: state.over,
    };
  },

  publicMove(state, move) {
    return move.round >= state.round && !state.over
      ? { round: move.round, locked: true }
      : move;
  },

  playerCount(config) {
    return isObject(config) && config.mode === "teams" ? 4 : 2;
  },
};

const stateSchema = parser<FakeState>((value) =>
  isObject(value) &&
  typeof value.round === "number" &&
  Array.isArray(value.seats) &&
  Array.isArray(value.out) &&
  isObject(value.locked) &&
  isObject(value.scores)
    ? (value as FakeState)
    : null,
);

const moveSchema = parser<FakeMove>((value) =>
  isObject(value) &&
  typeof value.round === "number" &&
  typeof value.value === "number" &&
  Object.keys(value).length === 2
    ? (value as FakeMove)
    : null,
);

const configSchema = parser<Record<string, unknown>>((value) => {
  if (!isObject(value)) return null;
  const { rounds, ...rest } = value;
  if (rounds !== undefined && typeof rounds !== "number") return null;
  if (rest.mode === "duel")
    return Object.keys(rest).length === 1 ? { mode: "duel" } : null;
  const lobby = lobbyConfigSchema.safeParse(rest);
  if (!lobby.success) return null;
  return rounds === undefined ? lobby.data : { ...lobby.data, rounds };
});

export const fakeRoundsDefinition = {
  meta: {
    type: FAKE_ROUNDS,
    name: "Fake Rounds",
    description: "Synthetic simultaneous engine for tests",
    categoryId: "classic",
  },
  engine: fakeRoundsEngine,
  stateSchema,
  moveSchema,
  configSchema,
  queues: [
    { id: "duel", label: "1v1", description: "Duel", config: { mode: "duel" } },
    {
      id: "teams",
      label: "2v2",
      description: "Teams",
      config: { mode: "teams" },
    },
  ],
  layout: "wide",
} as unknown as GameDefinition;
