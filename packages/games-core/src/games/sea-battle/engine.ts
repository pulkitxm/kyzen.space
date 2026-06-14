import { SEA_BATTLE } from "@kyzen/shared/constants";
import {
  type GameEngine,
  type Outcome,
  type ReduceResult,
  type SeaBattleMove,
  type SeaBattleRole,
  type SeaBattleShot,
  type SeaBattleState,
  type Seat,
  seaBattleMoveSchema,
} from "@kyzen/shared/types";
import {
  generateRandomFleet,
  inBounds,
  isFleetSunk,
  randomUnfiredCell,
  sunkShips,
  validateFleet,
} from "./logic";

function isRole(role: string): role is SeaBattleRole {
  return role === "A" || role === "B";
}

function other(role: SeaBattleRole): SeaBattleRole {
  return role === "A" ? "B" : "A";
}

export function isTerminal(state: SeaBattleState): boolean {
  return (
    isFleetSunk(state.fleets.A, state.shots.A) ||
    isFleetSunk(state.fleets.B, state.shots.B)
  );
}

export const seaBattleEngine: GameEngine<SeaBattleState, SeaBattleMove> = {
  type: SEA_BATTLE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,
  roles: ["A", "B"],

  createInitialState(_seats: Seat[]): SeaBattleState {
    return {
      phase: "placement",
      fleets: { A: [], B: [] },
      shots: { A: [], B: [] },
      ready: { A: false, B: false },
      currentTurn: "A",
    };
  },

  reduce(state, ctx, input): ReduceResult<SeaBattleState> {
    const parsed = seaBattleMoveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid move" };
    }
    const move = parsed.data;

    if (!isRole(ctx.role)) {
      return { ok: false, error: "Not a player in this game" };
    }
    const role = ctx.role;

    if (isTerminal(state)) {
      return { ok: false, error: "Game is over" };
    }

    if (move.kind === "place") {
      if (state.phase !== "placement") {
        return { ok: false, error: "Placement is closed" };
      }
      if (state.ready[role]) {
        return { ok: false, error: "Your fleet is already placed" };
      }
      const valid = validateFleet(move.ships);
      if (!valid.ok) {
        return { ok: false, error: valid.error };
      }

      const fleets = {
        A: role === "A" ? move.ships : state.fleets.A,
        B: role === "B" ? move.ships : state.fleets.B,
      };
      const ready = {
        A: role === "A" ? true : state.ready.A,
        B: role === "B" ? true : state.ready.B,
      };
      const bothReady = ready.A && ready.B;
      const nextState: SeaBattleState = {
        phase: bothReady ? "battle" : "placement",
        fleets,
        shots: { A: [...state.shots.A], B: [...state.shots.B] },
        ready,
        currentTurn: state.currentTurn,
      };
      return { ok: true, state: nextState, outcome: { status: "active" } };
    }

    if (state.phase !== "battle") {
      return { ok: false, error: "Battle has not started" };
    }
    if (state.currentTurn !== role) {
      return { ok: false, error: "Not your turn" };
    }

    const target = { row: move.row, col: move.col };
    if (!inBounds(target)) {
      return { ok: false, error: "Target is off the board" };
    }

    const opp = other(role);
    const oppShots = state.shots[opp];
    if (oppShots.some((s) => s.row === target.row && s.col === target.col)) {
      return { ok: false, error: "You already fired at that cell" };
    }

    const hit = state.fleets[opp].some((ship) =>
      ship.cells.some(
        (cell) => cell.row === target.row && cell.col === target.col,
      ),
    );
    const shot: SeaBattleShot = { row: target.row, col: target.col, hit };
    const nextOppShots = [...oppShots, shot];

    const nextState: SeaBattleState = {
      phase: state.phase,
      fleets: { A: state.fleets.A, B: state.fleets.B },
      shots: {
        A: role === "A" ? state.shots.A : nextOppShots,
        B: role === "B" ? state.shots.B : nextOppShots,
      },
      ready: state.ready,
      currentTurn: opp,
    };

    const outcome: Outcome = isFleetSunk(nextState.fleets[opp], nextOppShots)
      ? { status: "completed", winnerRole: role, draw: false }
      : { status: "active" };

    return { ok: true, state: nextState, outcome };
  },

  autoMove(state, role): SeaBattleMove {
    if (state.phase === "placement") {
      return { kind: "place", ships: generateRandomFleet() };
    }
    const opp = isRole(role) ? other(role) : "B";
    const cell = randomUnfiredCell(state.shots[opp]);
    return { kind: "fire", row: cell.row, col: cell.col };
  },

  currentRole(state): string | null {
    if (isTerminal(state)) return null;
    if (state.phase === "placement") {
      return state.ready.A ? "B" : "A";
    }
    return state.currentTurn;
  },

  viewFor(state, role): SeaBattleState {
    if (!isRole(role)) {
      return {
        phase: state.phase,
        fleets: {
          A: sunkShips(state.fleets.A, state.shots.A),
          B: sunkShips(state.fleets.B, state.shots.B),
        },
        shots: { A: [...state.shots.A], B: [...state.shots.B] },
        ready: { ...state.ready },
        currentTurn: state.currentTurn,
      };
    }

    const opp = other(role);
    return {
      phase: state.phase,
      fleets: {
        A:
          role === "A"
            ? [...state.fleets.A]
            : sunkShips(state.fleets[opp], state.shots[opp]),
        B:
          role === "B"
            ? [...state.fleets.B]
            : sunkShips(state.fleets[opp], state.shots[opp]),
      },
      shots: { A: [...state.shots.A], B: [...state.shots.B] },
      ready: { ...state.ready },
      currentTurn: state.currentTurn,
    };
  },
};
