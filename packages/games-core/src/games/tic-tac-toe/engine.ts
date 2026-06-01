import type { GameEngine, Outcome, ReduceResult, Seat } from "../../engine";
import {
  type Cell,
  type Mark,
  TIC_TAC_TOE,
  type TicTacToeMove,
  type TicTacToeState,
  ticTacToeMoveSchema,
} from "./schemas";

const BOARD_SIZE = 9;

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Cell[] {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

export function lineWinner(board: Cell[]): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return v;
  }
  return null;
}

export function isBoardFull(board: Cell[]): boolean {
  return board.every((c) => c !== null);
}

function isMark(role: string): role is Mark {
  return role === "X" || role === "O";
}

function outcomeFor(state: TicTacToeState): Outcome {
  const winner = lineWinner(state.board);
  if (winner) return { status: "completed", winnerRole: winner, draw: false };
  if (isBoardFull(state.board))
    return { status: "completed", winnerRole: null, draw: true };
  return { status: "active" };
}

export function isTerminal(state: TicTacToeState): boolean {
  return outcomeFor(state).status === "completed";
}

export const ticTacToeEngine: GameEngine<TicTacToeState, TicTacToeMove> = {
  type: TIC_TAC_TOE,
  mode: "turn-based",
  minPlayers: 2,
  maxPlayers: 2,
  roles: ["X", "O"],

  createInitialState(_seats: Seat[]): TicTacToeState {
    return { board: emptyBoard(), currentTurn: "X" };
  },

  reduce(state, ctx, input): ReduceResult<TicTacToeState> {
    if (isTerminal(state)) {
      return { ok: false, error: "Game is not active" };
    }
    if (!isMark(ctx.role)) {
      return { ok: false, error: "Not a player in this game" };
    }
    if (state.currentTurn !== ctx.role) {
      return { ok: false, error: "Not your turn" };
    }
    // Structural validity lives in the schema (defense-in-depth: the driver
    // also validates before calling reduce). Game rules live below.
    const parsed = ticTacToeMoveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Invalid move" };
    }
    const { row, col } = parsed.data;
    const idx = row * 3 + col;
    if (state.board[idx] !== null) {
      return { ok: false, error: "Cell occupied" };
    }

    const board = [...state.board];
    board[idx] = ctx.role;
    const nextState: TicTacToeState = {
      board,
      currentTurn: ctx.role === "X" ? "O" : "X",
    };
    return { ok: true, state: nextState, outcome: outcomeFor(nextState) };
  },
};
