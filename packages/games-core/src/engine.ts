/**
 * Framework-agnostic game engine contract.
 *
 * An engine is PURE: no IO, no DB, no clock, no randomness from the ambient
 * environment. Everything time/seed-dependent must be passed in. This lets the
 * same engine run inside a turn-based socket dispatcher today and a
 * fixed-timestep tick loop / worker / WASM module later — and makes it trivially
 * testable and deterministic.
 */

/** Result of evaluating a game's terminal condition. */
export type Outcome =
  | { status: "active" }
  | { status: "completed"; winnerRole: string | null; draw: boolean };

/** A seated player and the role they occupy (e.g. "X" / "O"). */
export type Seat = { role: string };

/** Discriminated result of a turn-based reduce — never throws. */
export type ReduceResult<State> =
  | { ok: true; state: State; outcome: Outcome }
  | { ok: false; error: string };

/** Result of advancing a real-time simulation by one fixed step. */
export type StepResult<State> = { state: State; outcome: Outcome };

/** Context passed to a move: who is acting. */
export type MoveContext = { role: string };

export interface GameEngine<State, Input> {
  /** Stable identifier, e.g. "tic-tac-toe". Matches `game.gameType`. */
  readonly type: string;
  /** Drives which realtime driver hosts the game. */
  readonly mode: "turn-based" | "realtime";
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Role slots, assigned to seats in order, e.g. ["X","O"]. */
  readonly roles: readonly string[];

  /** Build the starting state for a set of seats. Pure. */
  createInitialState(seats: Seat[]): State;

  /**
   * TURN-BASED: validate + apply one discrete input. Pure; returns an error
   * result instead of throwing. Omitted for real-time engines.
   */
  reduce?(state: State, ctx: MoveContext, input: Input): ReduceResult<State>;

  /**
   * REAL-TIME (future): advance the sim one fixed step from buffered inputs.
   * Pure & deterministic. Omitted for turn-based engines.
   */
  step?(
    state: State,
    inputs: Map<string, Input>,
    dt: number,
  ): StepResult<State>;

  /** Simulation rate in Hz (real-time engines only). */
  readonly tickRate?: number;
}
